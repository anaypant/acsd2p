import json
import urllib3
import logging
from typing import Dict, Any, List, Tuple
from config import TAI_KEY
from db import check_and_update_ai_rate_limit
from utils import store_ai_invocation

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize urllib3 pool manager
http = urllib3.PoolManager()

def format_conversation_for_llm(chain: List[Dict[str, Any]]) -> str:
    """
    Format the conversation chain for the LLM prompt.
    """
    formatted_chain = []
    for msg in chain:
        formatted_msg = f"From: {msg['sender']}\n"
        formatted_msg += f"Subject: {msg['subject']}\n"
        formatted_msg += f"Body: {msg['body']}\n"
        formatted_msg += "---\n"
        formatted_chain.append(formatted_msg)
    
    return "\n".join(formatted_chain)

def invoke_flag_llm(conversation_chain: List[Dict[str, Any]], account_id: str, conversation_id: str, session_id: str) -> Tuple[str, Dict[str, int]]:
    """
    Invoke the flag LLM to determine if a conversation should be flagged.
    
    Args:
        conversation_chain: List of conversation messages
        account_id: The account ID
        conversation_id: The conversation ID
        session_id: The session ID for authorization
    
    Returns:
        Tuple[str, Dict[str, int]]: (should_flag, token_usage) where should_flag is 'true' or 'false'
    """
    try:
        # Format conversation for LLM
        formatted_chain = format_conversation_for_llm(conversation_chain)
        
        # Prepare system prompt
        system_prompt = {
            "role": "system",
            'content': """You are an assistant that evaluates whether an AI-driven buyer–realtor conversation has reached true conversion readiness and should be handed off to a human realtor (i.e. exit the automated pipeline). 
           
           Return exactly one word: "flag" if the lead is ready to be converted and needs a human realtor to close the deal, or "ok" if it should remain in automated nurturing.
           \n\nFlag (return "flag") only when the buyer:\n  
           1. Explicitly expresses firm intent to purchase ("I want to buy," "let\'s make an offer," etc.)\n  
           2. Asks to schedule a property viewing with no further qualification needed\n  
           3. Inquires about financing or pre-approval\n  
           4. Requests next steps toward making an offer or contract\n  
           5. Shows any unambiguous buying signal that a human touch is required to close\n\n
           
           Note: If you feel like nowhere near enough content is available for the realtor at this point, do not return "flag".\n\n
           
           Do NOT flag (return "ok") if the buyer:\n  
           1. Is only gathering general information (e.g. neighborhood questions)\n  
           2. Is asking purely about logistics or availability without stating intent to buy\n  
           3. Is in early-stage browsing or remains vague about buying\n  
           4. Requires more nurturing or qualification before human handoff
           
           \n\nThe goal is to escalate only fully qualified, ready-to-buy leads.  Return ONLY "flag" or "ok."""
        }
        # Prepare user message
        user_message = {
            "role": "user",
            "content": formatted_chain
        }
        
        # Make API call
        url = "https://api.together.xyz/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {TAI_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
            "messages": [system_prompt, user_message],
            "max_tokens": 5,  # We only need a very short response
            "temperature": 0.0,  # Zero temperature for deterministic responses
            "top_p": 0.1,  # Low top_p for focused sampling
            "frequency_penalty": 0.0,  # No frequency penalty needed
            "presence_penalty": 0.0,  # No presence penalty needed
            "stop": ["\n", ".", " ", ","]  # Stop at any punctuation or space
        }

        # Make the API call
        encoded_data = json.dumps(payload).encode('utf-8')
        response = http.request(
            'POST',
            url,
            body=encoded_data,
            headers=headers
        )

        if response.status != 200:
            logger.error(f"API call failed with status {response.status}: {response.data.decode('utf-8')}")
            return 'false', {'input_tokens': 0, 'output_tokens': 0}

        response_data = json.loads(response.data.decode('utf-8'))
        if "choices" not in response_data:
            logger.error(f"Invalid API response format: {response_data}")
            return 'false', {'input_tokens': 0, 'output_tokens': 0}

        # Get token usage from response
        token_usage = {
            'input_tokens': response_data.get('usage', {}).get('prompt_tokens', 0),
            'output_tokens': response_data.get('usage', {}).get('completion_tokens', 0)
        }

        # Get the response text and clean it
        response_text = response_data["choices"][0]["message"]["content"].strip().lower()
        logger.info(f"Flag LLM response: {response_text}")

        # Store the invocation record
        store_ai_invocation(
            associated_account=account_id,
            input_tokens=token_usage['input_tokens'],
            output_tokens=token_usage['output_tokens'],
            llm_email_type='flag',
            model_name='meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
            conversation_id=conversation_id,
            session_id=session_id
        )

        # Return True if the response is "flag", False otherwise
        return (True if response_text == "flag" else False, token_usage)

    except Exception as e:
        logger.error(f"Error invoking flag LLM: {str(e)}")
        return 'false', {'input_tokens': 0, 'output_tokens': 0} 