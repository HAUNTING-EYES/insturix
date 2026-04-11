import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/twitter/callback
 * Handles the OAuth 2.0 callback from Twitter/X.
 * Exchanges the authorization code for access/refresh tokens using PKCE,
 * fetches user's Twitter profile, and stores tokens in MongoDB.
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
            console.error("❌ Twitter OAuth state mismatch - possible CSRF attack");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=state_mismatch", url));
        }

        if (error || !code) {
            console.error("❌ Twitter OAuth error:", error || "No code received");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=denied", url));
        }

        // Get code verifier from cookie (PKCE)
        const codeVerifier = getCookieValue(cookies, "twitter_code_verifier");
        if (!codeVerifier) {
            console.error("❌ Twitter code verifier not found in cookies");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_verifier", url));
        }

        const clientId = process.env.TWITTER_CLIENT_ID!;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
        const redirectUri = `${url.origin}/api/services/uploaderx/twitter/callback`;

        // Step 1: Exchange authorization code for access tokens
        console.log("🔄 Exchanging Twitter authorization code for tokens...");

        const tokenUrl = "https://api.x.com/2/oauth2/token";

        // Create Basic Auth header
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
            console.error("❌ Twitter token exchange error:", tokenData.error);
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
            console.error("❌ No access token received from Twitter");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=no_token", url));
        }

        console.log("✅ Twitter access token obtained");
        console.log("📋 Token type:", token_type);
        console.log("📋 Expires in:", expires_in, "seconds");
        console.log("📋 Scopes granted:", scope);

        // Step 2: Fetch user's Twitter profile
        console.log("👤 Fetching Twitter user profile...");

        const meUrl = "https://api.x.com/2/users/me";

        const meRes = await fetch(meUrl, {
            headers: {
                "Authorization": `Bearer ${access_token}`,
            },
        });

        const meData = await meRes.json();

        if (meRes.status !== 200 || meData.errors) {
            console.error("❌ Failed to fetch Twitter profile:", meData.errors || meData);
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=profile_fetch", url));
        }

        const twitterUser = meData.data;
        console.log("✅ Twitter profile fetched:", twitterUser.username);

        // Step 3: Calculate token expiration time
        const expiresAt = new Date(Date.now() + expires_in * 1000);

        // Step 4: Store tokens in MongoDB
        console.log("💾 Saving Twitter tokens to database...");
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
                    },
                },
            },
            { upsert: true, new: true }
        );

        if (!updateResult) {
            console.error("❌ Failed to save Twitter tokens to database");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_error=save_failed", url));
        }

        console.log("✅ Twitter tokens saved to database successfully");
        console.log("👤 Connected as:", updateResult.twitterTokens?.userName);

        // Clean up cookies
        const response = NextResponse.redirect(new URL("/dashboard/uploaderx?twitter_connected=true", url));
        response.cookies.set("twitter_code_verifier", "", { maxAge: 0, path: "/" });
        response.cookies.set("twitter_state", "", { maxAge: 0, path: "/" });

        return response;
    } catch (err) {
        console.error("❌ Twitter callback error:", err);
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
