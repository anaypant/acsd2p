/**
 * @file deleteUser.js
 * @module deleteUser
 * @description
 * AWS Lambda handler to delete a user from Cognito and DynamoDB,
 * plus purge all their Conversations and Threads entries using the user's ID.
 */


// From github

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand as DocQueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION                         = process.env.AWS_REGION           || "us-east-2";
const USER_POOL_ID                   = process.env.COGNITO_USER_POOL_ID;
const USERS_TABLE                    = process.env.USERS_TABLE         || "Users";
const CONVERSATIONS_TABLE            = process.env.CONVERSATIONS_TABLE || "Conversations";
const THREADS_TABLE                  = process.env.THREADS_TABLE      || "Threads";
const ID_INDEX                       = "id-index";
const ASSOCIATED_ACCOUNT_INDEX       = "associated_account-is_first_email-index";
const THREADS_ASSOCIATED_INDEX       = "associated_account-index";

if (!USER_POOL_ID) {
  throw new Error("Missing required env var: COGNITO_USER_POOL_ID");
}

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
const dynamoDbClient = new DynamoDBClient({ region: REGION });
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
const lambdaClient  = new LambdaClient({ region: REGION });

async function getCorsHeaders(event) {
  try {
    const res = await lambdaClient.send(new InvokeCommand({
      FunctionName:   "Allow-Cors",
      InvocationType: "RequestResponse",
      Payload:        JSON.stringify(event),
    }));
    const payload = JSON.parse(new TextDecoder().decode(res.Payload));
    return payload.headers;
  } catch {
    return {
      "Access-Control-Allow-Origin":      "*",
      "Access-Control-Allow-Methods":     "OPTIONS, POST",
      "Access-Control-Allow-Headers":     "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    };
  }
}

export const handler = async (event) => {
  console.log(event)

  const cors = await getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  let targetId;
  try {
    const body = JSON.parse(event.body || "{}");
    targetId = body.id;
    if (!targetId) throw new Error("Missing required field: id");
  } catch (err) {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ message: `Invalid request: ${err.message}` }),
    };
  }

  try {
    // 1) Get user details to get email for Cognito deletion
    const userResult = await dynamoDb.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: {
        id: targetId
      }
    }));

    if (!userResult.Item) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ message: "User not found in database" })
      };
    }

    const userEmail = userResult.Item.email;
    if (!userEmail) {
      throw new Error("User email not found in user record");
    }

    // 2) Delete from Cognito using email
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetId, 
      }));
    } catch (cognitoErr) {
      if (cognitoErr.name === "UserNotFoundException") {
        console.warn(`User ${userEmail} not found in Cognito, continuing with database cleanup`);
      } else {
        throw cognitoErr;
      }
    }

    // 3) Query and delete all Conversations where associated_account = targetId
    const { Items: convItems = [] } = await dynamoDb.send(new DocQueryCommand({
      TableName: CONVERSATIONS_TABLE,
      IndexName: ASSOCIATED_ACCOUNT_INDEX,
      KeyConditionExpression: "associated_account = :id",
      ExpressionAttributeValues: {
        ":id": targetId,
      },
    }));

    console.log('Found conversations:', JSON.stringify(convItems, null, 2));

    // 4) Query and delete all Threads where associated_account = targetId
    const { Items: threadItems = [] } = await dynamoDb.send(new DocQueryCommand({
      TableName: THREADS_TABLE,
      IndexName: THREADS_ASSOCIATED_INDEX,
      KeyConditionExpression: "associated_account = :id",
      ExpressionAttributeValues: {
        ":id": targetId,
      },
    }));

    console.log('Found threads:', JSON.stringify(threadItems, null, 2));

    // 5) Delete all conversations and threads in parallel
    const deletePromises = [
      // Delete conversations
      ...convItems.filter(item => item && item.conversation_id && item.response_id).map(item => {
        console.log('Deleting conversation:', item.conversation_id, item.response_id);
        return dynamoDb.send(new DeleteCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: {
            conversation_id: item.conversation_id,
            response_id: item.response_id
          },
        }));
      }),
      // Delete threads
      ...threadItems.filter(item => item && item.conversation_id).map(item => {
        console.log('Deleting thread:', item.conversation_id);
        return dynamoDb.send(new DeleteCommand({
          TableName: THREADS_TABLE,
          Key: {
            conversation_id: item.conversation_id
          },
        }));
      })
    ];

    // 6) Wait for all deletions to complete
    if (deletePromises.length > 0) {
      console.log(`Attempting to delete ${deletePromises.length} items...`);
      await Promise.all(deletePromises);
      console.log('All items deleted successfully');
    } else {
      console.log('No conversations or threads found to delete');
    }

    // 7) Finally delete the user record
    console.log('Deleting user record:', targetId);
    await dynamoDb.send(new DeleteCommand({
      TableName: USERS_TABLE,
      Key: {
        id: targetId
      },
    }));

    // 8) Success response
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        message: "User and all associated records successfully deleted",
        deletedCounts: {
          conversations: convItems.length,
          threads: threadItems.length
        }
      }),
    };
  } catch (err) {
    console.error("Deletion error:", err);
    console.error("Error stack:", err.stack);
    console.error("Error metadata:", JSON.stringify(err.$metadata, null, 2));
    
    // Handle specific error cases
    if (err.name === "UserNotFoundException") {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ 
          message: "User not found in Cognito",
          error: err.name
        }),
      };
    }
    
    if (err.name === "ResourceNotFoundException") {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ 
          message: "Resource not found",
          error: err.name
        }),
      };
    }

    // Handle ValidationException specifically
    if (err.name === "ValidationException") {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ 
          message: "Invalid table schema or key structure",
          error: err.name,
          details: err.message,
          metadata: err.$metadata
        }),
      };
    }

    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ 
        message: "Internal server error during user deletion",
        error: err.name,
        details: err.message,
        stack: err.stack,
        metadata: err.$metadata
      }),
    };
  }
};
