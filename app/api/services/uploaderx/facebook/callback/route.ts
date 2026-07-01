import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import {
  consumeUploaderXOAuthState,
  UploaderXOAuthStateError,
} from "@/app/api/services/uploaderx/utils/oauth-state";

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
    const state = url.searchParams.get("state");

    if (error || !code) {
      console.error("[Facebook OAuth] Provider error:", error || "No code");
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=denied`
      );
    }

    try {
      await consumeUploaderXOAuthState({
        userId: session.userId,
        provider: "facebook",
        state,
      });
    } catch (stateError) {
      if (stateError instanceof UploaderXOAuthStateError) {
        return NextResponse.redirect(
          `${baseUrl}/dashboard/uploaderx?fb_error=invalid_state`
        );
      }

      throw stateError;
    }

    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;
    const redirectUri = `${baseUrl}/api/services/uploaderx/facebook/callback`;

    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("[Facebook OAuth] Token exchange error:", tokenData.error);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/uploaderx?fb_error=token_exchange`
      );
    }

    const shortToken = tokenData.access_token;

    const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();

    const userAccessToken = longData.access_token || shortToken;

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      console.error("[Facebook OAuth] Pages fetch error:", pagesData.error);
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

    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${userAccessToken}`
    );
    const meData = await meRes.json();

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
      { upsert: false }
    );

    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?fb_connected=true`
    );
  } catch (err) {
    console.error("[Facebook OAuth] Callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/uploaderx?fb_error=unknown`
    );
  }
}