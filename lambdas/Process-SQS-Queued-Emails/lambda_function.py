# handler.py
import json
import uuid
import base64
from datetime import datetime, timedelta
import boto3
import logging
from typing import Dict, Any, Optional

from config import BUCKET_NAME, QUEUE_URL, AWS_REGION, GENERATE_EV_LAMBDA_ARN, LCP_LLM_RESPONSE_LAMBDA_ARN, SPAM_TTL_DAYS, AUTH_BP, logger
from parser import parse_email, extract_email_headers, extract_email_from_text, extract_user_info_from_headers
from db import (
    get_conversation_id,
    get_associated_account,
    update_thread_attributes,
    store_conversation_item,
    store_spam_conversation_item,
    store_thread_item,
    invoke_db_select,
    update_thread_read_status
)
from scheduling import generate_safe_schedule_name, schedule_email_processing
from llm_interface import detect_spam
from email_processor import process_email_record
from utils import db_update

# Set up logging
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
sqs = boto3.client('sqs')
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
lambda_client = boto3.client('lambda', region_name=AWS_REGION)

def update_thread_with_attributes(conversation_id: str, account_id: str) -> None:
    """
    Invokes get-thread-attrs lambda and updates the thread with the returned attributes.
    Now handles nested attributes structure and stores individual attributes.
    
    Args:
        conversation_id (str): The ID of the conversation to update
        account_id (str): The ID of the account associated with the conversation
    """
    try:
        # Invoke get-thread-attrs lambda
        response = lambda_client.invoke(
            FunctionName='getThreadAttrs',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'body': json.dumps({
                    'conversationId': conversation_id,
                    'accountId': account_id
                })
            })
        )
        
        # Parse the response
        response_payload = json.loads(response['Payload'].read())
        logger.info(f"Response payload: {response_payload}")
        if response_payload['statusCode'] != 200:
            logger.error(f"Failed to get thread attributes: {response_payload}")
            return
            
        # Parse the body which contains the actual attributes
        body_data = json.loads(response_payload['body'])
        
        # Extract attributes from the nested structure
        attributes = body_data.get('attributes', {})
        metadata = body_data.get('metadata', {})
        
        # Combine attributes and metadata into a single update
        formatted_attributes = {}
        
        # Process attributes
        for key, value in attributes.items():
            # Convert attribute names to lowercase with underscores
            formatted_key = key.lower().replace(' ', '_')
            formatted_attributes[formatted_key] = value
                    
        # Update the thread using db-select
        if not update_thread_attributes(conversation_id, formatted_attributes):
            logger.error(f"Failed to update thread attributes for conversation {conversation_id}")
            return
            
        logger.info(f"Successfully updated thread attributes for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Error updating thread attributes: {str(e)}")

def process_email_record(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Process a single SQS record containing an email.
    Returns the processed data or None if processing failed.
    """
    try:
        logger.info(f"Processing record: {json.dumps(record)}")
        body = json.loads(record['body'])
        logger.info(f"Parsed body: {json.dumps(body)}")
        
        if not isinstance(body, dict):
            logger.error(f"Expected body to be a dictionary, got {type(body)}")
            return None
            
        if 'Message' not in body:
            logger.error("No 'Message' key found in body")
            return None
            
        message = json.loads(body['Message'])
        logger.info(f"Parsed message: {json.dumps(message)}")
        
        if not isinstance(message, dict):
            logger.error(f"Expected message to be a dictionary, got {type(message)}")
            return None
            
        if 'mail' not in message:
            logger.error("No 'mail' key found in message")
            return None
            
        mail = message['mail']
        if not isinstance(mail, dict):
            logger.error(f"Expected mail to be a dictionary, got {type(mail)}")
            return None

        source = mail['source']
        destination = mail['destination'][0]
        subject = mail['commonHeaders'].get('subject', '')
        s3_key = mail['messageId']

        # Get account_id first since we need it for conversation ID lookup
        account_id = get_associated_account(destination, "null", AUTH_BP)
        
        if not account_id:
            logger.error(f"No account found for destination: {destination}")
            return None

        # Fetch and parse email
        raw = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)['Body'].read()
        msg, text_body = parse_email(raw)
        
        # Handle case where email parsing fails but we still want to process
        if not msg:
            logger.error("Failed to parse email message")
            # Create minimal data structure for processing
            msg_id_hdr = mail.get('messageId', '')
            user_info = {'sender_name': '', 'sender_email': source}
            text_body = f"Subject: {subject}\nFrom: {source}\n\n[Email content could not be parsed]"
        else:
            msg_id_hdr, in_reply_to, references = extract_email_headers(msg)
            user_info = extract_user_info_from_headers(msg)
            
            # Use both In-Reply-To and References for better threading
            conv_id = None
            if in_reply_to:
                conv_id = get_conversation_id(in_reply_to, account_id, AUTH_BP)
                logger.info(f"Found conversation ID from in_reply_to: {conv_id}")
            if not conv_id and references:
                conv_id = get_conversation_id(references, account_id, AUTH_BP)
                logger.info(f"Found conversation ID from references: {conv_id}")
            
            # Only generate new UUID if we couldn't find an existing conversation
            if not conv_id:
                conv_id = str(uuid.uuid4())
                logger.info(f"Generated new conversation ID: {conv_id}")
            
            timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            is_first = not bool(in_reply_to or references)
            logger.info(f"Email is_first: {is_first}, conv_id: {conv_id}, in_reply_to: {in_reply_to}, references: {references}")

            return {
                'source': source,
                'destination': destination,
                'subject': subject,
                's3_key': s3_key,
                'msg_id_hdr': msg_id_hdr,
                'in_reply_to': in_reply_to,
                'references': references,
                'conv_id': conv_id,
                'account_id': account_id,
                'timestamp': timestamp,
                'is_first': is_first,
                'text_body': text_body,
                'user_info': user_info
            }

        # If we get here, we have minimal data but can still process
        if not text_body:
            logger.error("No text body available for email")
            return None

        # For failed parsing, create a basic conversation structure
        conv_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        is_first = True  # Assume first email if we can't determine threading
        
        logger.info(f"Processing email with minimal data - conv_id: {conv_id}, is_first: {is_first}")

        return {
            'source': source,
            'destination': destination,
            'subject': subject,
            's3_key': s3_key,
            'msg_id_hdr': msg_id_hdr,
            'in_reply_to': '',
            'references': '',
            'conv_id': conv_id,
            'account_id': account_id,
            'timestamp': timestamp,
            'is_first': is_first,
            'text_body': text_body,
            'user_info': user_info
        }
    except Exception as e:
        logger.error(f"Error processing email record: {str(e)}", exc_info=True)
        return None

def store_email_data(data: Dict[str, Any]) -> bool:
    """
    Store email data in DynamoDB tables.
    Uses db-select for reads and direct DynamoDB access for writes.
    Returns True if successful, False otherwise.
    """
    try:
        logger.info(f"Starting to store email data for conversation {data['conv_id']}")
        # Get sender name from user_info if available
        sender_name = data['user_info'].get('sender_name', '')
        logger.info(f"Sender name from user_info: {sender_name}")
        
        # Prepare conversation data
        conversation_data = {
            'conversation_id': data['conv_id'],
            'response_id': data['msg_id_hdr'],
            'in_reply_to': data['in_reply_to'],
            'timestamp': data['timestamp'],
            'sender': data['source'],
            'receiver': data['destination'],
            'associated_account': data['account_id'],
            'subject': data['subject'],
            'body': data['text_body'],
            's3_location': data['s3_key'],
            'type': 'inbound-email',
            'is_first_email': '1' if data['is_first'] else '0'
        }

        # Add llm_email_type if this is an LLM-generated email
        if data.get('llm_email_type'):
            conversation_data['llm_email_type'] = data['llm_email_type']
            conversation_data['type'] = 'llm-response'  # Override type for LLM responses
            logger.info(f"Adding LLM email type: {data['llm_email_type']}")
        
        # Store in Conversations table using direct DynamoDB access
        logger.info("Storing conversation data in Conversations table")
        if not store_conversation_item(conversation_data):
            logger.error(f"Failed to store conversation data for {data['conv_id']}")
            return False
        logger.info("Successfully stored conversation data")

        # Check if thread exists using db-select
        logger.info(f"Checking if thread exists for conversation {data['conv_id']}")
        existing_thread = invoke_db_select(
            table_name='Threads',
            index_name='conversation_id-index',  # Primary key query
            key_name='conversation_id',
            key_value=data['conv_id'],
            account_id=data['account_id'],
            session_id=AUTH_BP
        )
        
        if data['is_first'] and not existing_thread:
            # Get user's lcp_automatic_enabled status
            lcp_enabled = get_user_lcp_automatic_enabled(data['account_id'], AUTH_BP)
            logger.info(f"User lcp_automatic_enabled status: {lcp_enabled} for account {data['account_id']}")
            
            # Prepare thread data
            thread_data = {
                'conversation_id': data['conv_id'],
                'source': data['source'],
                'source_name': sender_name,
                'associated_account': data['account_id'],
                'read': 'false',
                'lcp_enabled': lcp_enabled,
                'lcp_flag_threshold': '80',
                'flag': 'false',  # Will be updated by generate-ev lambda
                'flag_for_review': 'false',  # Initialize flag_for_review as false
                'flag_review_override': 'false'  # Initialize flag_review_override as false
            }
            
            # Only create new thread if it's first email and thread doesn't exist
            logger.info(f"Creating new thread for conversation {data['conv_id']} with lcp_enabled={lcp_enabled}")
            if not store_thread_item(thread_data):
                logger.error(f"Failed to create thread for {data['conv_id']}")
                return False
            logger.info("Successfully created new thread")
                
        elif existing_thread:
            # Update existing thread using direct DynamoDB access
            logger.info(f"Updating existing thread for conversation {data['conv_id']}")
            if not update_thread_read_status(data['conv_id'], False):
                logger.error(f"Failed to update thread for {data['conv_id']}")
                return False
            logger.info("Successfully updated thread read status")
        else:
            logger.warning(f"Thread not found for non-first email conversation {data['conv_id']}")

        # Update thread attributes after storing email data
        logger.info(f"Updating thread attributes for conversation {data['conv_id']}")
        update_thread_with_attributes(data['conv_id'], data['account_id'])

        logger.info(f"Successfully completed storing email data for conversation {data['conv_id']}")
        return True
    except Exception as e:
        logger.error(f"Error storing email data: {str(e)}", exc_info=True)  # Added exc_info for stack trace
        return False

def invoke_generate_ev(conversation_id: str, message_id: str, account_id: str, session_id: str) -> Optional[int]:
    """
    Invokes the generate-ev lambda to calculate and update EV score.
    Returns the EV score if successful, None otherwise.
    """
    try:
        response = lambda_client.invoke(
            FunctionName=GENERATE_EV_LAMBDA_ARN,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'conversation_id': conversation_id,
                'message_id': message_id,
                'account_id': account_id,
                'session_id': session_id
            })
        )
        
        response_payload = json.loads(response['Payload'].read())
        if response_payload['statusCode'] != 200:
            logger.error(f"Failed to generate EV: {response_payload}")
            return None
            
        result = json.loads(response_payload['body'])
        if result['status'] != 'success':
            logger.error(f"Generate EV failed: {result}")
            return None
            
        return result['ev_score']
    except Exception as e:
        logger.error(f"Error invoking generate-ev lambda: {str(e)}")
        return None

def invoke_llm_response(conversation_id: str, account_id: str, is_first_email: bool, session_id: str) -> Optional[str]:
    """
    Invokes the LLM response Lambda to generate a response.
    Returns the message ID if successful, None otherwise.
    """
    try:
        logger.info(f"Starting LLM response generation for conversation {conversation_id}")
        logger.info(f"Account ID: {account_id}, Is First Email: {is_first_email}")

        # Invoke LLM response Lambda
        payload = {
            'conversation_id': conversation_id,
            'account_id': account_id,
            'is_first_email': is_first_email,
            'scenario': None,
            'session_id': session_id
        }
        logger.info(f"Sending request to LLM response Lambda with payload: {json.dumps(payload, indent=2)}")
        
        response = lambda_client.invoke(
            FunctionName=LCP_LLM_RESPONSE_LAMBDA_ARN,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        logger.info(f"Received response from LLM response Lambda")
        response_payload = json.loads(response['Payload'].read())
        logger.info(f"Response payload: {json.dumps(response_payload, indent=2)}")
        result = None
        
        if response_payload['statusCode'] != 200:
            logger.error(f"LLM response Lambda failed with status {response_payload['statusCode']}")

                    
        result = json.loads(response_payload['body'])
        logger.info(f"Parsed response body: {json.dumps(result, indent=2)}")
        
        if result['status'] != 'success':
            logger.error(f"Exiting LLM response generation for conversation {conversation_id} due to status {result['status']}")
            return None
        
        # Store the LLM response in Conversations table
        llm_response = result['response']
        llm_email_type = result.get('llm_email_type', 'continuation_email')  # Default to continuation_email if not specified
        
        logger.info(f"Generated response length: {len(llm_response)} characters")
        logger.info(f"LLM email type: {llm_email_type}")
        
        # Generate a unique message ID for the response
        
        return llm_response
    except Exception as e:
        logger.error(f"Error invoking LLM response Lambda: {str(e)}", exc_info=True)  # Added exc_info for stack trace
        return None

def get_user_lcp_automatic_enabled(account_id: str, session_id: str) -> str:
    """
    Get the user's lcp_automatic_enabled status from the Users table.
    Returns True if enabled, False otherwise.
    
    Args:
        account_id (str): The ID of the account to check
        
    Returns:
        bool: True if LCP automatic is enabled, False otherwise
    """
    try:
        result = invoke_db_select(
            table_name='Users',
            index_name='id-index',
            key_name='id',
            key_value=account_id,
            account_id=account_id,
            session_id=session_id
        )
        
        # Handle list response
        logger.info(f"User lcp_automatic_enabled status: {result}")
        if isinstance(result, list) and result:
            return result[0].get('lcp_automatic_enabled', 'false')
        return False
    except Exception as e:
        logger.error(f"Error getting user lcp_automatic_enabled status: {str(e)}")
        return False

def lambda_handler(event, context):
    """
    AWS Lambda handler function that processes SQS messages containing emails.
    
    Args:
        event (dict): The event data from AWS Lambda
        context (LambdaContext): The runtime context from AWS Lambda
        
    Returns:
        dict: Response containing status code and message
    """
    try:
        logger.info(f"Received event: {json.dumps(event)}")
        
        if 'Records' not in event:
            logger.error("No Records found in event")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No Records found in event'})
            }
            
        for record in event['Records']:
            try:
                # Process the email record
                email_data = process_email_record(record)
                if not email_data:
                    logger.error("Failed to process email record")
                    continue
                    
                # Check if email is spam
                is_spam = detect_spam(
                    subject=email_data['subject'],
                    body=email_data['text_body'],
                    sender=email_data['source'],
                    account_id=email_data['account_id'],
                    session_id=AUTH_BP
                )
                
                if is_spam:
                    # Handle spam email
                    spam_conversation_data = {
                        **email_data,
                        'type': 'inbound-email',
                        'is_first_email': '1' if email_data['is_first'] else '0'
                    }
                    store_spam_conversation_item(spam_conversation_data, SPAM_TTL_DAYS)
                    spam_thread_data = {
                        'conversation_id': email_data['conv_id'],
                        'source': email_data['source'],
                        'source_name': email_data['user_info'].get('sender_name', ''),
                        'associated_account': email_data['account_id'],
                        'read': 'false',
                        'lcp_enabled': 'false',
                        'lcp_flag_threshold': '80',
                        'flag': 'false',
                        'flag_for_review': 'false',
                        'flag_review_override': 'false',
                        'spam': 'true',
                        'ttl': int(datetime.utcnow().timestamp()) + SPAM_TTL_DAYS * 24 * 60 * 60
                    }
                    store_thread_item(spam_thread_data)
                    
                    continue
                else:
                    # Store attribute 'new_email' in Users table
                    db_update(
                        table_name='Users',
                        key_name='id',
                        key_value=email_data['account_id'],
                        index_name='id-index',
                        update_data={'new_email': True},
                        account_id=email_data['account_id'],
                        session_id=AUTH_BP
                    )
                    
                    # Store email data using the robust store_email_data function
                    if not store_email_data(email_data):
                        logger.error(f"Failed to store email data for conversation {email_data['conv_id']}")
                        continue
                    
                    # Generate EV score
                    ev_score = invoke_generate_ev(
                        email_data['conv_id'],
                        email_data['msg_id_hdr'],
                        email_data['account_id'],
                        AUTH_BP
                    )
                    
                    if ev_score is None:
                        logger.error(f"Failed to calculate EV for {email_data['conv_id']}")
                        continue
                    
                    # Check if LCP is enabled and should respond
                    thread = invoke_db_select(
                        'Threads',
                        'conversation_id-index',
                        'conversation_id',
                        email_data['conv_id'],
                        email_data['account_id'],
                        AUTH_BP
                    )
                    
                    if not thread:
                        logger.error(f"Could not find thread for conversation {email_data['conv_id']}")
                        continue
                    
                    should_respond = (
                        thread[0].get('lcp_enabled', 'false') == 'true' and
                        get_user_lcp_automatic_enabled(email_data['account_id'], AUTH_BP)
                    )
                    
                    if should_respond:
                        # Generate and schedule LLM response
                        llm_response = invoke_llm_response(
                            email_data['conv_id'],
                            email_data['account_id'],
                            email_data['is_first'],
                            AUTH_BP
                        )
                        
                        if llm_response:
                            schedule_name = generate_safe_schedule_name(f"process-email-{email_data['msg_id_hdr']}")
                            schedule_time = datetime.utcnow() + timedelta(seconds=10)
                            
                            # Update thread to indicate processing
                            update_thread_attributes(email_data['conv_id'], {'busy': True})
                            
                            # Schedule the response
                            schedule_email_processing(
                                schedule_name,
                                schedule_time,
                                {
                                    'response_body': llm_response,
                                    'account': email_data['account_id'],
                                    'target': email_data['source'],
                                    'in_reply_to': email_data['msg_id_hdr'],
                                    'conversation_id': email_data['conv_id'],
                                    'subject': email_data['subject'],
                                    'ev_score': ev_score,
                                    'account_id': email_data['account_id'],
                                    'session_id': AUTH_BP
                                },
                                email_data['in_reply_to']
                            )
                    
                    # Update thread attributes
                    update_thread_with_attributes(email_data['conv_id'], email_data['account_id'])
                
            except Exception as e:
                logger.error(f"Error processing record: {str(e)}", exc_info=True)
                continue
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Successfully processed all records'})
        }
        
    except Exception as e:
        logger.error(f"Error in lambda handler: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
