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
    
    try:
        # Extract parameters from API Gateway event
        query_params = event.get('queryStringParameters', {}) or {}

        domain_name = query_params.get('domain')
        verification_type = query_params.get('verification_type')

        if not domain_name or not verification_type:
            return api_response(400, {
                'error': 'Please provide both a domain name and verification type (identity/dkim).'
            })

        if verification_type.lower() == 'identity':
            # Check domain identity verification status
            domain_identity_response = ses_client.get_identity_verification_attributes(
                Identities=[domain_name]
            )

            verification_status = domain_identity_response['VerificationAttributes'].get(
                domain_name, {}
            ).get('VerificationStatus', 'NotFound')

            result = {
                'domain_name': domain_name,
                'verification_type': 'identity',
                'domain_verification_status': verification_status
            }

        elif verification_type.lower() == 'dkim':
            # Check DKIM verification status
            dkim_attributes_response = ses_client.get_identity_dkim_attributes(
                Identities=[domain_name]
            )

            dkim_attributes = dkim_attributes_response['DkimAttributes'].get(domain_name, {})
            dkim_enabled = dkim_attributes.get('DkimEnabled', False)
            dkim_verification_status = dkim_attributes.get('DkimVerificationStatus', 'NotFound')

            result = {
                'domain_name': domain_name,
                'verification_type': 'dkim',
                'dkim_enabled': dkim_enabled,
                'dkim_verification_status': dkim_verification_status
            }

        else:
            return api_response(400, {
                'error': 'Invalid verification type. Use "identity" or "dkim".',
            })

        return api_response(200, {
            'message': f'{verification_type.capitalize()} verification status retrieved successfully.',
            'verification_status': result,
        })

    except Exception as e:
        return api_response(500, {
            'error': f'Error checking {verification_type} verification status: {str(e)}',
        })

def api_response(status_code, body):
    """
    Helper function to format API Gateway HTTP responses.
    """
    return {
        'statusCode': status_code,
        'headers': {
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Credentials": "true",
        },
        'body': json.dumps(body)
    }

