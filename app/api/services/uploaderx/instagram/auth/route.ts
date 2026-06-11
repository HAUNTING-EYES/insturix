import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const debugInstagramAuth = (...args: unknown[]) => {
  if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
    console.log(...args);
  }
};

/**
 * GET /api/services/uploaderx/instagram/auth
 * Redirects user to Instagram OAuth (Instagram Login flow).
 * Works for both Business and Creator accounts without requiring a Facebook Page.
 */
export async function GET(req: Request) {
  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = (process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID || "").trim();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (!appId) {
    return NextResponse.json({ error: "Instagram App ID not configured" }, { status: 500 });
  }

  const redirectUri = `${baseUrl}/api/services/uploaderx/instagram/callback`;

  debugInstagramAuth("[IG Auth] Redirect URI prepared");

  const scopes = [
    "instagram_business_basic",
    "instagram_business_content_publish",
  ].join(",");

  const igAuthUrl = new URL("https://www.instagram.com/oauth/authorize");

  igAuthUrl.searchParams.set("client_id", appId);
  igAuthUrl.searchParams.set("redirect_uri", redirectUri);
  igAuthUrl.searchParams.set("scope", scopes);
  igAuthUrl.searchParams.set("response_type", "code");
  igAuthUrl.searchParams.set("state", session.userId);

  return NextResponse.redirect(igAuthUrl.toString());
}
