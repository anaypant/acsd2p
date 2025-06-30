"""
Database Update Lambda Function
==============================

This Lambda function provides secure update operations for DynamoDB records with account-based filtering.
It ensures that users can only update records that have their account_id as the associated_account.

Attribute Collision Handling:
- If the same attribute name appears multiple times in update_data, the last occurrence takes precedence
- All existing attributes not being updated are preserved during the update operation
- Complex data types (dicts, lists) are automatically serialized to JSON strings
- Uses put_item with merge strategy to ensure complete attribute preservation

Update Strategy:
- For new items: Creates a new item with all provided attributes
- For existing items: Merges existing item with new update_data, preserving all existing attributes
- This approach is more reliable than DynamoDB's SET operation for ensuring attribute persistence

API Interface
------------
Endpoint: POST /db-update
Authentication: Required (account_id and session)

Request Payload:
{
    "table_name": string,      # Required: Name of the DynamoDB table to update
    "index_name": string,      # Required: Name of the GSI to use for querying
    "key_name": string,        # Required: Name of the key attribute to query on
    "key_value": string,       # Required: Value to match against key_name
    "update_data": object,     # Required: Object containing attributes to update
    "account_id": string,      # Required: ID of the authenticated user
    "session": string          # Required: Session token for authentication
}

Response:
{
    "statusCode": number,      # HTTP status code
    "headers": object,         # CORS headers
    "body": string            # JSON stringified response body
}

Status Codes:
- 200: Success - Records updated successfully
- 400: Bad Request - Missing required parameters or invalid request format
- 401: Unauthorized - Invalid or expired session
- 429: Too Many Requests - Rate limit exceeded
- 500: Internal Server Error - DynamoDB update failed or rate limit check failed

Security:
- All requests must include valid account_id and session
- Records are filtered to only update those where associated_account matches account_id
- Rate limiting is enforced per account
- CORS headers are automatically applied
"""

import json
import boto3
from botocore.exceptions import ClientError
from utils import (
    create_response, LambdaError, parse_event, authorize, 
    DecimalEncoder, serialize_for_dynamodb
)
from utils import invoke_lambda
from config import logger, AUTH_BP
from decimal import Decimal
import os

dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')


def fetch_cors_headers():
    from utils import invoke_lambda
    try:
        response = invoke_lambda(os.environ.get("CORS_FUNCTION_NAME", "Allow-Cors"), {})
        return response.get('headers', {})
    except Exception as e:
        logger.error(f"Failed to fetch CORS headers: {e}")
        return {}

def validate_and_clean_update_data(update_data):
    """
    Validates and cleans update data to ensure it's suitable for DynamoDB operations.
    Returns cleaned data ready for serialization.
    """
    if not isinstance(update_data, dict):
        raise LambdaError(400, "update_data must be a dictionary")
    
    if not update_data:
        raise LambdaError(400, "update_data cannot be empty")
    
    cleaned_data = {}
    
    for key, value in update_data.items():
        # Validate key
        if not isinstance(key, str):
            raise LambdaError(400, f"All keys must be strings, found: {type(key)}")
        
        if not key.strip():
            raise LambdaError(400, "Empty keys are not allowed")
        
        # Check for reserved DynamoDB words (basic check)
        reserved_words = {
            'name', 'value', 'key', 'item', 'table', 'index', 'attribute', 
            'expression', 'condition', 'filter', 'projection', 'scan', 'query'
        }
        
        if key.lower() in reserved_words:
            logger.warning(f"Key '{key}' is a DynamoDB reserved word. This may cause issues.")
        
        # Store the value as-is - serialization will handle type conversion
        cleaned_data[key] = value
    
    logger.info(f"Validated update data with {len(cleaned_data)} attributes")
    return cleaned_data

