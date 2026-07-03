import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import {
  consumeUploaderXOAuthState,
  UploaderXOAuthStateError,
} from "@/app/api/services/uploaderx/utils/oauth-state";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const debugInstagramCallback = (...args: unknown[]) => {
  if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
    console.log(...args);
  }
};

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
    const state = url.searchParams.get("state");

    if (error || !code) {
      console.error("[Instagram OAuth] Provider error:", error || "No code");
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=denied`
      );
    }

    try {
      await consumeUploaderXOAuthState({
        userId: session.userId,
        provider: "instagram",
        state,
      });
    } catch (stateError) {
      if (stateError instanceof UploaderXOAuthStateError) {
        return NextResponse.redirect(
          `${baseUrl}/dashboard/uploaderx?ig_error=invalid_state`
        );
      }

      throw stateError;
    }

    const appId = (process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID || "").trim();
    const appSecret = (process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "").trim();
    const redirectUri = `${baseUrl}/api/services/uploaderx/instagram/callback`;

    debugInstagramCallback("[IG Callback] Redirect URI prepared");

    // Step 1: Exchange code for short-lived Instagram access token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error_type || tokenData.error_message) {
      console.error("[Instagram OAuth] Token exchange error:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=token_exchange`
      );
    }

    const shortLivedToken = tokenData.access_token;
    const igUserId = String(tokenData.user_id);

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortLivedToken)}`
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token || shortLivedToken;

    // Step 3: Get Instagram user profile
    const meRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
    );
    const meData = await meRes.json();

    if (meData.error) {
      console.error("[Instagram OAuth] Profile fetch error:", meData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?ig_error=profile_fetch`
      );
    }

    const username = meData.username || "Unknown";
    const accountType = meData.account_type || "UNKNOWN";
    const profilePicture = meData.profile_picture_url || null;

    debugInstagramCallback("[IG Callback] Connected account", {
      accountType,
      hasUsername: !!username,
      hasUserId: !!igUserId,
    });

    // Step 4: Save to database
    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    await User.findOneAndUpdate(
      { clerkUserId: session.userId },
      {
        $set: {
          instagramTokens: {
            userAccessToken: accessToken,
            userId: igUserId,
            userName: username,
            accountType,
            accounts: [
              {
                instagramAccountId: igUserId,
                instagramUsername: username,
                profilePictureUrl: profilePicture,
              },
            ],
            connectedAt: new Date(),
          },
        },
      },
      { upsert: false }
    );

    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?ig_connected=true`
    );
  } catch (err) {
    console.error("[Instagram OAuth] Callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?ig_error=unknown`
    );
  }
}
