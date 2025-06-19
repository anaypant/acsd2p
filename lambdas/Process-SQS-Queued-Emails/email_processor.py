import json
import uuid
from datetime import datetime, timedelta
import boto3

from config import BUCKET_NAME, SPAM_TTL_DAYS, AUTH_BP
from parser import parse_email, extract_email_headers
from db import (
    get_conversation_id, get_associated_account, update_thread_attributes,
    store_conversation_item, store_spam_conversation_item, store_thread_item,
    invoke_db_select, update_thread_read_status
)
from scheduling import generate_safe_schedule_name, schedule_email_processing
from llm_interface import detect_spam
from utils import logger, LambdaError, invoke_lambda

s3 = boto3.client('s3')

def process_email_record(record):
    try:
        body = json.loads(record['body'])
        message = json.loads(body['Message'])
        mail = message['mail']
        
        s3_key = mail['messageId']
        raw_email = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)['Body'].read()
        msg, text_body = parse_email(raw_email)
        if not msg or not text_body:
            raise LambdaError(400, "Failed to parse email content")

        msg_id_hdr, in_reply_to, references = extract_email_headers(msg)
        destination = mail['destination'][0]
        account_id = get_associated_account(destination, "null", AUTH_BP)
        if not account_id:
            raise LambdaError(404, f"No account found for destination: {destination}")

        is_spam = detect_spam(subject=mail['commonHeaders'].get('subject', ''), body=text_body, sender=mail['source'], account_id=account_id, session_id=AUTH_BP)
        
        conv_id = get_conversation_id(in_reply_to or references, account_id, AUTH_BP) or str(uuid.uuid4())
        
        email_data = {
            'source': mail['source'], 'destination': destination, 'subject': mail['commonHeaders'].get('subject', ''),
            's3_key': s3_key, 'msg_id_hdr': msg_id_hdr, 'in_reply_to': in_reply_to, 'references': references,
            'conv_id': conv_id, 'account_id': account_id, 'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'is_first': not bool(in_reply_to or references), 'text_body': text_body,
            'user_info': {'sender_name': mail['commonHeaders'].get('from', [{'name': ''}])[0].get('name', '')}
        }
        
        if is_spam:
            handle_spam(email_data)
            return
            
        handle_ham(email_data)

    except Exception as e:
        logger.error(f"Error processing email record: {e}", exc_info=True)
        # Decide if to re-raise or just log. For SQS, logging might be enough to avoid retries for bad messages.
        
def handle_spam(data):
    logger.info(f"Handling spam email for conversation {data['conv_id']}")
    spam_conversation_data = {**data, 'type': 'inbound-email', 'is_first_email': '1' if data['is_first'] else '0'}
    store_spam_conversation_item(spam_conversation_data, SPAM_TTL_DAYS)
    
    thread_data = {
        'conversation_id': data['conv_id'], 'source': data['source'], 'source_name': data['user_info'].get('sender_name', ''),
        'associated_account': data['account_id'], 'read': 'false', 'lcp_enabled': 'false', 'lcp_flag_threshold': '80',
        'flag': 'false', 'flag_for_review': 'false', 'flag_review_override': 'false', 'spam': 'true',
        'ttl': int(datetime.utcnow().timestamp()) + SPAM_TTL_DAYS * 24 * 60 * 60
    }
    store_thread_item(thread_data)

def handle_ham(data):
    logger.info(f"Handling non-spam email for conversation {data['conv_id']}")
    store_email_data(data)
    
    ev_score = invoke_generate_ev(data['conv_id'], data['msg_id_hdr'], data['account_id'], AUTH_BP)
    if ev_score is None:
        logger.error(f"Failed to calculate EV for {data['conv_id']}. Aborting further processing.")
        return

    thread = invoke_db_select('Threads', 'conversation_id-index', 'conversation_id', data['conv_id'], data['account_id'], AUTH_BP)
    if not thread:
        logger.error(f"Could not find thread for conversation {data['conv_id']}.")
        return

    should_respond = thread[0].get('lcp_enabled', 'false') == 'true'
    user_settings = invoke_db_select('Users', 'id-index', 'id', data['account_id'], data['account_id'], AUTH_BP)
    if should_respond and user_settings and user_settings[0].get('lcp_automatic_enabled', 'false') == 'true':
        llm_response = invoke_llm_response(data['conv_id'], data['account_id'], data['is_first'], AUTH_BP)
        if llm_response:
            schedule_llm_response(llm_response, data, ev_score)

def store_email_data(data):
    conversation_data = {
        'conversation_id': data['conv_id'], 'response_id': data['msg_id_hdr'], 'in_reply_to': data['in_reply_to'],
        'timestamp': data['timestamp'], 'sender': data['source'], 'receiver': data['destination'],
        'associated_account': data['account_id'], 'subject': data['subject'], 'body': data['text_body'],
        's3_location': data['s3_key'], 'type': 'inbound-email', 'is_first_email': '1' if data['is_first'] else '0'
    }
    store_conversation_item(conversation_data)

    existing_thread = invoke_db_select('Threads', 'conversation_id-index', 'conversation_id', data['conv_id'], data['account_id'], AUTH_BP)
    if data['is_first'] and not existing_thread:
        user_lcp_enabled = invoke_db_select('Users', 'id-index', 'id', data['account_id'], data['account_id'], AUTH_BP)
        lcp_enabled = user_lcp_enabled[0].get('lcp_automatic_enabled', 'false') if user_lcp_enabled else 'false'
        
        thread_data = {
            'conversation_id': data['conv_id'], 'source': data['source'], 'source_name': data['user_info'].get('sender_name', ''),
            'associated_account': data['account_id'], 'read': 'false', 'lcp_enabled': lcp_enabled,
            'lcp_flag_threshold': '80', 'flag': 'false', 'flag_for_review': 'false', 'flag_review_override': 'false'
        }
        store_thread_item(thread_data)
    elif existing_thread:
        update_thread_read_status(data['conv_id'], False)

    invoke_lambda('get-thread-attrs', {'body': json.dumps({'conversationId': data['conv_id'], 'accountId': data['account_id']})})

def invoke_generate_ev(conversation_id, message_id, account_id, session_id):
    try:
        payload = {'conversation_id': conversation_id, 'message_id': message_id, 'account_id': account_id, 'session_id': session_id}
        response = invoke_lambda('generate-ev', payload)
        return response.get('body', {}).get('ev_score')
    except LambdaError as e:
        logger.error(f"Error invoking generate-ev lambda: {e.message}")
        return None

def invoke_llm_response(conversation_id, account_id, is_first, session_id):
    try:
        payload = {'conversation_id': conversation_id, 'account_id': account_id, 'is_first_email': is_first, 'session_id': session_id}
        response = invoke_lambda('lcp-llm-response', payload)
        return response.get('body', {}).get('response')
    except LambdaError as e:
        logger.error(f"Error invoking LLM response Lambda: {e.message}")
        return None

def schedule_llm_response(response_body, email_data, ev_score):
    payload = {
        'response_body': response_body, 'account': email_data['account_id'], 'target': email_data['source'],
        'in_reply_to': email_data['msg_id_hdr'], 'conversation_id': email_data['conv_id'],
        'subject': email_data['subject'], 'ev_score': ev_score
    }
    schedule_name = generate_safe_schedule_name(f"process-email-{email_data['msg_id_hdr']}")
    schedule_time = datetime.utcnow() + timedelta(seconds=10)
    update_thread_attributes(email_data['conv_id'], {'busy': True})
    schedule_email_processing(schedule_name, schedule_time, payload, email_data['in_reply_to'])
