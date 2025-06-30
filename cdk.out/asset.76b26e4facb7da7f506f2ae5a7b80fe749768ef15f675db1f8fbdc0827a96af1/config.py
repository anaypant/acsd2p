import os
import logging
from typing import Dict, Any

# DynamoDB Table Names
DYNAMODB_TABLES = {
    'CONVERSATIONS': 'Conversations',
    'THREADS': 'Threads',
    'INVOCATIONS': 'Invocations',
    'USERS': 'Users'
}

# Together AI Configuration
TOGETHER_AI = {
    'API_URL': 'https://api.together.xyz/v1/chat/completions',
    'API_KEY': os.environ.get('TAI_KEY', 'NULL'),  # Get from environment variable
    'MODEL': 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    'TEMPERATURE': 0.1,
    'MAX_TOKENS': 500,
    'STOP_SEQUENCES': ['<|im_end|>', '<|endoftext|>']
}

# LLM System Prompts
SYSTEM_PROMPTS = {
    'THREAD_ATTRIBUTES': """You are an AI assistant that analyzes real estate conversations. Extract the following attributes from the conversation:

1. AI Summary: A concise phrase describing the current state of the conversation
2. Budget Range: A 2-4 word description of the lead's budget (use "UNKNOWN" if not mentioned)
3. Preferred Property Types: A maximum 5 word description of preferred property types (use "UNKNOWN" if not mentioned)
4. Timeline: A 2-5 word description of the lead's timeline to buy

Format your response exactly as:
ai_summary: [summary]
budget_range: [budget]
preferred_property_types: [types]
timeline: [timeline]"""
}

# Logging Configuration
LOGGING_CONFIG = {
    'LEVEL': 'INFO',
    'FORMAT': '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    'DATE_FORMAT': '%Y-%m-%d %H:%M:%S',
    'LOG_LEVELS': {
        'DEBUG': 10,
        'INFO': 20,
        'WARNING': 30,
        'ERROR': 40,
        'CRITICAL': 50
    },
    'ENABLE_REQUEST_LOGGING': True,
    'ENABLE_RESPONSE_LOGGING': True,
    'ENABLE_PERFORMANCE_LOGGING': True
}

# Add this to initialize the logger
logging.basicConfig(
    level=LOGGING_CONFIG['LEVEL'],
    format=LOGGING_CONFIG['FORMAT'],
    datefmt=LOGGING_CONFIG['DATE_FORMAT']
)
logger = logging.getLogger()

# Lambda Configuration
LAMBDA_CONFIG = {
    'TIMEOUT': 30,  # seconds
    'MEMORY_SIZE': 256  # MB
}

def get_table_name(table_key: str) -> str:
    """Helper function to get DynamoDB table name"""
    return DYNAMODB_TABLES.get(table_key, '')

def get_together_ai_config() -> Dict[str, Any]:
    """Helper function to get Together AI configuration"""
    return TOGETHER_AI.copy()

def get_system_prompt(prompt_key: str) -> str:
    """Helper function to get system prompt"""
    return SYSTEM_PROMPTS.get(prompt_key, '') 

AUTH_BP = os.environ.get('AUTH_BP', '')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-2')

if not AUTH_BP:
    raise ValueError("AUTH_BP environment variable is not set")