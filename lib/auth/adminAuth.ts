/**
 * Admin Authentication Utilities
 * 
 * Centralized admin authentication and authorization logic.
 * Uses email-based verification against ADMIN_EMAILS environment variable.
 * 
 * Security Design:
 * - Admin access is determined by checking if user's email exists in ADMIN_EMAILS
 * - No separate admin login - admins use the same login flow as regular users
 * - Environment variable based configuration for easy deployment
 * - Silent redirects for non-admins attempting to access admin routes
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Get list of admin emails from environment variable.
 *
 * SERVER-ONLY. Reads from ADMIN_EMAILS (non-public, stays in backend).
 *
 * HISTORY: Previously fell back to NEXT_PUBLIC_ADMIN_EMAILS, which was baked
 * into the client bundle at build time and exposed the admin email list to
 * anyone viewing page source. After a fired-teammate access audit (2026-04-19),
 * the variable was renamed and the fallback removed. If you need the admin
 * list in a client component, do NOT add back a NEXT_PUBLIC_ var — fetch from
 * a server-guarded API route instead.
 *
 * @returns Array of admin email addresses
 */
export function getAdminEmails(): string[] {
  const adminEmailsEnv = process.env.ADMIN_EMAILS;

  if (!adminEmailsEnv) {
    console.warn("⚠️ ADMIN_EMAILS environment variable not set. No admin access will be granted.");
    return [];
  }

  return adminEmailsEnv.split(",").map((email) => email.trim().toLowerCase());
}

/**
 * Check if a user ID is an admin (server-side only)
 * @param userId - Clerk user ID
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase();

    if (!userEmail) return false;

    const adminEmails = getAdminEmails();
    return adminEmails.includes(userEmail);
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Check if current user's email is an admin email
 * @param userEmail - User's email address
 * @returns boolean - true if email is in admin list
 */
export function isAdminEmail(userEmail: string): boolean {
  if (!userEmail) return false;
  
  const adminEmails = getAdminEmails();
  return adminEmails.includes(userEmail.toLowerCase());
}

/**
 * Server-side admin route guard
 * Validates that the current user is authenticated and is an admin.
 * Redirects to signin if not authenticated, or to home if not admin.
 * 
 * Usage in page.tsx:
 * ```typescript
 * export default async function AdminPage() {
 *   await requireAdmin();
 *   // rest of page code
 * }
 * ```
 * 
 * @param redirectUrl - Optional custom redirect URL after signin
 */
export async function requireAdmin(redirectUrl?: string): Promise<void> {
  const { userId } = await auth();

  // Not authenticated - redirect to signin
  if (!userId) {
    const currentPath = redirectUrl || "/admin";
    redirect(`/signin?redirect_url=${encodeURIComponent(currentPath)}`);
  }

  // Check if user is admin
  const userIsAdmin = await isAdmin(userId);
  
  if (!userIsAdmin) {
    // Not an admin - silently redirect to home
    redirect("/");
  }
}

/**
 * Get admin user info (server-side only)
 * Returns user email and admin status
 * @param userId - Clerk user ID
 * @returns Promise<{email: string, isAdmin: boolean} | null>
 */
export async function getAdminUserInfo(userId: string | null): Promise<{
  email: string;
  isAdmin: boolean;
} | null> {
  if (!userId) return null;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress || "";

    return {
      email: userEmail,
      isAdmin: isAdminEmail(userEmail),
    };
  } catch (error) {
    console.error("Error getting admin user info:", error);
    return null;
  }
}

/**
 * API route admin guard
 * Use this in API routes to verify admin access
 * 
 * Usage:
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   const adminCheck = await verifyAdminForApi();
 *   if (!adminCheck.isAdmin) {
 *     return adminCheck.response; // Returns 401 or 403
 *   }
 *   // Admin verified, proceed with API logic
 * }
 * ```
 */
export async function verifyAdminForApi(): Promise<{
  isAdmin: boolean;
  userId: string | null;
  email?: string;
  response?: Response;
}> {
  const { userId } = await auth();

  if (!userId) {
    return {
      isAdmin: false,
      userId: null,
      response: new Response(
        JSON.stringify({ ok: false, message: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const userInfo = await getAdminUserInfo(userId);

  if (!userInfo || !userInfo.isAdmin) {
    return {
      isAdmin: false,
      userId,
      email: userInfo?.email,
      response: new Response(
        JSON.stringify({ ok: false, message: "Forbidden: Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return {
    isAdmin: true,
    userId,
    email: userInfo.email,
  };
}
