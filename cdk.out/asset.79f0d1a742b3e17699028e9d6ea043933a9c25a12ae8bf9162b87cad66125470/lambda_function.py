import json
import boto3
import uuid
import os
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
organizations_table = dynamodb.Table('Organizations')
members_table = dynamodb.Table('OrganizationMembers')
invites_table = dynamodb.Table('OrganizationInvites')

# Environment & AWS clients
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-2")
CORS_FUNCTION = os.environ.get("CORS_FUNCTION_NAME", "Allow-Cors")
lambda_client = boto3.client("lambda", region_name=AWS_REGION)

# DynamoDB table for session storage
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "Sessions")
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)

def get_cors_headers(event):
    default = {
        "Access-Control-Allow-Origin":      "localhost:3000",
        "Access-Control-Allow-Methods":     "OPTIONS, POST",
        "Access-Control-Allow-Headers":     "Content-Type",
        "Access-Control-Allow-Credentials": "true",
    }
    try:
        resp = lambda_client.invoke(
            FunctionName   = CORS_FUNCTION,
            InvocationType = "RequestResponse",
            Payload        = json.dumps(event).encode()
        )
        data = json.loads(resp["Payload"].read().decode())
        return data.get("headers", default)
    except Exception:
        return default

cors_headers = {}

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def lambda_handler(event, context):
    cors_headers = get_cors_headers(event)

    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}
    """
    Main handler for organization CRUD operations
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        body = json.loads(event.get('body', '{}')) 

        query_params = event.get('queryStringParameters') or {}
        org_id = query_params.get('organization_id')

        # Route to appropriate handler
        print(path)
        print(http_method)
        if http_method == 'POST':
            return create_organization(body)
        elif http_method == 'GET' and org_id:
            return get_organization(org_id)
        elif http_method == 'PUT' and org_id:
            return update_organization(org_id, body)
        elif http_method == 'DELETE' and org_id:
            return delete_organization(org_id)
        # elif http_method == 'GET' and path.endswith('/user/organizations'):
        #     user_id = body.get('user_id')
        #     return get_user_organizations(user_id)
        else:
            return {
                'statusCode': 404,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Route not found'})
            }

    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def create_organization(data):
    """Create a new organization"""
    try:
        organization_id = str(uuid.uuid4())
        current_time = datetime.utcnow().isoformat() + 'Z'

        # Create organization
        organization = {
            'organization_id': organization_id,
            'name': data['name'],
            'description': data.get('description', ''),
            'created_at': current_time,
            'created_by': data['created_by'],
            'subscription_tier': data.get('subscription_tier', 'basic'),
            'settings': {
                'email_domains': data.get('email_domains', []),
                'max_members': data.get('max_members', 10),
                'features_enabled': data.get('features_enabled', ['basic_features'])
            },
            'status': 'active'
        }

        # Add organization to table
        organizations_table.put_item(Item=organization)

        # Add creator as owner
        member = {
            'organization_id': organization_id,
            'user_id': data['created_by'],
            'role': 'owner',
            'joined_at': current_time,
            'status': 'active',
            'email': data.get('creator_email', ''),
            'name': data.get('creator_name', '')
        }

        members_table.put_item(Item=member)

        return {
            'statusCode': 201,
            'headers': cors_headers,
            'body': json.dumps({
                'organization': organization,
                'message': 'Organization created successfully'
            })
        }

    except Exception as e:
        print(f"Error in create_organization: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def get_organization(organization_id):
    """Get organization details"""
    try:
        response = organizations_table.get_item(
            Key={'organization_id': organization_id}
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Organization not found'})
            }

        # Get organization members
        members_response = members_table.query(
            KeyConditionExpression='organization_id = :org_id',
            ExpressionAttributeValues={':org_id': organization_id}
        )

        organization = response['Item']
        organization['members'] = members_response.get('Items', [])

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'organization': organization}, default=decimal_default)
        }

    except Exception as e:
        print(f"Error in get_organization: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def update_organization(organization_id, data):
    """Update organization details"""
    try:
        # Build update expression dynamically
        update_expression = "SET "
        expression_attribute_values = {}
        expression_attribute_names = {}

        updates = []

        if 'name' in data:
            updates.append("#name = :name")
            expression_attribute_names['#name'] = 'name'
            expression_attribute_values[':name'] = data['name']

        if 'description' in data:
            updates.append("#description = :description")
            expression_attribute_names['#description'] = 'description'
            expression_attribute_values[':description'] = data['description']

        if 'settings' in data:
            updates.append("#settings = :settings")
            expression_attribute_names['#settings'] = 'settings'
            expression_attribute_values[':settings'] = data['settings']

        if 'subscription_tier' in data:
            updates.append("#subscription_tier = :subscription_tier")
            expression_attribute_names['#subscription_tier'] = 'subscription_tier'
            expression_attribute_values[':subscription_tier'] = data['subscription_tier']

        if not updates:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'No valid fields to update'})
            }

        update_expression += ", ".join(updates)

        response = organizations_table.update_item(
            Key={'organization_id': organization_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'organization': response['Attributes'],
                'message': 'Organization updated successfully'
            })
        }

    except Exception as e:
        print(f"Error in update_organization: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def delete_organization(organization_id):
    """Delete organization and all related data"""
    try:
        # First, get all members to delete them
        members_response = members_table.query(
            KeyConditionExpression='organization_id = :org_id',
            ExpressionAttributeValues={':org_id': organization_id}
        )

        # Delete all members
        for member in members_response.get('Items', []):
            members_table.delete_item(
                Key={
                    'organization_id': organization_id,
                    'user_id': member['user_id']
                }
            )

        # Get all invites to delete them
        invites_response = invites_table.query(
            IndexName='organization_id-index',
            KeyConditionExpression='organization_id = :org_id',
            ExpressionAttributeValues={':org_id': organization_id}
        )

        # Delete all invites
        for invite in invites_response.get('Items', []):
            invites_table.delete_item(
                Key={'invite_id': invite['invite_id']}
            )

        # Finally, delete the organization
        organizations_table.delete_item(
            Key={'organization_id': organization_id}
        )

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'message': 'Organization deleted successfully'})
        }

    except Exception as e:
        print(f"Error in delete_organization: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def get_user_organizations(user_id):
    """Get all organizations for a user"""
    try:
        # Get user's memberships
        members_response = members_table.query(
            IndexName='user_id-index',
            KeyConditionExpression='user_id = :user_id',
            ExpressionAttributeValues={':user_id': user_id}
        )

        organizations = []
        for member in members_response.get('Items', []):
            # Get organization details
            org_response = organizations_table.get_item(
                Key={'organization_id': member['organization_id']}
            )

            if 'Item' in org_response:
                org = org_response['Item']
                org['user_role'] = member['role']
                org['user_status'] = member['status']
                organizations.append(org)

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'organizations': organizations})
        }

    except Exception as e:
        print(f"Error in get_user_organizations: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }
