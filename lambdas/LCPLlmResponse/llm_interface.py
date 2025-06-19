import json
import urllib3
import boto3
import logging
import time
from config import TAI_KEY, AWS_REGION, AI_RATE_LIMIT_LAMBDA
from typing import Optional, Dict, Any, List, Tuple
from prompts import get_prompts, MODEL_MAPPING
from db import store_llm_invocation

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize urllib3 pool manager
http = urllib3.PoolManager()

url = "https://api.together.xyz/v1/chat/completions"


def invoke_rate_limit(lambda_name: str, account_id: str, session_id: str) -> Tuple[bool, Optional[str]]:
    """
    Invoke a rate limit Lambda function.
    Returns (is_allowed, error_message)
    """
    try:
        lambda_client = boto3.client('lambda', region_name=AWS_REGION)
        
        payload = {
            'account_id': account_id,
            'session_id': session_id
        }
        
        response = lambda_client.invoke(
            FunctionName=lambda_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        response_payload = json.loads(response['Payload'].read())
        if response_payload['statusCode'] != 200:
            logger.error(f"Rate limit Lambda failed: {response_payload}")
            return False, response_payload.get('body', 'Rate limit check failed')
            
        result = json.loads(response_payload['body'])
        logger.info(f"Rate limit Lambda result: {result}")
        logger.info("Response payload:")
        logger.info(response_payload)
        return response_payload['statusCode'] == 200, result.get('error_message')
        
    except Exception as e:
        logger.error(f"Error invoking rate limit Lambda: {str(e)}")
        return False, str(e)


def check_ai_rate_limit(account_id: str, session_id: str) -> Tuple[bool, Optional[str]]:
    """
    Check AI rate limit by invoking RateLimitAI Lambda.
    Returns (is_allowed, error_message)
    """
        
    return invoke_rate_limit(AI_RATE_LIMIT_LAMBDA, account_id, session_id)

class LLMResponder:
    def __init__(self, scenario: str, account_id: str, session_id: str):
        original_scenario = scenario
        
        # Get prompts with embedded preferences for this account
        prompts = get_prompts(account_id, session_id)
        
        if scenario not in prompts:
            # Default to continuation_email if unknown scenario
            logger.warning(f"Unknown LLM scenario: '{original_scenario}'. Defaulting to 'continuation_email'.")
            scenario = "continuation_email"
        
        logger.info(f"Initializing LLMResponder - Scenario: '{scenario}', Account ID: {account_id}")
        self.prompt_config = prompts[scenario]
        self.hyperparameters = self.prompt_config["hyperparameters"]
        self.system_prompt = self.prompt_config["system"]
        self.account_id = account_id
        self.scenario = scenario
        self.session_id = session_id  # Store session_id as instance variable
        self.model_name = MODEL_MAPPING.get(scenario, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8")
        
        # Check if this scenario has a middleman prompt
        self.has_middleman = "middleman" in self.prompt_config
        self.middleman_prompt = self.prompt_config.get("middleman", "")
        self.middleman_params = self.prompt_config.get("middleman_params", {})
        self.middleman_model = MODEL_MAPPING.get(f"{scenario}_middleman", self.model_name)
        
        logger.info(f"Prompt configuration for scenario '{scenario}':")
        logger.info(f"Model: {self.model_name}")
        logger.info(f"Has middleman: {self.has_middleman}")
        logger.info(f"Account ID: {account_id}")
        logger.info(f"Session ID: {session_id}")
        if self.has_middleman:
            logger.info(f"Middleman model: {self.middleman_model}")
            logger.info(f"Middleman params: {json.dumps(self.middleman_params, indent=2)}")
            logger.info(f"Middleman prompt length: {len(self.middleman_prompt)} characters")
        logger.info(f"Hyperparameters: {json.dumps(self.hyperparameters, indent=2)}")
        logger.info(f"System prompt length: {len(self.system_prompt)} characters")
        logger.info(f"Using prompts with embedded preferences for account {account_id}")

    def format_conversation(self, email_chain: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        logger.info(f"Formatting conversation with {len(email_chain)} messages")
        messages = [
            {"role": "system", "content": self.system_prompt}
        ]
        
        for i, email in enumerate(email_chain):
            email_content = f"Subject: {email.get('subject', '')}\n\nBody: {email.get('body', '')}"
            role = "user" if email.get('type') == 'inbound-email' else "assistant"
            logger.info(f"Message {i+1} - Role: {role}, Subject: {email.get('subject', '')}, Body length: {len(email.get('body', ''))} chars")
            messages.append({"role": role, "content": email_content})
            
        logger.info(f"Formatted {len(messages)} total messages (including system prompt)")
        return messages

    def call_middleman_llm(self, email_chain: List[Dict[str, Any]], conversation_id: Optional[str] = None) -> str:
        """
        Calls the middleman LLM to get strategic instructions for the email response.
        Returns the middleman's instructions as a string.
        """
        if not self.has_middleman:
            logger.error(f"No middleman prompt available for scenario '{self.scenario}'")
            raise ValueError(f"Scenario '{self.scenario}' does not have a middleman prompt")
        
        # Check AI rate limit before proceeding
        is_allowed, error_msg = check_ai_rate_limit(self.account_id, self.session_id)
        if not is_allowed:
            logger.warning(f"AI rate limit exceeded for account {self.account_id}: {error_msg}")
            raise Exception(error_msg)
        
        logger.info(f"=== MIDDLEMAN LLM CALL START ===")
        logger.info(f"Scenario: {self.scenario}")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"Account ID: {self.account_id}")
        logger.info(f"Email chain length: {len(email_chain)} messages")
        
        # Format conversation for middleman
        messages = [
            {"role": "system", "content": self.middleman_prompt}
        ]
        
        for i, email in enumerate(email_chain):
            email_content = f"Subject: {email.get('subject', '')}\n\nBody: {email.get('body', '')}"
            role = "user" if email.get('type') == 'inbound-email' else "assistant"
            logger.info(f"Middleman input - Email {i+1}: Role={role}, Subject='{email.get('subject', '')}', Body length={len(email.get('body', ''))} chars")
            messages.append({"role": role, "content": email_content})
        
        logger.info(f"Middleman formatted {len(messages)} total messages (including system prompt)")
        
        # Prepare API payload for middleman
        headers = {
            "Authorization": f"Bearer {TAI_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.middleman_model,
            "messages": messages,
            **self.middleman_params,
            "stop": ["<|im_end|>", "<|endoftext|>"],
            "stream": False
        }
        
        try:
            logger.info(f"Calling middleman API with model: {self.middleman_model}")
            logger.info(f"Middleman payload: {json.dumps(payload, indent=2)}")
            
            encoded_data = json.dumps(payload).encode('utf-8')
            response = http.request(
                'POST',
                url,
                body=encoded_data,
                headers=headers
            )
            
            logger.info(f"Middleman API response status: {response.status}")
            if response.status != 200:
                error_msg = response.data.decode('utf-8')
                logger.error(f"Middleman API call failed with status {response.status}: {error_msg}")
                raise Exception(f"Failed to fetch response from middleman LLM: {error_msg}")
            
            response_data = json.loads(response.data.decode('utf-8'))
            logger.info("Middleman raw API response:")
            logger.info(json.dumps(response_data, indent=2))
            
            if "choices" not in response_data:
                logger.error(f"Invalid middleman API response format: {response_data}")
                raise Exception("Invalid response format from middleman LLM")
            
            # Extract token usage
            usage = response_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = usage.get("total_tokens", 0)
            
            logger.info(f"Middleman token usage - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}")
            
            # Store invocation record for middleman
            if self.account_id:
                logger.info("Storing middleman invocation record in DynamoDB")
                invocation_success = store_llm_invocation(
                    associated_account=self.account_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    llm_email_type=f"{self.scenario}_middleman",
                    model_name=self.middleman_model,
                    conversation_id=conversation_id
                )
                logger.info(f"Stored middleman invocation record: {'Success' if invocation_success else 'Failed'}")
            
            middleman_instructions = response_data["choices"][0]["message"]["content"]
            logger.info(f"Middleman instructions generated successfully - length: {len(middleman_instructions)} characters")
            logger.info(f"Middleman instructions preview: {middleman_instructions[:500]}...")
            logger.info(f"=== MIDDLEMAN LLM CALL END ===")
            
            return middleman_instructions.replace('\\n', '\n')
        except Exception as e:
            logger.error(f"Error in middleman LLM call: {str(e)}", exc_info=True)
            logger.error(f"=== MIDDLEMAN LLM CALL FAILED ===")
            raise

    def call_output_llm(self, email_chain: List[Dict[str, Any]], middleman_instructions: str, conversation_id: Optional[str] = None) -> str:
        """
        Calls the output LLM with the middleman's instructions to generate the final email.
        Returns the final email response as a string.
        """
        # Check AI rate limit before proceeding
        is_allowed, error_msg = check_ai_rate_limit(self.account_id, self.session_id)
        if not is_allowed:
            logger.warning(f"AI rate limit exceeded for account {self.account_id}: {error_msg}")
            raise Exception(error_msg)
            
        logger.info(f"=== OUTPUT LLM CALL START ===")
        logger.info(f"Scenario: {self.scenario}")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"Account ID: {self.account_id}")
        logger.info(f"Middleman instructions length: {len(middleman_instructions)} characters")
        
        # Format conversation for output LLM with middleman instructions in system message
        combined_system_prompt = f"{self.system_prompt}\n\nStrategic Instructions:\n{middleman_instructions}"
        messages = [
            {"role": "system", "content": combined_system_prompt}
        ]
        
        # Add the email chain
        for i, email in enumerate(email_chain):
            email_content = f"Subject: {email.get('subject', '')}\n\nBody: {email.get('body', '')}"
            role = "user" if email.get('type') == 'inbound-email' else "assistant"
            logger.info(f"Output LLM input - Email {i+1}: Role={role}, Subject='{email.get('subject', '')}', Body length={len(email.get('body', ''))} chars")
            messages.append({"role": role, "content": email_content})
        
        logger.info(f"Output LLM formatted {len(messages)} total messages (including system prompt with instructions)")
        logger.info(f"Combined system prompt preview: {combined_system_prompt[:300]}...")
        
        # Prepare API payload for output LLM
        headers = {
            "Authorization": f"Bearer {TAI_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model_name,
            "messages": messages,
            **self.hyperparameters,
            "stop": ["<|im_end|>", "<|endoftext|>"],
            "stream": False
        }
        
        try:
            logger.info(f"Calling output API with model: {self.model_name}")
            logger.info(f"Output payload: {json.dumps(payload, indent=2)}")
            
            encoded_data = json.dumps(payload).encode('utf-8')
            response = http.request(
                'POST',
                url,
                body=encoded_data,
                headers=headers
            )
            
            logger.info(f"Output API response status: {response.status}")
            if response.status != 200:
                error_msg = response.data.decode('utf-8')
                logger.error(f"Output API call failed with status {response.status}: {error_msg}")
                raise Exception(f"Failed to fetch response from output LLM: {error_msg}")
            
            response_data = json.loads(response.data.decode('utf-8'))
            logger.info("Output raw API response:")
            logger.info(json.dumps(response_data, indent=2))
            
            if "choices" not in response_data:
                logger.error(f"Invalid output API response format: {response_data}")
                raise Exception("Invalid response format from output LLM")
            
            # Extract token usage
            usage = response_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = usage.get("total_tokens", 0)
            
            logger.info(f"Output token usage - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}")
            
            # Store invocation record for output LLM
            if self.account_id:
                logger.info("Storing output invocation record in DynamoDB")
                invocation_success = store_llm_invocation(
                    associated_account=self.account_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    llm_email_type=self.scenario,
                    model_name=self.model_name,
                    conversation_id=conversation_id
                )
                logger.info(f"Stored output invocation record: {'Success' if invocation_success else 'Failed'}")
            
            final_email = response_data["choices"][0]["message"]["content"]
            logger.info(f"Final email generated successfully - length: {len(final_email)} characters")
            logger.info(f"Final email preview: {final_email[:300]}...")
            logger.info(f"=== OUTPUT LLM CALL END ===")
            
            return final_email.replace('\\n', '\n')
        except Exception as e:
            logger.error(f"Error in output LLM call: {str(e)}", exc_info=True)
            logger.error(f"=== OUTPUT LLM CALL FAILED ===")
            raise

    def send(self, messages: List[Dict[str, str]], conversation_id: Optional[str] = None) -> str:
        headers = {
            "Authorization": f"Bearer {TAI_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model_name,
            "messages": messages,
            **self.hyperparameters,
            "stop": ["<|im_end|>", "<|endoftext|>"],
            "stream": False
        }
        try:
            logger.info(f"Sending request to Together AI API:")
            logger.info(f"Scenario: '{self.scenario}'")
            logger.info(f"Conversation ID: {conversation_id}")
            logger.info(f"Account ID: {self.account_id}")
            logger.info(f"Number of messages: {len(messages)}")
            logger.info(f"Request payload: {json.dumps(payload, indent=2)}")
            
            encoded_data = json.dumps(payload).encode('utf-8')
            logger.info("Making API request...")
            response = http.request(
                'POST',
                url,
                body=encoded_data,
                headers=headers
            )
            
            logger.info(f"API response status: {response.status}")
            if response.status != 200:
                error_msg = response.data.decode('utf-8')
                logger.error(f"API call failed with status {response.status}: {error_msg}")
                raise Exception(f"Failed to fetch response from Together AI API: {error_msg}")
            
            response_data = json.loads(response.data.decode('utf-8'))
            logger.info("Raw API response:")
            logger.info(json.dumps(response_data, indent=2))
            
            if "choices" not in response_data:
                logger.error(f"Invalid API response format: {response_data}")
                raise Exception("Invalid response format from Together AI API")
            
            # Extract token usage from response
            usage = response_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = usage.get("total_tokens", 0)
            
            logger.info(f"Token usage - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}")
            
            # Store invocation record if we have an account_id
            if self.account_id:
                logger.info("Storing invocation record in DynamoDB")
                invocation_success = store_llm_invocation(
                    associated_account=self.account_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    llm_email_type=self.scenario,
                    model_name=self.model_name,
                    conversation_id=conversation_id
                )
                logger.info(f"Stored invocation record: {'Success' if invocation_success else 'Failed'}")
            
            content = response_data["choices"][0]["message"]["content"]
            logger.info(f"Generated response length: {len(content)} characters")
            return content.replace('\\n', '\n')
        except Exception as e:
            logger.error(f"Error in send_message_to_llm: {str(e)}", exc_info=True)  # Added stack trace
            raise

    def generate_response(self, email_chain: List[Dict[str, Any]], conversation_id: Optional[str] = None) -> str:
        """
        Generates an email response using either the two-step middleman workflow or direct LLM call.
        
        Two-step workflow (for scenarios with middleman prompts):
        1. Call middleman LLM to get strategic instructions
        2. Call output LLM with those instructions to generate final email
        
        Direct workflow (for scenarios without middleman prompts):
        1. Call LLM directly with conversation
        """
        logger.info(f"====== GENERATING RESPONSE START ======")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"Scenario: {self.scenario}")
        logger.info(f"Has middleman: {self.has_middleman}")
        logger.info(f"Email chain length: {len(email_chain)} messages")
        
        workflow_start_time = time.time()
        
        try:
            if self.has_middleman:
                logger.info(f"Using TWO-STEP MIDDLEMAN WORKFLOW for scenario '{self.scenario}'")
                
                # Step 1: Call middleman LLM to get strategic instructions
                step1_start_time = time.time()
                logger.info("Step 1: Calling middleman LLM for strategic instructions...")
                try:
                    middleman_instructions = self.call_middleman_llm(email_chain, conversation_id)
                    step1_end_time = time.time()
                    step1_duration = step1_end_time - step1_start_time
                    logger.info(f"Step 1: Middleman LLM call completed successfully in {step1_duration:.2f} seconds")
                    
                    # Validate middleman instructions
                    if not middleman_instructions or not middleman_instructions.strip():
                        logger.error("Step 1: Middleman returned empty or whitespace-only instructions")
                        logger.error("Falling back to direct LLM call due to empty middleman response")
                        return self._direct_llm_call(email_chain, conversation_id)
                    
                    if len(middleman_instructions.strip()) < 10:
                        logger.error(f"Step 1: Middleman instructions too short ({len(middleman_instructions.strip())} chars), likely invalid")
                        logger.error("Falling back to direct LLM call due to insufficient middleman instructions")
                        return self._direct_llm_call(email_chain, conversation_id)
                    
                    logger.info(f"Step 1: Middleman instructions validated successfully ({len(middleman_instructions)} chars)")
                    
                except Exception as e:
                    step1_end_time = time.time()
                    step1_duration = step1_end_time - step1_start_time
                    logger.error(f"Step 1: Middleman LLM call failed after {step1_duration:.2f} seconds: {str(e)}")
                    logger.error("Falling back to direct LLM call due to middleman failure")
                    # Fallback to direct call if middleman fails
                    return self._direct_llm_call(email_chain, conversation_id)
                
                # Step 2: Call output LLM with middleman instructions
                step2_start_time = time.time()
                logger.info("Step 2: Calling output LLM with middleman instructions...")
                try:
                    final_response = self.call_output_llm(email_chain, middleman_instructions, conversation_id)
                    step2_end_time = time.time()
                    step2_duration = step2_end_time - step2_start_time
                    total_duration = step2_end_time - workflow_start_time
                    
                    logger.info(f"Step 2: Output LLM call completed successfully in {step2_duration:.2f} seconds")
                    logger.info(f"====== TWO-STEP WORKFLOW COMPLETED SUCCESSFULLY ======")
                    logger.info(f"Workflow timing summary:")
                    logger.info(f"  - Step 1 (Middleman): {step1_duration:.2f} seconds")
                    logger.info(f"  - Step 2 (Output): {step2_duration:.2f} seconds")
                    logger.info(f"  - Total workflow time: {total_duration:.2f} seconds")
                    return final_response
                except Exception as e:
                    step2_end_time = time.time()
                    step2_duration = step2_end_time - step2_start_time
                    logger.error(f"Step 2: Output LLM call failed after {step2_duration:.2f} seconds: {str(e)}")
                    logger.error("Falling back to direct LLM call due to output LLM failure")
                    # Fallback to direct call if output LLM fails
                    return self._direct_llm_call(email_chain, conversation_id)
                    
            else:
                logger.info(f"Using DIRECT LLM WORKFLOW for scenario '{self.scenario}' (no middleman prompt)")
                direct_response = self._direct_llm_call(email_chain, conversation_id)
                direct_end_time = time.time()
                direct_duration = direct_end_time - workflow_start_time
                logger.info(f"====== DIRECT WORKFLOW COMPLETED SUCCESSFULLY ======")
                logger.info(f"Direct workflow time: {direct_duration:.2f} seconds")
                return direct_response
                
        except Exception as e:
            workflow_end_time = time.time()
            workflow_duration = workflow_end_time - workflow_start_time
            logger.error(f"Critical error in generate_response after {workflow_duration:.2f} seconds: {str(e)}", exc_info=True)
            logger.error(f"====== RESPONSE GENERATION FAILED ======")
            raise

    def _direct_llm_call(self, email_chain: List[Dict[str, Any]], conversation_id: Optional[str] = None) -> str:
        """
        Makes a direct LLM call without using middleman.
        Used for scenarios that don't require middleman processing.
        """
        # Check AI rate limit before proceeding
        is_allowed, error_msg = check_ai_rate_limit(self.account_id, self.session_id)
        if not is_allowed:
            logger.warning(f"AI rate limit exceeded for account {self.account_id}: {error_msg}")
            raise Exception(error_msg)
            
        logger.info(f"=== DIRECT LLM CALL START ===")
        logger.info(f"Scenario: {self.scenario}")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"Email chain length: {len(email_chain)} messages")
        
        try:
            messages = self.format_conversation(email_chain)
            logger.info("Formatted conversation for direct LLM call")
            
            response = self.send(messages, conversation_id)
            logger.info("Direct LLM call completed successfully")
            logger.info(f"=== DIRECT LLM CALL END ===")
            return response
            
        except Exception as e:
            logger.error(f"Error in direct LLM call: {str(e)}", exc_info=True)
            logger.error(f"=== DIRECT LLM CALL FAILED ===")
            raise







