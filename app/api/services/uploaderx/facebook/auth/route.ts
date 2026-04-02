import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

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
    const { origin } = new URL(req.url);
    const redirectUri = `${origin}/api/services/uploaderx/facebook/callback`;

    // Required permissions for Facebook Page video uploads
    // Reference: https://developers.facebook.com/docs/facebook-login/permissions
    const scopes = [
        "pages_manage_posts",    // Create posts on pages (includes video uploads)
        "pages_read_engagement", // Read page engagement data
        "pages_show_list",       // List pages user manages
    ].join(",");

    const fbAuthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    fbAuthUrl.searchParams.set("client_id", appId);
    fbAuthUrl.searchParams.set("redirect_uri", redirectUri);
    fbAuthUrl.searchParams.set("scope", scopes);
    fbAuthUrl.searchParams.set("response_type", "code");
    fbAuthUrl.searchParams.set("state", session.userId);
    // Force re-authorization to get fresh permissions
    fbAuthUrl.searchParams.set("auth_type", "rerequest");

    return NextResponse.redirect(fbAuthUrl.toString());
}
