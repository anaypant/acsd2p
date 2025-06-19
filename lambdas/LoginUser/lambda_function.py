# @file handler.py
# @module handler
# @description
# Main AWS Lambda entry point for user login in ACS (Python 3.13).
# Delegates to provider-specific flows in form.py and google.py.
import os
import json
import boto3
from datetime import datetime, timezone
from utils import parse_event, create_response, LambdaError, invoke_lambda
from login_logic import handle_login
from config import logger


# Environment & AWS clients
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-2")
CORS_FUNCTION = os.environ.get("CORS_FUNCTION_NAME", "Allow-Cors")
lambda_client = boto3.client("lambda", region_name=AWS_REGION)


# DynamoDB table for session storage
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "Sessions")
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)


VALID_PROVIDERS = ("form", "google")

def get_cors_headers():
    try:
        response = invoke_lambda(CORS_FUNCTION, {})
        return response.get('headers', {})
    except Exception as e:
        logger.error(f"Failed to fetch CORS headers: {e}")
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS, POST",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Credentials": "true",
        }

def lambda_handler(event, context):
    cors_headers = get_cors_headers()
    
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    try:
        payload = parse_event(event)
        email = payload.get("email")
        provider = payload.get("provider")
        password = payload.get("password")
        name = payload.get("name")

        if not email or not provider:
            raise LambdaError(400, "Invalid request: email and provider required")

        body, cookies = handle_login(provider, email, password, name)
        
        headers = {**cors_headers, "Set-Cookie": ",".join(cookies)}
        return create_response(200, body, headers=headers)

    except LambdaError as e:
        return create_response(e.status_code, {"message": e.message}, headers=cors_headers)
    except Exception as e:
        logger.error(f"Unhandled error in login handler: {e}")
        return create_response(500, {"message": "Internal server error"}, headers=cors_headers)
