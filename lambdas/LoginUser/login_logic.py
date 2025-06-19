import os
import json
import hmac
import hashlib
import base64
import uuid
import boto3
from utils import invoke_lambda, LambdaError

# Environment & Cognito client
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
CLIENT_SECRET = os.environ.get("COGNITO_CLIENT_SECRET")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")
SIGNUP_FUNCTION = "ProcessNewUserSupabase"
CREATE_SESSION_FUNCTION = os.environ.get("CREATE_SESSION_FUNCTION", "CreateNewSession")

cognito = boto3.client("cognito-idp", region_name=AWS_REGION)

def get_secret_hash(username):
    msg = username + CLIENT_ID
    dig = hmac.new(CLIENT_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    return base64.b64encode(dig).decode()

def create_session(user_id):
    try:
        payload = {"body": json.dumps({"uid": user_id})}
        response = invoke_lambda(CREATE_SESSION_FUNCTION, payload)
        response_body = json.loads(response.get("body", "{}"))
        session_id = response_body.get("sessionId")
        if not session_id:
            raise LambdaError(500, "No session ID returned from CreateNewSession")
        cookie = f"session_id={session_id}; HttpOnly; Secure; SameSite=None; Max-Age=2592000"
        return session_id, cookie
    except Exception as e:
        raise LambdaError(500, f"Failed to create session: {e}")

def form_login_flow(email, password):
    if not password:
        raise LambdaError(400, "Password required for form login")
        
    try:
        list_resp = cognito.list_users(UserPoolId=USER_POOL_ID, Filter=f'email = "{email}"', Limit=1)
        if not list_resp.get("Users"):
            raise LambdaError(401, "Incorrect username or password")
        
        user_id = list_resp["Users"][0]["Username"]
        if not user_id:
            raise LambdaError(401, "Incorrect username or password (user_id not found)")

        resp = cognito.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": user_id, "PASSWORD": password, "SECRET_HASH": get_secret_hash(user_id)}
        )
        auth = resp["AuthenticationResult"]

        session_id, session_cookie = create_session(user_id)

        user = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=user_id)
        attrs = {a["Name"]: a["Value"] for a in user.get("UserAttributes", [])}
        info = {"id": user.get("Username"), "name": attrs.get("name")}

        cookies = [
            f"id_token={auth['IdToken']}; HttpOnly; Secure; SameSite=None; Max-Age=3600",
            f"access_token={auth['AccessToken']}; HttpOnly; Secure; SameSite=None; Max-Age=3600",
            f"refresh_token={auth['RefreshToken']}; HttpOnly; Secure; SameSite=None; Max-Age=1209600",
            session_cookie
        ]
        
        body = {"message": "Login successful (form)", **info, "authtype": "existing"}
        return body, cookies

    except cognito.exceptions.NotAuthorizedException:
        raise LambdaError(401, "Incorrect username or password")
    except Exception as e:
        raise LambdaError(500, f"Internal server error during form login: {e}")

def google_login_flow(email, name):
    if not name:
        raise LambdaError(400, "Name required for google signup/login")

    try:
        resp = cognito.list_users(UserPoolId=USER_POOL_ID, Filter=f'email = "{email}"', Limit=1)
        if resp.get("Users"):
            user_id = resp["Users"][0]["Username"]
            authType = "existing"
        else:
            user_id = str(uuid.uuid4())
            payload = {"body": json.dumps({"id": user_id, "email": email, "name": name, "provider": "google"})}
            print(f"DEBUG: Calling signup function with payload: {payload}")
            try:
                response = invoke_lambda(SIGNUP_FUNCTION, payload)
                print(f"DEBUG: Signup function response: {response}")
            except Exception as signup_error:
                print(f"DEBUG: Signup function failed: {signup_error}")
                raise signup_error
            authType = "new"

        session_id, cookie = create_session(user_id)
        info = {"id": user_id, "name": name}
        body = {"message": "Login successful (google)", **info, "authType": authType}
        return body, [cookie]

    except Exception as e:
        print(f"DEBUG: Google login flow failed: {e}")
        raise LambdaError(500, f"Internal server error during google login: {e}")

def handle_login(provider, email, password, name):
    if provider == "form":
        return form_login_flow(email, password)
    elif provider == "google":
        return google_login_flow(email, name)
    else:
        raise LambdaError(400, f"Provider must be one of ('form', 'google')")
