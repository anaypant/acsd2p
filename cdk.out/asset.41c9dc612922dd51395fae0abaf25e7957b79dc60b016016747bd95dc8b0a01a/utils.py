import json
import boto3
import time
from typing import Dict, Any
from botocore.exceptions import ClientError
from config import logger, AWS_REGION

lambda_client = boto3.client("lambda", region_name=AWS_REGION)
dynamodb = boto3.resource('dynamodb')

class LambdaError(Exception):
    def __init__(self, status_code, message):
        self.status_code = status_code
        self.message = message
        super().__init__(f"[{status_code}] {message}")

class AuthorizationError(Exception):
    pass

def create_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }

def invoke_lambda(function_name, payload, invocation_type="RequestResponse"):
    try:
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType=invocation_type,
            Payload=json.dumps(payload),
        )
        response_payload_bytes = response["Payload"].read()
        if not response_payload_bytes:
            if "FunctionError" in response:
                 raise LambdaError(500, f"Error in {function_name}: Empty payload with FunctionError.")
            return {}

        response_payload = response_payload_bytes.decode("utf-8")
        
        if "FunctionError" in response:
            logger.error(f"Error in {function_name}: {response_payload}")
            try:
                error_details = json.loads(response_payload)
                message = error_details.get("errorMessage", response_payload)
            except json.JSONDecodeError:
                message = response_payload
            raise LambdaError(500, f"Error in {function_name}: {message}")

        parsed_payload = json.loads(response_payload)
        
        if isinstance(parsed_payload, dict) and 'statusCode' in parsed_payload and parsed_payload['statusCode'] >= 300:
            body = parsed_payload.get('body')
            error_message = body
            if isinstance(body, str):
                try:
                    body_dict = json.loads(body)
                    error_message = body_dict.get('error', body_dict.get('message', body))
                except json.JSONDecodeError:
                    pass
            elif isinstance(body, dict):
                error_message = body.get('error', body.get('message', 'Invocation failed'))
            
            raise LambdaError(parsed_payload['statusCode'], error_message)

        return parsed_payload
    except ClientError as e:
        logger.error(f"ClientError invoking {function_name}: {e}")
        raise LambdaError(500, f"Failed to invoke {function_name}: {e.response['Error']['Message']}")
    except json.JSONDecodeError as e:
        logger.error(f"JSONDecodeError parsing response from {function_name}: {e}")
        logger.error(f"Raw response payload: {response_payload}")
        raise LambdaError(500, f"Failed to parse response from invoked Lambda.")
    except LambdaError:
        raise
    except Exception as e:
        logger.error(f"An unexpected error occurred invoking {function_name}: {e}", exc_info=True)
        raise LambdaError(500, f"An unexpected error occurred invoking {function_name}: {e}")

def parse_event(event):
    response = invoke_lambda('ParseEvent', event)
    return json.loads(response.get('body', '{}'))

def authorize(user_id, session_id):
    payload = {'user_id': user_id, 'session_id': session_id}
    try:
        response = invoke_lambda('Authorize', payload)
        body = json.loads(response.get('body', '{}'))
        if not body.get('authorized'):
             raise AuthorizationError(body.get('message', 'Unauthorized'))
    except LambdaError as e:
        raise AuthorizationError(e.message) from e

def db_select(table_name, index_name, key_name, key_value, account_id, session_id):
    payload = {
        'table_name': table_name, 'index_name': index_name,
        'key_name': key_name, 'key_value': key_value,
        'account_id': account_id, 'session_id': session_id
    }
    response = invoke_lambda('DBSelect', {'body': json.dumps(payload)})
    return json.loads(response.get('body', '[]'))

def db_update(table_name, index_name, key_name, key_value, update_data, account_id, session_id):
    payload = {
        'table_name': table_name, 'index_name': index_name,
        'key_name': key_name, 'key_value': key_value,
        'update_data': update_data,
        'account_id': account_id, 'session_id': session_id
    }
    response = invoke_lambda('DBUpdate', {'body': json.dumps(payload)})
    return json.loads(response.get('body', '{}'))

def db_delete(table_name, key_name, key_value, index_name, account_id, session_id):
    payload = {
        'table_name': table_name, 'key_name': key_name, 'key_value': key_value,
        'index_name': index_name, 'account_id': account_id, 'session_id': session_id
    }
    response = invoke_lambda('db-delete', {'body': json.dumps(payload)})
    return json.loads(response.get('body', '{}'))

def select(table_name: str, index_name: str, key_name: str, key_value: str, account_id: str, session_id: str) -> Dict[str, Any]:
    """
    Select a record from a DynamoDB table by key
    
    Args:
        table_name (str): The name of the DynamoDB table
        index_name (str): The name of the index to use
        key_name (str): The name of the key to use
        key_value (str): The value of the key to use
        account_id (str): The account ID to validate ownership
        session_id (str): The session ID to validate
        
    Returns:
        Dict[str, Any]: The selected record
        
    Raises:
        AuthorizationError: If authorization fails
    """
    try:
        # Invoke the select Lambda function
        response = db_select(table_name, index_name, key_name, key_value, account_id, session_id)
        
        return response
        
    except Exception as e:
        logger.error(f"Error selecting record: {str(e)}")
        raise

