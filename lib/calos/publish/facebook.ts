import { recordProviderCostEvent } from "@/lib/financials/provider-cost-events";
import type { PublishParams, PublishResult } from "./contract";
import { resolveUserOAuthToken } from "./token-crypto";

/**
 * CalOS Facebook publisher - SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Facebook is Page-only for CalOS. A brand must have an explicit Facebook Page binding in
 * calos_connected_accounts; there is no personal-profile fallback and no "first page" default.
 * The page access token is resolved from the assigning owner's existing UploaderX connection:
 * User.facebookTokens.pages[].pageAccessToken.
 */

type FacebookPage = {
  pageId?: string;
  pageName?: string;
  pageAccessToken?: string;
};

type FacebookAuth =
  | { pageId: string; pageName?: string; pageAccessToken: string }
  | { error: string; retryable: boolean };
type FacebookPublishResult = PublishResult & { responseStatus?: number };

function graphVersion() {
  const raw = (process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0").trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export async function publishToFacebook(params: PublishParams): Promise<FacebookPublishResult> {
  const text = (params.caption ?? params.title ?? "").trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false, providerAttempted: false };
  if (!params.brandId) return { ok: false, error: "Facebook publishing requires a brandId", retryable: false, providerAttempted: false };
  if (!text) return { ok: false, error: "Facebook post text is empty", retryable: false, providerAttempted: false };

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandPageAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable, providerAttempted: false };

  const result = await createFacebookFeedPost(auth.pageId, auth.pageAccessToken, text);
  await recordCalosFacebookPublishCost(params, result);
  return result;
}

async function resolveBrandPageAuth(
  brandId: string,
  accountRef?: string | null,
): Promise<FacebookAuth> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "facebook",
    ...(accountRef ? { accountRef } : {}),
  });

  if (!acct) {
    return { error: "No Facebook Page assigned for this brand", retryable: false };
  }
  if (!acct.accountRef) {
    return { error: "Brand Facebook account has no Page id (accountRef) - reconnect", retryable: false };
  }

  const page = await resolveOwnerFacebookPageToken(acct.ownerUserId, acct.accountRef);
  if ("error" in page) return page;

  return {
    pageId: page.pageId,
    pageName: page.pageName,
    pageAccessToken: page.pageAccessToken,
  };
}

async function resolveOwnerFacebookPageToken(
  ownerUserId: string,
  pageId: string,
): Promise<FacebookAuth> {
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: ownerUserId })
    .select("facebookTokens")
    .lean<{
      facebookTokens?: {
        pages?: FacebookPage[];
      } | null;
    } | null>();

  const page = user?.facebookTokens?.pages?.find((item) => String(item.pageId) === String(pageId));
  if (!page) {
    return { error: "Assigned Facebook Page is no longer connected for this owner", retryable: false };
  }
  if (!page.pageAccessToken) {
    return { error: "Assigned Facebook Page token is missing - reconnect Facebook", retryable: false };
  }
  const pageAccessToken = resolveUserOAuthToken(page.pageAccessToken);
  if (!pageAccessToken) {
    return { error: "Assigned Facebook Page token is unreadable - reconnect Facebook", retryable: false };
  }

  return {
    pageId: String(page.pageId),
    pageName: page.pageName,
    pageAccessToken,
  };
}

async function createFacebookFeedPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
): Promise<FacebookPublishResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pageId)}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message,
        access_token: pageAccessToken,
      }),
    });

    const bodyText = await res.text();
    let data: { id?: string; error?: { message?: string }; message?: string } = {};
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = { message: bodyText };
      }
    }

    if (!res.ok || data.error) {
      const retryable = res.status >= 500 || res.status === 429;
      return {
        ok: false,
        error: `Facebook post failed (${res.status}): ${data.error?.message || data.message || bodyText || "unknown error"}`,
        retryable,
        providerAttempted: true,
        responseStatus: res.status,
      };
    }

    if (!data.id) return { ok: false, error: "Facebook returned no post id", retryable: true, providerAttempted: true, responseStatus: res.status };
    return { ok: true, postId: data.id, postUrl: `https://www.facebook.com/${data.id}`, providerAttempted: true, responseStatus: res.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Facebook post threw", retryable: true, providerAttempted: true };
  }
}

async function recordCalosFacebookPublishCost(params: PublishParams, result: FacebookPublishResult) {
  await recordProviderCostEvent({
    idempotencyKey:
      result.ok && result.postId
        ? `calos:facebook:publish:${params.deliverableId}:${result.postId}`
        : undefined,
    status: result.ok ? "success" : "failed",
    userId: params.ownerUserId,
    projectId: params.brandId,
    taskId: params.deliverableId,
    service: "calos",
    action: "platform_publish",
    route: "lib/calos/publish/facebook",
    provider: "meta-graph-api",
    model: `facebook-${graphVersion()}`,
    operation: "social_publish",
    providerJobId: result.postId,
    units: { requestCount: 1 },
    metadata: {
      platform: "facebook",
      responseStatus: result.responseStatus,
      retryable: result.retryable,
      hasAccountRef: Boolean(params.accountRef),
      hasBrandId: Boolean(params.brandId),
    },
  });
}
