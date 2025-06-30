import json
import boto3
import time
from http.cookies import SimpleCookie

dynamodb = boto3.resource('dynamodb')
table_name = 'Sessions'
table = dynamodb.Table(table_name)

# List of allowed ARNs (routes the user can access after being authorized)
ALLOWED_ROUTES = [
    "arn:aws:execute-api:us-east-2:872515253712:2skw7xvkm0/prod/*",
    # "arn:aws:execute-api:us-east-2:872515253712:2skw7xvkm0/prod/GET/api/users/threads/*",
    # "arn:aws:execute-api:us-east-2:872515253712:2skw7xvkm0/*/POST/api/users/domain/verify-email-valid"
]

def validate_session(session_id):
    """Validates session ID and retrieves user data from DynamoDB."""
    try:
        response = table.get_item(Key={'session_id': session_id})
        if 'Item' not in response:
            return None

        session = response['Item']

        # Check expiration timestamp
        if int(session['expiration']) < int(time.time()):
            return None

        return {
            'user_id': session['user_id'],
        }

    except Exception as e:
        print(f"Error accessing DynamoDB: {str(e)}")
        return None

def lambda_handler(event, context):
    """Lambda authorizer for API Gateway."""
    try:
        print("Received event:", json.dumps(event))

        # Extract cookie header safely
        headers = event.get('headers', {})
        cookie_header = headers.get('Cookie', '') or headers.get('cookie', '')

        if not cookie_header:
            print("No cookie header found.")
            return generate_policy('user', 'Deny', event['methodArn'])

        # Parse session ID from cookies
        cookies = SimpleCookie(cookie_header)
        session_id = cookies.get('session_id')

        if not session_id:
            print("Session ID missing from cookies.")
            return generate_policy('user', 'Deny', event['methodArn'])

        # Validate session in DynamoDB
        session_data = validate_session(session_id.value)

        if not session_data:
            print("Invalid session or expired token.")
            return generate_policy('user', 'Deny', event['methodArn'])

        print(f"Authorized user: {session_data['user_id']} for {event['methodArn']}")

        # Grant access to all defined routes
        return generate_policy(
            session_data['user_id'], 
            'Allow', 
            ALLOWED_ROUTES,
            context={
                'user_id': session_data['user_id'],
            }
        )

    except Exception as e:
        print(f"Error in authorizer: {str(e)}")
        return generate_policy('user', 'Deny', event['methodArn'])

def generate_policy(principal_id, effect, resources, context=None):
    """Generates IAM policy for API Gateway."""
    statements = []

    for resource in resources:
        statements.append({
            'Action': 'execute-api:Invoke',
            'Effect': effect,
            'Resource': resource
        })

    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': statements
        }
    }

    if context:
        policy['context'] = context

    print(f"Generated policy: {json.dumps(policy)}")
    return policy
