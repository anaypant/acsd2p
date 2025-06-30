# db.py
import json
import boto3
import logging
from typing import Dict, Any, Optional, List, Tuple
from config import AWS_REGION, DB_SELECT_LAMBDA
import time
import uuid
from utils import db_select, db_update, invoke_lambda, LambdaError
from config import logger


logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda', region_name=AWS_REGION)
dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)


def get_conversation_id(message_id: str, account_id: str, session_id: str) -> Optional[str]:
    """Get conversation ID by message ID."""
    if not message_id:
        return None
    
    result = db_select('Conversations', 'response_id-index', 'response_id', message_id, account_id, session_id)
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('conversation_id')
    return None

def get_associated_account(email: str, account_id: str, session_id: str) -> Optional[str]:
    """Get account ID by email."""
    result = db_select('Users', 'responseEmail-index', 'responseEmail', email.lower(), account_id, session_id)
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('id')
    return None

def get_email_chain(conversation_id: str, account_id: str, session_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves the email chain for a given conversation ID.
    
    Args:
        conversation_id (str): The conversation ID to retrieve
        account_id (str): The account ID for authorization
        session_id (str): The session ID for authorization
    
    Returns:
        List[Dict[str, Any]]: List of email messages in the chain
    """
    try:
        table = dynamodb.Table('Conversations')
        
        # Determine if associated_account is part of the index
        index_name = 'conversation_id-index'
        key_name = 'conversation_id'
        key_value = conversation_id
        
        # Check if associated_account is in the index name
        if 'account' in index_name.lower():
            # If associated_account is part of the index, include it in KeyConditionExpression
            query_params = {
                'IndexName': index_name,
                'KeyConditionExpression': f"{key_name} = :key_value AND associated_account = :account_id",
                'ExpressionAttributeValues': {
                    ':key_value': key_value,
                    ':account_id': account_id
                }
            }
        else:
            # If associated_account is not part of the index, use it as a filter
            query_params = {
                'IndexName': index_name,
                'KeyConditionExpression': f"{key_name} = :key_value",
                'FilterExpression': "associated_account = :account_id",
                'ExpressionAttributeValues': {
                    ':key_value': key_value,
                    ':account_id': account_id
                }
            }
            
        response = table.query(**query_params)
        items = response.get('Items', [])
        
        # Sort by timestamp and format items
        sorted_items = sorted(items, key=lambda x: x.get('timestamp', ''))
        
        return [{
            'subject': item.get('subject', ''),
            'body': item.get('body', ''),
            'sender': item.get('sender', ''),
            'timestamp': item.get('timestamp', ''),
            'type': item.get('type', ''),
            'message_id': item.get('response_id')
        } for item in sorted_items]
        
    except Exception as e:
        logger.error(f"Error retrieving email chain: {str(e)}")
        return []

def get_account_email(account_id: str, session_id: str) -> Optional[str]:
    """Get account email by account ID."""
    result = db_select('Users', 'id-index', 'id', account_id, account_id, session_id)
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('responseEmail')
    return None

def update_thread_attributes(conversation_id: str, attributes: Dict[str, Any], account_id: str, session_id: str) -> bool:
    """
    Update thread attributes in the Threads table.
    
    Args:
        conversation_id (str): The conversation ID to update
        attributes (Dict[str, Any]): The attributes to update
        account_id (str): The account ID for authorization
        session_id (str): The session ID for authorization
    
    Returns:
        bool: True if update was successful, False otherwise
    """
    try:
        success = db_update('Threads', 'conversation_id-index', 'conversation_id', conversation_id, attributes, account_id, session_id)
        
        if success:
            logger.info(f"Updated thread attributes for conversation {conversation_id}")
        else:
            logger.error(f"Failed to update thread attributes for conversation {conversation_id}")
        
        return success
        
    except Exception as e:
        logger.error(f"Error updating thread attributes: {str(e)}")
        return False

def check_rate_limit(account_id: str, type: str) -> None:
    """
    Checks rate limit by invoking the appropriate rate-limiting lambda.
    'type' can be 'AWS' or 'AI'.
    """
    function_name = f"rate-limit-{type.lower()}"
    try:
        # Using a dummy session ID because this is an internal, trusted check
        invoke_lambda(function_name, {'client_id': account_id, 'session': 'internal_check'})
    except LambdaError as e:
        if e.status_code == 429:
            raise LambdaError(429, f"{type} rate limit exceeded.")
        else:
            raise e

def check_and_update_ai_rate_limit(account_id, session_id):
    """
    Checks and updates the AI rate limit for a given account by invoking the rate-limit-ai lambda.
    """
    try:
        payload = {'client_id': account_id, 'session': session_id}
        response = invoke_lambda('RateLimitAI', payload)
        
        if response.get('statusCode') != 200:
            return False, "Rate limit check failed."
            
        body = json.loads(response.get('body', '{}'))
        return True, body.get('message', "Rate limit check passed.")

    except LambdaError as e:
        logger.error(f"AI rate limit check failed for account {account_id}: {e.message}")
        if e.status_code == 429:
            return False, "Rate limit exceeded."
        raise