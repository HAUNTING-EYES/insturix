import { recordProviderCostEvent } from "@/lib/financials/provider-cost-events";
import type { PublishParams, PublishResult } from "./contract";
import { refreshLinkedInAccessToken } from "./linkedin-token-refresh";

/**
 * CalOS LinkedIn publisher — SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Token resolution is brand-assignment-only:
 *  - PER-BRAND: the brand must have a connected LinkedIn account (calos_connected_accounts). We
 *     use it — and NEVER fall back to the owner's personal account (posting a client's content from
 *     the wrong identity is the agency-killing failure). An existing-but-broken brand account fails
 *     loud (reconnect), it does not silently fall through. A brand account is one of two models:
 *     Model A (reference — resolve the assigning operator's live token) or Model B (the brand's own
 *     encrypted token). The author URN is built from the account's accountType (org page vs person).
 *
 * Then it creates a TEXT post via the LinkedIn REST posts API (mirrors the text path of
 * app/api/services/uploaderx/linkedin/route.ts createLinkedInRestPost). Media is a later slice.
 */

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";

type LinkedInAuth = { accessToken: string; authorUrn: string };
type AuthError = { error: string; retryable: boolean };
type LinkedInPublishResult = PublishResult & { responseStatus?: number };

function linkedInRestHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_REST_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export async function publishToLinkedIn(params: PublishParams): Promise<LinkedInPublishResult> {
  const text = (params.caption ?? params.title ?? "").trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false, providerAttempted: false };
  if (!params.brandId) return { ok: false, error: "LinkedIn publishing requires a brandId", retryable: false, providerAttempted: false };
  if (!text) return { ok: false, error: "LinkedIn post text is empty", retryable: false, providerAttempted: false };

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const brandAuth = await resolveBrandAccountAuth(params.brandId, params.accountRef);
  if ("error" in brandAuth) {
    return { ok: false, error: brandAuth.error, retryable: brandAuth.retryable, providerAttempted: false };
  }
  const result = await createLinkedInTextPost(brandAuth.accessToken, brandAuth.authorUrn, text);
  await recordCalosLinkedInPublishCost(params, result);
  return result;
}

/**
 * Per-brand auth. Missing or unusable assignments fail closed; there is no queue-owner fallback.
 *
 * Model A (no accessTokenEnc): resolve the assigning operator's live token (acct.ownerUserId) — the
 *   common case the assign flow writes (an operator binds a profile/page they control to a brand).
 * Model B (accessTokenEnc set): the brand's OWN encrypted token (a client connected its own login).
 */
async function resolveBrandAccountAuth(
  brandId: string,
  accountRef?: string | null,
): Promise<LinkedInAuth | AuthError> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "linkedin",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) {
    return { error: "No LinkedIn account assigned for this brand", retryable: false };
  }

  if (!acct.accountRef) {
    return { error: "Brand LinkedIn account has no author target (accountRef) — reconnect", retryable: false };
  }
  const authorUrn = buildAuthorUrn(acct.accountType, acct.accountRef);

  // Model B — the brand's own encrypted token.
  if (acct.accessTokenEnc) {
    const { decryptToken, encryptToken } = await import("./token-crypto");
    let accessToken: string | null;
    try {
      accessToken = decryptToken(acct.accessTokenEnc);
    } catch {
      return { error: "Brand LinkedIn token unreadable — reconnect the brand's LinkedIn", retryable: false };
    }
    if (!accessToken) {
      return { error: "Brand LinkedIn token unreadable — reconnect the brand's LinkedIn", retryable: false };
    }
    if (acct.expiresAt && new Date(acct.expiresAt).getTime() <= Date.now()) {
      let refreshToken: string | null;
      try {
        refreshToken = acct.refreshTokenEnc
          ? decryptToken(acct.refreshTokenEnc)
          : "";
      } catch {
        refreshToken = "";
      }
      if (!refreshToken) {
        return { error: "Brand LinkedIn token expired and cannot refresh — reconnect required", retryable: false };
      }
      const refreshed = await refreshLinkedInAccessToken(refreshToken);
      if (!refreshed.ok) return refreshed;
      try {
        const write = await CalosConnectedAccount.updateOne(
          {
            _id: acct._id,
            brandId,
            platform: "linkedin",
            accountRef: acct.accountRef,
          },
          {
            $set: {
              accessTokenEnc: encryptToken(refreshed.accessToken),
              refreshTokenEnc: encryptToken(refreshed.refreshToken),
              expiresAt: refreshed.expiresAt,
            },
          },
        );
        if (write.matchedCount !== 1) {
          return { error: "LinkedIn token refreshed but account persistence failed", retryable: true };
        }
      } catch (error) {
        console.error("[CALOS_LOUD] LinkedIn brand token persistence failed:", error);
        return { error: "LinkedIn token refreshed but account persistence failed", retryable: true };
      }
      accessToken = refreshed.accessToken;
    }
    return { accessToken, authorUrn };
  }

  // Model A — reference the assigning operator's live token.
  if (!acct.ownerUserId) {
    return { error: "Brand LinkedIn assignment has no token owner — reconnect", retryable: false };
  }
  const isPersonal = acct.accountType === "personal";
  const owner = await resolveOwnerLinkedInToken(acct.ownerUserId, isPersonal);
  if ("error" in owner) return owner;
  if (isPersonal && owner.memberId !== acct.accountRef) {
    return {
      error: "Assigned LinkedIn profile no longer matches the owner's connected profile — reassign it",
      retryable: false,
    };
  }
  return { accessToken: owner.accessToken, authorUrn };
}