def format_conversation_for_llm(email_chain, account_id: Optional[str] = None):
    """
    Formats the email chain to be compatible with the LLM input structure.
    Includes both subject and body for each email.
    """
    prompts = get_prompts(account_id)
    formatted_messages = [{"role": "system", "content": prompts["intro_email"]["system"]}]
    
    logger.info(f"Formatting conversation for LLM. Chain length: {len(email_chain)}")
    for i, email in enumerate(email_chain):
        email_content = f"Subject: {email.get('subject', '')}\n\nBody: {email.get('body', '')}"
        role = "user" if email.get('type') == 'inbound-email' else "assistant"
        logger.info(f"Email {i+1} - Role: {role}, Subject: {email.get('subject', '')}")
        
        formatted_messages.append({
            "role": role,
            "content": email_content
        })
    
    return formatted_messages



def update_thread_busy_status(conversation_id: str, busy_value: str) -> bool:
    """
    Updates the thread's busy attribute in DynamoDB.
    Returns True if successful, False otherwise.
    """
    try:
        dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        threads_table = dynamodb.Table('Threads')
        
        threads_table.update_item(
            Key={'conversation_id': conversation_id},
            UpdateExpression='SET busy = :busy',
            ExpressionAttributeValues={':busy': busy_value}
        )
        
        logger.info(f"Successfully updated busy status to {busy_value} for conversation {conversation_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating busy status: {str(e)}")
        return False

