import json
import boto3
from boto3.dynamodb.conditions import Key
from common import get_cors_headers

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('Conversations')

def handle_get_thread_by_id(user_id, thread_id, event):
    try:
        response = table.query(
            KeyConditionExpression=Key('conversation_id').eq(thread_id)
        )
        items = response.get('Items', [])

        if not items or any(item.get('associated_account') != user_id for item in items):
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Thread not found for thread: {thread_id}. Items: {items}'}),
                'headers': get_cors_headers(event)
            }

        thread_info = [
            {
                'conversation_id': item['conversation_id'],
                'response_id': item['response_id'],
                'timestamp': item['timestamp'],
                'from': item['sender'],
                'to': item['receiver'],
                'subject': item['subject'],
                'body': item['body'],
                'read': True
            }
            for item in items
        ]

        return {
            'statusCode': 200,
            'body': json.dumps(thread_info),
            'headers': get_cors_headers(event)
        }

    except Exception as e:
        print(f"Error retrieving thread: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal Server Error'}),
            'headers': get_cors_headers(event)
        }
