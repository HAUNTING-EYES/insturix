import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/linkedin/auth
 * Initiates LinkedIn OAuth flow
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/services/uploaderx/linkedin/callback`;

        if (!clientId) {
            console.error("❌ LinkedIn Client ID not configured");
            return NextResponse.json({ success: false, error: "LinkedIn integration not configured" }, { status: 500 });
        }

        // LinkedIn OAuth scopes are configurable because some LinkedIn apps are only approved for narrower permission sets.
        const scopes: string[] = ['w_member_social']; // Default to the posting permission.
        if (process.env.LINKEDIN_REQUEST_PROFILE_SCOPE === 'true') {
            scopes.push('r_liteprofile');
        }
        if (process.env.LINKEDIN_REQUEST_EMAIL_SCOPE === 'true') {
            scopes.push('r_emailaddress');
        }
        if (process.env.LINKEDIN_REQUEST_ORG_SCOPE === 'true') {
            scopes.push('rw_organization_admin');
        }
        if (process.env.LINKEDIN_REQUEST_ORG_SCOPE === 'true' && process.env.LINKEDIN_REQUEST_ORG_SOCIAL_SCOPE === 'true') {
            scopes.push('w_organization_social');
        }

        const scopeString = scopes.join(' ');

        const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scopeString);
        authUrl.searchParams.set('state', session.userId); // Use userId as state for security

        console.log("🔗 LinkedIn OAuth URL:", authUrl.toString());

        return NextResponse.redirect(authUrl.toString());
    } catch (error) {
        console.error("❌ LinkedIn auth error:", error);
        return NextResponse.json({ success: false, error: "Failed to initiate LinkedIn authentication" }, { status: 500 });
    }
}