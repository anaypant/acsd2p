import json
import requests
import boto3
import logging
import time
from db import store_ai_invocation
from config import TOGETHER_API_KEY, TOGETHER_API_URL, TOGETHER_MODEL

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

spam_detection_role = {
    "role": "system",
    "content": """You are a spam detection system for a real estate automation platform. Your job is to determine if an email is relevant to real estate conversations or if it should be classified as spam.

CLASSIFY AS SPAM if the email is:
- Marketing/promotional emails unrelated to real estate
- Newsletter subscriptions
- Social media notifications
- Online shopping confirmations/receipts
- Technical notifications (server alerts, software updates, etc.)
- Personal emails clearly unrelated to real estate business
- Automated system emails from non-real estate platforms
- Job postings unrelated to real estate

CLASSIFY AS NOT SPAM if the email is:
- Inquiries about buying/selling/renting property
- Questions about real estate services
- Responses to property listings
- Real estate market inquiries
- Mortgage/financing related to property purchases
- Property management questions
- Real estate investment inquiries
- Follow-up emails about property viewings or consultations

Respond with ONLY the word "spam" or "not spam" - nothing else."""
}

def detect_spam(subject: str, body: str, sender: str, account_id: str, session_id: str) -> bool:
    """
    Uses LLM to detect if an email is spam (not related to real estate conversations).
    Returns True if the email is spam, False otherwise.
    """
    max_retries = 3
    retry_delay = 1  # seconds
    
    for attempt in range(max_retries + 1):
        try:
            logger.info(f"Starting spam detection for email from {sender} to account {account_id} (Attempt {attempt + 1}/{max_retries + 1})")
            logger.info(f"Email subject: {subject}")
            logger.info(f"Email body length: {len(body)} characters")
            
            # Prepare the email content for spam detection
            email_content = f"""
Subject: {subject}
From: {sender}
Body: {body}
"""
            
            messages = [
                spam_detection_role,
                {
                    "role": "user",
                    "content": email_content
                }
            ]
            
            logger.info("Prepared messages for spam detection:")
            logger.info(f"System prompt length: {len(spam_detection_role['content'])} characters")
            logger.info(f"User message length: {len(email_content)} characters")
            
            # Use the LLM API to detect spam
            headers = {
                "Authorization": f"Bearer {TOGETHER_API_KEY}",
                "Content-Type": "application/json"
            }

            payload = {
                "model": TOGETHER_MODEL,
                "messages": messages,
                "max_tokens": 10,  # We only need "spam" or "not spam"
                "temperature": 0.1,  # Low temperature for consistent classification
                "top_p": 0.9,
                "top_k": 50,
                "repetition_penalty": 1,
                "stop": ["<|im_end|>", "<|endoftext|>"],
                "stream": False
            }
            
            logger.info("Sending request to Together AI API for spam detection")
            logger.info(f"Request payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(TOGETHER_API_URL, headers=headers, json=payload)
            logger.info(f"API response status code: {response.status_code}")
            
            # Check for 503 error and retry if needed
            if response.status_code == 503 and attempt < max_retries:
                logger.warning(f"Service unavailable (503). Retrying in {retry_delay} seconds... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                continue
            
            response_data = response.json()
            logger.info("Raw API response data:")
            logger.info(json.dumps(response_data, indent=2))

            if response.status_code != 200 or "choices" not in response_data:
                logger.error(f"Spam detection API call failed: {response_data}")
                # In case of API failure, assume not spam to avoid false positives
                return False

            response_text = response_data["choices"][0]["message"]["content"].strip().lower()
            logger.info(f"Spam detection response text: '{response_text}'")
            
            # Get token usage from response
            usage = response_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = usage.get("total_tokens", 0)
            
            logger.info(f"Token usage - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}")
            
            # Store the invocation record with actual token counts
            invocation_success = store_ai_invocation(
                associated_account=account_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                llm_email_type="spam_detection"
            )
            logger.info(f"Stored invocation record: {'Success' if invocation_success else 'Failed'}")
            
            # Check if the response contains "spam"
            is_spam = "spam" in response_text and "not spam" not in response_text
            logger.info(f"Final spam classification: {is_spam}")
            
            return is_spam
            
        except Exception as e:
            logger.error(f"Error in spam detection: {str(e)}", exc_info=True)
            if attempt < max_retries:
                logger.warning(f"Retrying after error in {retry_delay} seconds... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                continue
            # In case of error after all retries, assume not spam to avoid false positives
            return False
