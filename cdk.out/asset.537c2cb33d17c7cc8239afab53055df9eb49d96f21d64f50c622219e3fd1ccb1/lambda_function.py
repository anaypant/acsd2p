import json, boto3, random, os
from datetime import datetime, timedelta

scheduler_client = boto3.client('scheduler')
PROCESSING_LAMBDA_ARN = os.environ.get('PROCESSING_LAMBDA_ARN', 'Send-Email')
SCHEDULER_ROLE_ARN = os.environ.get('SCHEDULER_ROLE_ARN', 'arn:aws:iam::872515253712:role/SQS-SES-Handler')

def simple_string_hash(input_string, length=32):
    # Generate a numeric hash based on character codes
    hashed_value = sum(ord(char) for char in input_string) % (10**length)
    return str(hashed_value)[:length]

def generate_safe_schedule_name(original_name):
    # Limit the prefix and append a unique hash of the full original name
    hashed_name = simple_string_hash(original_name, 32)  # 32 chars from hash
    truncated_name = original_name[:20]  # Take first 20 characters of the original name
    return f"{truncated_name}-{hashed_name}"

def lambda_handler(event, context):
    # TODO implement
    message_id = "<CALP_W_LQJa2JqPiZYb2B2kvB9WbykPHbxOPuiyvfXps1mq=xCw@mail.gmail.com>"
    cleaned_message_id = ''.join(char for char in message_id if char.isalnum())
    schedule_name = generate_safe_schedule_name(f"process-email-{cleaned_message_id}")

    random_minutes = random.randint(7, 25)
    scheduled_time = datetime.utcnow() + timedelta(minutes=random_minutes)
    schedule_time = scheduled_time.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    print(schedule_name)
    print(schedule_time)

    response_scheduler = scheduler_client.create_schedule(
        Name=schedule_name,
        ScheduleExpression=f"at(2025-01-27T01:00:00)",
        ScheduleExpressionTimezone="UTC",
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target={
            'Arn': PROCESSING_LAMBDA_ARN,
            'RoleArn': SCHEDULER_ROLE_ARN,
            'Input': json.dumps({"hello":"world"}),
        }, 
        State='ENABLED',  # Enable the schedule
        Description='Schedule for email processing'
    )
    print("Schedule created successfully:", response_scheduler)
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }
