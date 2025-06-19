import json
import os
import time
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError
import logging
from utils import invoke_lambda, parse_event, authorize, AuthorizationError, create_response, LambdaError
from config import logger, AUTH_BP
from rate_limit_logic import process_rate_limit_request

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment Variables
DYNAMODB_TABLE = os.environ.get('RATE_LIMIT_TABLE', 'RL_AI')
TTL_S = int(os.environ.get('TTL_S', '60'))  # Default 1 minute TTL if not specified

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table("RL_AI")
user_table = dynamodb.Table("Users")

def lambda_handler(event, context):
    try:
        parsed_event = parse_event(event)
        
        client_id = parsed_event.get('client_id') or parsed_event.get('account_id')
        session_id = parsed_event.get('session') or parsed_event.get('session_id')
        
        if not client_id or not session_id:
            raise LambdaError(400, "Missing required fields: client_id and session are required.")
            
        result = process_rate_limit_request(client_id, session_id, AUTH_BP)
        
        return create_response(200, result)

    except LambdaError as e:
        return create_response(e.status_code, {"message": e.message, "error": type(e).__name__})
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}", exc_info=True)
        return create_response(500, {"message": "An internal server error occurred."}) 