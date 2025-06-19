"""
Database Batch Select Lambda Function
===================================

This Lambda function provides secure batch access to DynamoDB records with account-based filtering.
It allows querying multiple values at once and returns all matching records.

API Interface
------------
Endpoint: POST /db-batch-select
Authentication: Required (account_id and session)

Request Payload:
{
    "table_name": string,      # Required: Name of the DynamoDB table to query
    "index_name": string,      # Required: Name of the GSI to use for querying
    "key_name": string,        # Required: Name of the key attribute to query on
    "key_values": array,       # Required: Array of values to match against key_name
    "account_id": string,      # Required: ID of the authenticated user
    "session": string          # Required: Session token for authentication
}

Response:
{
    "statusCode": number,      # HTTP status code
    "headers": object,         # CORS headers
    "body": string            # JSON stringified response body containing array of matching items
}

Status Codes:
- 200: Success - Records retrieved successfully
- 400: Bad Request - Missing required parameters or invalid request format
- 401: Unauthorized - Invalid or expired session
- 429: Too Many Requests - Rate limit exceeded
- 500: Internal Server Error - DynamoDB query failed or rate limit check failed

Security:
- All requests must include valid account_id and session
- Records are filtered to only return those where associated_account matches account_id
- Rate limiting is enforced per account
- CORS headers are automatically applied
"""

import os
import json
import boto3
import logging
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from utils import invoke_lambda, parse_event, authorize, AuthorizationError, create_response, LambdaError

# Configure logging
logger = logging.getLogger()
AUTH_BP = os.environ.get('AUTH_BP', '')
logger.setLevel(logging.INFO)

# Custom JSON encoder to handle Decimal types
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

# Helper function to safely serialize objects with Decimal types
def safe_json_dumps(obj):
    return json.dumps(obj, cls=DecimalEncoder)

# reuse clients
dynamodb = boto3.resource('dynamodb')

def fetch_cors_headers():
    """
    Invoke the designated CORS Lambda and extract its 'headers' map.
    Falls back to empty dict on error.
    """
    fn = 'Allow-Cors'
    logger.info(f"Fetching CORS headers from Lambda function: {fn}")

    try:
        logger.debug("Invoking CORS Lambda function")
        resp = invoke_lambda(fn, {})
        headers = resp.get('headers', {})
        logger.info("Successfully retrieved CORS headers")
        return headers
    except Exception as e:
        logger.error(f"Failed to fetch CORS headers: {str(e)}", exc_info=True)
        return {}

def batch_select_db_items(table_name, index_name, key_name, key_values, account_id, session_id):
    """
    Selects items from DynamoDB based on multiple key values, and filters by account ID.
    Returns all items where the key_name matches any of the key_values.
    """
    table = dynamodb.Table(table_name)
    all_items = []
    
    try:
        # Convert key_values to set for O(1) lookup
        key_values_set = set(key_values)
        
        if 'associated_account' in index_name.lower():
            # If using associated_account index, query by account_id and filter by key_values
            response = table.query(
                IndexName=index_name,
                KeyConditionExpression=Key('associated_account').eq(account_id)
            )
            items = [item for item in response.get('Items', []) 
                    if item.get(key_name) in key_values_set]
            all_items.extend(items)
        else:
            # For other indexes, query each key_value separately
            for key_value in key_values:
                if session_id == AUTH_BP:
                    response = table.query(
                        IndexName=index_name,
                        KeyConditionExpression=Key(key_name).eq(key_value)
                    )
                else:
                    response = table.query(
                        IndexName=index_name,
                        KeyConditionExpression=Key(key_name).eq(key_value),
                        FilterExpression='attribute_exists(associated_account) AND associated_account = :account_id',
                        ExpressionAttributeValues={':account_id': account_id}
                    )
                items = response.get('Items', [])
                all_items.extend(items)
        
        logger.info(f"Batch query successful. Retrieved {len(all_items)} items.")
        return all_items

    except Exception as e:
        logger.error(f"DynamoDB error during batch select: {e}")
        raise LambdaError(500, f"A database error occurred: {e}")

