import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createUploaderXOAuthStateRecord,
  storeUploaderXOAuthState,
} from "@/app/api/services/uploaderx/utils/oauth-state";

const debugFacebookAuth = (...args: unknown[]) => {
  if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
    console.log(...args);
  }
};

/**
 * GET /api/services/uploaderx/facebook/auth
 * Redirects user to Facebook OAuth dialog to request Page permissions.
 */
export async function GET(req: Request) {
  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const redirectUri = `${baseUrl}/api/services/uploaderx/facebook/callback`;
  const oauthState = createUploaderXOAuthStateRecord({
    userId: session.userId,
    provider: "facebook",
  });

  debugFacebookAuth("[FB Auth] Redirect URI prepared");

  const scopes = [
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_show_list",
  ].join(",");

  const fbAuthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");

  fbAuthUrl.searchParams.set("client_id", appId);
  fbAuthUrl.searchParams.set("redirect_uri", redirectUri);
  fbAuthUrl.searchParams.set("scope", scopes);
  fbAuthUrl.searchParams.set("response_type", "code");
  fbAuthUrl.searchParams.set("state", oauthState.state);
  fbAuthUrl.searchParams.set("auth_type", "rerequest");

  await storeUploaderXOAuthState(oauthState);

  return NextResponse.redirect(fbAuthUrl.toString());
}
