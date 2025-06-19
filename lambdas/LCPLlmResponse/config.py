# config.py
import os
import logging

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Load configuration from environment variables
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-2')
TAI_KEY = os.environ['TAI_KEY']  # Together AI API key

# Database Lambda function name
DB_SELECT_LAMBDA = os.environ['DB_SELECT_LAMBDA']  # Single Lambda for all DB operations 

# Rate limit Lambda function names
AWS_RATE_LIMIT_LAMBDA = "RateLimitAWS"  # AWS rate limit Lambda
AI_RATE_LIMIT_LAMBDA = "RateLimitAI"    # AI rate limit Lambda

BEDROCK_KB_ID     = os.getenv("BEDROCK_KB_ID")      # your KB's ID
BEDROCK_MODEL_ARN = os.getenv("BEDROCK_MODEL_ARN")  # e.g. "anthropic.claude-v2:1"

# Authentication bypass key for admin operations
AUTH_BP = os.environ.get("AUTH_BP", "")
if not AUTH_BP:
    logger.warning("AUTH_BP environment variable not set. Admin bypass functionality will be disabled.")
