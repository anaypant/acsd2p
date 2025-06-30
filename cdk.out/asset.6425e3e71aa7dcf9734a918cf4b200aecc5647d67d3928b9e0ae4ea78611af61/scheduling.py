# scheduling.py
import os
import json
import random
from datetime import datetime, timedelta
import boto3
from config import PROCESSING_LAMBDA_ARN, AWS_REGION

scheduler = boto3.client('scheduler', region_name=AWS_REGION)


def simple_string_hash(input_str: str, length: int = 32) -> str:
    return str(abs(hash(input_str)))[:length]


def generate_safe_schedule_name(base: str) -> str:
    hash_val = simple_string_hash(base)
    return f"{base[:20]}-{hash_val}"


def schedule_email_processing(name: str, at_time: datetime, payload: dict, in_reply_to: str = None):
    expr = at_time.strftime('%Y-%m-%dT%H:%M:%S')
    scheduler.create_schedule(
        Name=name,
        ScheduleExpression=f"at({expr})",
        ScheduleExpressionTimezone='UTC',
        FlexibleTimeWindow={'Mode': 'OFF'},
        Target={
            'Arn': PROCESSING_LAMBDA_ARN,
            'RoleArn': os.environ['SCHEDULER_ROLE_ARN'],
            'Input': json.dumps(payload),
            'RetryPolicy': {'MaximumRetryAttempts': 0}
        },
        State='ENABLED'
    )
