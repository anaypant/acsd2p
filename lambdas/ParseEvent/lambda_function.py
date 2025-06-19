import json
from config import logger
from utils import create_response

def parse_cookies(cookie_string):
    """
    Parses a cookie string into a dictionary.
    """
    if not cookie_string:
        return {}
    return dict(cookie.split('=', 1) for cookie in cookie_string.split('; '))

def lambda_handler(event, context):
    """
    Parse an event from either API Gateway or direct Lambda invocation
    
    Args:
        event (dict): The event to parse, either from API Gateway or direct Lambda
        context (LambdaContext): Lambda context object
        
    Returns:
        dict: Response containing status code and parsed data
        {
            "statusCode": int,
            "body": dict
        }
    """
    try:
        print(f"DEBUG: ParseEvent received event: {json.dumps(event, default=str)}")
        parsed_data = {}
        
        # API Gateway event
        if 'body' in event and event['body'] is not None:
            if isinstance(event['body'], str):
                try:
                    parsed_data.update(json.loads(event['body']))
                except json.JSONDecodeError:
                    # If body is not a valid JSON, it might be a different format.
                    # This could be handled more gracefully depending on expected inputs.
                    logger.warning(f"Request body is not a valid JSON string: {event['body']}")
                    parsed_data['raw_body'] = event['body']
            else:
                parsed_data.update(event.get('body', {}))

            if 'headers' in event and 'Cookie' in event['headers']:
                parsed_data['cookies'] = parse_cookies(event['headers']['Cookie'])
        
        # Direct Lambda invocation
        else:
            parsed_data.update(event)
        
        print(f"DEBUG: ParseEvent returning parsed_data: {json.dumps(parsed_data, default=str)}")
        return create_response(200, parsed_data)
        
    except Exception as e:
        logger.error(f"Error parsing event: {e}")
        return create_response(400, {"error": "Failed to parse event", "message": str(e)})