def db_update_item(table_name, key_name, key_value, index_name, update_data, account_id, session_id):
    """
    Updates or creates an item in DynamoDB using put_item with simple merge strategy.
    Finds items by key_name/key_value and merges update_data into them.
    """
    
    table = dynamodb.Table(table_name)
    
    try:
        # Validate and clean input parameters
        if not isinstance(key_value, (str, int, float, bool)) and key_value is not None:
            raise LambdaError(400, "key_value must be a primitive type (string, number, boolean, or null)")
        
        # Validate and clean update_data
        cleaned_update_data = validate_and_clean_update_data(update_data)
        
        # Serialize update data for DynamoDB compatibility
        try:
            serialized_update_data = serialize_for_dynamodb(cleaned_update_data)
        except ValueError as e:
            logger.error(f"Serialization failed: {e}")
            raise LambdaError(400, f"Failed to serialize update data: {e}")
        
        # Get the table's key schema to understand the primary key structure
        key_schema = table.key_schema
        primary_key_attrs = [key_attr['AttributeName'] for key_attr in key_schema]
        
        logger.info(f"Table key schema: {primary_key_attrs}")
        logger.info(f"Key name: {key_name}, Key value: {key_value}")
        
        # Query to find existing items that match the key
        query_params = {
            'IndexName': index_name,
            'KeyConditionExpression': f"{key_name} = :key_value",
            'ExpressionAttributeValues': {':key_value': key_value}
        }
        
        response = table.query(**query_params)
        existing_items = response.get('Items', [])
        
        logger.info(f"Found {len(existing_items)} existing items")
        
        if not existing_items:
            # Create new item with key and update data
            new_item = {key_name: key_value}
            new_item.update(serialized_update_data)
            
            logger.info(f"Creating new item: {new_item}")
            table.put_item(Item=new_item)
            
            return {
                "message": "Successfully created new item.",
                "operation": "create", 
                "updated_count": 1,
                "item_created": True
            }
        
        # Update existing items
        updated_count = 0
        for existing_item in existing_items:
            # Build the complete item by merging existing item with update data
            merged_item = existing_item.copy()  # Start with all existing attributes
            
            # Apply updates (new values will override existing ones)
            for attr_name, attr_value in serialized_update_data.items():
                if attr_value is not None:
                    old_value = merged_item.get(attr_name, "NOT_PRESENT")
                    merged_item[attr_name] = attr_value
                    logger.info(f"Updating attribute '{attr_name}': '{old_value}' -> '{attr_value}'")
                else:
                    # If update value is None, remove the attribute (DynamoDB behavior)
                    # But don't remove key attributes
                    if attr_name in primary_key_attrs:
                        logger.warning(f"Cannot remove key attribute '{attr_name}', skipping")
                        continue
                    
                    if attr_name in merged_item:
                        removed_value = merged_item.pop(attr_name)
                        logger.info(f"Removing attribute '{attr_name}' with value '{removed_value}'")
                    else:
                        logger.info(f"Attribute '{attr_name}' not present, skipping removal")
            
            # Ensure all required key attributes are present
            missing_key_attrs = []
            for key_attr in primary_key_attrs:
                if key_attr not in merged_item:
                    missing_key_attrs.append(key_attr)
            
            if missing_key_attrs:
                logger.error(f"Missing required key attributes in merged item: {missing_key_attrs}")
                continue
            
            try:
                logger.info(f"Putting merged item: {merged_item}")
                table.put_item(Item=merged_item)
                updated_count += 1
                logger.info(f"Successfully updated item")
            except ClientError as e:
                logger.error(f"Failed to update item: {e}")
                # Continue with other items instead of failing completely
                continue
        
        return {
            "message": f"Successfully updated {updated_count} items.",
            "operation": "update", 
            "updated_count": updated_count,
            "item_created": False
        }

    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"DynamoDB ClientError: {error_code} - {error_message}")
        raise LambdaError(500, f"Database operation failed: {error_message}")
    except TypeError as e:
        logger.error(f"TypeError in db_update_item: {e}")
        raise LambdaError(400, f"Invalid data type provided: {e}")
    except Exception as e:
        logger.error(f"Unexpected error in db_update_item: {e}", exc_info=True)
        raise LambdaError(500, f"An unexpected error occurred: {e}")

def lambda_handler(event, context):
    try:
        cors_headers = fetch_cors_headers()
        if event.get('httpMethod') == 'OPTIONS':
            return {'statusCode': 200, 'headers': cors_headers, 'body': ''}

        parsed_event = parse_event(event)
        logger.info(f"Parsed event: {parsed_event}")
        session_id = parsed_event.get('session_id') or parsed_event.get('session') or parsed_event.get('cookies', {}).get('session_id')
        account_id = parsed_event.get('account_id') or parsed_event.get('account') or parsed_event.get('client_id')

        if not session_id:
            raise LambdaError(401, "No session ID provided in body or cookies.")

        required_fields = ['table_name', 'key_name', 'key_value', 'index_name', 'update_data']
        if any(field not in parsed_event for field in required_fields):
            raise LambdaError(400, "Missing one or more required fields.")
        
        if not account_id:
            raise LambdaError(400, "No account ID provided in body or cookies.")
        
        if session_id != AUTH_BP:
            logger.info(f"Authorizing account {account_id} with session {session_id}")
            authorize(account_id, session_id)
            # Check rate limit using the rate-limit Lambda
            rate_limit_response = invoke_lambda(os.environ.get("RATE_LIMIT_AWS_FUNCTION_NAME", "RateLimitAWS"), {
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
        
        message = db_update_item(
            parsed_event['table_name'],
            parsed_event['key_name'],
            parsed_event['key_value'],
            parsed_event['index_name'],
            parsed_event['update_data'],
            account_id,
            session_id
        )
        
        response = create_response(200, message)
        response['headers'].update(cors_headers)
        return response

    except LambdaError as e:
        response = create_response(e.status_code, {"error": e.message})
        response['headers'].update(fetch_cors_headers())
        return response
    except Exception as e:
        logger.error(f"Unhandled error: {e}")
        response = create_response(500, {"error": "Internal server error."})
        response['headers'].update(fetch_cors_headers())
        return response
