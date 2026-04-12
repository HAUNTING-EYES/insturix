import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

// Required scopes for full Twitter functionality
const REQUIRED_SCOPES = [
    "tweet.read",
    "tweet.write",
    "users.read",
    "offline.access",
];

/**
 * Validate that all required scopes were granted
 */
function validateScopes(grantedScope: string): { valid: boolean; missing: string[]; granted: string[] } {
    const grantedScopes = grantedScope?.split(" ") || [];
    const missing = REQUIRED_SCOPES.filter(scope => !grantedScopes.includes(scope));
    return {
        valid: missing.length === 0,
        missing,
        granted: grantedScopes,
    };
}

/**
 * GET /api/services/uploaderx/twitter/callback
 * Handles the OAuth 2.0 callback from Twitter/X.
 * Exchanges the authorization code for access/refresh tokens using PKCE,
 * fetches user's Twitter profile, validates permissions, and stores tokens in MongoDB.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=unauthorized", req.url));
        }

        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Verify state matches (CSRF protection)
        const cookies = req.headers.get("cookie") || "";
        const storedState = getCookieValue(cookies, "twitter_state");

        if (state !== storedState) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=state_mismatch", url));
        }

        if (error || !code) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=denied", url));
        }

        // Get code verifier from cookie (PKCE)
        const codeVerifier = getCookieValue(cookies, "twitter_code_verifier");
        if (!codeVerifier) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_verifier", url));
        }

        const clientId = process.env.TWITTER_CLIENT_ID!;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
        const redirectUri = `${url.origin}/api/services/uploaderx/twitter/callback`;

        // Step 1: Exchange authorization code for access tokens
        const tokenUrl = "https://api.x.com/2/oauth2/token";
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const tokenBody = new URLSearchParams();
        tokenBody.set("grant_type", "authorization_code");
        tokenBody.set("code", code);
        tokenBody.set("redirect_uri", redirectUri);
        tokenBody.set("code_verifier", codeVerifier);

        const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${credentials}`,
            },
            body: tokenBody.toString(),
        });

        const tokenData = await tokenRes.json();

        if (tokenRes.status !== 200 || tokenData.error) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=token_exchange", url));
        }

        const {
            access_token,
            refresh_token,
            expires_in,
            scope,
            token_type,
        } = tokenData;

        if (!access_token) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_token", url));
        }

        // Validate permissions/scopes
        const scopeValidation = validateScopes(scope);

        // Fetch user's Twitter profile
        const meUrl = "https://api.x.com/2/users/me";

        const meRes = await fetch(meUrl, {
            headers: {
                "Authorization": `Bearer ${access_token}`,
            },
        });

        const meData = await meRes.json();

        if (meRes.status !== 200 || meData.errors) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=profile_fetch", url));
        }

        const twitterUser = meData.data;

        // Step 3: Calculate token expiration time
        const expiresAt = new Date(Date.now() + expires_in * 1000);

        // Step 4: Store tokens in MongoDB with scope information
        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const updateResult = await User.findOneAndUpdate(
            { clerkUserId: session.userId },
            {
                $set: {
                    twitterTokens: {
                        accessToken: access_token,
                        refreshToken: refresh_token,
                        userId: twitterUser.id,
                        userName: twitterUser.username,
                        expiresAt,
                        connectedAt: new Date(),
                        scopes: scopeValidation.granted,
                        missingScopes: scopeValidation.missing,
                    },
                },
            },
            { new: true }
        );

        if (!updateResult) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=user_not_found", url));
        }

        // Build redirect URL with scope validation info
        let redirectUrl = "/dashboard/uploaderx?twitter_connected=true";
        if (scopeValidation.missing.length > 0) {
            redirectUrl += "&twitter_scopes_warning=" + encodeURIComponent(scopeValidation.missing.join(","));
        }

        // Clean up cookies
        const response = NextResponse.redirect(new URL(redirectUrl, url));
        response.cookies.set("twitter_code_verifier", "", { maxAge: 0, path: "/" });
        response.cookies.set("twitter_state", "", { maxAge: 0, path: "/" });

        return response;
    } catch (err) {
        return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=unknown", req.url));
    }
}

/**
 * Helper function to extract cookie value from cookie header string
 */
function getCookieValue(cookies: string, name: string): string | null {
    const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
}
