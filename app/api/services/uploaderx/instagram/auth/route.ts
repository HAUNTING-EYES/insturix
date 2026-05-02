import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/instagram/auth
 * Redirects user to Facebook OAuth with Instagram permissions
 * This is the correct flow for Instagram Graph API (content publishing)
 */
export async function GET(req: Request) {
  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

  // MUST match callback exactly
  const redirectUri = `${baseUrl}/api/services/uploaderx/instagram/callback`;

  console.log("[IG Auth] Redirect URI:", redirectUri);

  // Facebook OAuth scopes for Instagram Business/Creator accounts
  // instagram_basic: Read Instagram account info
  // instagram_content_publish: Publish content to Instagram
  // pages_show_list, pages_read_engagement: Access Facebook Pages with Instagram
  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  // Use Facebook OAuth (not Instagram Basic Display)
  const fbAuthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");

  fbAuthUrl.searchParams.set("client_id", appId);
  fbAuthUrl.searchParams.set("redirect_uri", redirectUri);
  fbAuthUrl.searchParams.set("scope", scopes);
  fbAuthUrl.searchParams.set("response_type", "code");
  fbAuthUrl.searchParams.set("state", session.userId);
  fbAuthUrl.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(fbAuthUrl.toString());
}