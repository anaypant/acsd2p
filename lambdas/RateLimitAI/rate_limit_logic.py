import time
import boto3
import os
from botocore.exceptions import ClientError
from config import logger
from utils import LambdaError, authorize

# Environment Variables
TTL_S = int(os.environ.get('TTL_S', 3600))  # Default 1 hour

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table("RL_AI")
user_table = dynamodb.Table("Users")

def get_user_rate_limit(client_id):
    try:
        response = user_table.get_item(Key={'id': client_id})
        item = response.get('Item')
        
        if not item:
            raise LambdaError(404, f"User {client_id} not found.")
            
        rate_limit = item.get('rl_ai')
        if rate_limit is None:
            raise LambdaError(500, f"User {client_id} has no AI rate limit configured.")
            
        try:
            return int(rate_limit)
        except (TypeError, ValueError):
            raise LambdaError(500, f"Invalid rate limit value for user {client_id}. Expected a number.")
            
    except ClientError as e:
        logger.error(f"Error retrieving user rate limit for {client_id}: {e}")
        raise LambdaError(500, "Database error while fetching user rate limit.")

def check_and_update_rate_limit(client_id):
    user_rate_limit = get_user_rate_limit(client_id)
    
    try:
        current_time = int(time.time())
        
        # Get current record
        response = table.get_item(Key={'associated_account': client_id})
        item = response.get('Item', {})
        current_invocations = item.get('invocations', 0)
        created_at = item.get('created_at', current_time)

        # Check if TTL has expired
        time_diff = current_time - created_at
        if time_diff >= TTL_S:
            # Reset invocations if TTL has expired
            logger.info(f"TTL expired for {client_id}, resetting invocations")
            table.update_item(
                Key={'associated_account': client_id},
                UpdateExpression="SET invocations = :start, created_at = :now",
                ExpressionAttributeValues={
                    ':start': 1,
                    ':now': current_time
                }
            )
            return {"message": "Rate limit check passed (TTL reset).", "current": 1, "limit": user_rate_limit}

        logger.info(f"Current invocations: {current_invocations}")
        logger.info(f"User rate limit: {user_rate_limit}")

        if current_invocations >= user_rate_limit:
            raise LambdaError(429, "Rate limit exceeded.")

        # Update invocations if within TTL
        table.update_item(
            Key={'associated_account': client_id},
            UpdateExpression="SET invocations = if_not_exists(invocations, :start) + :inc, created_at = if_not_exists(created_at, :now)",
            ExpressionAttributeValues={
                ':inc': 1,
                ':start': 0,
                ':now': current_time
            }
        )
        return {"message": "Rate limit check passed.", "current": current_invocations + 1, "limit": user_rate_limit}

    except ClientError as e:
        logger.error(f"DynamoDB error during rate limit check for {client_id}: {e}")
        raise LambdaError(500, "Database error during rate limit check.")

def process_rate_limit_request(client_id, session_id, auth_bp):
    if session_id != auth_bp:
        authorize(client_id, session_id)
    
    return check_and_update_rate_limit(client_id)
