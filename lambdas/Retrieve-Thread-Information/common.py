import json
import boto3

lambda_client = boto3.client('lambda')

def get_cors_headers(event):
    response = lambda_client.invoke(
        FunctionName='Get-Cors',
        InvocationType='RequestResponse',
        Payload=json.dumps(event)
    )
    return json.load(response['Payload'])
