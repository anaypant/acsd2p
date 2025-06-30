import time
import boto3
import os
from decimal import Decimal
from botocore.exceptions import ClientError
from config import logger
from utils import LambdaError, authorize

# Environment Variables
TTL_S = int(os.environ.get('TTL_S', 3600))  # Default 1 hour

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table("RL_AWS")
user_table = dynamodb.Table("Users")

def get_user_rate_limit(client_id):
    try:
        response = user_table.get_item(Key={'id': client_id})
        item = response.get('Item')
        
        if not item:
            logger.error(f"User {client_id} not found in Users table")
            raise LambdaError(500, f"User {client_id} not found in database.")
        
        if 'rl_aws' not in item:
            logger.error(f"User {client_id} has no rl_aws field set. Available fields: {list(item.keys())}")
            # Set a default rate limit instead of failing
            default_rate_limit = 100  # Default rate limit
            logger.info(f"Setting default rate limit of {default_rate_limit} for user {client_id}")
            return default_rate_limit
            
        try:
            rate_limit = int(item['rl_aws'])
            logger.info(f"User {client_id} has rate limit: {rate_limit}")
            return rate_limit
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid rl_aws value for user {client_id}: {item['rl_aws']}, error: {e}")
            # Set a default rate limit instead of failing
            default_rate_limit = 100
            logger.info(f"Setting default rate limit of {default_rate_limit} for user {client_id}")
            return default_rate_limit
            
    except ClientError as e:
        logger.error(f"Error retrieving user rate limit for {client_id}: {e}")
        raise LambdaError(500, "Database error while fetching user rate limit.")
    except Exception as e:
        logger.error(f"Unexpected error in get_user_rate_limit for {client_id}: {e}")
        raise LambdaError(500, f"Unexpected error while fetching user rate limit: {str(e)}")

def check_and_update_rate_limit(client_id):
    user_rate_limit = get_user_rate_limit(client_id)
    
    try:
        current_time = int(time.time())
        
        # Get current record
        response = table.get_item(Key={'associated_account': client_id})
        item = response.get('Item', {})
        
        # Safely convert values to int, handling Decimal types
        try:
            current_invocations = int(item.get('invocations', 0))
        except (ValueError, TypeError):
            current_invocations = 0
            logger.warning(f"Invalid invocations value for {client_id}, defaulting to 0")
            
        try:
            created_at = int(item.get('created_at', current_time))
        except (ValueError, TypeError):
            created_at = current_time
            logger.warning(f"Invalid created_at value for {client_id}, defaulting to current time")

        # Check if TTL has expired
        time_diff = current_time - created_at
        if time_diff >= TTL_S:
            # Reset invocations if TTL has expired
            logger.info(f"TTL expired for {client_id}, resetting invocations")
            try:
                table.update_item(
                    Key={'associated_account': client_id},
                    UpdateExpression="SET invocations = :start, created_at = :now",
                    ExpressionAttributeValues={
                        ':start': 1,
                        ':now': current_time
                    }
                )
                return {
                    "message": "Rate limit check passed (TTL reset).", 
                    "current": 1,
                    "limit": user_rate_limit
                }
            except ClientError as e:
                logger.error(f"Failed to update rate limit for {client_id} after TTL reset: {e}")
                raise LambdaError(500, "Failed to update rate limit after TTL reset.")

        logger.info(f"Current invocations: {current_invocations}")
        logger.info(f"User rate limit: {user_rate_limit}")

        if current_invocations >= user_rate_limit:
            raise LambdaError(429, "Rate limit exceeded.")

        # Update invocations if within TTL
        try:
            table.update_item(
                Key={'associated_account': client_id},
                UpdateExpression="SET invocations = if_not_exists(invocations, :start) + :inc, created_at = if_not_exists(created_at, :now)",
                ExpressionAttributeValues={
                    ':inc': 1,
                    ':start': 0,
                    ':now': current_time
                }
            )
            return {
                "message": "Rate limit check passed.", 
                "current": current_invocations + 1,
                "limit": user_rate_limit
            }
        except ClientError as e:
            logger.error(f"Failed to update rate limit for {client_id}: {e}")
            raise LambdaError(500, "Failed to update rate limit.")

    except ClientError as e:
        logger.error(f"DynamoDB error during rate limit check for {client_id}: {e}")
        raise LambdaError(500, "Database error during rate limit check.")
    except LambdaError:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in check_and_update_rate_limit for {client_id}: {e}")
        raise LambdaError(500, f"Unexpected error during rate limit check: {str(e)}")

def process_rate_limit_request(client_id, session_id, auth_bp):
    if session_id == auth_bp:
        return {"message": "Rate limit check bypassed for admin."}
    
    authorize(client_id, session_id)
    return check_and_update_rate_limit(client_id)
