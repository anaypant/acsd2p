# config.py
import os
import logging

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger()

# Load configuration from environment variables
BUCKET_NAME = os.environ['BUCKET_NAME']
QUEUE_URL = os.environ['QUEUE_URL']
PROCESSING_LAMBDA_ARN = os.environ['PROCESSING_LAMBDA_ARN']
GENERATE_EV_LAMBDA_ARN = os.environ['GENERATE_EV_LAMBDA_ARN']
LCP_LLM_RESPONSE_LAMBDA_ARN = os.environ['LCP_LLM_RESPONSE_LAMBDA_ARN']
DB_SELECT_LAMBDA = os.environ['DB_SELECT_LAMBDA']  # Database Lambda function name
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-2')

# Spam configuration
SPAM_TTL_DAYS = int(os.environ.get('SPAM_TTL_DAYS', 30))  # Default 30 days TTL for spam emails
AUTH_BP = os.environ.get('AUTH_BP', '')

# Together AI API configuration
TOGETHER_API_KEY = os.environ['TAI_KEY']
TOGETHER_API_URL = os.environ.get('TOGETHER_API_URL', 'https://api.together.xyz/v1/chat/completions')
TOGETHER_MODEL = os.environ.get('TOGETHER_MODEL', 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free')
