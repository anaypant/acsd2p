import json

def get_allowed_origin(event):
    allowed_origins = [
        "http://localhost:3000",
        "https://automatedconsultancy.com"
    ]

    origin = event.get('headers', {}).get('origin', '*')

    if origin in allowed_origins:
        allow_origin = origin
    else:
        allow_origin = 'null'  # CORS spec requires 'null' for disallowed origins

    return origin

def lambda_handler(event, context):
    # TODO implement
    print(get_allowed_origin(event))
    print(event)
    print(context)
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": get_allowed_origin(event),  # Allow all origins (use specific domains in production)
            "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Credentials": "true",  # Allow cookies if needed
        },
        "body": ""
    }