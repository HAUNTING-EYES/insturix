import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import {
  consumeUploaderXOAuthState,
  UploaderXOAuthStateError,
} from "@/app/api/services/uploaderx/utils/oauth-state";
import {
  FACEBOOK_GRAPH_TIMEOUT_MS,
  facebookGraphApiUrl,
} from "@/lib/uploaderx/facebook-graph";
import { encryptUserOAuthToken } from "@/lib/calos/publish/token-crypto";

type FacebookGraphPayload = Record<string, unknown> & {
  error?: unknown;
};

type FacebookGraphResult = {
  data: FacebookGraphPayload | null;
  ok: boolean;
  status: number | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSeconds(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dashboardRedirect(baseUrl: string, key: "fb_connected" | "fb_error", value: string) {
  const redirectUrl = new URL("/dashboard/uploaderx", baseUrl);
  redirectUrl.searchParams.set(key, value);
  return NextResponse.redirect(redirectUrl);
}

async function fetchFacebookJson(
  url: URL,
  init: RequestInit = {},
): Promise<FacebookGraphResult> {
  try {
    const response = await fetch(url.toString(), {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(FACEBOOK_GRAPH_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null) as FacebookGraphPayload | null;
    return {
      data,
      ok: response.ok && data !== null && !data.error,
      status: response.status,
    };
  } catch (error) {
    console.error("[Facebook OAuth] Graph request failed:", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return { data: null, ok: false, status: null };
  }
}

export async function GET(req: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!baseUrl) {
    console.error("[Facebook OAuth] Missing NEXT_PUBLIC_APP_URL");
    return NextResponse.json(
      { error: "Facebook connection is not configured" },
      { status: 503 },
    );
  }

  try {
    const session = await auth();

    if (!session.userId) {
      return dashboardRedirect(baseUrl, "fb_error", "unauthorized");
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    if (error || !code) {
      console.error("[Facebook OAuth] Provider error:", error || "No code");
      return dashboardRedirect(baseUrl, "fb_error", "denied");
    }

    try {
      await consumeUploaderXOAuthState({
        userId: session.userId,
        provider: "facebook",
        state,
      });
    } catch (stateError) {
      if (stateError instanceof UploaderXOAuthStateError) {
        return dashboardRedirect(baseUrl, "fb_error", "invalid_state");
      }

      throw stateError;
    }

    const appId = process.env.FACEBOOK_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      console.error("[Facebook OAuth] Missing app credentials");
      return dashboardRedirect(baseUrl, "fb_error", "configuration");
    }

    const redirectUri = `${baseUrl}/api/services/uploaderx/facebook/callback`;

    const tokenUrl = facebookGraphApiUrl("oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResult = await fetchFacebookJson(tokenUrl);
    const shortToken = text(tokenResult.data?.access_token);
    if (!tokenResult.ok || !shortToken) {
      console.error("[Facebook OAuth] Short token exchange failed:", {
        status: tokenResult.status,
      });
      return dashboardRedirect(baseUrl, "fb_error", "token_exchange");
    }

    const longUrl = facebookGraphApiUrl("oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const longResult = await fetchFacebookJson(longUrl);
    const userAccessToken = text(longResult.data?.access_token);
    if (!longResult.ok || !userAccessToken) {
      console.error("[Facebook OAuth] Long token exchange failed:", {
        status: longResult.status,
      });
      return dashboardRedirect(baseUrl, "fb_error", "token_exchange");
    }

    const pagesResult = await fetchFacebookJson(
      facebookGraphApiUrl("me/accounts"),
      { headers: { Authorization: `Bearer ${userAccessToken}` } },
    );
    const rawPages = pagesResult.data?.data;
    if (!pagesResult.ok || !Array.isArray(rawPages)) {
      console.error("[Facebook OAuth] Page discovery failed:", {
        status: pagesResult.status,
      });
      return dashboardRedirect(baseUrl, "fb_error", "pages_fetch");
    }

    const pages = rawPages.map((value) => {
      const page = value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
      return {
        pageId: text(page.id),
        pageName: text(page.name),
        pageAccessToken: text(page.access_token),
      };
    });
    if (pages.some((page) => !page.pageId || !page.pageName || !page.pageAccessToken)) {
      console.error("[Facebook OAuth] Page discovery returned incomplete credentials");
      return dashboardRedirect(baseUrl, "fb_error", "pages_fetch");
    }

    const profileResult = await fetchFacebookJson(
      facebookGraphApiUrl("me"),
      { headers: { Authorization: `Bearer ${userAccessToken}` } },
    );
    const userId = text(profileResult.data?.id);
    const userName = text(profileResult.data?.name);
    if (!profileResult.ok || !userId || !userName) {
      console.error("[Facebook OAuth] Profile lookup failed:", {
        status: profileResult.status,
      });
      return dashboardRedirect(baseUrl, "fb_error", "profile_fetch");
    }

    const expiresInSeconds = positiveSeconds(longResult.data?.expires_in);
    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1_000)
      : undefined;

    let storedUserAccessToken: string;
    let storedPages: typeof pages;
    try {
      storedUserAccessToken = encryptUserOAuthToken(userAccessToken);
      storedPages = pages.map((page) => ({
        ...page,
        pageAccessToken: encryptUserOAuthToken(page.pageAccessToken),
      }));
    } catch (encryptionError) {
      console.error("[Facebook OAuth] Credential encryption failed:", {
        error: encryptionError instanceof Error ? encryptionError.message : "unknown error",
      });
      return dashboardRedirect(baseUrl, "fb_error", "persistence");
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const updatedUser = await User.findOneAndUpdate(
      { clerkUserId: session.userId },
      {
        $set: {
          facebookTokens: {
            userAccessToken: storedUserAccessToken,
            userId,
            userName,
            pages: storedPages,
            expiresAt,
            connectedAt: new Date(),
          },
        },
      },
      { upsert: false },
    );
    if (!updatedUser) {
      console.error("[Facebook OAuth] User record missing during token persistence");
      return dashboardRedirect(baseUrl, "fb_error", "persistence");
    }

    return dashboardRedirect(baseUrl, "fb_connected", "true");
  } catch (err) {
    console.error("[Facebook OAuth] Callback error:", err);
    return dashboardRedirect(baseUrl, "fb_error", "unknown");
  }
}
