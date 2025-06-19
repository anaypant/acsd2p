import json

ALLOWED_ORIGINS = [
    "https://acs-next-js.vercel.app",
    "http://localhost:3000",
    "localhost:3000"
]

def lambda_handler(event, context):
    origin = event.get("headers", {}).get("origin", "")
    allowed_origin = origin if origin in ALLOWED_ORIGINS else "null"

    if allowed_origin == "null":
        print(f"Blocked origin: {origin}")

    return {
        "Access-Control-Allow-Origin": allowed_origin,
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true"
    }
