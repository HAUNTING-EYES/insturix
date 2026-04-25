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

        // Step 3: Fetch user's Facebook Pages (with pagination support)
        console.log("📄 Fetching user's Pages...");
        let allPages: any[] = [];
        let nextPageUrl: string | null = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,permissions`;
        
        while (nextPageUrl) {
            console.log("📄 Fetching page batch:", nextPageUrl);
            const pagesRes = await fetch(nextPageUrl);
            const pagesData = await pagesRes.json();
            
            if (pagesData.error) {
                console.error("❌ Failed to fetch Pages:", pagesData.error);
                return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=pages_fetch", req.url));
            }
            
            if (pagesData.data && pagesData.data.length > 0) {
                allPages = [...allPages, ...pagesData.data];
                console.log(`📄 Fetched ${pagesData.data.length} pages in this batch`);
            }
            
            nextPageUrl = pagesData.paging?.next || null;
        }
        
        console.log("📄 Total raw pages fetched:", allPages.length);
        console.log("📄 Raw Pages API Response (sample):", JSON.stringify(allPages.slice(0, 3), null, 2));

        // Also fetch pages using the user token to get additional page data
        // This can help discover more pages
        console.log("📄 Verifying page access with user token...");
        const userPagesUrl = `https://graph.facebook.com/v21.0/me?fields=accounts{id,name,access_token}&access_token=${userAccessToken}`;
        
        try {
            const userPagesRes = await fetch(userPagesUrl);
            const userPagesData = await userPagesRes.json();
            console.log("📄 User accounts (via /me):", JSON.stringify(userPagesData, null, 2));
            
            if (userPagesData.accounts?.data) {
                // Merge any pages not already in the list
                const existingIds = new Set(allPages.map(p => p.id));
                for (const page of userPagesData.accounts.data) {
                    if (!existingIds.has(page.id)) {
                        allPages.push(page);
                        console.log(`📄 Added page from /me endpoint: ${page.name}`);
                    }
                }
            }
        } catch (e) {
            console.warn("⚠️ Could not fetch additional pages from /me endpoint:", e);
        }

        // Also check permissions to see what was granted
        console.log("📄 Checking granted permissions...");
        try {
            const permsUrl = `https://graph.facebook.com/v21.0/me/permissions?access_token=${userAccessToken}`;
            const permsRes = await fetch(permsUrl);
            const permsData = await permsRes.json();
            console.log("📄 Granted permissions:", JSON.stringify(permsData, null, 2));
            
            // Check if pages_show_list is granted
            const pagesShowListPerm = permsData.data?.find((p: any) => p.permission === 'pages_show_list');
            if (pagesShowListPerm && pagesShowListPerm.status !== 'granted') {
                console.warn("⚠️ pages_show_list permission not granted! Status:", pagesShowListPerm.status);
            }
        } catch (e) {
            console.warn("⚠️ Could not fetch permissions:", e);
        }

        const pages = allPages.map((page: any) => ({
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
        }));

        console.log(`✅ Found ${pages.length} Pages:`, pages.map((p: any) => p.pageName));
        console.log("✅ Pages data:", JSON.stringify(pages, null, 2));

        // Check if pages array is empty and warn user
        if (pages.length === 0) {
            console.warn("⚠️ No Facebook Pages found for this user!");
            console.warn("💡 The user may need to:");
            console.warn("   1. Create a Facebook Page at https://www.facebook.com/pages/create");
            console.warn("   2. Be an admin of at least one Page");
            console.warn("   3. Ensure Facebook App has 'pages_show_list' permission in App Review");
            
            // Still save the connection but with empty pages - user will see the issue when trying to upload
        } else if (pages.length < 3) {
            console.warn(`⚠️ Only ${pages.length} page(s) found. User claims to have 3 pages.`);
            console.warn("💡 Possible reasons:");
            console.warn("   1. User is not admin of all their pages");
            console.warn("   2. Some pages may be archived or unpublished");
            console.warn("   3. Facebook App permissions may be limited");
        }

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

        // If no pages found, redirect with warning
        if (pages.length === 0) {
            return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_connected=true&fb_warning=no_pages", req.url));
        }

        return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_connected=true", req.url));
    } catch (err) {
        console.error("❌ Facebook callback error:", err);
        return NextResponse.redirect(new URL("/dashboard/uploaderx?fb_error=unknown", req.url));
    }
}
