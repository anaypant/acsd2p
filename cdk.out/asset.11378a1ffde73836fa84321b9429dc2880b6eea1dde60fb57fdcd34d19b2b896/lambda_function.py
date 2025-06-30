import json
import boto3
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Conversations')

def lambda_handler(event, context):
    # Get user_id from the request context (injected by your authorizer)
    user_id = event['requestContext']['authorizer']['user_id']

    # Query the Conversations table using the GSI
    response = table.query(
        IndexName='associated_account-index',
        KeyConditionExpression='associated_account = :acc',
        ExpressionAttributeValues={':acc': user_id}
    )

    # Return the conversations
    return {
        'statusCode': 200,
        'body': json.dumps(response['Items'])
    }