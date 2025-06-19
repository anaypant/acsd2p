import crypto from "crypto";
import { DynamoDBClient, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  ListUsersCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { invokeLambda, LambdaError } from './utils.mjs';

const REGION = process.env.AWS_REGION || "us-east-2";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RATE_LIMIT_AWS = process.env.RATE_LIMIT_AWS || "1000";
const RATE_LIMIT_AI = process.env.RATE_LIMIT_AI || "1000";

const dynamoDb = new DynamoDBClient({ region: REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

function getSecretHash(username) {
  return crypto.createHmac("SHA256", CLIENT_SECRET).update(username + CLIENT_ID).digest("base64");
}

function generateRandomPassword() {
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).toUpperCase().slice(-8) + "!";
}

async function addSession(uid) {
  try {
    const response = await invokeLambda('CreateNewSession', { body: JSON.stringify({ uid }) });
    const body = JSON.parse(response.body);
    return body.sessionId;
  } catch (error) {
    throw new LambdaError("Failed to create session: " + error.message, 500);
  }
}

async function verifyCaptcha(token) {
  if (!token) throw new LambdaError("Captcha token is required", 400);
  const params = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token });
  const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body: params });
  if (!resp.ok) throw new LambdaError(`Captcha request failed (${resp.status})`, 500);
  const body = await resp.json();
  if (!body.success) throw new LambdaError(`Captcha verification failed: ${body["error-codes"]?.join(', ')}`, 401);
  if (body.score !== undefined && body.score < 0.5) throw new LambdaError(`Captcha score too low (${body.score})`, 429);
}

async function generateUniqueEmail(baseEmail) {
    const listResp = await dynamoDb.send(new ScanCommand({
        TableName: "Users",
        FilterExpression: "acsMail = :email",
        ExpressionAttributeValues: { ":email": { S: baseEmail } }
    }));
    if (!listResp.Items?.length) return baseEmail;

    const [baseName, domain] = baseEmail.split('@');
    let attempts = 0;
    while (attempts < 10) {
        const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const newEmail = `${baseName}${randomDigits}@${domain}`;
        const listResp = await dynamoDb.send(new ScanCommand({
            TableName: "Users",
            FilterExpression: "acsMail = :email",
            ExpressionAttributeValues: { ":email": { S: newEmail } }
        }));
        if (!listResp.Items?.length) return newEmail;
        attempts++;
    }
    throw new LambdaError("Failed to generate unique email after 10 attempts", 500);
}

export async function processNewUser({ id, email, password, name, captchaToken, provider }) {
    // Debug logging to understand the data being passed
    console.log("DEBUG: processNewUser called with:", { id, email, password, name, captchaToken, provider });
    
    if (provider === "form") {
        await verifyCaptcha(captchaToken);
    }

    const listResp = await cognitoClient.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, Filter: `email = "${email}"`, Limit: 1 }));
    if (listResp.Users?.length) {
        throw new LambdaError("User already exists", 409);
    }
    
    const pwd = provider === "form" ? password : generateRandomPassword();
    const userAttrs = [
      { Name: "email", Value: email },
      { Name: "name", Value: name },
      { Name: "custom:provider", Value: provider },
      { Name: "email_verified", Value: "true" }
    ];

    await cognitoClient.send(new AdminCreateUserCommand({ UserPoolId: USER_POOL_ID, Username: id, TemporaryPassword: pwd, MessageAction: "SUPPRESS", UserAttributes: userAttrs }));
    await cognitoClient.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: id, Password: pwd, Permanent: true }));

    const responseEmail = await generateUniqueEmail(`${name.replace(/\s+/g, "").toLowerCase()}@homes.automatedconsultancy.com`);
    const defaultSignature = `Best Regards,\n${name}\n${email}`;

    console.log("DEBUG: About to insert into Users table with data:", {
        id, email, responseEmail, provider, defaultSignature
    });

    await dynamoDb.send(new PutItemCommand({
      TableName: "Users",
      Item: {
        id: { S: id }, email: { S: email }, responseEmail: { S: responseEmail }, acsMail: { S: responseEmail },
        provider: { S: provider }, createdAt: { S: new Date().toISOString() }, role: { S: "user" },
        email_signature: { S: defaultSignature }, rl_aws: { N: RATE_LIMIT_AWS }, rl_ai: { N: RATE_LIMIT_AI }, bio: { S: "" },
        company: { S: "" }, country: { S: "" }, data_sharing: { B: false }, email_notifications: { B: true }, job_title: { S: "" }, language: { S: "en" },
        lcp_automatic_enabled: { S: "false" }, lcp_sample_prompt: { S: "" }, lcp_style: {S: "concise"}, lcp_tone: {S: "professional"},
        location: { S: "" }, marketing_email: { S: "true" }, new_email: { S: "false" },phone: { S: "" }
      },
    }));

    console.log("DEBUG: Successfully inserted user into Users table");

    let cookies;
    const sessionId = await addSession(id);

    if (provider === "form") {
        const auth = await cognitoClient.send(new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: CLIENT_ID,
            AuthParameters: { USERNAME: id, PASSWORD: pwd, SECRET_HASH: getSecretHash(id) },
        }));
        const tokens = auth.AuthenticationResult;
        if (!tokens) throw new LambdaError("Auth flow failed", 500);
        cookies = [
            `session_id=${sessionId}; HttpOnly; Secure; SameSite=None; Max-Age=2592000`,
            `id_token=${tokens.IdToken}; HttpOnly; Secure; SameSite=None; Max-Age=3600`,
            `access_token=${tokens.AccessToken}; HttpOnly; Secure; SameSite=None; Max-Age=3600`,
            `refresh_token=${tokens.RefreshToken}; HttpOnly; Secure; SameSite=None; Max-Age=1209600`,
        ];
    } else {
        cookies = [`session_id=${sessionId}; HttpOnly; Secure; SameSite=None; Max-Age=2592000`];
    }
    
    return {
        message: provider === "form" ? "User created & signed in" : "Google user created & signed in",
        authType: "new",
        cookies
    };
}
