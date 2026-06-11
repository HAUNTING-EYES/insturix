import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import crypto from "crypto";

const debugTwitterOAuth = (...args: unknown[]) => {
    if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
        console.log(...args);
    }
};

/**
 * GET /api/services/uploaderx/twitter/oauth1a/callback
 * Handles the OAuth 1.0a callback and stores tokens.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=unauthorized", req.url));
        }

        const url = new URL(req.url);
        const oauthToken = url.searchParams.get("oauth_token");
        const oauthVerifier = url.searchParams.get("oauth_verifier");
        const denied = url.searchParams.get("denied");

        if (denied) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=denied", url));
        }

        if (!oauthToken || !oauthVerifier) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=missing_params", url));
        }

        // Get token secret from cookie (stored during init)
        const cookies = req.headers.get("cookie") || "";
        const oauthTokenSecret = getCookieValue(cookies, "twitter_oauth1a_secret");

        if (!oauthTokenSecret) {
            console.error("❌ No oauth_token_secret found in cookies");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_secret", url));
        }

        // Exchange request token for access token
        const accessTokenUrl = "https://api.x.com/oauth/access_token";
        
        // OAuth 1.0a parameters
        const oauthParams: Record<string, string> = {
            oauth_consumer_key: process.env.TWITTER_API_KEY!,
            oauth_nonce: crypto.randomBytes(16).toString("hex"),
            oauth_signature_method: "HMAC-SHA1",
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: oauthToken,
            oauth_verifier: oauthVerifier,
            oauth_version: "1.0",
        };

        // Create signature base string
        const sortedParams = Object.entries(oauthParams)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
            .join("&");

        const signatureBaseString = `POST&${percentEncode(accessTokenUrl)}&${percentEncode(sortedParams)}`;
        const signingKey = `${percentEncode(process.env.TWITTER_API_SECRET!)}&${percentEncode(oauthTokenSecret)}`;

        // Generate signature
        const signature = crypto
            .createHmac("sha1", signingKey)
            .update(signatureBaseString)
            .digest("base64");

        // Build Authorization header
        const authHeader = `OAuth ` + [
            `oauth_consumer_key="${percentEncode(oauthParams.oauth_consumer_key)}"`,
            `oauth_nonce="${percentEncode(oauthParams.oauth_nonce)}"`,
            `oauth_signature="${percentEncode(signature)}"`,
            `oauth_signature_method="${percentEncode(oauthParams.oauth_signature_method)}"`,
            `oauth_timestamp="${percentEncode(oauthParams.oauth_timestamp)}"`,
            `oauth_token="${percentEncode(oauthParams.oauth_token)}"`,
            `oauth_verifier="${percentEncode(oauthParams.oauth_verifier)}"`,
            `oauth_version="${percentEncode(oauthParams.oauth_version)}"`,
        ].join(", ");

        const response = await fetch(accessTokenUrl, {
            method: "POST",
            headers: {
                "Authorization": authHeader,
            },
        });

        const responseText = await response.text();
        debugTwitterOAuth("[Twitter OAuth1a Callback] Access token status:", response.status);
        
        if (response.status !== 200) {
            console.error("[Twitter OAuth1a Callback] Failed to get access token:", response.status);
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=token_exchange", url));
        }

        // Parse response
        const params = new URLSearchParams(responseText);
        const accessToken = params.get("oauth_token");
        const accessTokenSecret = params.get("oauth_token_secret");
        const userId = params.get("user_id");
        const screenName = params.get("screen_name");

        if (!accessToken || !accessTokenSecret) {
            console.error("[Twitter OAuth1a Callback] Invalid access token response");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_token", url));
        }

        // Store OAuth 1.0a tokens in database
        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        await User.findOneAndUpdate(
            { clerkUserId: session.userId },
            {
                $set: {
                    "twitterTokens.oauthToken": accessToken,
                    "twitterTokens.oauthTokenSecret": accessTokenSecret,
                    "twitterTokens.oauth1aUserId": userId,
                    "twitterTokens.oauth1aScreenName": screenName,
                    "twitterTokens.oauth1aConnectedAt": new Date(),
                },
            }
        );

        debugTwitterOAuth("[Twitter OAuth1a Callback] Tokens stored", {
            hasUserId: !!userId,
            hasScreenName: !!screenName,
        });

        // Clean up cookies
        const redirectResponse = NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_connected=true", url));
        redirectResponse.cookies.set("twitter_oauth1a_state", "", { maxAge: 0, path: "/" });
        redirectResponse.cookies.set("twitter_oauth1a_secret", "", { maxAge: 0, path: "/" });

        return redirectResponse;
    } catch (err) {
        console.error("❌ OAuth 1.0a callback error:", err);
        return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=unknown", req.url));
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
 * Helper function to extract cookie value from cookie header string
 */
function getCookieValue(cookies: string, name: string): string | null {
    const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
}
