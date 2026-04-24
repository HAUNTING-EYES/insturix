import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLinkedInScopes } from "@/lib/uploaderx/linkedinScopes";
import { getLinkedInRedirectUri } from "@/lib/uploaderx/linkedinUrl";

/**
 * GET /api/services/uploaderx/linkedin/auth
 * Initiates LinkedIn OAuth flow
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
        const redirectUri = getLinkedInRedirectUri(request);

        if (!clientId) {
            console.error("❌ LinkedIn Client ID not configured");
            return NextResponse.json({ success: false, error: "LinkedIn integration not configured" }, { status: 500 });
        }

        // Personal posting needs profile access so we can resolve the member URN.
        // Organization scopes stay opt-in because many LinkedIn apps are not approved for them.
        const { scopes } = getLinkedInScopes();
        
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
