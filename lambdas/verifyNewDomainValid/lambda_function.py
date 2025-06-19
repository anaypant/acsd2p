import json
import boto3
import urllib.request

# Initialize AWS Clients
dynamodb = boto3.resource("dynamodb", region_name="us-east-2")
table = dynamodb.Table("Users")  # Ensure this is your correct table name
route53 = boto3.client("route53")

# DynamoDB table for session storage
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "Sessions")
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)

def get_cors_headers(event: dict) -> dict:
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

# Allowed origins for CORS
ALLOWED_ORIGINS = [
    "https://acs-next-js.vercel.app",
    "http://localhost:3000",
    "localhost:3000"
]

# Our AWS-owned domain (Route 53 verification required)
OWNED_DOMAIN = "homes.automatedconsultancy.com"
ROUTE53_ZONE_ID = "Z07316711WN9QRDUB0OJ2"  # 🔹 Update this with your actual AWS Route 53 Hosted Zone ID

def get_cors_headers(event):
    """Determine and return the appropriate CORS headers."""
    request_origin = event.get("headers", {}).get("origin", "")
    response_origin = request_origin if request_origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

    return {
        "Access-Control-Allow-Origin": response_origin,
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
    }

# Public email providers (require OAuth instead of DNS checks)
PUBLIC_EMAIL_PROVIDERS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]

def lambda_handler(event, context):
    """Handles email verification by checking DNS records and updating the database."""
    cors_headers = get_cors_headers(event)

    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}
    try:
        # Log event for debugging
        print("Received Event:", json.dumps(event))

        # Parse request body
        body = json.loads(event["body"]) if "body" in event else {}
        user_id = body.get("uid")
        new_email = body.get("newEmail")

        if not user_id or not new_email:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing userId or newResponseEmail"}),
                "headers": get_cors_headers(event)
            }

        # Extract domain from email
        domain = new_email.split("@")[-1]

        # ✅ **Check if the domain is our own AWS domain**
        if domain == OWNED_DOMAIN:
            print(f"Checking Route 53 for {domain}...")
            txt_records = get_txt_records_route53(domain)
        else:
            print(f"Checking Google DNS for {domain}...")
            txt_records = get_txt_records_google(domain)

        # ✅ Convert all records to lowercase and strip spaces
        txt_records_cleaned = [record.lower().strip() for record in txt_records]

        # ✅ Check if SPF and DKIM exist
        has_spf = any("v=spf1" in record for record in txt_records_cleaned)
        has_dkim = any("dkim" in record for record in txt_records_cleaned)

        # ✅ Debugging output
        print(f"Checking SPF/DKIM: SPF Found? {has_spf}, DKIM Found? {has_dkim}")

        if not has_spf or (domain != OWNED_DOMAIN and domain != "automatedconsultancy.com" and not has_dkim):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "DNS verification failed. SPF/DKIM not found."}),
                "headers": get_cors_headers(event)
            }


        # ✅ **Update Email in DB if DNS Check Passed**
        return update_email_in_db(user_id, new_email, event)

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error", "details": str(e)}),
            "headers": get_cors_headers(event)
        }

def get_txt_records_route53(domain):
    """Fetch TXT records from AWS Route 53 for a specific domain, checking parent domain if needed."""
    try:
        response = route53.list_resource_record_sets(HostedZoneId=ROUTE53_ZONE_ID)
        records = response.get("ResourceRecordSets", [])

        # 🔹 Log all records for debugging
        print("Full Route 53 Response:", response)

        # 🔹 Extract TXT records for the exact domain
        txt_records = extract_txt_records(domain, records)

        # 🔹 If no TXT records found, check the root domain (e.g., automatedconsultancy.com)
        if not txt_records:
            parent_domain = ".".join(domain.split(".")[-2:])  # Get root domain
            txt_records = extract_txt_records(parent_domain, records)
            print(f"Checking parent domain {parent_domain} for TXT records...")

        print(f"Final TXT Records for {domain}: {txt_records}")
        return txt_records if txt_records else []

    except Exception as e:
        print(f"Error fetching TXT records from Route 53: {str(e)}")
        return []

def extract_txt_records(domain, records):
    """Helper function to extract TXT records for a given domain."""
    txt_records = []
    for record in records:
        if record["Type"] == "TXT" and record["Name"].strip(".") == domain.strip("."):
            txt_records.extend([entry["Value"].strip('"') for entry in record["ResourceRecords"]])
    return txt_records

def get_txt_records_google(domain):
    """Fetch TXT records using Google's Public DNS-over-HTTPS API (No requests needed)"""
    url = f"https://dns.google/resolve?name={domain}&type=TXT"
    try:
        # Open URL using urllib (works in AWS Lambda)
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode("utf-8"))

        # Extract TXT records
        txt_records = [entry["data"] for entry in data.get("Answer", []) if "data" in entry]
        print(f"Google DNS TXT Records for {domain}: {txt_records}")
        return txt_records if txt_records else []
    except Exception as e:
        print(f"Error fetching TXT records from Google DNS: {str(e)}")
        return []

def update_email_in_db(user_id, new_email, event):
    """Update user's response email in DynamoDB"""
    try:
        # Check if user exists in DynamoDB
        user = table.get_item(Key={"id": user_id}).get("Item")

        if not user:
            return {
                "statusCode": 403,
                "body": json.dumps({"error": "User not found or unauthorized"}),
                "headers": get_cors_headers(event)
            }

        # Update user's response email in DynamoDB
        table.update_item(
            Key={"id": user_id},
            UpdateExpression="SET responseEmail = :email",
            ExpressionAttributeValues={":email": new_email}
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "verified": True,
                "message": "Email successfully verified and updated.",
                "email": new_email
            }),
            "headers": get_cors_headers(event)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Database update failed", "details": str(e)}),
            "headers": get_cors_headers(event)
        }
