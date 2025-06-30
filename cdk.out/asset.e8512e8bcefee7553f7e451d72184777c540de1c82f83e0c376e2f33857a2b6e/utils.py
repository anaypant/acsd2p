import json
import boto3
from typing import Dict, Any
from botocore.exceptions import ClientError
from config import logger, AWS_REGION

lambda_client = boto3.client("lambda", region_name=AWS_REGION)

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