import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/instagram/auth
 * Redirects user to Facebook OAuth dialog for Instagram permissions
 */
export async function GET(req: Request) {
  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!; // ✅ single source

  // ✅ MUST match callback + Meta exactly
  const redirectUri = `${baseUrl}/api/services/uploaderx/instagram/callback`;

  console.log("[IG Auth] Redirect URI:", redirectUri);

  const scopes = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const fbAuthUrl = new URL(
    "https://www.facebook.com/v21.0/dialog/oauth"
  );

  fbAuthUrl.searchParams.set("client_id", appId);
  fbAuthUrl.searchParams.set("redirect_uri", redirectUri);
  fbAuthUrl.searchParams.set("scope", scopes);
  fbAuthUrl.searchParams.set("response_type", "code");
  fbAuthUrl.searchParams.set("state", session.userId);
  fbAuthUrl.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(fbAuthUrl.toString());
}