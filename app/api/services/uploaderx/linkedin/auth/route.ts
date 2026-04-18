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
        // To enable all posting options, set these env vars to 'true':
        // - LINKEDIN_REQUEST_PROFILE_SCOPE=true (for personal profile posting)
        // - LINKEDIN_REQUEST_ORG_SCOPE=true (for organization admin access)
        // - LINKEDIN_REQUEST_ORG_SOCIAL_SCOPE=true (for organization posting)
        // 
        // Note: You must have these scopes approved in your LinkedIn Developer Portal
        const scopes: string[] = ['w_member_social']; // Base permission for posting
        
        // Profile scope - requires r_liteprofile approval in LinkedIn app
        if (process.env.LINKEDIN_REQUEST_PROFILE_SCOPE === 'true') {
            scopes.push('r_liteprofile');
        }
        
        // Email scope - requires r_emailaddress approval
        if (process.env.LINKEDIN_REQUEST_EMAIL_SCOPE === 'true') {
            scopes.push('r_emailaddress');
        }
        
        // Organization scopes - require approval in LinkedIn app
        // Only add if explicitly enabled to avoid unauthorized scope errors
        if (process.env.LINKEDIN_REQUEST_ORG_SCOPE === 'true') {
            scopes.push('rw_organization_admin');
        }
        if (process.env.LINKEDIN_REQUEST_ORG_SOCIAL_SCOPE === 'true') {
            scopes.push('w_organization_social');
        }
        
        console.log("🔗 LinkedIn OAuth scopes:", scopes);

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