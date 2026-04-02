import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

/**
 * GET /api/services/uploaderx/facebook/callback
 * Handles the OAuth callback from Facebook.
 * Exchanges code for access token, fetches user's Pages,
 * and stores the Page Access Token in MongoDB.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.redirect(new URL("/dashboard?fb_error=unauthorized", req.url));
        }

        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error || !code) {
            console.error("❌ Facebook OAuth error:", error || "No code received");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=denied", req.url));
        }

        const appId = process.env.FACEBOOK_APP_ID!;
        const appSecret = process.env.FACEBOOK_APP_SECRET!;
        const redirectUri = `${url.origin}/api/services/uploaderx/facebook/callback`;

        // Step 1: Exchange code for short-lived User Access Token
        console.log("🔄 Exchanging Facebook code for access token...");
        const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
        tokenUrl.searchParams.set("client_id", appId);
        tokenUrl.searchParams.set("client_secret", appSecret);
        tokenUrl.searchParams.set("redirect_uri", redirectUri);
        tokenUrl.searchParams.set("code", code);

        const tokenRes = await fetch(tokenUrl.toString());
        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error("❌ Facebook token exchange error:", tokenData.error);
            return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=token_exchange", req.url));
        }

        const shortLivedToken = tokenData.access_token;
        console.log("✅ Short-lived token obtained");

        // Step 2: Exchange for long-lived User Access Token
        console.log("🔄 Exchanging for long-lived token...");
        const longLivedUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
        longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
        longLivedUrl.searchParams.set("client_id", appId);
        longLivedUrl.searchParams.set("client_secret", appSecret);
        longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

        const longLivedRes = await fetch(longLivedUrl.toString());
        const longLivedData = await longLivedRes.json();

        const userAccessToken = longLivedData.access_token || shortLivedToken;
        console.log("✅ Long-lived user token obtained");

        // Step 3: Fetch user's Facebook Pages
        console.log("📄 Fetching user's Pages...");
        const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,permissions`;
        console.log("📄 Pages API URL:", pagesUrl);
        
        const pagesRes = await fetch(pagesUrl);
        const pagesData = await pagesRes.json();

        console.log("📄 Raw Pages API Response:", JSON.stringify(pagesData, null, 2));

        if (pagesData.error) {
            console.error("❌ Failed to fetch Pages:", pagesData.error);
            return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=pages_fetch", req.url));
        }

        const pages = (pagesData.data || []).map((page: any) => ({
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
        }));

        console.log(`✅ Found ${pages.length} Pages:`, pages.map((p: any) => p.pageName));
        console.log("✅ Pages data:", JSON.stringify(pages, null, 2));

        // Also fetch user profile info
        const meRes = await fetch(
            `https://graph.facebook.com/v21.0/me?access_token=${userAccessToken}&fields=id,name,email`
        );
        const meData = await meRes.json();

        console.log("👤 User profile:", meData);

        // Step 4: Store tokens in MongoDB
        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const updateResult = await User.findOneAndUpdate(
            { clerkUserId: session.userId },
            {
                $set: {
                    facebookTokens: {
                        userAccessToken,
                        userId: meData.id,
                        userName: meData.name,
                        pages,
                        connectedAt: new Date(),
                    },
                },
            },
            { upsert: true, new: true }
        );

        console.log("💾 Facebook tokens saved to database");
        console.log("💾 Saved pages:", updateResult?.facebookTokens?.pages?.length || 0);

        return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_connected=true", req.url));
    } catch (err) {
        console.error("❌ Facebook callback error:", err);
        return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=unknown", req.url));
    }
}
