import json
import boto3
import os

lambda_client = boto3.client('lambda')

# Environment variables
GET_CORS_FUNCTION = os.environ.get("GET_CORS_FUNCTION_NAME", "Get-Cors")

def get_cors_headers(event):
    response = lambda_client.invoke(
        FunctionName=GET_CORS_FUNCTION,
        InvocationType='RequestResponse',
        Payload=json.dumps(event)
    )
    return json.load(response['Payload'])
