import os
import logging

# Configure logging
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger()

# AWS Region
AWS_REGION = os.environ.get("AWS_REGION")

if not AWS_REGION:
    logger.error("AWS_REGION environment variable not set.")
    raise ValueError("AWS_REGION is a required environment variable.") 