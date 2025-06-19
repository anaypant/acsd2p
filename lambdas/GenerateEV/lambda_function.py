import json
import logging
from typing import Dict, Any
import os

from ev_logic import calculate_ev_for_conversation
from utils import parse_event, authorize, AuthorizationError, invoke_lambda, create_response, LambdaError, check_aws_rate_limit

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

AUTH_BP = os.environ.get('AUTH_BP', '')

def lambda_handler(event, context):
    """
    Main lambda handler for EV calculation.
    
    Args:
        event: AWS Lambda event
        context: AWS Lambda context
        
    Returns:
        Dict: Response with EV score and status
    """
    try:
        parsed_event = parse_event(event)
        
        conversation_id = parsed_event.get('conversation_id')
        account_id = parsed_event.get('account_id') or parsed_event.get('account') or parsed_event.get('client_id')
        session_id = parsed_event.get('session_id') or parsed_event.get('session')
        
        if not all([conversation_id, account_id, session_id]):
            raise LambdaError(400, "Missing required fields: conversation_id, account_id, or session_id.")
        
        # Skip authorization for internal calls
        if session_id != AUTH_BP:
            authorize(account_id, session_id)
            check_aws_rate_limit(account_id, session_id)
        
        # Calculate EV score using the modular logic
        ev_score, token_usage = calculate_ev_for_conversation(
            conversation_id=conversation_id,
            account_id=account_id,
            session_id=session_id
        )
        
        response_body = {
            'ev_score': ev_score,
            'conversation_id': conversation_id,
            'status': 'success',
            'token_usage': token_usage
        }
        return create_response(200, response_body)
        
    except LambdaError as e:
        logger.error(f"Error processing EV calculation: {e.message}")
        return create_response(e.status_code, {"status": "error", "error": e.message})
    except AuthorizationError as e:
        logger.error(f"Authorization error: {str(e)}")
        return create_response(401, {"status": "error", "error": "Unauthorized"})
    except Exception as e:
        logger.error(f"An unexpected error occurred in lambda_handler: {e}")
        return create_response(500, {"status": "error", "error": "An internal server error occurred."}) 