import json
import time
from config import logger, LOGGING_CONFIG, AUTH_BP
from utils import create_response, LambdaError, authorize, invoke_lambda
from thread_logic import get_attributes_for_thread

def lambda_handler(event, context):
    start_time = time.time()
    conversation_id = None
    try:
        if LOGGING_CONFIG.get('ENABLE_REQUEST_LOGGING'):
            logger.info(f"Incoming event: {event}")

        if not event.get('body'):
            raise LambdaError(400, "Missing request body.")

        try:
            body = json.loads(event['body'])
            conversation_id = body.get('conversationId')
            account_id = body.get('accountId')
            session_id = body.get('sessionId', AUTH_BP)  # Default to AUTH_BP if not provided
        except json.JSONDecodeError:
            raise LambdaError(400, "Invalid JSON in request body.")
        
        if not conversation_id:
            raise LambdaError(400, "Missing conversationId in request body.")
        if not account_id:
            raise LambdaError(400, "Missing accountId in request body.")

        # Check authorization and rate limits if not using AUTH_BP
        if session_id != AUTH_BP:
            authorize(account_id, session_id)
            # Check rate limits
            rate_limit_response = invoke_lambda('RateLimitAWS', {
                'client_id': account_id,
                'session': session_id
            })
            
            if rate_limit_response.get('statusCode') == 429:
                logger.warning(f"Rate limit exceeded for account {account_id}")
                return create_response(429, {
                    'error': 'Rate limit exceeded',
                    'message': 'You have exceeded your AWS API rate limit. Please try again later.'
                })
            elif rate_limit_response.get('statusCode') == 401:
                logger.warning(f"Unauthorized request for account {account_id}")
                return create_response(401, {
                    'error': 'Unauthorized',
                    'message': 'Invalid or expired session'
                })
            elif rate_limit_response.get('statusCode') != 200:
                logger.error(f"Rate limit check failed: {rate_limit_response}")
                return create_response(500, {
                    'error': 'Rate limit check failed',
                    'message': 'An error occurred while checking rate limits'
                })

        attributes, account_id, email_count = get_attributes_for_thread(conversation_id, account_id, session_id)
        
        processing_time = time.time() - start_time
        
        response_body = {
            'attributes': attributes,
            'metadata': {
                'conversationId': conversation_id,
                'accountId': account_id,
                'emailCount': email_count,
                'processingTime': f"{processing_time:.2f}s"
            }
        }
        
        if LOGGING_CONFIG.get('ENABLE_PERFORMANCE_LOGGING'):
            logger.info(f"Lambda execution for {conversation_id} completed in {processing_time:.2f} seconds.")

        return create_response(200, response_body)

    except LambdaError as e:
        logger.error(f"Error processing get-thread-attrs for {conversation_id}: {e.message}")
        return create_response(e.status_code, {"error": e.message, "errorType": type(e).__name__})
    except Exception as e:
        logger.error(f"An unexpected error occurred in lambda_handler for {conversation_id}: {e}", exc_info=True)
        return create_response(500, {"error": "An internal server error occurred.", "errorType": "InternalServerError"})
