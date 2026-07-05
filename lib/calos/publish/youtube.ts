import { clerkClient } from "@clerk/nextjs/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { recordProviderCostEvent } from "@/lib/financials/provider-cost-events";
import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS YouTube publisher - sessionless brand publish path.
 *
 * Producer path: the Publishing UI assigns a CalOSConnectedAccount row for brand + youtube.
 * Decision owner/source of truth: that row's ownerUserId points to the Clerk user who connected
 * Google/YouTube. Final consumer: this publisher asks Clerk for that owner's Google OAuth access
 * token at publish time, then streams the card video into youtube.videos.insert.
 */

type YtAuth = { accessToken: string; channelId?: string | null } | { error: string; retryable: boolean };
type YtPublishResult = PublishResult & { providerAttempted?: boolean; responseStatus?: number };
type ClerkExternalAccount = { provider?: string | null };

export async function publishToYouTube(params: PublishParams): Promise<PublishResult> {
  const title = (params.title ?? params.caption ?? "").trim();
  const description = (params.caption ?? "").trim();
  const videoUrl = params.imageUrl?.trim();

  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!params.brandId) return { ok: false, error: "YouTube publishing requires a brandId", retryable: false };
  if (!videoUrl) {
    return {
      ok: false,
      error: "YouTube requires a video - attach a video to the card before approving",
      retryable: false,
    };
  }

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandYtAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable };

  const result = await uploadVideo(auth.accessToken, videoUrl, title || "Untitled", description);
  if (result.providerAttempted) await recordCalosYouTubePublishCost(params, result);
  return result;
}

/** Per-brand YouTube auth (Model A): token from the assigning owner's Clerk Google connection. */
async function resolveBrandYtAuth(brandId: string, accountRef?: string | null): Promise<YtAuth> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "youtube",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) return { error: "No YouTube channel assigned for this brand", retryable: false };

  const ownerUserId = typeof acct.ownerUserId === "string" ? acct.ownerUserId : "";
  if (!ownerUserId) {
    return { error: "Cannot resolve the YouTube channel owner - reconnect", retryable: false };
  }

  try {
    const client = await clerkClient();
    const owner = await client.users.getUser(ownerUserId);
    const googleAccount = (owner.externalAccounts as unknown as ClerkExternalAccount[] | undefined)?.find(
      (account) => account.provider?.includes("google"),
    );
    if (!googleAccount?.provider) {
      return { error: "Assigned YouTube channel is no longer connected for this owner - reconnect", retryable: false };
    }

    const tokenResponse = await client.users.getUserOauthAccessToken(ownerUserId, googleAccount.provider as any);
    const accessToken = tokenResponse.data?.[0]?.token;
    if (!accessToken) {
      return { error: "Assigned YouTube channel has no usable OAuth token - reconnect", retryable: false };
    }

    return { accessToken, channelId: acct.accountRef };
  } catch (e) {
    const message = e instanceof Error && e.message ? `: ${e.message}` : "";
    return { error: `Assigned YouTube channel token lookup failed${message}`, retryable: false };
  }
}

/** Stream the video URL into youtube.videos.insert (public). Fails loud on fetch/API errors. */
async function uploadVideo(
  accessToken: string,
  videoUrl: string,
  title: string,
  description: string,
): Promise<YtPublishResult> {
  let providerCallStarted = false;
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      const retryable = videoRes.status >= 500 || videoRes.status === 429;
      return { ok: false, error: `Could not fetch the card's video (${videoRes.status})`, retryable, providerAttempted: false };
    }
    const body = Readable.fromWeb(videoRes.body as Parameters<typeof Readable.fromWeb>[0]);

    providerCallStarted = true;
    const insert = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "public" },
      },
      media: { body },
    });

    const responseStatus = insert.status;
    const id = insert.data.id;
    if (!id) {
      return { ok: false, error: "YouTube returned no video id", retryable: true, providerAttempted: true, responseStatus };
    }
    return { ok: true, postId: id, postUrl: `https://www.youtube.com/watch?v=${id}`, providerAttempted: true, responseStatus };
  } catch (e) {
    const err = e as { code?: number; response?: { status?: number }; message?: string };
    const status = err.response?.status ?? err.code;
    const retryable = typeof status === "number" && (status >= 500 || status === 429);
    return {
      ok: false,
      error: `YouTube upload failed: ${err.message || "unknown error"}`,
      retryable,
      providerAttempted: providerCallStarted,
      responseStatus: typeof status === "number" ? status : undefined,
    };
  }
}

async function recordCalosYouTubePublishCost(params: PublishParams, result: YtPublishResult) {
  await recordProviderCostEvent({
    idempotencyKey:
      result.ok && result.postId
        ? `calos:youtube:publish:${params.deliverableId}:${result.postId}`
        : undefined,
    status: result.ok ? "success" : "failed",
    userId: params.ownerUserId,
    projectId: params.brandId,
    taskId: params.deliverableId,
    service: "calos",
    action: "platform_publish",
    route: "lib/calos/publish/youtube",
    provider: "youtube-data-api",
    model: "youtube-v3",
    operation: "social_publish",
    providerJobId: result.postId,
    units: { requestCount: 1 },
    metadata: {
      platform: "youtube",
      responseStatus: result.responseStatus,
      retryable: result.retryable,
      hasAccountRef: Boolean(params.accountRef),
      hasBrandId: Boolean(params.brandId),
    },
  });
}