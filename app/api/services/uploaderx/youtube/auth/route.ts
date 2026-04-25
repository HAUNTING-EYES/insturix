import { NextResponse } from "next/server";

/**
 * GET /api/services/uploaderx/youtube/auth
 * This endpoint is deprecated for YouTube connection.
 * YouTube OAuth is now handled directly through Clerk's external accounts.
 * 
 * Users should connect YouTube via:
 * 1. The "Connect YouTube" button in PlatformConnectionStatus component
 * 2. Or through the YouTubeConnectionStatus component
 * 
 * Both use Clerk's built-in OAuth flow with google strategy.
 */
export async function GET() {
    // Redirect to UploaderX page - the connection is handled client-side via Clerk
    return NextResponse.redirect(new URL("/dashboard/uploaderx", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
