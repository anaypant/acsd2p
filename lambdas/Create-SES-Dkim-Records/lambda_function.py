import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
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

    try:
        body = json.loads(event.get("body", "{}"))
        domain_name = body.get("domain", "").strip()
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"message": "Invalid JSON in request body"})
        }
    print(f"Domain: {domain_name}")
    print(f"Body: {body}")
    if not domain_name:
        return {
            'statusCode': 400,
            'body': json.dumps('Please provide a domain name.'),
            'headers': {
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }
        }

    try:
        # Step 1: Request DKIM verification for the domain
        dkim_verification_response = ses_client.verify_domain_dkim(
            Domain=domain_name
        )

        # Step 2: Retrieve the DKIM tokens (CNAME records)
        dkim_tokens = dkim_verification_response['DkimTokens']

        # Step 3: Construct the DKIM CNAME records
        dkim_cname_records = []
        for token in dkim_tokens:
            cname_record = {
                'Name': f"{token}._domainkey.{domain_name}",
                'Type': 'CNAME',
                'Value': f"{token}.dkim.amazonses.com"
            }
            dkim_cname_records.append(cname_record)

        # Step 4: Return the DKIM CNAME records
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'DKIM verification initiated for {domain_name}. Please add the following CNAME records to your DNS.',
                'dkim_records': dkim_cname_records
            }),
            'headers': {
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error retrieving DKIM records: {str(e)}'),
            'headers': {
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }
        }
