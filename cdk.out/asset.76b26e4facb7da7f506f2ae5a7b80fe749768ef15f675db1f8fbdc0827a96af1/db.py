import boto3
import logging
import time
import uuid
from typing import Dict, Any, List, Optional
from config import get_table_name, LOGGING_CONFIG
from utils import db_select

# Set up logging
logger = logging.getLogger(__name__)
logger.setLevel(getattr(logging, LOGGING_CONFIG['LEVEL']))

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

def get_email_chain(conversation_id: str, account_id: str, session_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves and formats the email chain for a conversation.
    Returns a list of dictionaries with consistent 'subject' and 'body' keys.
    """
    start_time = time.time()
    logger.info(f"Fetching email chain for conversation: {conversation_id}")

    try:
        items = db_select(
            table_name=get_table_name('CONVERSATIONS'),
            index_name='conversation_id-index',
            key_name='conversation_id',
            key_value=conversation_id,
            account_id=account_id,
            session_id=session_id
        )
        
        logger.info(f"Retrieved {len(items)} items from db-select lambda.")
        
        # Sort by timestamp
        sorted_items = sorted(items, key=lambda x: x.get('timestamp', ''))
        
        # Format items to have consistent keys
        formatted_chain = []
        for idx, item in enumerate(sorted_items, 1):
            formatted_item = {
                'subject': item.get('subject', ''),
                'body': item.get('body', ''),
                'sender': item.get('sender', ''),
                'timestamp': item.get('timestamp', ''),
                'type': item.get('type', '')
            }
            formatted_chain.append(formatted_item)
        
        return formatted_chain
        
    except Exception as e:
        logger.error(f"Error fetching email chain: {str(e)}", exc_info=True)
        raise Exception(f"Failed to fetch email chain for conversation {conversation_id}: {str(e)}")

def store_llm_invocation(
    associated_account: str,
    input_tokens: int,
    output_tokens: int,
    llm_email_type: str,
    model_name: str,
    conversation_id: Optional[str] = None,
    invocation_id: Optional[str] = None
) -> bool:
    """
    Store an LLM invocation record in DynamoDB.
    Returns True if successful, False otherwise.
    """
    start_time = time.time()
    logger.info(f"Storing LLM invocation record for account: {associated_account}")
    
    if LOGGING_CONFIG['ENABLE_REQUEST_LOGGING']:
        logger.info("Invocation details:")
        logger.info(f"  Account: {associated_account}")
        logger.info(f"  Type: {llm_email_type}")
        logger.info(f"  Model: {model_name}")
        logger.info(f"  Input tokens: {input_tokens}")
        logger.info(f"  Output tokens: {output_tokens}")
        logger.info(f"  Total tokens: {input_tokens + output_tokens}")
        if conversation_id:
            logger.info(f"  Conversation ID: {conversation_id}")
        if invocation_id:
            logger.info(f"  Invocation ID: {invocation_id}")
    
    try:
        invocations_table = dynamodb.Table(get_table_name('INVOCATIONS'))
        
        # Create timestamp for sorting
        timestamp = int(time.time() * 1000)
        
        item = {
            'id': str(uuid.uuid4()),  # Unique identifier for the invocation
            'associated_account': associated_account,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'llm_email_type': llm_email_type,
            'model_name': model_name,
            'timestamp': timestamp,
            'total_tokens': input_tokens + output_tokens  # Convenience field for analytics
        }
        
        # Add optional fields if provided
        if conversation_id:
            item['conversation_id'] = conversation_id
        if invocation_id:
            item['invocation_id'] = invocation_id
            
        if LOGGING_CONFIG['ENABLE_REQUEST_LOGGING']:
            logger.info(f"Writing to DynamoDB table: {invocations_table.name}")
            logger.info(f"Item ID: {item['id']}")
        
        write_start = time.time()
        invocations_table.put_item(Item=item)
        write_duration = time.time() - write_start
        
        if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
            logger.info(f"DynamoDB write completed in {write_duration:.2f} seconds")
        
        # Success logging
        logger.info(f"✅ Successfully stored LLM invocation record:")
        logger.info(f"   - Record ID: {item['id']}")
        logger.info(f"   - Account: {associated_account}")
        logger.info(f"   - Type: {llm_email_type}")
        logger.info(f"   - Tokens: {input_tokens + output_tokens} total")
        if invocation_id:
            logger.info(f"   - Invocation ID: {invocation_id}")
        if conversation_id:
            logger.info(f"   - Conversation ID: {conversation_id}")
        
        total_duration = time.time() - start_time
        if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
            logger.info(f"Total invocation storage completed in {total_duration:.2f} seconds")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error storing LLM invocation record: {str(e)}", exc_info=True)
        logger.error("Error context:")
        logger.error(f"   - Account: {associated_account}")
        logger.error(f"   - Type: {llm_email_type}")
        logger.error(f"   - Model: {model_name}")
        logger.error(f"   - Tokens: {input_tokens}/{output_tokens}")
        logger.error(f"   - Table: {invocations_table.name}")
        if invocation_id:
            logger.error(f"   - Invocation ID: {invocation_id}")
        if conversation_id:
            logger.error(f"   - Conversation ID: {conversation_id}")
        logger.error(f"   - Execution time: {time.time() - start_time:.2f} seconds")
        return False

def get_thread_account_id(conversation_id: str) -> Optional[str]:
    """
    Get the associated account ID for a conversation from the Threads table.
    Returns None if the thread doesn't exist or there's an error.
    """
    start_time = time.time()
    logger.info(f"Fetching account ID for conversation: {conversation_id}")
    
    try:
        table = dynamodb.Table(get_table_name('THREADS'))
        
        if LOGGING_CONFIG['ENABLE_REQUEST_LOGGING']:
            logger.info(f"Querying DynamoDB table: {table.name}")
            logger.info(f"Query parameters: conversation_id = {conversation_id}")
        
        query_start = time.time()
        response = table.get_item(
            Key={'conversation_id': conversation_id}
        )
        query_duration = time.time() - query_start
        
        if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
            logger.info(f"DynamoDB query completed in {query_duration:.2f} seconds")
        
        if 'Item' not in response:
            logger.warning(f"Thread not found for conversation {conversation_id}")
            return None
            
        account_id = response['Item'].get('associated_account')
        if not account_id:
            logger.warning(f"No associated_account found for conversation {conversation_id}")
            return None
            
        logger.info(f"Found account_id {account_id} for conversation {conversation_id}")
        
        total_duration = time.time() - start_time
        if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
            logger.info(f"Total account ID retrieval completed in {total_duration:.2f} seconds")
            
        return account_id
        
    except Exception as e:
        logger.error(f"Error getting thread account_id: {str(e)}", exc_info=True)
        logger.error("Error context:")
        logger.error(f"  Conversation ID: {conversation_id}")
        logger.error(f"  Table: {table.name}")
        logger.error(f"  Execution time: {time.time() - start_time:.2f} seconds")
        return None 