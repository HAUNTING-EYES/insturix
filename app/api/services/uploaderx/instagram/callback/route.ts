import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session.userId) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=unauthorized`
      );
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      console.error("❌ Instagram OAuth error:", error || "No code");
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=denied`
      );
    }

    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;

    // ✅ MUST match /auth exactly
    const redirectUri = `${baseUrl}/api/services/uploaderx/instagram/callback`;

    console.log("[IG Callback] Redirect URI:", redirectUri);

    // 🔄 Exchange code → token
    const tokenUrl = new URL(
      "https://graph.facebook.com/v21.0/oauth/access_token"
    );
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("❌ Token error:", tokenData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=token_exchange`
      );
    }

    const shortToken = tokenData.access_token;

    // 🔄 Long-lived token
    const longUrl = new URL(
      "https://graph.facebook.com/v21.0/oauth/access_token"
    );
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();

    const userAccessToken = longData.access_token || shortToken;

    // 📄 Fetch pages + IG accounts
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}`
    );

    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      console.error("❌ Pages error:", pagesData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=pages_fetch`
      );
    }

    const igAccounts: any[] = [];

    for (const page of pagesData.data || []) {
      if (page.instagram_business_account) {
        igAccounts.push({
          instagramAccountId: page.instagram_business_account.id,
          instagramUsername:
            page.instagram_business_account.username || "Unknown",
          profilePictureUrl:
            page.instagram_business_account.profile_picture_url || null,
          facebookPageId: page.id,
          facebookPageName: page.name,
          facebookPageAccessToken: page.access_token,
        });
      }
    }

    if (igAccounts.length === 0) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=no_accounts`
      );
    }

    // 👤 User info
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${userAccessToken}`
    );
    const meData = await meRes.json();

    // 💾 Save
    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    await User.findOneAndUpdate(
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
      { upsert: true }
    );

    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?ig_connected=true`
    );
  } catch (err) {
    console.error("❌ Instagram callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?ig_error=unknown`
    );
  }
}