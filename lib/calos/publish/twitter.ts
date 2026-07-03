import { recordProviderCostEvent } from "@/lib/financials/provider-cost-events";
import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS X (Twitter) publisher — SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Text post (v1). Model A: a brand assigns an X account it controls (calos_connected_accounts); we
 * resolve the assigning owner's twitterTokens (OAuth2 user-context), refresh if expired (write-back),
 * and POST /2/tweets. Mirrors app/api/services/uploaderx/twitter/route.ts.
 *
 * No silent truncation: if the text exceeds the account's limit, X rejects it and we fail loud. (A
 * Premium account allows 25k chars, a standard one 280 — so we never hardcode a wrong limit, we let X
 * validate and surface the real error.) Media tweets are a later slice.
 */

type XAuth = { accessToken: string; userName?: string | null } | { error: string; retryable: boolean };
type XPublishResult = PublishResult & { responseStatus?: number };
type XTokens = {
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  userName?: string;
  expiresAt?: Date | string | null;
};

export async function publishToTwitter(params: PublishParams): Promise<PublishResult> {
  const text = (params.caption ?? params.title ?? "").trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!params.brandId) return { ok: false, error: "X publishing requires a brandId", retryable: false };
  if (!text) return { ok: false, error: "X post text is empty", retryable: false };

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandXAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable };

  const result = await createTweet(auth.accessToken, auth.userName, text);
  await recordCalosXPublishCost(params, result);
  return result;
}

/** Per-brand X auth (Model A — reference the assigning owner's live token). */
async function resolveBrandXAuth(brandId: string, accountRef?: string | null): Promise<XAuth> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "twitter",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) return { error: "No X account assigned for this brand", retryable: false };
  return resolveOwnerXToken(acct.ownerUserId);
}

/** Resolve the owner's X token from User.twitterTokens, refreshing (with write-back) if expired. */
async function resolveOwnerXToken(ownerUserId: string): Promise<XAuth> {
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({
    clerkUserId: ownerUserId,
    twitterTokens: { $exists: true, $ne: null },
  });
  const tokens = user?.twitterTokens as XTokens | undefined;
  if (!tokens?.accessToken) {
    return { error: "X not connected for this owner — reconnect the brand's X account", retryable: false };
  }

  let accessToken = tokens.accessToken;
  const expired = !tokens.expiresAt || new Date(tokens.expiresAt) < new Date();
  if (expired) {
    if (!tokens.refreshToken) {
      return { error: "X token expired and cannot refresh — reconnect", retryable: false };
    }
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { error: "X client credentials not configured (TWITTER_CLIENT_ID/SECRET)", retryable: false };
    }
    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }),
      });
      const data = await res.json();
      if (res.status !== 200 || data.error || !data.access_token) {
        return { error: "X token refresh failed — reconnect", retryable: false };
      }
      accessToken = data.access_token;
      await User.updateOne(
        { clerkUserId: ownerUserId },
        {
          $set: {
            "twitterTokens.accessToken": data.access_token,
            "twitterTokens.refreshToken": data.refresh_token || tokens.refreshToken,
            "twitterTokens.expiresAt": new Date(Date.now() + data.expires_in * 1000),
          },
        },
      );
    } catch {
      return { error: "X token refresh error — reconnect", retryable: true };
    }
  }

  return { accessToken, userName: tokens.userName };
}

/** POST /2/tweets (text). Fails loud on any X error (incl. over-length) — no silent truncation. */
async function createTweet(
  accessToken: string,
  userName: string | null | undefined,
  text: string,
): Promise<XPublishResult> {
  try {
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data: {
      data?: { id?: string };
      errors?: Array<{ message?: string }>;
      detail?: string;
      title?: string;
    } = await res.json().catch(() => ({}));

    const id = data?.data?.id;
    if (!res.ok || data.errors || !id) {
      const retryable = res.status >= 500 || res.status === 429;
      const msg = data.detail || data.errors?.[0]?.message || data.title || res.statusText || "unknown error";
      return { ok: false, error: `X post failed (${res.status}): ${msg}`, retryable, responseStatus: res.status };
    }

    const url = userName ? `https://x.com/${userName}/status/${id}` : `https://x.com/i/web/status/${id}`;
    return { ok: true, postId: id, postUrl: url, responseStatus: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "X post threw", retryable: true };
  }
}

async function recordCalosXPublishCost(params: PublishParams, result: XPublishResult) {
  await recordProviderCostEvent({
    idempotencyKey:
      result.ok && result.postId
        ? `calos:twitter:publish:${params.deliverableId}:${result.postId}`
        : undefined,
    status: result.ok ? "success" : "failed",
    userId: params.ownerUserId,
    projectId: params.brandId,
    taskId: params.deliverableId,
    service: "calos",
    action: "platform_publish",
    route: "lib/calos/publish/twitter",
    provider: "x-api",
    model: "twitter-v2",
    operation: "social_publish",
    providerJobId: result.postId,
    units: { requestCount: 1 },
    metadata: {
      platform: "twitter",
      responseStatus: result.responseStatus,
      retryable: result.retryable,
      hasAccountRef: Boolean(params.accountRef),
      hasBrandId: Boolean(params.brandId),
    },
  });
}