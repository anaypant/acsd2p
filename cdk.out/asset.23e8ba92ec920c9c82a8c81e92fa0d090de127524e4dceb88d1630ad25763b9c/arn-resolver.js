/**
 * Utility function to resolve Lambda function ARNs from function names
 * This avoids circular dependencies in CDK by constructing ARNs at runtime
 */

const AWS = require('aws-sdk');

/**
 * Constructs a Lambda function ARN from the function name
 * @param {string} functionName - The name of the Lambda function
 * @returns {string} The ARN of the Lambda function
 */
function getLambdaArn(functionName) {
  const region = process.env.CDK_AWS_REGION || process.env.AWS_REGION || 'us-west-1';
  const accountId = process.env.AWS_ACCOUNT_ID;
  
  if (!accountId) {
    throw new Error('AWS_ACCOUNT_ID environment variable is not set');
  }
  
  return `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;
}

/**
 * Invokes a Lambda function by name
 * @param {string} functionName - The name of the Lambda function to invoke
 * @param {Object} payload - The payload to send to the function
 * @param {string} invocationType - The invocation type ('RequestResponse' or 'Event')
 * @returns {Promise<Object>} The response from the Lambda function
 */
async function invokeLambda(functionName, payload, invocationType = 'RequestResponse') {
  const lambda = new AWS.Lambda();
  const functionArn = getLambdaArn(functionName);
  
  const params = {
    FunctionName: functionArn,
    InvocationType: invocationType,
    Payload: JSON.stringify(payload)
  };
  
  try {
    const result = await lambda.invoke(params).promise();
    if (invocationType === 'RequestResponse') {
      return JSON.parse(result.Payload.toString());
    }
    return result;
  } catch (error) {
    console.error(`Error invoking Lambda function ${functionName}:`, error);
    throw error;
  }
}

module.exports = {
  getLambdaArn,
  invokeLambda
}; 