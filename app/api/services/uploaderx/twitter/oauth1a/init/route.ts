import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

/**
 * GET /api/services/uploaderx/twitter/oauth1a/init
 * Initiates OAuth 1.0a flow for Twitter media uploads.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { origin } = new URL(req.url);
        const callbackUrl = `${origin}/api/services/uploaderx/twitter/oauth1a/callback`;

        // Step 1: Get request token from Twitter
        const requestTokenUrl = "https://api.x.com/oauth/request_token";
        
        // OAuth 1.0a parameters
        const oauthParams: Record<string, string> = {
            oauth_callback: callbackUrl,
            oauth_consumer_key: process.env.TWITTER_API_KEY!,
            oauth_nonce: crypto.randomBytes(16).toString("hex"),
            oauth_signature_method: "HMAC-SHA1",
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_version: "1.0",
        };

        // Create signature base string
        const sortedParams = Object.entries(oauthParams)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
            .join("&");

        const signatureBaseString = `POST&${percentEncode(requestTokenUrl)}&${percentEncode(sortedParams)}`;
        const signingKey = `${percentEncode(process.env.TWITTER_API_SECRET!)}&`;
        
        console.log("🔐 Signature base string:", signatureBaseString);
        console.log("🔐 Signing key (last 10 chars):", signingKey.slice(-10));
        
        // Generate signature
        const signature = crypto
            .createHmac("sha1", signingKey)
            .update(signatureBaseString)
            .digest("base64");

        console.log("🔐 Generated signature:", signature);

        // Build Authorization header (include callback)
        const authHeader = `OAuth ` + [
            `oauth_callback="${percentEncode(callbackUrl)}"`,
            `oauth_consumer_key="${percentEncode(oauthParams.oauth_consumer_key)}"`,
            `oauth_nonce="${percentEncode(oauthParams.oauth_nonce)}"`,
            `oauth_signature="${percentEncode(signature)}"`,
            `oauth_signature_method="${percentEncode(oauthParams.oauth_signature_method)}"`,
            `oauth_timestamp="${percentEncode(oauthParams.oauth_timestamp)}"`,
            `oauth_version="${percentEncode(oauthParams.oauth_version)}"`,
        ].join(", ");

        console.log("🔐 Auth header:", authHeader);

        const response = await fetch(requestTokenUrl, {
            method: "POST",
            headers: {
                "Authorization": authHeader,
            },
        });

        const responseText = await response.text();
        
        console.log("📥 Request token response status:", response.status);
        console.log("📥 Response text:", responseText);
        
        if (response.status !== 200) {
            console.error("❌ Failed to get request token:", responseText);
            return NextResponse.json({ 
                error: "Failed to initialize Twitter OAuth 1.0a",
                details: responseText 
            }, { status: 500 });
        }

        // Parse response (oauth_token=xxx&oauth_token_secret=xxx&oauth_callback_confirmed=true)
        const params = parseOAuthResponse(responseText);
        const oauthToken = params.get("oauth_token");
        const oauthTokenSecret = params.get("oauth_token_secret");

        if (!oauthToken) {
            console.error("❌ No oauth_token in response:", responseText);
            return NextResponse.json({ 
                error: "Invalid OAuth 1.0a response" 
            }, { status: 500 });
        }

        // Generate state token for CSRF protection
        const stateToken = crypto.randomBytes(16).toString("hex");
        
        // Redirect to Twitter authorization page
        const redirectUrl = `https://api.x.com/oauth/authorize?oauth_token=${oauthToken}`;

        const redirectResponse = NextResponse.redirect(redirectUrl);
        
        // Store state and token secret in cookies (use DB in production)
        redirectResponse.cookies.set("twitter_oauth1a_state", stateToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 10, // 10 minutes
            path: "/",
        });

        redirectResponse.cookies.set("twitter_oauth1a_secret", oauthTokenSecret || "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 10,
            path: "/",
        });

        return redirectResponse;
    } catch (error) {
        console.error("❌ OAuth 1.0a init error:", error);
        return NextResponse.json(
            { error: "Failed to initialize Twitter OAuth 1.0a" },
            { status: 500 }
        );
    }
}

/**
 * Percent-encode a string for OAuth 1.0a
 */
function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/!/g, "%21")
        .replace(/\*/g, "%2A")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/'/g, "%27");
}

/**
 * Parse OAuth URL-encoded response
 */
function parseOAuthResponse(text: string): URLSearchParams {
    return new URLSearchParams(text);
}
