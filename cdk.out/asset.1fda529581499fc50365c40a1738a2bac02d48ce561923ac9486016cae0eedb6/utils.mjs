import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { LOG_LEVEL } from './config.mjs';

// Configure logging
const logger = {
  info: (...args) => LOG_LEVEL === 'info' && console.log("[INFO]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args)
};

// Initialize AWS clients
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-2" });
const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-2" });

/**
 * Custom error class for authorization failures
 */
export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class LambdaError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "LambdaError";
    this.statusCode = statusCode;
  }
}

export function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Invoke a Lambda function by name with the given payload
 * @param {string} functionName - Name of the Lambda function to invoke
 * @param {Object} payload - Payload to send to the Lambda function
 * @returns {Promise<Object>} Response from the Lambda function
 * @throws {Error} If Lambda invocation fails
 */
export async function invokeLambda(functionName, payload) {
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));

    if (response.FunctionError) {
      logger.error(`Lambda function ${functionName} returned an error:`, responsePayload);
      throw new LambdaError(responsePayload.errorMessage || "Unknown error", 500);
    }
    
    if (responsePayload.statusCode && responsePayload.statusCode !== 200) {
        const body = JSON.parse(responsePayload.body || '{}');
        throw new LambdaError(body.message || 'Invocation failed', responsePayload.statusCode);
    }

    return responsePayload;
  } catch (error) {
    if (error instanceof LambdaError) throw error;
    logger.error(`Failed to invoke Lambda function ${functionName}:`, error);
    throw new LambdaError(`Invocation of ${functionName} failed`, 500);
  }
}

/**
 * Parse an event from either API Gateway or direct Lambda invocation
 * @param {Object} event - The event to parse, either from API Gateway or direct Lambda
 * @returns {Object} Parsed event data including body and cookies if present
 * @throws {Error} If event parsing fails
 */
export async function parseEvent(event) {
  const response = await invokeLambda('ParseEvent', event);
  return JSON.parse(response.body || '{}');
}

/**
 * Authorize a user by validating their session
 * @param {string} userId - The user ID to validate
 * @param {string} sessionId - The session ID to validate
 * @returns {Promise<void>}
 * @throws {AuthorizationError} If authorization fails
 */
export async function authorize(userId, sessionId) {
  await invokeLambda('Authorize', { user_id: userId, session_id: sessionId });
} 