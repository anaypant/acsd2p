import json
from config import logger, AUTH_BP
from utils import create_response, LambdaError, parse_event
import boto3
from botocore.exceptions import ClientError
import os

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')
sessions_table = dynamodb.Table('Sessions')

def authorize_user(user_id, session_id):
    """
    Authorizes a user by validating their session ID.
    """
    logger.info(f"Authorizing user: {user_id} with session: {session_id}")
    if not user_id or not session_id:
        raise LambdaError(400, "Missing required fields: user_id and session_id are required.")

    if AUTH_BP and session_id == AUTH_BP:
        logger.info("Admin bypass authorization successful.")
        return create_response(200,  "Authorized")

    try:
        response = sessions_table.get_item(Key={'session_id': session_id})
        session = response.get('Item')

        if not session:
            logger.warning(f"Session not found: {session_id}")
            raise LambdaError(401, "ACS: Unauthorized")

        if session.get('associated_account') != user_id:
            logger.warning(f"User ID mismatch: {user_id} != {session.get('associated_account')}")
            raise LambdaError(401, "ACS: Unauthorized")

        return {"message": "Authorized", "authorized": True}

    except ClientError as e:
        logger.error(f"DynamoDB error during authorization: {e}")
        raise LambdaError(401, "ACS: Unauthorized")

def lambda_handler(event, context):
    """
    Lambda function to authorize a user by validating their session.
    """
    try:
        logger.info(f"Event: {event}")
        parsed_event = parse_event(event)
        user_id = parsed_event.get('user_id') or parsed_event.get('account_id') or parsed_event.get('account') or parsed_event.get('client_id')
        cookies = parsed_event.get('cookies') or {}
        session_id = parsed_event.get('session_id') or parsed_event.get('session') or cookies.get('session_id')
        
        auth_response = authorize_user(user_id, session_id)
        
        return create_response(200, auth_response)

    except LambdaError as e:
        logger.error(f"LambdaError during authorization: {e}")
        return create_response(e.status_code, {"message": e.message, "authorized": False})
    except Exception as e:
        import traceback
        logger.error(f"Unexpected error during authorization: {e}\n{traceback.format_exc()}")
        return create_response(500, {"message": "Internal server error", "authorized": False})