def update_thread_flag_for_review(conversation_id: str, flag_value: str) -> bool:
    """
    Updates the thread's flag_for_review attribute in DynamoDB and sets busy to false if flagged.
    Returns True if successful, False otherwise.
    """
    try:
        dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        threads_table = dynamodb.Table('Threads')
        
        # If flagging for review, also set busy to false
        if flag_value == 'true':
            threads_table.update_item(
                Key={'conversation_id': conversation_id},
                UpdateExpression='SET flag_for_review = :flag, busy = :busy',
                ExpressionAttributeValues={
                    ':flag': flag_value,
                    ':busy': 'false'
                }
            )
        else:
            threads_table.update_item(
                Key={'conversation_id': conversation_id},
                UpdateExpression='SET flag_for_review = :flag',
                ExpressionAttributeValues={':flag': flag_value}
            )
        
        logger.info(f"Successfully updated flag_for_review to {flag_value} and busy to {not flag_value == 'true'} for conversation {conversation_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating flag_for_review and busy status: {str(e)}")
        return False

def get_thread_flag_review_override(conversation_id: str) -> Optional[str]:
    """
    Gets the thread's flag_review_override attribute from DynamoDB.
    Returns None if the thread doesn't exist or there's an error.
    """
    try:
        dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        threads_table = dynamodb.Table('Threads')
        
        response = threads_table.get_item(
            Key={'conversation_id': conversation_id},
            ProjectionExpression='flag_review_override'
        )
        
        if 'Item' not in response:
            logger.warning(f"Thread {conversation_id} not found")
            return None
            
        return response['Item'].get('flag_review_override', 'false')
    except Exception as e:
        logger.error(f"Error getting flag_review_override: {str(e)}")
        return None

