import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS LinkedIn publisher — SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Resolves the owner's stored LinkedIn token (refreshing if expired), then creates a TEXT post via
 * the LinkedIn REST posts API. Mirrors the text path of
 * app/api/services/uploaderx/linkedin/route.ts (createLinkedInRestPost) but keyed on
 * params.ownerUserId instead of auth().
 *
 * Per-user today: the token comes from User.linkedinTokens by ownerUserId. Per-brand (B-second)
 * swaps ONLY the token SOURCE to the brand's connected_social_account — same post call. Media
 * (image/video/document) is a later slice; v1 posts the caption/title text.
 */

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";

function linkedInRestHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_REST_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export async function publishToLinkedIn(params: PublishParams): Promise<PublishResult> {
  const text = (params.caption ?? params.title ?? "").trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!text) return { ok: false, error: "LinkedIn post text is empty", retryable: false };

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();
  const { User } = await import("@/schemas/user");

  const user = await User.findOne({
    clerkUserId: params.ownerUserId,
    linkedinTokens: { $exists: true, $ne: null },
  });
  if (!user?.linkedinTokens) {
    return { ok: false, error: "LinkedIn not connected for this owner", retryable: false };
  }

  const tokens = user.linkedinTokens;
  let accessToken: string = tokens.accessToken;
  let memberId: string | undefined = tokens.userId;

  // Resolve the member id (needed for a personal author URN) if missing.
  if (!memberId && !params.accountRef) {
    try {
      const meRes = await fetch("https://api.linkedin.com/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
      });
      if (meRes.ok) {
        memberId = (await meRes.json())?.id;
        if (memberId) {
          await User.updateOne(
            { clerkUserId: params.ownerUserId },
            { $set: { "linkedinTokens.userId": memberId } },
          );
        }
      }
    } catch (e) {
      console.warn("[calos-publish:linkedin] /v2/me lookup failed", e);
    }
  }

  // Refresh an expired token (mirrors the route's refresh).
  if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!tokens.refreshToken || !clientId || !clientSecret) {
      return { ok: false, error: "LinkedIn token expired and cannot refresh — reconnect required", retryable: false };
    }
    try {
      const refreshRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const refreshData = await refreshRes.json();
      if (!refreshRes.ok || !refreshData.access_token) {
        return { ok: false, error: "LinkedIn token refresh failed — reconnect required", retryable: false };
      }
      accessToken = refreshData.access_token;
      await User.updateOne(
        { clerkUserId: params.ownerUserId },
        {
          $set: {
            "linkedinTokens.accessToken": refreshData.access_token,
            "linkedinTokens.refreshToken": refreshData.refresh_token || tokens.refreshToken,
            "linkedinTokens.expiresAt": new Date(Date.now() + refreshData.expires_in * 1000),
          },
        },
      );
    } catch {
      return { ok: false, error: "LinkedIn token refresh error — reconnect required", retryable: true };
    }
  }

  // Author URN: accountRef = a LinkedIn organization id → org post; else personal member.
  let authorUrn: string;
  if (params.accountRef) {
    authorUrn = `urn:li:organization:${params.accountRef}`;
  } else if (memberId) {
    authorUrn = `urn:li:person:${memberId}`;
  } else {
    return { ok: false, error: "No LinkedIn author available (no member id, no accountRef)", retryable: false };
  }

  // Create the text post (LinkedIn REST posts API; mirrors createLinkedInRestPost's text path).
  try {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: linkedInRestHeaders(accessToken),
      body: JSON.stringify({
        author: authorUrn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    const bodyText = await res.text();
    let data: { error?: { message?: string }; message?: string; id?: string } = {};
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = {};
      }
    }
    if (!res.ok || data.error) {
      // 5xx / 429 = transient (safe to retry); 4xx = permanent (bad token / validation).
      const retryable = res.status >= 500 || res.status === 429;
      return {
        ok: false,
        error: `LinkedIn post failed (${res.status}): ${data.error?.message || data.message || bodyText || "unknown error"}`,
        retryable,
      };
    }
    const postId = res.headers.get("x-restli-id") || data.id;
    if (!postId) return { ok: false, error: "LinkedIn returned no post id", retryable: true };
    return { ok: true, postId, postUrl: `https://www.linkedin.com/feed/update/${postId}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LinkedIn post threw", retryable: true };
  }
}
