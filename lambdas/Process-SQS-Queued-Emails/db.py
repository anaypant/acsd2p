# db.py
import json
import boto3
import logging
from typing import Dict, Any, Optional, List
from config import AWS_REGION, DB_SELECT_LAMBDA
from datetime import datetime, timedelta
import uuid
from utils import invoke_lambda, db_select, db_update, LambdaError
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda', region_name=AWS_REGION)
dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)

def invoke_db_select(table_name: str, index_name: Optional[str], key_name: str, key_value: Any, account_id: str, session_id: str) -> Optional[Dict[str, Any]]:
    """
    Generic function to invoke the db-select Lambda for read operations only.
    Returns the parsed response or None if the invocation failed.
    """
    try:
        payload = {
            'table_name': table_name,
            'index_name': index_name,
            'key_name': key_name,
            'key_value': key_value,
            'account_id': account_id,
            'session_id': session_id
        }
        
        logger.info(f"Invoking database Lambda with payload: {json.dumps(payload)}")
        
        response = lambda_client.invoke(
            FunctionName=DB_SELECT_LAMBDA,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        # Read and parse the response payload
        response_payload = json.loads(response['Payload'].read())
        logger.info(f"Raw database Lambda response: {json.dumps(response_payload)}")
        
        # Check if response has the expected structure
        if not isinstance(response_payload, dict):
            logger.error(f"Database Lambda response is not a dictionary: {type(response_payload)}")
            return None
            
        if 'statusCode' not in response_payload:
            logger.error(f"Database Lambda response missing statusCode: {response_payload}")
            return None
            
        if response_payload['statusCode'] != 200:
            logger.error(f"Database Lambda failed with status {response_payload['statusCode']}: {response_payload}")
            return None
            
        if 'body' not in response_payload:
            logger.error(f"Database Lambda response missing body: {response_payload}")
            return None
            
        try:
            # Parse the body which should be a JSON string
            body_data = json.loads(response_payload['body'])
            logger.info(f"Parsed database Lambda response body: {json.dumps(body_data)}")
            return body_data
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse database Lambda response body as JSON: {str(e)}")
            return None
            
    except Exception as e:
        logger.error(f"Error invoking database Lambda: {str(e)}", exc_info=True)
        return None

def get_conversation_id(message_id: str, account_id: str, session_id: str) -> Optional[str]:
    """Get conversation ID by message ID."""
    if not message_id:
        return None
    
    result = invoke_db_select(
        table_name='Conversations',
        index_name='response_id-index',
        key_name='response_id',
        key_value=message_id,
        account_id=account_id,
        session_id=session_id
    )
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('conversation_id')
    return None

def get_associated_account(email: str, account_id: str, session_id: str) -> Optional[str]:
    """Get account ID by email."""
    result = invoke_db_select(
        table_name='Users',
        index_name='responseEmail-index',
        key_name='responseEmail',
        key_value=email.lower(),
        account_id=account_id,
        session_id=session_id
    )
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('id')
    return None

def get_email_chain(conversation_id: str, account_id: str, session_id: str) -> List[Dict[str, Any]]:
    """Get email chain for a conversation."""
    result = invoke_db_select(
        table_name='Conversations',
        index_name=None,  # Primary key query
        key_name='conversation_id',
        key_value=conversation_id,
        account_id=account_id,
        session_id=session_id
    )
    
    # Handle list response directly
    if not isinstance(result, list):
        return []
        
    # Sort by timestamp and format items
    sorted_items = sorted(result, key=lambda x: x.get('timestamp', ''))
    
    return [{
        'subject': item.get('subject', ''),
        'body': item.get('body', ''),
        'sender': item.get('sender', ''),
        'timestamp': item.get('timestamp', ''),
        'type': item.get('type', '')
    } for item in sorted_items]

def get_account_email(account_id: str, session_id: str) -> Optional[str]:
    """Get account email by account ID."""
    result = invoke_db_select(
        table_name='Users',
        index_name=None,  # Primary key query
        key_name='id',
        key_value=account_id,
        account_id=account_id,
        session_id=session_id
    )
    
    # Handle list response
    if isinstance(result, list) and result:
        return result[0].get('responseEmail')
    return None

def get_user_lcp_automatic_enabled(account_id: str, session_id: str) -> bool:
    """Get lcp_automatic_enabled status for a user by account ID."""
    result = invoke_db_select(
        table_name='Users',
        index_name='id-index',  # Primary key query
        key_name='id',
        key_value=account_id,
        account_id=account_id,
        session_id=session_id
    )
    
    # Handle list response
    if isinstance(result, list) and result:
        lcp_automatic_enabled = result[0].get('lcp_automatic_enabled', 'false')
        return lcp_automatic_enabled.lower() == 'true'
    return False

def update_thread_attributes(conversation_id: str, attributes: Dict[str, Any]) -> bool:
    """Update thread with new attributes using direct DynamoDB access."""
    try:
        threads_table = dynamodb.Table('Threads')
        
        # Build update expression and attribute values
        update_expr = "SET "
        expr_attr_values = {}
        expr_attr_names = {}
        
        for i, (key, value) in enumerate(attributes.items()):
            placeholder = f":val{i}"
            name_placeholder = f"#attr{i}"
            update_expr += f"{name_placeholder} = {placeholder}, "
            expr_attr_values[placeholder] = value
            expr_attr_names[name_placeholder] = key
        
        # Remove trailing comma and space
        update_expr = update_expr[:-2]
        
        threads_table.update_item(
            Key={'conversation_id': conversation_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_attr_values,
            ExpressionAttributeNames=expr_attr_names
        )
        
        logger.info(f"Successfully updated thread attributes for conversation {conversation_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating thread attributes: {str(e)}")
        return False

def store_conversation_item(item: Dict[str, Any]) -> bool:
    """Store a conversation item using direct DynamoDB access."""
    try:
        conversations_table = dynamodb.Table('Conversations')
        conversations_table.put_item(Item=item)
        return True
    except Exception as e:
        logger.error(f"Error storing conversation item: {str(e)}")
        return False

def store_spam_conversation_item(item: Dict[str, Any], ttl_days: int = 30) -> bool:
    """Store a spam conversation item with TTL using direct DynamoDB access."""
    try:
        # Add spam flag and TTL to the item
        spam_item = item.copy()
        spam_item['spam'] = 'true'
        
        # Calculate TTL (Unix timestamp for DynamoDB TTL)
        ttl_timestamp = int((datetime.utcnow() + timedelta(days=ttl_days)).timestamp())
        spam_item['ttl'] = ttl_timestamp
        
        conversations_table = dynamodb.Table('Conversations')
        conversations_table.put_item(Item=spam_item)
        
        # Also create a thread entry for the spam conversation if first        
        logger.info(f"Stored spam conversation and thread with {ttl_days}-day TTL (expires at timestamp: {ttl_timestamp})")
        return True
    except Exception as e:
        logger.error(f"Error storing spam conversation item: {str(e)}")
        return False

def store_thread_item(item: Dict[str, Any]) -> bool:
    """Store a thread item using direct DynamoDB access."""
    try:
        # Ensure context_notes is included as empty string if not provided
        if 'context_notes' not in item:
            item['context_notes'] = ''
            
        threads_table = dynamodb.Table('Threads')
        threads_table.put_item(Item=item)
        return True
    except Exception as e:
        logger.error(f"Error storing thread item: {str(e)}")
        return False

def update_thread_read_status(conversation_id: str, read_status: str) -> bool:
    """Update thread read status using direct DynamoDB access."""
    try:
        threads_table = dynamodb.Table('Threads')
        threads_table.update_item(
            Key={'conversation_id': conversation_id},
            UpdateExpression='SET #read = :read',
            ExpressionAttributeNames={'#read': 'read'},
            ExpressionAttributeValues={':read': read_status}
        )
        return True
    except Exception as e:
        logger.error(f"Error updating thread read status: {str(e)}")
        return False

def store_ai_invocation(
    associated_account: str,
    input_tokens: int,
    output_tokens: int,
    llm_email_type: Optional[str] = None,
    conversation_id: Optional[str] = None,
    model_name: str = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8"
) -> bool:
    """
    Store an AI invocation record in the Invocations table.
    Returns True if successful, False otherwise.
    """
    try:
        invocations_table = dynamodb.Table('Invocations')
        
        # Generate a unique invocation ID
        invocation_id = str(uuid.uuid4())
        
        # Prepare the invocation record
        invocation_data = {
            'id': invocation_id,
            'associated_account': associated_account,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'model_name': model_name,
            'timestamp': int(time.time() * 1000)
        }
        
        # Add optional fields if provided
        if llm_email_type:
            invocation_data['llm_email_type'] = llm_email_type
        if conversation_id:
            invocation_data['conversation_id'] = conversation_id
            
        # Store in Invocations table
        invocations_table.put_item(Item=invocation_data)
        logger.info(f"Stored AI invocation record for account {associated_account}")
        return True
        
    except Exception as e:
        logger.error(f"Error storing AI invocation record: {str(e)}")
        return False

