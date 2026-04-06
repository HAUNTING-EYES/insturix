import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/instagram/auth
 * Redirects user to Facebook OAuth dialog to request Instagram permissions.
 * Instagram publishing uses the Instagram Graph API via Facebook Login.
 */
export async function GET(req: Request) {
    const session = await auth();
    if (!session.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appId = process.env.FACEBOOK_APP_ID!;
    const { origin } = new URL(req.url);
    const redirectUri = `${origin}/api/services/uploaderx/instagram/callback`;

    // Required permissions for Instagram publishing via Facebook Login
    // Reference: https://developers.facebook.com/docs/instagram-developer-api/getting-started
    const scopes = [
        "pages_show_list",          // List pages user manages
        "pages_manage_posts",       // Create posts on Facebook Pages
        "pages_read_engagement",    // Read page engagement data
        "instagram_basic",          // Access basic Instagram account info
        "instagram_content_publish", // Publish content to Instagram
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
