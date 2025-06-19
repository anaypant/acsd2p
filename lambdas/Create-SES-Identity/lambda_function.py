import json
import boto3
import os

ses_client = boto3.client('ses')
# Environment & AWS clients
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-2")
CORS_FUNCTION = os.environ.get("CORS_FUNCTION_NAME", "Allow-Cors")
lambda_client = boto3.client("lambda", region_name=AWS_REGION)

# DynamoDB table for session storage
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "Sessions")
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)

def get_cors_headers(event: dict) -> dict:
    default = {
        "Access-Control-Allow-Origin":      "*",
        "Access-Control-Allow-Methods":     "OPTIONS, POST",
        "Access-Control-Allow-Headers":     "Content-Type",
        "Access-Control-Allow-Credentials": "true",
    }
    try:
        resp = lambda_client.invoke(
            FunctionName   = CORS_FUNCTION,
            InvocationType = "RequestResponse",
            Payload        = json.dumps(event).encode()
        )
        data = json.loads(resp["Payload"].read().decode())
        return data.get("headers", default)
    except Exception:
        return default

def lambda_handler(event, context):
    cors_headers = get_cors_headers(event)

    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}
    print(event)
    domain_name = json.loads(event["body"]).get("domain")

    if not domain_name:
        print('Please provide a domain name.')
        return {
            'statusCode': 400,
            'body': json.dumps('Please provide a domain name.')
        }

    try:
        # Step 1: Verify the domain in SES
        verify_domain_response = ses_client.verify_domain_identity(
            Domain=domain_name
        )

        # SES will return a verification token
        verification_token = verify_domain_response['VerificationToken']

        # Construct the TXT record for domain verification
        txt_record = {
            'Name': f'_amazonses.{domain_name}',
            'Type': 'TXT',
            'Value': verification_token
        }

        # Return the TXT record to be added to DNS
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Domain verification initiated for {domain_name}. Please add the following TXT record to your DNS.',
                'txt_record': txt_record
            }),
            'headers': {
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }
        }

    except Exception as e:
        print(f'Error verifying domain: {str(e)}')
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error verifying domain: {str(e)}'),
            'headers': {
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }
        }