def update_thread_flag_review_override(conversation_id: str, flag_value: str) -> bool:
    """
    Updates the thread's flag_review_override attribute in DynamoDB.
    Returns True if successful, False otherwise.
    """
    try:
        dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        threads_table = dynamodb.Table('Threads')
        
        threads_table.update_item(
            Key={'conversation_id': conversation_id},
            UpdateExpression='SET flag_review_override = :flag',
            ExpressionAttributeValues={':flag': flag_value}
        )
        
        logger.info(f"Successfully updated flag_review_override to {flag_value} for conversation {conversation_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating flag_review_override: {str(e)}")
        return False

def check_with_reviewer_llm(email_chain: List[Dict[str, Any]], conversation_id: str, account_id, session_id) -> bool:
    """
    Uses the reviewer_llm to determine if a conversation needs human review.
    Returns True if the conversation should be flagged for review, False otherwise.
    """
    logger.info(f"Starting reviewer LLM check for conversation {conversation_id}")
    logger.info(f"Account ID: {account_id}")
    logger.info(f"Email chain length: {len(email_chain)} messages")
    
    # First check if review override is enabled
    override_flag = get_thread_flag_review_override(conversation_id)
    logger.info(f"Review override flag: {override_flag}")
    
    if override_flag is None:
        logger.error(f"Could not get flag_review_override for conversation {conversation_id}")
        return True  # Default to flagging for review on error
        
    if override_flag == 'true':
        logger.info(f"Review override enabled for conversation {conversation_id} - skipping reviewer LLM")
        return False  # Skip review since override is enabled
    
    # Create a reviewer LLM instance with account_id if provided
    logger.info("Creating reviewer LLM instance")
    reviewer = LLMResponder("reviewer_llm", account_id, session_id)
    messages = reviewer.format_conversation(email_chain)
    
    try:
        logger.info("Invoking reviewer LLM to check if conversation needs review...")
        response = reviewer.send(messages, conversation_id)
        decision = response.strip().upper()
        logger.info(f"Reviewer LLM decision: {decision}")
        
        if decision == "FLAG":
            logger.info(f"Thread flagged for review: {conversation_id}")
            if not update_thread_flag_for_review(conversation_id, 'true'):
                logger.error(f"Failed to update flag_for_review for conversation {conversation_id}")
            return True
        elif decision == "CONTINUE":
            logger.info(f"Reviewer LLM decided to continue: {conversation_id}")
            return False
        else:
            logger.warning(f"Reviewer LLM returned unknown decision '{decision}', defaulting to FLAG")
            if not update_thread_flag_for_review(conversation_id, 'true'):
                logger.error(f"Failed to update flag_for_review for conversation {conversation_id}")
            return True
    except Exception as e:
        logger.error(f"Error in reviewer LLM: {str(e)}", exc_info=True)  # Added stack trace
        logger.error(f"Defaulting to FLAG for conversation {conversation_id}")
        if not update_thread_flag_for_review(conversation_id, 'true'):
            logger.error(f"Failed to update flag_for_review for conversation {conversation_id}")
        return True

