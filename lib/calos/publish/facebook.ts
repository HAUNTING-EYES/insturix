import type { PublishParams, PublishResult } from "./contract";

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

function graphVersion() {
  const raw = (process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0").trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export async function publishToFacebook(params: PublishParams): Promise<PublishResult> {
  const text = (params.caption ?? params.title ?? "").trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!params.brandId) return { ok: false, error: "Facebook publishing requires a brandId", retryable: false };
  if (!text) return { ok: false, error: "Facebook post text is empty", retryable: false };

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandPageAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable };

  return createFacebookFeedPost(auth.pageId, auth.pageAccessToken, text);
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

  return {
    pageId: String(page.pageId),
    pageName: page.pageName,
    pageAccessToken: page.pageAccessToken,
  };
}

async function createFacebookFeedPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
): Promise<PublishResult> {
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
      };
    }

    if (!data.id) return { ok: false, error: "Facebook returned no post id", retryable: true };
    return { ok: true, postId: data.id, postUrl: `https://www.facebook.com/${data.id}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Facebook post threw", retryable: true };
  }
}