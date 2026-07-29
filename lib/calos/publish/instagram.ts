import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";
import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS Instagram publisher — SESSIONLESS (runs from the publish-queue cron, no Clerk session).
 *
 * Instagram has NO text-only posts: every post needs media. v1 here = a single IMAGE (the graphic
 * generated for the card, carried on the deliverable as assetUrl → params.imageUrl). If there's no
 * image, it fails loud (no silent empty post). Reels/video are a later slice (CalOS video = a script,
 * not a rendered video, so there's no video asset to post yet).
 *
 * Model A: a brand assigns an IG account it controls (calos_connected_accounts); we resolve the
 * assigning owner's instagramTokens.userAccessToken (Instagram Login flow → /me/media) — mirrors
 * app/api/services/uploaderx/instagram/route.ts. 2-step: create media container, then publish it.
 * The image URL MUST be publicly fetchable (Instagram fetches it server-side).
 */

type CalosInstagramCostOperation = "social_media_upload" | "social_publish";
type CalosInstagramCostPhase = "container_create" | "publish";

function graphVersion() {
  const raw = (process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0").trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}

const IG_API = `https://graph.instagram.com/${graphVersion()}`;
const IG_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type IgAuth = { userAccessToken: string } | { error: string; retryable: boolean };
type GraphResponse = { id?: string; error?: { message?: string } };
type InstagramTokenRecord = {
  userAccessToken?: string;
  userId?: string | number;
  accounts?: Array<{ instagramAccountId?: string | number }>;
  expiresAt?: Date | string | null;
};

export async function publishToInstagram(params: PublishParams): Promise<PublishResult> {
  const caption = (params.caption ?? params.title ?? "").trim();
  const imageUrl = params.imageUrl?.trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false, providerAttempted: false };
  if (!params.brandId) return { ok: false, error: "Instagram publishing requires a brandId", retryable: false, providerAttempted: false };
  if (!imageUrl) {
    return {
      ok: false,
      error: "Instagram requires an image — generate the card's graphic before approving",
      retryable: false,
      providerAttempted: false,
    };
  }

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandIgAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable, providerAttempted: false };

  return createInstagramImagePost(params, auth.userAccessToken, imageUrl, caption);
}

/**
 * Per-brand IG auth (Model A — reference the assigning owner's live Instagram token). IG's /me/media
 * posts to the account the token belongs to (Instagram Login = one token per IG account), so accountRef
 * records WHICH account was assigned; the token resolves the actual posting account.
 */
async function resolveBrandIgAuth(brandId: string, accountRef?: string | null): Promise<IgAuth> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "instagram",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) return { error: "No Instagram account assigned for this brand", retryable: false };
  if (!acct.accountRef) {
    return { error: "Brand Instagram assignment has no account id - reassign it", retryable: false };
  }
  if (!acct.ownerUserId) {
    return { error: "Brand Instagram assignment has no token owner - reconnect", retryable: false };
  }

  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: acct.ownerUserId })
    .select("instagramTokens")
    .lean<{ instagramTokens?: InstagramTokenRecord | null } | null>();
  const tokens = user?.instagramTokens;
  const token = tokens?.userAccessToken;
  if (!token) {
    return {
      error: "Assigned Instagram account is no longer connected for this owner — reconnect",
      retryable: false,
    };
  }

  const connectedAccountRefs = new Set<string>();
  if (tokens?.userId != null) connectedAccountRefs.add(String(tokens.userId));
  for (const account of tokens?.accounts ?? []) {
    if (account.instagramAccountId != null) {
      connectedAccountRefs.add(String(account.instagramAccountId));
    }
  }
  if (connectedAccountRefs.size === 0) {
    return {
      error: "Connected Instagram account identity cannot be verified - reconnect",
      retryable: false,
    };
  }
  if (!connectedAccountRefs.has(String(acct.accountRef))) {
    return {
      error: "Assigned Instagram account no longer matches the owner's connected account - reassign it",
      retryable: false,
    };
  }

  const expiresAt = tokens?.expiresAt ? new Date(tokens.expiresAt).getTime() : Number.NaN;
  if (!Number.isFinite(expiresAt)) {
    return { error: "Instagram token expiry cannot be verified - reconnect", retryable: false };
  }
  if (expiresAt <= Date.now()) {
    return { error: "Instagram token expired - reconnect", retryable: false };
  }
  if (expiresAt - Date.now() > IG_REFRESH_WINDOW_MS) return { userAccessToken: token };

  try {
    const query = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
    const response = await fetch(`https://graph.instagram.com/refresh_access_token?${query}`);
    const data: { access_token?: string; expires_in?: number; error?: { message?: string } } =
      await response.json().catch(() => ({}));
    const expiresIn = Number(data.expires_in);
    if (!response.ok || !data.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      const retryable = response.status === 429 || response.status >= 500;
      return { error: data.error?.message || "Instagram token refresh failed - reconnect", retryable };
    }
    const refreshedExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await User.updateOne(
      { clerkUserId: acct.ownerUserId, "instagramTokens.userAccessToken": token },
      { $set: {
        "instagramTokens.userAccessToken": data.access_token,
        "instagramTokens.expiresAt": refreshedExpiresAt,
      } },
    );
    return { userAccessToken: data.access_token };
  } catch (error) {
    return {
      error: error instanceof Error ? `Instagram token refresh failed: ${error.message}` : "Instagram token refresh failed",
      retryable: true,
    };
  }
}

