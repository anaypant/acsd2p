/**
 * @file process-new-user-supabase.mjs
 * @module ProcessNewUserSupabase
 * @description
 * AWS Lambda handler for user signup in ACS.
 * Supports two providers: "form" (email/password + reCAPTCHA) and "google" (OAuth).
 * 
 * Payload Format:
 * {
 *   id: string,           // Required: User's unique identifier
 *   email: string,        // Required: User's email address
 *   name: string,         // Required: User's full name
 *   provider: string,     // Required: "form" or "google"
 *   password?: string,    // Required for "form" provider
 *   captchaToken?: string // Required for "form" provider
 * }
 * 
 * Functionality:
 * - FORM signups:
 *   • Verify CAPTCHA
 *   • Create Cognito user (suppressed invite)
 *   • Permanently set password
 *   • Authenticate via USER_PASSWORD_AUTH
 *   • Create session via CreateNewSession Lambda
 *   • Issue Cognito tokens + session cookie
 * 
 * - GOOGLE signups:
 *   • Generate random password
 *   • Create Cognito user (suppressed invite) with email_verified=true
 *   • Permanently set password
 *   • Create session via CreateNewSession Lambda
 *   • Issue only session cookie
 * 
 * Return Codes:
 * 200: Success - User created and signed in
 * 201: Success - User created and signed in (alternative success code)
 * 400: Bad Request - Missing required fields or invalid payload
 * 401: Unauthorized - CAPTCHA verification failed
 * 409: Conflict - User already exists
 * 429: Too Many Requests - CAPTCHA score too low
 * 500: Internal Server Error - Server-side error occurred
 * 
 * Response Format:
 * Success (200/201):
 * {
 *   message: string,      // Success message
 *   authType: string,     // "new" or "existing"
 *   headers: {
 *     "Set-Cookie": string[] // Array of cookies for FORM, single cookie for GOOGLE
 *   }
 * }
 * 
 * Error (400/401/409/429/500):
 * {
 *   message: string,      // Error description
 *   errorCodes?: string[], // For CAPTCHA errors
 *   score?: number        // For CAPTCHA score errors
 * }
 * 
 * Cookies:
 * - FORM signup: session_id, id_token, access_token, refresh_token
 * - GOOGLE signup: session_id only
 * 
 * All cookies are:
 * - HttpOnly
 * - Secure
 * - SameSite=None
 * - Max-Age=2592000 (30 days) for session_id
 * - Max-Age=3600 (1 hour) for id_token and access_token
 * - Max-Age=1209600 (14 days) for refresh_token
 */

import { createResponse, LambdaError, parseEvent } from './utils.mjs';
import { processNewUser } from './user_processor.mjs';

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    if (event.httpMethod === "OPTIONS") {
      return createResponse(200, "", corsHeaders);
    }

    const payload = await parseEvent(event);
    
    // Debug logging to understand the payload structure
    console.log("DEBUG: Raw event:", JSON.stringify(event, null, 2));
    console.log("DEBUG: Parsed payload:", JSON.stringify(payload, null, 2));
    
    // Validate required fields
    const { id, email, name, provider, password, captchaToken } = payload;
    if (!id || !email || !name || !provider) {
      throw new LambdaError("Missing required fields: id, email, name, or provider", 400);
    }
    if (provider === "form" && (!password || !captchaToken)) {
      throw new LambdaError("Password and captcha token are required for form signup", 400);
    }
    if (provider !== "form" && provider !== "google") {
      throw new LambdaError("Provider must be either 'form' or 'google'", 400);
    }

    // Process the new user
    const result = await processNewUser({ 
      id, 
      email, 
      password, 
      name, 
      captchaToken, 
      provider 
    });

    // Format cookies properly for the Set-Cookie header
    const cookieHeader = result.cookies.map(cookie => cookie.trim()).join('; ');
    
    return createResponse(
      201, 
      { 
        message: result.message, 
        authType: result.authType 
      }, 
      {
        ...corsHeaders,
        "Set-Cookie": cookieHeader
      }
    );

  } catch (error) {
    console.error("Signup error:", error);
    
    // Handle specific error cases
    let statusCode = 500;
    let errorResponse = { message: "Internal server error" };

    if (error instanceof LambdaError) {
      statusCode = error.statusCode;
      errorResponse = { 
        message: error.message,
        ...(error.errorCodes && { errorCodes: error.errorCodes }),
        ...(error.score !== undefined && { score: error.score })
      };
    } else if (error.name === "ValidationError") {
      statusCode = 400;
      errorResponse = { message: error.message };
    }

    return createResponse(statusCode, errorResponse, corsHeaders);
  }
};