def lambda_handler(event, context):
    logger.info("Lambda function started")
    logger.debug(f"Received event: {safe_json_dumps(event)}")
    
    cors_headers = fetch_cors_headers()
    logger.debug(f"CORS headers: {safe_json_dumps(cors_headers)}")

    # CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        logger.info("Handling OPTIONS request (CORS preflight)")
        return {
            'statusCode': 200,
            'headers': cors_headers
        }

    # Parse the event (handles both API Gateway and direct Lambda)
    try:
        parsed_event = parse_event(event)
    except Exception as e:
        logger.error(f"Error parsing event: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': safe_json_dumps({'error': 'Invalid request format'})
        }
    
    print(parsed_event)

    # Validate required parameters
    table_name = parsed_event.get('table_name')
    index_name = parsed_event.get('index_name')
    key_name = parsed_event.get('key_name')
    key_values = parsed_event.get('key_values')
    account_id = parsed_event.get('account_id') or parsed_event.get('account') or parsed_event.get('client_id')
    session_id = parsed_event.get('session_id') or parsed_event.get('session')

    if not account_id or not session_id:
        logger.warning("Missing account_id or session in request")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'Missing required fields: account_id and session'
            })
        }
        
    logger.info("Authorizing request")
    try:
        if session_id != AUTH_BP:
            authorize(account_id, session_id)
            # Check rate limit using the rate-limit Lambda
            rate_limit_response = invoke_lambda('RateLimitAWS', {
                'client_id': account_id,
                'session': session_id
            })
            
            if rate_limit_response.get('statusCode') == 429:
                logger.warning(f"Rate limit exceeded for account {account_id}")
                return {
                    'statusCode': 429,
                    'headers': cors_headers,
                    'body': safe_json_dumps({
                        'error': 'Rate limit exceeded',
                        'message': 'You have exceeded your AWS API rate limit. Please try again later.'
                    })
                }
            elif rate_limit_response.get('statusCode') == 401:
                logger.warning(f"Unauthorized request for account {account_id}")
                return {
                    'statusCode': 401,
                    'headers': cors_headers,
                    'body': safe_json_dumps({
                        'error': 'Unauthorized',
                        'message': 'Invalid or expired session'
                    })
                }
            elif rate_limit_response.get('statusCode') != 200:
                logger.error(f"Rate limit check failed: {rate_limit_response}")
                return {
                    'statusCode': 500,
                    'headers': cors_headers,
                    'body': safe_json_dumps({
                        'error': 'Rate limit check failed',
                        'message': 'An error occurred while checking rate limits'
                    })
                }
    except AuthorizationError as e:
        logger.error(f"Authorization error: {str(e)}")
        return {
            'statusCode': 401,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'Unauthorized',
                'message': 'Invalid or expired session'
            })
        }
    except Exception as e:
        logger.error(f"Error during authorization or rate limit check: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'Authorization check failed',
                'message': 'An error occurred during authorization'
            })
        }

    logger.info(f"Validating parameters - Table: {table_name}, Index: {index_name}, Key: {key_name}")
    
    if not all([table_name, index_name, key_name, key_values]):
        missing_params = [param for param, value in [
            ('table_name', table_name),
            ('index_name', index_name),
            ('key_name', key_name),
            ('key_values', key_values)
        ] if not value]
        logger.error(f"Missing required parameters: {', '.join(missing_params)}")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'Missing one of table_name, ind ex_name, key_name, or key_values'
            })
        }

    if not isinstance(key_values, list):
        logger.error("key_values must be an array")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'key_values must be an array'
            })
        }

    logger.info(f"Querying DynamoDB table {table_name} using index {index_name}")
    # if key values is empty, return an empty list
    if len(key_values) == 0:
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'items': [],
                'count': 0
            })
        }

    try:
        items = batch_select_db_items(
            table_name=table_name,
            index_name=index_name,
            key_name=key_name,
            key_values=key_values,
            account_id=account_id,
            session_id=session_id
        )
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'items': items,
                'count': len(items)
            })
        }
    except LambdaError as e:
        logger.error(f"Lambda error: {str(e)}")
        return {
            'statusCode': e.status_code,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': e.message
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': safe_json_dumps({
                'error': 'An unexpected error occurred',
                'message': str(e)
            })
        }
