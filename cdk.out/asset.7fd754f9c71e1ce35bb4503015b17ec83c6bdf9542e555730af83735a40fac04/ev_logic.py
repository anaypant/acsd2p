import time
import boto3
from config import logger
from utils import LambdaError, store_ai_invocation, update_thread_ev, update_conversation_ev
from ev_calculator import calc_ev
from db import get_email_chain, update_thread_attributes
from flag_llm import invoke_flag_llm

dynamodb = boto3.resource('dynamodb')

def calculate_ev_for_conversation(conversation_id: str, account_id: str, session_id: str) -> tuple[int, dict[str, int]]:
    """
    Calculate the EV score for a conversation.
    
    Args:
        conversation_id (str): The conversation ID
        account_id (str): The account ID for authorization
        session_id (str): The session ID for authorization
    
    Returns:
        Tuple[int, Dict[str, int]]: (ev_score, token_usage)
        
    Raises:
        LambdaError: If any step fails
    """
    # Get the email chain
    chain_result = get_email_chain(conversation_id, account_id, session_id)
    if not chain_result:
        raise LambdaError(404, f"Failed to get email chain for conversation {conversation_id}")
    
    # Handle different return types from get_email_chain
    if isinstance(chain_result, tuple):
        chain, realtor_email = chain_result
    else:
        chain = chain_result
        realtor_email = None
    
    if not chain:
        raise LambdaError(404, f"Failed to get email chain for conversation {conversation_id}")
    
    # Calculate EV score
    ev_result = calc_ev(chain, account_id, conversation_id, session_id)
    if isinstance(ev_result, tuple):
        ev_score, token_usage_ev = ev_result
    else:
        ev_score = ev_result
        token_usage_ev = {'input_tokens': 0, 'output_tokens': 0}
    
    if ev_score < 0:
        raise LambdaError(500, f"Failed to calculate EV score for conversation {conversation_id}")
    
    # Get flag decision
    flag_result = invoke_flag_llm(chain, account_id, conversation_id, session_id)
    if isinstance(flag_result, tuple):
        should_flag, token_usage_flag = flag_result
    else:
        should_flag = flag_result
        token_usage_flag = {'input_tokens': 0, 'output_tokens': 0}
    
    # Ensure should_flag is a boolean
    if isinstance(should_flag, (tuple, list)):
        should_flag = bool(should_flag[0]) if should_flag else False
    else:
        should_flag = bool(should_flag)
    
    # Update thread EV with flag decision
    if not update_thread_ev(conversation_id, ev_score, should_flag, account_id, session_id):
        raise LambdaError(500, f"Failed to update thread EV for conversation {conversation_id}")
    
    # Update conversation EV (using conversation_id as message_id if not available)
    if not update_conversation_ev(conversation_id, conversation_id, ev_score, account_id, session_id):
        raise LambdaError(500, f"Failed to update conversation EV for conversation {conversation_id}")
    
    # Calculate total token usage
    total_input_tokens = token_usage_ev.get('input_tokens', 0) + token_usage_flag.get('input_tokens', 0)
    total_output_tokens = token_usage_ev.get('output_tokens', 0) + token_usage_flag.get('output_tokens', 0)
    
    # Store AI invocation records
    if not store_ai_invocation(
        associated_account=account_id,
        input_tokens=token_usage_ev.get('input_tokens', 0),
        output_tokens=token_usage_ev.get('output_tokens', 0),
        llm_email_type='ev_calculation',
        model_name='meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
        conversation_id=conversation_id,
        session_id=session_id
    ):
        logger.error(f"Failed to store EV calculation invocation record for conversation {conversation_id}")
    
    if not store_ai_invocation(
        associated_account=account_id,
        input_tokens=token_usage_flag.get('input_tokens', 0),
        output_tokens=token_usage_flag.get('output_tokens', 0),
        llm_email_type='flag',
        model_name='meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
        conversation_id=conversation_id,
        session_id=session_id
    ):
        logger.error(f"Failed to store flag invocation record for conversation {conversation_id}")
    
    logger.info(f"Calculated EV score {ev_score} and flag decision {should_flag} for conversation {conversation_id}")
    
    return ev_score, {"input_tokens": total_input_tokens, "output_tokens": total_output_tokens}