/** Create the image media container, then publish it (mirrors the uploaderx IG direct-image path). */
async function createInstagramImagePost(
  params: PublishParams,
  userAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  let phase: CalosInstagramCostPhase = "container_create";
  let operation: CalosInstagramCostOperation = "social_media_upload";
  let responseStatus: number | undefined;
  let providerJobId: string | undefined;
  let providerAttempted = false;
  const hasImageSource = Boolean(imageUrl);
  const hasCaptionText = Boolean(caption);

  try {
    // 1) Create the media container.
    const containerParams = new URLSearchParams({ image_url: imageUrl, access_token: userAccessToken });
    if (caption) containerParams.set("caption", caption);
    const cRes = await fetch(`${IG_API}/me/media?${containerParams.toString()}`, { method: "POST" });
    responseStatus = cRes.status;
    const cData: GraphResponse = await cRes.json().catch(() => ({}));
    providerJobId = cData.id;
    if (!cRes.ok || cData.error || !cData.id) {
      const retryable = cRes.status >= 500 || cRes.status === 429;
      await recordCalosInstagramPublishCost(params, {
        status: "failed",
        operation,
        phase,
        responseStatus,
        providerJobId,
        retryable,
        hasImageSource,
        hasCaptionText,
      });
      return {
        ok: false,
        error: `Instagram container failed (${cRes.status}): ${cData.error?.message || "unknown error"}`,
        retryable,
        providerAttempted: false,
        responseStatus,
      };
    }

    await recordCalosInstagramPublishCost(params, {
      status: "success",
      operation,
      phase,
      responseStatus,
      providerJobId,
      hasImageSource,
      hasCaptionText,
    });

    // 2) Publish the container.
    phase = "publish";
    operation = "social_publish";
    responseStatus = undefined;
    providerJobId = undefined;
    const pubParams = new URLSearchParams({ creation_id: cData.id, access_token: userAccessToken });
    providerAttempted = true;
    const pRes = await fetch(`${IG_API}/me/media_publish?${pubParams.toString()}`, { method: "POST" });
    responseStatus = pRes.status;
    const pData: GraphResponse = await pRes.json().catch(() => ({}));
    providerJobId = pData.id;
    if (!pRes.ok || pData.error || !pData.id) {
      const retryable = pRes.status >= 500 || pRes.status === 429;
      await recordCalosInstagramPublishCost(params, {
        status: "failed",
        operation,
        phase,
        responseStatus,
        providerJobId,
        retryable,
        hasImageSource,
        hasCaptionText,
      });
      return {
        ok: false,
        error: `Instagram publish failed (${pRes.status}): ${pData.error?.message || "unknown error"}`,
        retryable,
        providerAttempted: true,
        responseStatus,
      };
    }

    await recordCalosInstagramPublishCost(params, {
      status: "success",
      operation,
      phase,
      responseStatus,
      providerJobId,
      hasImageSource,
      hasCaptionText,
    });

    return { ok: true, postId: pData.id, postUrl: `https://www.instagram.com/p/${pData.id}`, providerAttempted: true, responseStatus };
  } catch (e) {
    await recordCalosInstagramPublishCost(params, {
      status: "failed",
      operation,
      phase,
      responseStatus,
      providerJobId,
      retryable: true,
      hasImageSource,
      hasCaptionText,
      error: e,
    });
    return { ok: false, error: e instanceof Error ? e.message : "Instagram post threw", retryable: true, providerAttempted, responseStatus };
  }
}

async function recordCalosInstagramPublishCost(params: PublishParams, input: {
  status: ProviderCostEventStatus;
  operation: CalosInstagramCostOperation;
  phase: CalosInstagramCostPhase;
  responseStatus?: number;
  providerJobId?: string;
  retryable?: boolean;
  hasImageSource: boolean;
  hasCaptionText: boolean;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.providerJobId
        ? `calos:instagram:${input.phase}:${params.deliverableId}:${input.providerJobId}`
        : undefined,
    status: input.status,
    userId: params.ownerUserId,
    projectId: params.brandId,
    taskId: params.deliverableId,
    service: "calos",
    action: "platform_publish",
    route: "lib/calos/publish/instagram",
    provider: "instagram-graph-api",
    model: `instagram-${graphVersion()}`,
    operation: input.operation,
    providerJobId: input.providerJobId,
    units: { requestCount: 1 },
    metadata: {
      platform: "instagram",
      phase: input.phase,
      responseStatus: input.responseStatus,
      retryable: input.retryable,
      hasProviderJobId: Boolean(input.providerJobId),
      hasAccountRef: Boolean(params.accountRef),
      hasBrandId: Boolean(params.brandId),
      hasImageSource: input.hasImageSource,
      hasCaptionText: input.hasCaptionText,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
