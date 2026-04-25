import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/twitter/auth
 * Redirects user to Twitter OAuth 2.0 dialog with PKCE for X API permissions.
 * Uses Authorization Code flow with PKCE for secure token exchange.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const clientId = process.env.TWITTER_CLIENT_ID!;
        const { origin } = new URL(req.url);
        const redirectUri = `${origin}/api/services/uploaderx/twitter/callback`;

        // Required scopes for Twitter/X API v2 with media upload
        // tweet.read - Read user's tweets
        // tweet.write - Create tweets (including with media)
        // users.read - Read user's profile info
        // offline.access - Get refresh token for long-term access
        // media.write - Upload media (videos/images) to Twitter
        const scopes = [
            "tweet.read",
            "tweet.write",
            "users.read",
            "offline.access",
            "media.write",
        ].join(" ");

        // Generate PKCE code verifier and challenge
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store code verifier in cookie for callback validation
        const state = session.userId;

        const twitterAuthUrl = new URL("https://x.com/i/oauth2/authorize");
        twitterAuthUrl.searchParams.set("response_type", "code");
        twitterAuthUrl.searchParams.set("client_id", clientId);
        twitterAuthUrl.searchParams.set("redirect_uri", redirectUri);
        twitterAuthUrl.searchParams.set("scope", scopes);
        twitterAuthUrl.searchParams.set("state", state);
        twitterAuthUrl.searchParams.set("code_challenge", codeChallenge);
        twitterAuthUrl.searchParams.set("code_challenge_method", "S256");

        console.log("🔐 OAuth 2.0 scopes requested:", scopes);

        // Create response with redirect
        const response = NextResponse.redirect(twitterAuthUrl.toString());

        // Store code verifier in secure HTTP-only cookie
        // This cookie will only be sent to our callback endpoint
        response.cookies.set("twitter_code_verifier", codeVerifier, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 10, // 10 minutes (OAuth flow timeout)
            path: "/",
        });

        // Store state in cookie for CSRF protection
        response.cookies.set("twitter_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 10,
            path: "/",
        });

        return response;
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to initialize Twitter OAuth" },
            { status: 500 }
        );
    }
}

/**
 * Generate a cryptographically secure random code verifier
 */
function generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);

    // Base64URL encode
    return base64URLEncode(randomBytes);
}

/**
 * Generate PKCE code challenge from code verifier using SHA-256
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    // Convert verifier to Uint8Array
    const encoder = new TextEncoder();
    const verifierBytes = encoder.encode(codeVerifier);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest("SHA-256", verifierBytes);

    // Base64URL encode the hash
    return base64URLEncode(new Uint8Array(hashBuffer));
}

/**
 * Base64URL encode a byte array
 */
function base64URLEncode(bytes: Uint8Array): string {
    // Convert bytes to base64
    let base64 = "";
    const chunkSize = 0x8000; // Process in chunks to avoid call stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        base64 += String.fromCharCode.apply(null, chunk);
    }

    // Convert to base64 and make URL-safe
    return btoa(base64)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""); // Remove padding
}
