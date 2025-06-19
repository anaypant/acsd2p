import json
import boto3
import logging
import os
from typing import Dict, Any, Tuple, Optional

from llm_interface import generate_email_response, invoke_rate_limit
from db import get_email_chain
from config import logger, AWS_REGION, AWS_RATE_LIMIT_LAMBDA, AI_RATE_LIMIT_LAMBDA, AUTH_BP
from utils import authorize, parse_event

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Get AUTH_BP from config if available, otherwise from environment
try:
    from config import AUTH_BP
except ImportError:
    AUTH_BP = os.environ.get("AUTH_BP", "")
    logger.warning("AUTH_BP not found in config, using environment variable")

def generate_response_for_conversation(conversation_id: str, account_id: str, session_id: str, invocation_id: str, is_first_email: bool = False, scenario: str = None) -> Dict[str, Any]:
    """
    Generates an LLM response for a conversation.
    Returns the generated response and status.
    
    Args:
        conversation_id: The conversation ID
        account_id: The account ID  
        session_id: The session ID
        invocation_id: Unique ID for this Lambda invocation (groups all LLM calls)
        is_first_email: Whether this is the first email in a chain
        scenario: Optional scenario override
    """
    try:
        logger.info(f"Starting response generation for invocation {invocation_id}")
        logger.info(f"  - Conversation: {conversation_id}")
        logger.info(f"  - Account: {account_id}")
        logger.info(f"  - Is first email: {is_first_email}")
        logger.info(f"  - Scenario: {scenario}")
        
        # Get the email chain
        chain = get_email_chain(conversation_id, account_id, session_id)
        
        if not chain:
            raise ValueError("Could not get email chain")

        # For first emails, we only use the first message
        if is_first_email:
            chain = [chain[0]]

        # Generate response with invocation_id for tracking
        response = generate_email_response(chain, account_id, conversation_id, scenario, invocation_id, session_id)
        logger.info(f"Generated response for conversation {conversation_id} using scenario '{scenario}' (invocation: {invocation_id})")

        # If response is None, it means the conversation was flagged for review
        if response is None:
            return {
                'response': None,
                'conversation_id': conversation_id,
                'invocation_id': invocation_id,
                'status': 'flagged_for_review',
                'message': 'Conversation flagged for human review - no email will be sent'
            }

        # Map scenario to llm_email_type
        llm_email_type = scenario if scenario in ['intro_email', 'continuation_email', 'closing_referral', 'summarizer'] else 'continuation_email'

        return {
            'response': response,
            'conversation_id': conversation_id,
            'invocation_id': invocation_id,
            'status': 'success',
            'llm_email_type': llm_email_type
        }
    except Exception as e:
        logger.error(f"Error generating response for invocation {invocation_id}: {str(e)}")
        return {
            'status': 'error',
            'error': str(e),
            'invocation_id': invocation_id
        }



def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for processing email responses.
    """
    try:
        # Use robust event parsing
        parsed_event = parse_event(event)
        # Extract fields from parsed_event
        conversation_id = parsed_event.get('conversation_id')
        acc_id = parsed_event.get('account_id')
        is_first_email = parsed_event.get('is_first_email', False)
        scenario = parsed_event.get('scenario')
        session_id = parsed_event.get('session_id')

        # Check for required fields before DB calls
        if not acc_id or not session_id:
            logger.error(f"Missing required fields for DB call: account_id={acc_id}, session_id={session_id}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'status': 'error',
                    'error': 'Missing required fields: account_id and session_id',
                })
            }
            
        # Skip auth and rate limits for admin bypass
        if session_id != AUTH_BP:
            authorize(acc_id, session_id)
            
            # Check both AWS and AI rate limits via Lambda invocations
            is_aws_allowed, aws_error = invoke_rate_limit(AWS_RATE_LIMIT_LAMBDA, acc_id, session_id)
            if not is_aws_allowed:
                logger.warning(f"AWS rate limit exceeded for account {acc_id}: {aws_error}")
                return {
                    'statusCode': 429,
                    'body': json.dumps({
                        'status': 'error',
                        'error': aws_error,
                    })
                }
                
            is_ai_allowed, ai_error = invoke_rate_limit(AI_RATE_LIMIT_LAMBDA, acc_id, session_id)
            if not is_ai_allowed:
                logger.warning(f"AI rate limit exceeded for account {acc_id}: {ai_error}")
                return {
                    'statusCode': 429,
                    'body': json.dumps({
                        'status': 'error',
                        'error': ai_error,
                    })
                }
        
        # Generate email response
        try:
            # Get the email chain
            chain = get_email_chain(conversation_id, acc_id, session_id)

            response = generate_email_response(
                emails=chain,
                uid=acc_id,
                conversation_id=conversation_id,
                scenario=scenario,
                invocation_id="null",
                session_id=session_id
            )
            
            if response is None:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'flagged',
                        'message': 'Conversation flagged for review',
                        'invocation_id': "null"
                    })
                }
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'success',
                    'response': response,
                    'invocation_id': "null"
                })
            }
            
        except Exception as e:
            logger.error(f"Error generating email response: {str(e)}", exc_info=True)
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'status': 'error',
                    'error': str(e),
                    'invocation_id': "null"
                })
            }
            
    except Exception as e:
        logger.error(f"Error in lambda handler: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'error',
                'error': str(e),
                'invocation_id': context.aws_request_id if context else None
            })
        } 