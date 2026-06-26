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

const IG_API = `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0"}`;

type IgAuth = { userAccessToken: string } | { error: string; retryable: boolean };
type GraphResponse = { id?: string; error?: { message?: string } };

export async function publishToInstagram(params: PublishParams): Promise<PublishResult> {
  const caption = (params.caption ?? params.title ?? "").trim();
  const imageUrl = params.imageUrl?.trim();
  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!params.brandId) return { ok: false, error: "Instagram publishing requires a brandId", retryable: false };
  if (!imageUrl) {
    return {
      ok: false,
      error: "Instagram requires an image — generate the card's graphic before approving",
      retryable: false,
    };
  }

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandIgAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable };

  return createInstagramImagePost(auth.userAccessToken, imageUrl, caption);
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

  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: acct.ownerUserId })
    .select("instagramTokens")
    .lean<{ instagramTokens?: { userAccessToken?: string } | null } | null>();
  const token = user?.instagramTokens?.userAccessToken;
  if (!token) {
    return {
      error: "Assigned Instagram account is no longer connected for this owner — reconnect",
      retryable: false,
    };
  }
  return { userAccessToken: token };
}

/** Create the image media container, then publish it (mirrors the uploaderx IG direct-image path). */
async function createInstagramImagePost(
  userAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  try {
    // 1) Create the media container.
    const containerParams = new URLSearchParams({ image_url: imageUrl, access_token: userAccessToken });
    if (caption) containerParams.set("caption", caption);
    const cRes = await fetch(`${IG_API}/me/media?${containerParams.toString()}`, { method: "POST" });
    const cData: GraphResponse = await cRes.json().catch(() => ({}));
    if (!cRes.ok || cData.error || !cData.id) {
      const retryable = cRes.status >= 500 || cRes.status === 429;
      return {
        ok: false,
        error: `Instagram container failed (${cRes.status}): ${cData.error?.message || "unknown error"}`,
        retryable,
      };
    }

    // 2) Publish the container.
    const pubParams = new URLSearchParams({ creation_id: cData.id, access_token: userAccessToken });
    const pRes = await fetch(`${IG_API}/me/media_publish?${pubParams.toString()}`, { method: "POST" });
    const pData: GraphResponse = await pRes.json().catch(() => ({}));
    if (!pRes.ok || pData.error || !pData.id) {
      const retryable = pRes.status >= 500 || pRes.status === 429;
      return {
        ok: false,
        error: `Instagram publish failed (${pRes.status}): ${pData.error?.message || "unknown error"}`,
        retryable,
      };
    }

    return { ok: true, postId: pData.id, postUrl: `https://www.instagram.com/p/${pData.id}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Instagram post threw", retryable: true };
  }
}