def select_scenario_with_llm(email_chain: List[Dict[str, Any]], conversation_id: str, account_id, session_id) -> str:
    """
    Uses the selector_llm prompt to classify the email chain and return a scenario keyword.
    """
    logger.info(f"Starting scenario selection for conversation {conversation_id}")
    logger.info(f"Account ID: {account_id}")
    logger.info(f"Email chain length: {len(email_chain)} messages")
    
    # Create a special LLMResponder instance with account_id if provided
    logger.info("Creating selector LLM instance")
    selector = LLMResponder("selector_llm", account_id, session_id)
    messages = selector.format_conversation(email_chain)
    
    try:
        logger.info("Invoking selector LLM to determine scenario...")
        response = selector.send(messages, conversation_id)
        raw_scenario = response.strip()
        logger.info(f"Selector LLM raw response: '{raw_scenario}'")
        
        # Handle scenarios - convert to lowercase for consistency
        scenario = raw_scenario.lower()
        logger.info(f"Normalized scenario: '{scenario}'")
        
        # Special handling for 'intro' to map to 'intro_email'
        if scenario == 'intro':
            logger.info("Mapping 'intro' to 'intro_email'")
            scenario = 'intro_email'
        
        # Validate the scenario is one of the expected email generation scenarios
        valid_scenarios = ["summarizer", "intro_email", "continuation_email", "closing_referral"]
        if scenario in valid_scenarios:
            logger.info(f"Selector LLM chose valid scenario: '{scenario}'")
            return scenario
        else:
            logger.warning(f"Selector LLM returned invalid scenario '{scenario}', defaulting to 'continuation_email'")
            return "continuation_email"
    except Exception as e:
        logger.error(f"Error in selector LLM: {str(e)}", exc_info=True)  # Added stack trace
        logger.error(f"Defaulting to 'continuation_email' for conversation {conversation_id}")
        return "continuation_email"

