import json
import time
import random
import string
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from config import logger
from utils import create_response, LambdaError, parse_event

dynamodb = boto3.resource('dynamodb')
sessions_table = dynamodb.Table('Sessions')

def generate_session_id():
    """Generate a unique session identifier."""
    timestamp = int(time.time() * 1000)
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{timestamp}-{random_str}"

def manage_session(uid):
    """
    Creates a new session or updates the TTL of an existing session for a given user.
    """
    if not uid:
        raise LambdaError(400, "Missing required field: uid")

    ttl = int(time.time()) + (30 * 24 * 3600)  # 30 days

    try:
        # Check for an existing session for the user
        response = sessions_table.scan(
            FilterExpression='associated_account = :uid',
            ExpressionAttributeValues={':uid': uid},
            Limit=1
        )

        if response.get('Items'):
            # Update existing session's TTL
            existing_session = response['Items'][0]
            session_id = existing_session['session_id']
            
            sessions_table.update_item(
                Key={'session_id': session_id},
                UpdateExpression='SET expiration = :ttl',
                ExpressionAttributeValues={':ttl': ttl}
            )
            
            return {
                "sessionId": session_id,
                "message": "Existing session TTL updated",
                "isNewSession": False
            }

        # Create new session if none exists
        session_id = generate_session_id()
        sessions_table.put_item(
            Item={
                'session_id': session_id,
                'created_at': datetime.utcnow().isoformat(),
                'expiration': ttl,
                'associated_account': uid
            }
        )

        return {
            "sessionId": session_id,
            "message": "New session created successfully",
            "isNewSession": True
        }

    except ClientError as e:
        logger.error(f"DynamoDB error managing session: {e}")
        raise LambdaError(500, "Failed to manage session due to a database error.")
    except Exception as e:
        logger.error(f"Unexpected error managing session: {e}")
        raise LambdaError(500, "An unexpected error occurred while managing the session.")

def lambda_handler(event, context):
    try:
        body = parse_event(event)
        uid = body.get('uid')
        
        session_info = manage_session(uid)
        
        return create_response(200, session_info)

    except LambdaError as e:
        return create_response(e.status_code, {"message": e.message})
    except Exception as e:
        logger.error(f"Unexpected error in lambda_handler: {e}")
        return create_response(500, {"message": "Internal server error."})
