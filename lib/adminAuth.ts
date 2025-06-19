import { NextRequest } from "next/server";

/**
 * Validates admin authentication using secret key
 * @param request - The NextRequest object
 * @returns boolean - true if authenticated, false otherwise
 */
export function validateAdminAuth(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  
  if (!adminSecret) {
    console.error("ADMIN_SECRET_KEY is not configured in environment variables");
    return false;
  }

  // Check for secret in Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    return token === adminSecret;
  }

  // Check for secret in x-admin-secret header
  const adminSecretHeader = request.headers.get("x-admin-secret");
  if (adminSecretHeader) {
    return adminSecretHeader === adminSecret;
  }

  // Check for secret in query params (less secure, for testing only)
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("admin_secret");
  if (secretParam) {
    return secretParam === adminSecret;
  }

  return false;
}

/**
 * Creates a standardized unauthorized response
 */
export function createUnauthorizedResponse() {
  return new Response(
    JSON.stringify({ 
      error: "Unauthorized", 
      message: "Admin authentication required. Provide ADMIN_SECRET_KEY in Authorization header, x-admin-secret header, or admin_secret query parameter." 
    }),
    { 
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}