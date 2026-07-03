import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLinkedInScopes } from "@/lib/uploaderx/linkedinScopes";
import { getLinkedInRedirectUri } from "@/lib/uploaderx/linkedinUrl";
import {
    createUploaderXOAuthStateRecord,
    storeUploaderXOAuthState,
} from "@/app/api/services/uploaderx/utils/oauth-state";

const debugLinkedInAuth = (...args: unknown[]) => {
    if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
        console.log(...args);
    }
};

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
        const oauthState = createUploaderXOAuthStateRecord({
            userId: session.userId,
            provider: "linkedin",
        });

        if (!clientId) {
            console.error("[LinkedIn Auth] Client ID not configured");
            return NextResponse.json({ success: false, error: "LinkedIn integration not configured" }, { status: 500 });
        }

        // Personal posting needs profile access so we can resolve the member URN.
        // Organization scopes stay opt-in because many LinkedIn apps are not approved for them.
        const { scopes } = getLinkedInScopes();
        debugLinkedInAuth("[LinkedIn Auth] Scope count:", scopes.length);

        const scopeString = scopes.join(' ');

        const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scopeString);
        authUrl.searchParams.set('state', oauthState.state);

        await storeUploaderXOAuthState(oauthState);

        debugLinkedInAuth("[LinkedIn Auth] Redirect URL prepared");

        return NextResponse.redirect(authUrl.toString());
    } catch (error) {
        console.error("[LinkedIn Auth] Error:", error);
        return NextResponse.json({ success: false, error: "Failed to initiate LinkedIn authentication" }, { status: 500 });
    }
}
