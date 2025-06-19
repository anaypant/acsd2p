import json
import requests

def get_msg_via_requests(starting_msg):
    tai_key = "2e1a1e910693ae18c09ad0585a7645e0f4595e90ec35bb366b6f5520221b6ca7"
    url = "https://api.together.xyz/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {tai_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "messages": [
            {
                "role": "user",
                "content": starting_msg
            }
        ],
        "max_tokens": 512,
        "temperature": 0.7,
        "top_p": 0.7,
        "top_k": 50,
        "repetition_penalty": 1,
        "stop": ["<|im_end|>", "<|endoftext|>"],
        "stream": False
    }

    response = requests.post(url, headers=headers, json=payload)
    response_data = response.json()

    # Ensure proper error handling in case the API call fails
    if response.status_code != 200 or "choices" not in response_data:
        raise Exception("Failed to fetch response from Together AI API", response_data)

    return response_data["choices"][0]["message"]["content"]

def extract_subject_and_body(message):
    """
    Extracts a well-formatted subject and body from the AI-generated message.
    """
    # Use a structured prompt format to guide the AI response
    subject = ""
    body = ""

    for line in message.splitlines():
        if line.lower().startswith("subject:"):
            subject = line.split("Subject:", 1)[1].strip()
        elif line.strip():
            body += line + "\n"

    subject = subject if subject else "No Subject Generated"
    body = body.strip() if body else "No Body Generated"

    return subject, body

def lambda_handler(event, context):
    try:
        # Extract sender, recipient, and additional details from the event
        sender = event.get("sender", "default-sender@example.com")
        recipient = event.get("recipient", "default-recipient@example.com")
        base_message = event.get("base_message", "Generate a professional email.")

        # Configure starting message
        starting_msg = (
            f"You are an AI email generator. Based on the following input, generate an email with a structured subject and body:\n"
            f"Input: {base_message}\n"
            f"Output: The subject should be concise and engaging. The body should be professional and well-structured."
        )

        # Get the generated message using Together AI
        generated_message = get_msg_via_requests(starting_msg)

        # Extract subject and body
        subject, body = extract_subject_and_body(generated_message)

        # Format the email response
        email_response = {
            "subject": subject,
            "body": body,
            "sender": sender,
            "recipient": recipient
        }

        return {
            'statusCode': 200,
            'body': json.dumps(email_response)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                "error": str(e)
            })
        }