def update(table_name: str, index_name: str, key_name: str, key_value: str, account_id: str, session_id: str) -> Dict[str, Any]:
    """
    Update a record in a DynamoDB table by key
    
    Args:
        table_name (str): The name of the DynamoDB table
        index_name (str): The name of the index to use
        key_name (str): The name of the key to use
        key_value (str): The value of the key to use
        account_id (str): The account ID to validate ownership
        session_id (str): The session ID to validate
        
    Returns:
        Dict[str, Any]: The updated record
        
    Raises:
        AuthorizationError: If authorization fails
    """
    try:
        # Invoke the update Lambda function
        response = db_update(table_name, index_name, key_name, key_value, {}, account_id, session_id)
        
        return response
    
    except Exception as e:
        logger.error(f"Error updating record: {str(e)}")
        raise

# Database utility functions moved from lambda_function.py and ev_logic.py
def store_ai_invocation(associated_account: str, input_tokens: int, output_tokens: int, 
                       llm_email_type: str, model_name: str, conversation_id: str, 
                       session_id: str) -> bool:
    """Store AI invocation record in DynamoDB."""
    try:
        # Generate a unique ID for the invocation record
        invocation_id = f"{conversation_id}_{int(time.time())}_{llm_email_type}"
        
        ai_invocations_table = dynamodb.Table('Invocations')
        ai_invocations_table.put_item(
            Item={
                'id': invocation_id,  # Primary key required by the table
                'associated_account': associated_account,
                'timestamp': int(time.time()),
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
                'llm_email_type': llm_email_type,
                'model_name': model_name,
                'conversation_id': conversation_id,
            }
        )
        return True
    except Exception as e:
        logger.error(f"Error storing AI invocation: {str(e)}")
        return False

def update_thread_ev(conversation_id: str, ev_score: int, should_flag: str, account_id: str, session_id: str) -> bool:
    """
    Updates the thread with the new EV score and flag status.
    If the email gets flagged, also sets the 'busy' field to false.
    """
    try:
        threads_table = dynamodb.Table('Threads')
        
        # Determine if we need to set busy to false (when email is flagged)
        should_set_busy_false = str(should_flag).lower() == 'true' or should_flag is True
        
        if should_set_busy_false:
            # Update with flag, EV score, and set busy to false
            threads_table.update_item(
                Key={
                    'conversation_id': conversation_id
                },
                UpdateExpression='SET #flag = :flag, ev_score = :ev, busy = :busy',
                ExpressionAttributeNames={
                    '#flag': 'flag'
                },
                ExpressionAttributeValues={
                    ':flag': should_flag,
                    ':ev': str(ev_score),
                    ':busy': False
                }
            )
            logger.info(f"Updated thread flag for conversation {conversation_id} with EV score {ev_score}, flag {should_flag}, and set busy to false")
        else:
            # Update with flag and EV score only
            threads_table.update_item(
                Key={
                    'conversation_id': conversation_id
                },
                UpdateExpression='SET #flag = :flag, ev_score = :ev',
                ExpressionAttributeNames={
                    '#flag': 'flag'
                },
                ExpressionAttributeValues={
                    ':flag': should_flag,
                    ':ev': str(ev_score)
                }
            )
            logger.info(f"Updated thread flag for conversation {conversation_id} with EV score {ev_score} and flag {should_flag}")
        
        return True
    except Exception as e:
        logger.error(f"Error updating thread flag: {str(e)}")
        return False

def update_conversation_ev(conversation_id: str, message_id: str, ev_score: int, account_id: str, session_id: str) -> bool:
    """
    Updates the conversation with the EV score using GSI and modular approach.
    """
    try:
        # Use the modular db_update function with GSI
        update_data = {'ev_score': str(ev_score)}
        response = db_update(
            table_name='Conversations',
            index_name='conversation_id-index',  # GSI name - adjust as needed
            key_name='conversation_id',
            key_value=conversation_id,
            update_data=update_data,
            account_id=account_id,
            session_id=session_id
        )
        
        logger.info(f"Updated conversation EV score for {conversation_id} message {message_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating conversation EV score: {str(e)}")
        return False

def check_aws_rate_limit(account_id: str, session_id: str) -> None:
    """
    Checks the AWS rate limit for a given account by invoking the rate-limit-aws lambda.
    """
    payload = {'client_id': account_id, 'session': session_id}
    # This invocation is already designed to raise LambdaError on failure
    invoke_lambda('RateLimitAWS', payload)
    