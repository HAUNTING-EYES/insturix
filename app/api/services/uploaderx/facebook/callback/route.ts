import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session.userId) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=unauthorized`
      );
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      console.error("❌ Facebook OAuth error:", error || "No code");
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=denied`
      );
    }

    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;

    // ✅ FIXED: ALWAYS use same redirect URI as /auth
    const redirectUri = `${baseUrl}/api/services/uploaderx/facebook/callback`;

    // 🔄 Exchange code → access token
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
      console.error("❌ Token exchange error:", tokenData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=token_exchange`
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

    // 📄 Fetch pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      console.error("❌ Pages fetch error:", pagesData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=pages_fetch`
      );
    }

    const pages =
      pagesData.data?.map((p: any) => ({
        pageId: p.id,
        pageName: p.name,
        pageAccessToken: p.access_token,
      })) || [];

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
          facebookTokens: {
            userAccessToken,
            userId: meData.id,
            userName: meData.name,
            pages,
            connectedAt: new Date(),
          },
        },
      },
      { upsert: true }
    );

    // ✅ SUCCESS
    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?fb_connected=true`
    );
  } catch (err) {
    console.error("❌ Callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?fb_error=unknown`
    );
  }
}