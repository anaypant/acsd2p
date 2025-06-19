# config.py
import os
import logging

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger()

# Load configuration from environment variables
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-2')
TAI_KEY = os.environ['TAI_KEY']  # Together AI API key

# Database Lambda function name
DB_SELECT_LAMBDA = os.environ['DB_SELECT_LAMBDA']  # Single Lambda for all DB operations 