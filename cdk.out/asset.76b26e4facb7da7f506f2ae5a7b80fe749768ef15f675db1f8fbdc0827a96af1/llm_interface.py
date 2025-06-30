import json
import urllib3
import logging
import time
import re
from typing import Dict, Any, Optional, Tuple
from db import store_llm_invocation
from config import get_together_ai_config, get_system_prompt, LOGGING_CONFIG

# Set up logging
logger = logging.getLogger(__name__)
logger.setLevel(getattr(logging, LOGGING_CONFIG['LEVEL']))

# Initialize urllib3 pool manager
http = urllib3.PoolManager()

# Define expected attributes and their validation rules
EXPECTED_ATTRIBUTES = {
    'ai_summary': {
        'required': True
    },
    'budget_range': {
        'required': True,
        'max_words': 1000,
        'min_words': 0,
        'allowed_values': ['UNKNOWN']  # Special case for unknown values
    },
    'preferred_property_types': {
        'required': True,
        'max_words': 1000,
        'min_words': 0,
        'allowed_values': ['UNKNOWN']  # Special case for unknown values
    },
    'timeline': {
        'required': True,
        'max_words': 1000,
        'min_words': 0
    }
}

def to_snake_case(s: str) -> str:
    """
    Convert a string to snake_case.
    """
    s = s.strip().replace('-', ' ').replace('.', ' ')
    s = re.sub(r'(?<!^)(?=[A-Z])', '_', s).replace(' ', '_')
    return s.lower()

def clean_attribute_value(value: str) -> str:
    """
    Clean and normalize an attribute value.
    """
    # Remove extra whitespace
    value = ' '.join(value.split())
    # Remove any leading/trailing punctuation
    value = value.strip('.,;:!?')
    return value

def validate_attribute(key: str, value: str) -> Tuple[bool, str]:
    """
    Validate an attribute value against its rules.
    Returns (is_valid, error_message)
    """
    if key not in EXPECTED_ATTRIBUTES:
        return False, f"Unexpected attribute: {key}"
    
    rules = EXPECTED_ATTRIBUTES[key]
    value = clean_attribute_value(value)
    
    # Check required
    if rules['required'] and not value:
        return False, f"{key} is required"
    
    # Check word count
    word_count = len(value.split())
    if 'max_words' in rules and word_count > rules['max_words']:
        return False, f"{key} exceeds maximum word count of {rules['max_words']}"
    if 'min_words' in rules and word_count < rules['min_words']:
        return False, f"{key} is below minimum word count of {rules['min_words']}"
    
    # Check allowed values
    if 'allowed_values' in rules and value.upper() in [v.upper() for v in rules['allowed_values']]:
        return True, ""
    
    return True, ""

def parse_llm_response(content: str) -> Dict[str, str]:
    """
    Parse and validate the LLM response into a dictionary of attributes.
    Returns a dictionary of validated attributes or raises ValueError if invalid.
    """
    logger.info("Parsing LLM response")
    attributes = {}
    errors = []
    
    # Split into lines and process each line
    lines = [line.strip() for line in content.split('\n') if line.strip()]
    
    for line in lines:
        if ':' not in line:
            logger.warning(f"Skipping invalid line (no colon): {line}")
            continue
            
        key, value = line.split(':', 1)
        key = key.strip()
        value = value.strip()
        
        # Normalize key to snake_case
        key_snake = to_snake_case(key)
        
        # Clean and validate the attribute
        value = clean_attribute_value(value)
        is_valid, error_msg = validate_attribute(key_snake, value)
        
        if is_valid:
            attributes[key_snake] = value
            logger.debug(f"Validated attribute - {key_snake}: {value}")
        else:
            errors.append(f"{key_snake}: {error_msg}")
            logger.warning(f"Invalid attribute - {key_snake}: {value} - {error_msg}")
    
    # Check for missing required attributes
    for key, rules in EXPECTED_ATTRIBUTES.items():
        if rules['required'] and key not in attributes:
            errors.append(f"Missing required attribute: {key}")
            logger.warning(f"Missing required attribute: {key}")
    
    if errors:
        error_msg = "Validation errors:\n" + "\n".join(errors)
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    logger.info("Successfully parsed and validated all attributes")
    return attributes