/** Build a LinkedIn author URN from the stored account type (defaults to an organization page). */
function buildAuthorUrn(accountType: string | null | undefined, accountRef: string): string {
  return accountType === "personal"
    ? `urn:li:person:${accountRef}`
    : `urn:li:organization:${accountRef}`;
}

/**
 * Resolve a usable LinkedIn access token for an owner (clerkUserId) from User.linkedinTokens:
 * resolves the member id when needed and refreshes an expired token (with write-back).
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

  // Refresh before identity resolution so /v2/me never receives an expired credential.
  if (tokens.expiresAt && new Date(tokens.expiresAt).getTime() <= Date.now()) {
    const refreshed = await refreshLinkedInAccessToken(tokens.refreshToken || "");
    if (!refreshed.ok) return refreshed;
    try {
      await User.updateOne(
        { clerkUserId: ownerUserId },
        {
          $set: {
            "linkedinTokens.accessToken": refreshed.accessToken,
            "linkedinTokens.refreshToken": refreshed.refreshToken,
            "linkedinTokens.expiresAt": refreshed.expiresAt,
          },
        },
      );
    } catch (error) {
      console.error("[CALOS_LOUD] LinkedIn owner token persistence failed:", error);
      return { error: "LinkedIn token refreshed but account persistence failed", retryable: true };
    }
    accessToken = refreshed.accessToken;
  }

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
      // TODO(CALOS_LOUD): revert to warn once stable.
      console.error("[CALOS_LOUD] linkedin /v2/me lookup failed (no memberId → personal post may fail):", e);
    }
  }

  return { accessToken, memberId };
}

/** Create the text post (LinkedIn REST posts API; mirrors createLinkedInRestPost's text path). */
async function createLinkedInTextPost(
  accessToken: string,
  authorUrn: string,
  text: string,
): Promise<LinkedInPublishResult> {
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
        providerAttempted: true,
        responseStatus: res.status,
      };
    }
    const postId = res.headers.get("x-restli-id") || data.id;
    if (!postId) return { ok: false, error: "LinkedIn returned no post id", retryable: true, providerAttempted: true, responseStatus: res.status };
    return { ok: true, postId, postUrl: `https://www.linkedin.com/feed/update/${postId}`, providerAttempted: true, responseStatus: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LinkedIn post threw", retryable: true, providerAttempted: true };
  }
}

async function recordCalosLinkedInPublishCost(params: PublishParams, result: LinkedInPublishResult) {
  await recordProviderCostEvent({
    idempotencyKey:
      result.ok && result.postId
        ? `calos:linkedin:publish:${params.deliverableId}:${result.postId}`
        : undefined,
    status: result.ok ? "success" : "failed",
    userId: params.ownerUserId,
    projectId: params.brandId,
    taskId: params.deliverableId,
    service: "calos",
    action: "platform_publish",
    route: "lib/calos/publish/linkedin",
    provider: "linkedin-api",
    model: `linkedin-rest-${LINKEDIN_REST_API_VERSION}`,
    operation: "social_publish",
    providerJobId: result.postId,
    units: { requestCount: 1 },
    metadata: {
      platform: "linkedin",
      responseStatus: result.responseStatus,
      retryable: result.retryable,
      hasAccountRef: Boolean(params.accountRef),
      hasBrandId: Boolean(params.brandId),
    },
  });
}
