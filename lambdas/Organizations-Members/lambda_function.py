import json
import boto3
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

dynamodb = boto3.resource('dynamodb')
members_table = dynamodb.Table('OrganizationMembers')
organizations_table = dynamodb.Table('Organizations')

# DynamoDB table for session storage
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "Sessions")
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)

def get_cors_headers(event: dict) -> dict:
    """
    Invoke Allow-Cors Lambda to get CORS headers. Fallback to defaults.
    """
    default = {
        "Access-Control-Allow-Origin":      "*",
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

def lambda_handler(event: Dict[str, Any], context: Any) -> 
Dict[str, Any]:
    """
    Main handler for organization member management
    """
    cors_headers = get_cors_headers(event)

    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}
    
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        body = json.loads(event.get('body', '{}')) if
event.get('body') else {}

        # Extract organization ID from path
        org_id = None
        user_id = None
        if '/organizations/' in path:
            path_parts = path.split('/organizations/')
            if len(path_parts) > 1:
                remaining_path = path_parts[1]
                if '/members' in remaining_path:
                    org_id = remaining_path.split('/members')[0]
                    member_path =
remaining_path.split('/members')[1]
                    if member_path and
member_path.startswith('/'):
                        user_id = member_path[1:] if
member_path[1:] else None

        # Route to appropriate handler
        if http_method == 'GET' and org_id and not user_id:
            return get_organization_members(org_id)
        elif http_method == 'PUT' and org_id and user_id:
            return update_member_role(org_id, user_id, body)
        elif http_method == 'DELETE' and org_id and user_id:
            return remove_member(org_id, user_id, body)
        elif http_method == 'POST' and
path.endswith('/members/add'):
            return add_member(body)
        else:
            return {
                'statusCode': 404,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Route not found'})
            }

    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }

def cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE,
OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, 
Authorization',
    }

