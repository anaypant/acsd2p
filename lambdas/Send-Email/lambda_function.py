import boto3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from botocore.exceptions import ClientError
from datetime import datetime, timedelta
import base64
import uuid
import re
from decimal import Decimal
import logging
import time
from config import logger, AUTH_BP
from utils import create_response, LambdaError
from send_email_logic import process_and_send_email

# Initialize the SES client
ses_client = boto3.client('ses', region_name='us-east-2')
dynamodb_resource = boto3.resource('dynamodb')

def is_domain_verified(domain):
    """
    Check if a domain is verified in SES.
    
    :param domain: The domain to check (e.g., 'example.com')
    :return: Boolean indicating if domain is verified
    """
    try:
        response = ses_client.list_verified_email_addresses()
        verified_domains = [email.split('@')[1] for email in response['VerifiedEmailAddresses']]
        return domain.lower() in verified_domains
    except ClientError as e:
        print(f"Error checking domain verification: {e.response['Error']['Message']}")
        return False

def extract_domain(email):
    """
    Extract domain from email address.
    
    :param email: Email address
    :return: Domain part of email
    """
    match = re.search(r'@(.+)$', email)
    return match.group(1) if match else None

def get_account_email(account_id):
    """
    Retrieves the email associated with the account from DynamoDB.
    
    :param account_id: The unique identifier of the account.
    :return: Tuple of (email, signature) associated with the account.
    """
    table = dynamodb_resource.Table('Users')
    try:
        response = table.get_item(Key={'id': account_id})
        if 'Item' in response:
            return (
                response['Item'].get('responseEmail'),  # Assuming 'responseEmail' holds the email
                response['Item'].get('email_signature', '')  # Get signature, default to empty string
            )
        else:
            print(f"No account found for ID: {account_id}")
            return None, None
    except ClientError as e:
        print(f"Error fetching account email: {e.response['Error']['Message']}")
        return None, None

def log_email_to_dynamodb(account_id, conversation_id, sender, receiver, associated_account, subject, body_text, message_id, in_reply_to='', llm_email_type=None):
    """
    Logs the sent email details to the Conversations DynamoDB table.
    
    :param conversation_id: The ID of the conversation.
    :param sender: The sender's email address.
    :param receiver: The receiver's email address.
    :param associated_account: The account associated with the email.
    :param body_text: The text content of the email.
    :param message_id: The RFC Message-ID of the email.
    :param in_reply_to: The Message-ID of the email being replied to (empty string for first email).
    :param llm_email_type: The type of LLM-generated email (if applicable).
    """
    table = dynamodb_resource.Table('Conversations')
    current_timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        item = {
            'conversation_id': conversation_id,
            'is_first_email': '0',  # Mark as not the first email
            'response_id': message_id,
            'in_reply_to': in_reply_to,  # Store the in_reply_to value
            'timestamp': current_timestamp,
            'sender': sender,
            'receiver': receiver,
            'associated_account': account_id,
            'subject': subject,
            'body': body_text,
            's3_location': '',
            'type': "outbound-email",
            'ev_score': ''
        }
        
        # Add llm_email_type if provided
        if llm_email_type:
            item['llm_email_type'] = llm_email_type
            
        table.put_item(Item=item)
        print(f"Successfully logged email to DynamoDB for conversation {conversation_id}")
    except Exception as e:
        print(f"Error writing to DynamoDB: {str(e)}")
        raise e

def get_latest_conversation_by_id(conversation_id):
    """
    Fetch the latest conversation record for a given conversation_id from DynamoDB.
    Returns the item with the latest timestamp.
    """
    table = dynamodb_resource.Table('Conversations')
    try:
        # Query all items with this conversation_id
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversation_id').eq(conversation_id)
        )
        items = response.get('Items', [])
        if not items:
            return None
        # Sort by timestamp (descending) and return the latest
        sorted_items = sorted(
            items,
            key=lambda x: x.get('timestamp', ''),
            reverse=True
        )
        return sorted_items[0]
    except Exception as e:
        print(f"Error fetching conversation by id: {str(e)}")
        return None

def send_email(sender, recipient, subject, body_text, body_html=None, in_reply_to=None):
    """
    Sends an email using Amazon SES. Adds reply headers if replying to an existing email.

    :param sender: The sender's email address. Must be verified in SES.
    :param recipient: The recipient's email address.
    :param subject: The subject of the email.
    :param body_text: The plain text version of the email body.
    :param body_html: The HTML version of the email body (optional).
    :param in_reply_to: The Message-ID of the email being replied to (optional).
    :return: Tuple of (rfc_message_id, error_message). If successful, error_message will be None.
    """
    # Check if we're in sandbox mode by attempting to get sending statistics
    try:
        ses_client.get_send_statistics()
    except ClientError as e:
        if 'AccessDenied' in str(e):
            print("WARNING: SES account is in sandbox mode. Recipients must be verified.")
            # Check if recipient domain is verified
            recipient_domain = extract_domain(recipient)
            if not is_domain_verified(recipient_domain):
                return None, f"Recipient domain {recipient_domain} is not verified. Please verify the domain in SES or move to production mode."

    msg = MIMEMultipart('alternative')
    # Generate and set a custom Message-ID for threading
    rfc_message_id = f"<{uuid.uuid4()}@homes.automatedconsultancy.com>"
    msg['Message-ID'] = rfc_message_id
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient

    # Add threading headers if replying to an email
    if in_reply_to:
        msg['In-Reply-To'] = in_reply_to
        msg['References'] = in_reply_to

    # Attach the plain text and HTML parts
    part1 = MIMEText(body_text, 'plain')
    msg.attach(part1)

    if body_html:
        part2 = MIMEText(body_html, 'html')
        msg.attach(part2)

    try:
        # Send the email using send_raw_email (preserving headers exactly)
        response = ses_client.send_raw_email(
            Source=sender,
            Destinations=[recipient],
            RawMessage={
                'Data': msg.as_bytes()
            }
        )
        ses_message_id = response['MessageId']
        print(f"Email sent! SES Message ID: {ses_message_id}")
        return ses_message_id, None
    except ClientError as e:
        error_message = e.response['Error']['Message']
        print(f"Failed to send email: {error_message}")
        
        # Provide more helpful error messages for common issues
        if "Email address is not verified" in error_message:
            return None, "Sender email is not verified in SES. Please verify the sender email or use a verified domain."
        elif "not authorized to send from" in error_message:
            return None, "Sender email is not authorized to send from this domain. Please verify the domain in SES."
        elif "sandbox" in error_message.lower():
            return None, "SES account is in sandbox mode. Please request production access or verify the recipient email."
        
        return None, error_message

def check_and_update_rate_limit(account_id):
    """
    Checks and updates the rate limit for an account in the RL_AWS table.
    Returns the current invocation count and whether the rate limit is exceeded.
    
    :param account_id: The account ID to check rate limit for
    :return: Tuple of (invocations, is_rate_limited, error_message)
    """
    table = dynamodb_resource.Table('RL_AWS')
    users_table = dynamodb_resource.Table('Users')
    
    try:
        # Get the rate limit from Users table
        user_response = users_table.get_item(Key={'id': account_id})
        if 'Item' not in user_response:
            return 0, False, "Account not found"
            
        rate_limit = user_response['Item'].get('rl_aws', 0)
        
        # Get current invocation count
        response = table.query(
            IndexName='associated_account-index',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('associated_account').eq(account_id)
        )
        
        current_time = int(time.time())  # Current time in seconds
        ttl_time = current_time + 60  # 1 minute from now
        
        if response['Items']:
            # Update existing record
            item = response['Items'][0]
            current_invocations = item.get('invocations', 0) + 1
            
            table.update_item(
                Key={'associated_account': account_id},
                UpdateExpression='SET invocations = :inv, #ttl = :ttl',
                ExpressionAttributeValues={
                    ':inv': current_invocations,
                    ':ttl': ttl_time
                },
                ExpressionAttributeNames={
                    '#ttl': 'ttl'
                }
            )
            
            return current_invocations, current_invocations > rate_limit, None
        else:
            table.put_item(
                Item={
                    'associated_account': account_id,
                    'invocations': 1,
                    'ttl': ttl_time
                }
            )
            return 1, 1 > rate_limit, None
            
    except Exception as e:
        logger.error(f"Error in rate limiting: {str(e)}")
        return 0, False, str(e)

def check_and_update_ai_rate_limit(account_id):
    """
    Checks and updates the rate limit for an account in the RL_AI table.
    Returns the current invocation count and whether the rate limit is exceeded.
    
    :param account_id: The account ID to check rate limit for
    :return: Tuple of (invocations, is_rate_limited, error_message)
    """
    table = dynamodb_resource.Table('RL_AI')
    users_table = dynamodb_resource.Table('Users')
    
    try:
        # Get the rate limit from Users table
        user_response = users_table.get_item(Key={'id': account_id})
        if 'Item' not in user_response:
            return 0, False, "Account not found"
            
        rate_limit = user_response['Item'].get('rl_ai', 0)
        
        # Get current invocation count
        response = table.query(
            IndexName='associated_account-index',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('associated_account').eq(account_id)
        )
        
        current_time = int(time.time())  # Current time in seconds
        ttl_time = current_time + 60  # 1 minute from now
        
        if response['Items']:
            # Update existing record
            item = response['Items'][0]
            current_invocations = item.get('invocations', 0) + 1
            
            table.update_item(
                Key={'id': item['id']},
                UpdateExpression='SET invocations = :inv, #ttl = :ttl',
                ExpressionAttributeValues={
                    ':inv': current_invocations,
                    ':ttl': ttl_time
                },
                ExpressionAttributeNames={
                    '#ttl': 'ttl'
                }
            )
            
            return current_invocations, current_invocations > rate_limit, None
        else:
            # Create new record
            new_id = str(uuid.uuid4())
            table.put_item(
                Item={
                    'id': new_id,
                    'associated_account': account_id,
                    'invocations': 1,
                    'ttl': ttl_time
                }
            )
            return 1, 1 > rate_limit, None
            
    except Exception as e:
        logger.error(f"Error in AI rate limiting: {str(e)}")
        return 0, False, str(e)

def lambda_handler(event, context):
    try:
        # Assuming EventBridge scheduler passes the payload directly
        result = process_and_send_email(event)
        return create_response(200, result)

    except LambdaError as e:
        logger.error(f"Error processing send-email request: {e.message}")
        return create_response(e.status_code, {"error": e.message})
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}", exc_info=True)
        return create_response(500, {"error": "An internal server error occurred."})
