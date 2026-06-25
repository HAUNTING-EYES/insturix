import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS LinkedIn publisher — SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Token resolution is two-tier:
 *  1. PER-BRAND: if the brand has its own connected LinkedIn account (calos_connected_accounts),
 *     use it — and NEVER fall back to the owner's personal account (posting a client's content from
 *     the wrong identity is the agency-killing failure). An existing-but-broken brand account fails
 *     loud (reconnect), it does not silently fall through. A brand account is one of two models:
 *     Model A (reference — resolve the assigning operator's live token) or Model B (the brand's own
 *     encrypted token). The author URN is built from the account's accountType (org page vs person).
 *  2. PER-USER fallback: the owner's own User.linkedinTokens (the original behavior; what a solo
 *     business / a brand without its own connected account uses).
 *
 * Then it creates a TEXT post via the LinkedIn REST posts API (mirrors the text path of
 * app/api/services/uploaderx/linkedin/route.ts createLinkedInRestPost). Media is a later slice.
 */

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";

type LinkedInAuth = { accessToken: string; authorUrn: string };
type AuthError = { error: string; retryable: boolean };

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

  // Per-brand first — if a brand account exists, it is authoritative (no fallback = isolation).
  const brandAuth = params.brandId
    ? await resolveBrandAccountAuth(params.brandId, params.accountRef)
    : null;
  if (brandAuth && "error" in brandAuth) return { ok: false, error: brandAuth.error, retryable: brandAuth.retryable };
  if (brandAuth) return createLinkedInTextPost(brandAuth.accessToken, brandAuth.authorUrn, text);

  // Per-user fallback (the brand has no connected account of its own).
  const userAuth = await resolveUserAuth(params);
  if ("error" in userAuth) return { ok: false, error: userAuth.error, retryable: userAuth.retryable };
  return createLinkedInTextPost(userAuth.accessToken, userAuth.authorUrn, text);
}

/**
 * Per-brand auth. null = no connected account for this brand (caller falls back to the user token).
 * A connected account that exists but is unusable returns an error (no silent fallthrough).
 *
 * Model A (no accessTokenEnc): resolve the assigning operator's live token (acct.ownerUserId) — the
 *   common case the assign flow writes (an operator binds a profile/page they control to a brand).
 * Model B (accessTokenEnc set): the brand's OWN encrypted token (a client connected its own login).
 */
async function resolveBrandAccountAuth(
  brandId: string,
  accountRef?: string | null,
): Promise<LinkedInAuth | AuthError | null> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "linkedin",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) return null;

  if (!acct.accountRef) {
    return { error: "Brand LinkedIn account has no author target (accountRef) — reconnect", retryable: false };
  }
  const authorUrn = buildAuthorUrn(acct.accountType, acct.accountRef);

  // Model B — the brand's own encrypted token.
  if (acct.accessTokenEnc) {
    const { decryptToken } = await import("./token-crypto");
    const accessToken = decryptToken(acct.accessTokenEnc);
    if (!accessToken) {
      return { error: "Brand LinkedIn token unreadable — reconnect the brand's LinkedIn", retryable: false };
    }
    if (acct.expiresAt && new Date(acct.expiresAt) < new Date()) {
      // Refresh-write-back for own-token brand accounts is a follow-up; until then expired = reconnect.
      return { error: "Brand LinkedIn token expired — reconnect the brand's LinkedIn", retryable: false };
    }
    return { accessToken, authorUrn };
  }

  // Model A — reference the assigning operator's live token (refreshes via the per-user path).
  const owner = await resolveOwnerLinkedInToken(acct.ownerUserId, false);
  if ("error" in owner) return owner;
  return { accessToken: owner.accessToken, authorUrn };
}

/** Build a LinkedIn author URN from the stored account type (defaults to an organization page). */
function buildAuthorUrn(accountType: string | null | undefined, accountRef: string): string {
  return accountType === "personal"
    ? `urn:li:person:${accountRef}`
    : `urn:li:organization:${accountRef}`;
}

/** Per-user auth: the owner's own connected LinkedIn (User.linkedinTokens), refreshing if expired. */
async function resolveUserAuth(params: PublishParams): Promise<LinkedInAuth | AuthError> {
  // Need the member id only for a personal post (no org accountRef given).
  const owner = await resolveOwnerLinkedInToken(params.ownerUserId, !params.accountRef);
  if ("error" in owner) return owner;
  // Author URN: accountRef = a LinkedIn organization id → org post; else personal member.
  if (params.accountRef) return { accessToken: owner.accessToken, authorUrn: `urn:li:organization:${params.accountRef}` };
  if (owner.memberId) return { accessToken: owner.accessToken, authorUrn: `urn:li:person:${owner.memberId}` };
  return { error: "No LinkedIn author available (no member id, no accountRef)", retryable: false };
}

/**
 * Resolve a usable LinkedIn access token for an owner (clerkUserId) from User.linkedinTokens:
 * resolves the member id when needed and refreshes an expired token (with write-back). Shared by the
 * per-user path and Model-A brand accounts so both refresh through one place.
 */
async function resolveOwnerLinkedInToken(
  ownerUserId: string,
  needMemberId: boolean,
): Promise<{ accessToken: string; memberId?: string } | AuthError> {
  const { User } = await import("@/schemas/user");

  const user = await User.findOne({
    clerkUserId: ownerUserId,
    linkedinTokens: { $exists: true, $ne: null },
  });
  if (!user?.linkedinTokens) {
    return { error: "LinkedIn not connected for this owner", retryable: false };
  }

  const tokens = user.linkedinTokens;
  let accessToken: string = tokens.accessToken;
  let memberId: string | undefined = tokens.userId;

  // Resolve the member id (for a personal author URN) if missing.
  if (needMemberId && !memberId) {
    try {
      const meRes = await fetch("https://api.linkedin.com/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
      });
      if (meRes.ok) {
        memberId = (await meRes.json())?.id;
        if (memberId) {
          await User.updateOne(
            { clerkUserId: ownerUserId },
            { $set: { "linkedinTokens.userId": memberId } },
          );
        }
      }
    } catch (e) {
      console.warn("[calos-publish:linkedin] /v2/me lookup failed", e);
    }
  }

  // Refresh an expired token.
  if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!tokens.refreshToken || !clientId || !clientSecret) {
      return { error: "LinkedIn token expired and cannot refresh — reconnect required", retryable: false };
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
        return { error: "LinkedIn token refresh failed — reconnect required", retryable: false };
      }
      accessToken = refreshData.access_token;
      await User.updateOne(
        { clerkUserId: ownerUserId },
        {
          $set: {
            "linkedinTokens.accessToken": refreshData.access_token,
            "linkedinTokens.refreshToken": refreshData.refresh_token || tokens.refreshToken,
            "linkedinTokens.expiresAt": new Date(Date.now() + refreshData.expires_in * 1000),
          },
        },
      );
    } catch {
      return { error: "LinkedIn token refresh error — reconnect required", retryable: true };
    }
  }

  return { accessToken, memberId };
}

/** Create the text post (LinkedIn REST posts API; mirrors createLinkedInRestPost's text path). */
async function createLinkedInTextPost(
  accessToken: string,
  authorUrn: string,
  text: string,
): Promise<PublishResult> {
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