def generate_email_response(emails, uid, conversation_id, scenario, invocation_id, session_id):
    """
    Generates a follow-up email response based on the provided email chain and scenario.
    If scenario is None, uses the reviewer LLM first, then the selector LLM to determine the scenario.
    
    Args:
        emails: List of email messages in the conversation
        uid: User/account ID
        conversation_id: Optional conversation ID
        scenario: Optional scenario override
        invocation_id: Optional Lambda invocation ID for grouping LLM calls
    """
    try:
        logger.info(f"Starting email generation for conversation_id: {conversation_id}, uid: {uid}")
        logger.info(f"Initial scenario provided: {scenario}")
        logger.info(f"Email chain length: {len(emails)} messages")
        if invocation_id:
            logger.info(f"Invocation ID: {invocation_id}")
        
        # 1) First check with reviewer LLM if conversation needs review (only if no scenario is forced)
        if conversation_id and scenario is None:
            logger.info("No scenario provided - checking with reviewer LLM first...")
            if check_with_reviewer_llm(emails, conversation_id, uid, session_id):
                # If flagged for review, return None to prevent email sending
                logger.info(f"Conversation {conversation_id} flagged for review - no email will be sent")
                return None
        
        # 2) Determine scenario (intro vs continuation/etc.)
        if not emails:
            scenario = "intro_email"
            logger.info("No emails provided, forcing 'intro_email' scenario")
        elif scenario is None:
            # Check if most recent email is outbound - if so, use follow_up scenario
            if emails and emails[-1].get('type') == 'outbound-email':
                scenario = "follow_up"
                logger.info("Most recent email is outbound - using 'follow_up' scenario")
            else:
                logger.info("No scenario provided - using selector LLM to determine scenario...")
                scenario = select_scenario_with_llm(emails, conversation_id, uid, session_id)
                logger.info(f"Selector LLM determined scenario: '{scenario}'")
        else:
            logger.info(f"Using provided scenario: '{scenario}'")
  
        # 3) Generate response using the determined scenario
        logger.info(f"Creating LLMResponder for scenario: '{scenario}'")
        logger.info(f"====== EMAIL GENERATION WORKFLOW STARTING ======")
        logger.info(f"Final workflow parameters:")
        logger.info(f"  - Conversation ID: {conversation_id}")
        logger.info(f"  - Account ID (uid): {uid}")
        logger.info(f"  - Scenario: {scenario}")
        logger.info(f"  - Email chain length: {len(emails)}")
        
        try:
            responder = LLMResponder(scenario, uid, session_id)  # Pass uid to get user preferences
            logger.info(f"LLMResponder created successfully for scenario '{scenario}'")
            logger.info(f"Responder has middleman: {responder.has_middleman}")
            
            logger.info(f"Starting response generation using '{scenario}' scenario...")
            response = responder.generate_response(emails, conversation_id)
            
            # Validate response
            if not response or not response.strip():
                logger.error(f"Generated response is empty or whitespace-only for scenario '{scenario}'")
                raise ValueError(f"Empty response generated for scenario '{scenario}'")
            
            logger.info(f"Successfully generated response for scenario '{scenario}':")
            logger.info(f"  - Response length: {len(response)} characters")
            logger.info(f"  - Response preview: {response[:200]}...")
            logger.info(f"====== EMAIL GENERATION WORKFLOW COMPLETED SUCCESSFULLY ======")
            
            return response
            
        except Exception as e:
            logger.error(f"Error in email generation workflow: {str(e)}", exc_info=True)
            logger.error(f"====== EMAIL GENERATION WORKFLOW FAILED ======")
            raise
    except Exception as e:
        logger.error(f"Error generating email response: {str(e)}", exc_info=True)  # Added stack trace
        raise