def get_thread_attributes(conversation_text: str, account_id: Optional[str] = None, conversation_id: Optional[str] = None) -> Dict[str, str]:
    """
    Get thread attributes by analyzing conversation text using LLM.
    Returns a dictionary of validated attributes.
    """
    start_time = time.time()
    logger.info(f"Starting thread attributes analysis for conversation_id: {conversation_id}")
    
    # Get Together AI configuration
    tai_config = get_together_ai_config()
    
    headers = {
        "Authorization": f"Bearer {tai_config['API_KEY']}",
        "Content-Type": "application/json"
    }

    messages = [
        {
            "role": "system",
            "content": get_system_prompt('THREAD_ATTRIBUTES')
        },
        {
            "role": "user",
            "content": f"Please analyze this real estate conversation and provide the attributes:\n\n{conversation_text}"
        }
    ]

    payload = {
        "model": tai_config['MODEL'],
        "messages": messages,
        "temperature": tai_config['TEMPERATURE'],
        "max_tokens": tai_config['MAX_TOKENS'],
        "stop": tai_config['STOP_SEQUENCES'],
        "stream": False
    }

    if LOGGING_CONFIG['ENABLE_REQUEST_LOGGING']:
        logger.info("Preparing Together AI API request:")
        logger.info(f"  Model: {payload['model']}")
        logger.info(f"  Temperature: {payload['temperature']}")
        logger.info(f"  Max Tokens: {payload['max_tokens']}")
        logger.info(f"  System Prompt: {messages[0]['content'][:100]}...")
        logger.info(f"  User Message Length: {len(messages[1]['content'])} characters")

    try:
        encoded_data = json.dumps(payload).encode('utf-8')
        api_start_time = time.time()
        
        logger.info("Sending request to Together AI API...")
        response = http.request(
            'POST',
            tai_config['API_URL'],
            body=encoded_data,
            headers=headers
        )
        api_duration = time.time() - api_start_time
        
        if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
            logger.info(f"API request completed in {api_duration:.2f} seconds")

        if response.status != 200:
            logger.error(f"API call failed with status {response.status}")
            logger.error(f"Response data: {response.data.decode('utf-8')}")
            raise Exception("Failed to fetch response from Together AI API")

        response_data = json.loads(response.data.decode('utf-8'))
        if "choices" not in response_data:
            logger.error(f"Invalid API response structure: {json.dumps(response_data, indent=2)}")
            raise Exception("Invalid response from Together AI API")

        # Extract token usage
        usage = response_data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)
        total_tokens = input_tokens + output_tokens

        if LOGGING_CONFIG['ENABLE_RESPONSE_LOGGING']:
            logger.info("Together AI API Response Details:")
            logger.info(f"  Status Code: {response.status}")
            logger.info(f"  Input Tokens: {input_tokens}")
            logger.info(f"  Output Tokens: {output_tokens}")
            logger.info(f"  Total Tokens: {total_tokens}")
            logger.info(f"  Response Time: {api_duration:.2f} seconds")
            logger.info(f"  Tokens/Second: {total_tokens/api_duration:.2f}")

        # Store invocation record if we have an account_id
        if account_id:
            logger.info(f"Storing LLM invocation record for account: {account_id}")
            invocation_success = store_llm_invocation(
                associated_account=account_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                llm_email_type="thread_attributes",
                model_name=payload["model"],
                conversation_id=conversation_id
            )
            logger.info(f"LLM invocation record storage: {'Success' if invocation_success else 'Failed'}")

        # Parse and validate the response
        content = response_data["choices"][0]["message"]["content"]
        try:
            attributes = parse_llm_response(content)
            
            if LOGGING_CONFIG['ENABLE_RESPONSE_LOGGING']:
                logger.info("Extracted and validated Thread Attributes:")
                for key, value in attributes.items():
                    logger.info(f"  {key}: {value}")

            total_duration = time.time() - start_time
            if LOGGING_CONFIG['ENABLE_PERFORMANCE_LOGGING']:
                logger.info(f"Total thread attributes analysis completed in {total_duration:.2f} seconds")

            return attributes
            
        except ValueError as e:
            logger.error(f"Failed to parse LLM response: {str(e)}")
            logger.error(f"Raw LLM response: {content}")
            raise

    except Exception as e:
        logger.error(f"Error in get_thread_attributes: {str(e)}", exc_info=True)
        logger.error("Error context:")
        logger.error(f"  Conversation ID: {conversation_id}")
        logger.error(f"  Account ID: {account_id}")
        logger.error(f"  Model: {payload['model']}")
        if 'response' in locals():
            logger.error(f"  Response Status: {response.status}")
            logger.error(f"  Response Data: {response.data.decode('utf-8')}")
        raise Exception(f"Failed to get thread attributes for conversation {conversation_id}: {str(e)}")