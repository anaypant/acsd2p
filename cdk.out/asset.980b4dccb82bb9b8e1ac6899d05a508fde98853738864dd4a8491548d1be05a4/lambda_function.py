from config import logger, AUTH_BP
from utils import create_response, LambdaError, parse_event
from rate_limit_logic import process_rate_limit_request

def lambda_handler(event, context):
    try:
        parsed_event = parse_event(event)
        
        client_id = parsed_event.get('client_id') or parsed_event.get('account_id') or parsed_event.get('account') or parsed_event.get('client_id')
        session_id = parsed_event.get('session_id') or parsed_event.get('session')
        
        # Safely handle cookies
        if not session_id and parsed_event.get('cookies'):
            session_id = parsed_event['cookies'].get('session_id')
        
        if not client_id or not session_id:
            raise LambdaError(400, "Missing required fields: client_id and session are required.")
            
        result = process_rate_limit_request(client_id, session_id, AUTH_BP)
        
        return create_response(200, result)

    except LambdaError as e:
        return create_response(e.status_code, {"message": e.message, "error": type(e).__name__})
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}", exc_info=True)
        return create_response(500, {"message": "An internal server error occurred."})