def get_organization_members(organization_id: str) -> Dict[str, 
Any]:
    """Get all members of an organization"""
    try:
        response = members_table.query(
            KeyConditionExpression='organization_id = :org_id',
            ExpressionAttributeValues={':org_id':
organization_id}
        )

        members = response.get('Items', [])

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({'members': members})
        }

    except Exception as e:
        print(f"Error in get_organization_members: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }

def add_member(data: Dict[str, Any]) -> Dict[str, Any]:
    """Add a new member to organization (used when accepting 
invites)"""
    try:
        current_time = datetime.utcnow().isoformat() + 'Z'

        member = {
            'organization_id': data['organization_id'],
            'user_id': data['user_id'],
            'role': data['role'],
            'joined_at': current_time,
            'invited_by': data.get('invited_by'),
            'status': 'active',
            'email': data['email'],
            'name': data.get('name', '')
        }

        # Check if member already exists
        existing_member = members_table.get_item(
            Key={
                'organization_id': data['organization_id'],
                'user_id': data['user_id']
            }
        )

        if 'Item' in existing_member:
            return {
                'statusCode': 409,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'User is already a 
member of this organization'})
            }

        members_table.put_item(Item=member)

        return {
            'statusCode': 201,
            'headers': cors_headers(),
            'body': json.dumps({
                'member': member,
                'message': 'Member added successfully'
            })
        }

    except Exception as e:
        print(f"Error in add_member: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }

def update_member_role(organization_id: str, user_id: str, data:
Dict[str, Any]) -> Dict[str, Any]:
    """Update a member's role"""
    try:
        new_role = data.get('role')
        requester_id = data.get('requester_id')

        if not new_role or new_role not in ['owner', 'admin',
'member']:
            return {
                'statusCode': 400,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Invalid role 
specified'})
            }

        # Check if requester has permission to change roles
        requester_member = members_table.get_item(
            Key={'organization_id': organization_id, 'user_id':
requester_id}
        )

        if 'Item' not in requester_member:
            return {
                'statusCode': 403,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Insufficient 
permissions'})
            }

        requester_role = requester_member['Item']['role']

        # Only owners can change roles, and owners can't change 
other owners
        if requester_role != 'owner':
            return {
                'statusCode': 403,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Only owners can 
change member roles'})
            }

        # Get target member
        target_member = members_table.get_item(
            Key={'organization_id': organization_id, 'user_id':
user_id}
        )

        if 'Item' not in target_member:
            return {
                'statusCode': 404,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Member not 
found'})
            }

        # Can't change role of another owner unless there will 
be at least one owner remaining
        if target_member['Item']['role'] == 'owner' and new_role
!= 'owner':
            # Count current owners
            owners_response = members_table.query(
                KeyConditionExpression='organization_id = 
:org_id',
                FilterExpression='#role = :role',
                ExpressionAttributeNames={'#role': 'role'},
                ExpressionAttributeValues={
                    ':org_id': organization_id,
                    ':role': 'owner'
                }
            )

            if len(owners_response.get('Items', [])) <= 1:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'error': 'Organization 
must have at least one owner'})
                }

        # Update the role
        response = members_table.update_item(
            Key={'organization_id': organization_id, 'user_id':
user_id},
            UpdateExpression='SET #role = :role',
            ExpressionAttributeNames={'#role': 'role'},
            ExpressionAttributeValues={':role': new_role},
            ReturnValues='ALL_NEW'
        )

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'member': response['Attributes'],
                'message': 'Member role updated successfully'
            })
        }

    except Exception as e:
        print(f"Error in update_member_role: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }

def remove_member(organization_id: str, user_id: str, data: 
Dict[str, Any]) -> Dict[str, Any]:
    """Remove a member from organization"""
    try:
        requester_id = data.get('requester_id')

        # Check if requester has permission to remove members
        requester_member = members_table.get_item(
            Key={'organization_id': organization_id, 'user_id':
requester_id}
        )

        if 'Item' not in requester_member:
            return {
                'statusCode': 403,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Insufficient 
permissions'})
            }

        requester_role = requester_member['Item']['role']

        # Get target member
        target_member = members_table.get_item(
            Key={'organization_id': organization_id, 'user_id':
user_id}
        )

        if 'Item' not in target_member:
            return {
                'statusCode': 404,
                'headers': cors_headers(),
                'body': json.dumps({'error': 'Member not 
found'})
            }

        target_role = target_member['Item']['role']

        # Permission checks:
        # - Members can leave themselves
        # - Admins can remove members (but not other admins or 
owners)
        # - Owners can remove anyone (but not if it leaves no 
owners)
        if requester_id != user_id:  # Not removing self
            if requester_role == 'member':
                return {
                    'statusCode': 403,
                    'headers': cors_headers(),
                    'body': json.dumps({'error': 'Members can 
only remove themselves'})
                }
            elif requester_role == 'admin' and target_role in
['admin', 'owner']:
                return {
                    'statusCode': 403,
                    'headers': cors_headers(),
                    'body': json.dumps({'error': 'Admins cannot 
remove other admins or owners'})
                }

        # Can't remove owner if it's the last owner
        if target_role == 'owner':
            owners_response = members_table.query(
                KeyConditionExpression='organization_id = 
:org_id',
                FilterExpression='#role = :role',
                ExpressionAttributeNames={'#role': 'role'},
                ExpressionAttributeValues={
                    ':org_id': organization_id,
                    ':role': 'owner'
                }
            )

            if len(owners_response.get('Items', [])) <= 1:
                return {
                    'statusCode': 400,
                    'headers': cors_headers(),
                    'body': json.dumps({'error': 'Cannot remove 
the last owner from organization'})
                }

        # Remove the member
        members_table.delete_item(
            Key={'organization_id': organization_id, 'user_id':
user_id}
        )

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({'message': 'Member removed 
successfully'})
        }

    except Exception as e:
        print(f"Error in remove_member: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }
