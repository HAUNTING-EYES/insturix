import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/instagram/callback
 * Handles the OAuth callback from Facebook for Instagram permissions.
 * Exchanges code for access token, fetches user's Instagram Business accounts,
 * and stores the tokens in MongoDB.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.redirect(new URL("/dashboard?ig_error=unauthorized", req.url));
        }

        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error || !code) {
            console.error("❌ Instagram OAuth error:", error || "No code received");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_error=denied", req.url));
        }

        const appId = process.env.FACEBOOK_APP_ID!;
        const appSecret = process.env.FACEBOOK_APP_SECRET!;
        const redirectUri = `${url.origin}/api/services/uploaderx/instagram/callback`;

        // Step 1: Exchange code for short-lived User Access Token
        console.log("🔄 Exchanging Facebook code for Instagram access token...");
        const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
        tokenUrl.searchParams.set("client_id", appId);
        tokenUrl.searchParams.set("client_secret", appSecret);
        tokenUrl.searchParams.set("redirect_uri", redirectUri);
        tokenUrl.searchParams.set("code", code);

        const tokenRes = await fetch(tokenUrl.toString());
        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error("❌ Facebook token exchange error:", tokenData.error);
            return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_error=token_exchange", req.url));
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

        // Step 3: Fetch user's Facebook Pages (to get connected Instagram accounts)
        console.log("\n" + "=".repeat(80));
        console.log("📄 STEP 3: Fetching user's Facebook Pages...");
        console.log("🔑 Using App ID:", appId);
        console.log("🔑 Token length:", userAccessToken.length);
        
        const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}`;
        console.log("📄 Pages API URL:", pagesUrl);

        const pagesRes = await fetch(pagesUrl);
        const pagesData = await pagesRes.json();

        console.log("\n📊 RAW Facebook API Response:");
        console.log(JSON.stringify(pagesData, null, 2));

        if (pagesData.error) {
            console.error("\n❌ FAILED to fetch Pages:");
            console.error(JSON.stringify(pagesData.error, null, 2));
            return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_error=pages_fetch", req.url));
        }

        console.log(`\n📊 Total Pages found: ${pagesData.data?.length || 0}`);
        console.log("=".repeat(80));

        // Extract Instagram Business Accounts connected to each Page
        const igAccounts = [];

        if (!pagesData.data || pagesData.data.length === 0) {
            console.log("\n⚠️ NO Facebook Pages found for this user!");
            console.log("\n💡 POSSIBLE REASONS:");
            console.log("   1. You don't have any Facebook Pages");
            console.log("   2. You're not an admin of any Pages");
            console.log("   3. The Facebook App doesn't have 'pages_show_list' permission approved");
            console.log("\n💡 HOW TO FIX:");
            console.log("   1. Create a Facebook Page: https://www.facebook.com/pages/create");
            console.log("   2. Make sure you're an admin of the Page");
            console.log("   3. Try connecting again");
        }

        for (const page of pagesData.data || []) {
            console.log(`\n📄 Page #${(pagesData.data || []).indexOf(page) + 1}:`);
            console.log(`   - Name: ${page.name}`);
            console.log(`   - ID: ${page.id}`);
            console.log(`   - Has access_token: ${!!page.access_token}`);
            console.log(`   - Has instagram_business_account: ${!!page.instagram_business_account}`);
            
            if (page.instagram_business_account) {
                const igAccount = page.instagram_business_account;
                console.log(`\n   ✅ INSTAGRAM ACCOUNT FOUND:`);
                console.log(`   - IG ID: ${igAccount.id}`);
                console.log(`   - Username: ${igAccount.username || "Unknown"}`);
                console.log(`   - Profile picture: ${igAccount.profile_picture_url || "Not provided"}`);
                
                igAccounts.push({
                    instagramAccountId: igAccount.id,
                    instagramUsername: igAccount.username || "Unknown",
                    profilePictureUrl: igAccount.profile_picture_url || null,
                    facebookPageId: page.id,
                    facebookPageName: page.name,
                    facebookPageAccessToken: page.access_token,
                });
            } else {
                console.log(`\n   ⚠️ NO Instagram account linked to this Page`);
                console.log(`   💡 TO FIX:`);
                console.log(`      1. Go to your Facebook Page → Settings → Instagram`);
                console.log(`      2. Click "Connect Account"`);
                console.log(`      3. Select your Instagram Business account`);
                console.log(`      4. Make sure Instagram account is Business/Creator type`);
            }
        }

        console.log("\n" + "=".repeat(80));
        console.log(`\n✅ SUMMARY: Found ${igAccounts.length} Instagram Business Account(s)`);
        if (igAccounts.length > 0) {
            console.log("\nAccounts:");
            igAccounts.forEach((acc, i) => {
                console.log(`  ${i + 1}. @${acc.instagramUsername} (via ${acc.facebookPageName})`);
            });
        }
        console.log("=".repeat(80) + "\n");
        console.log("✅ Instagram accounts data:", JSON.stringify(igAccounts, null, 2));

        if (igAccounts.length === 0) {
            console.warn("⚠️ No Instagram Business accounts found connected to user's Pages");
            return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_error=no_accounts", req.url));
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
                    instagramTokens: {
                        userAccessToken,
                        userId: meData.id,
                        userName: meData.name,
                        accounts: igAccounts,
                        connectedAt: new Date(),
                    },
                },
            },
            { upsert: true, new: true }
        );

        console.log("💾 Instagram tokens saved to database");
        console.log("💾 Saved accounts:", updateResult?.instagramTokens?.accounts?.length || 0);

        return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_connected=true", req.url));
    } catch (err) {
        console.error("❌ Instagram callback error:", err);
        return NextResponse.redirect(new URL("/dashboard/uploaderx?ig_error=unknown", req.url));
    }
}
