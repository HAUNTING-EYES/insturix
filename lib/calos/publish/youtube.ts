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

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const YOUTUBE_CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true&maxResults=2";
const YOUTUBE_IDENTITY_TIMEOUT_MS = 8_000;

type YtAuth = { accessToken: string; channelId: string } | { error: string; retryable: boolean };
type YtPublishResult = PublishResult & { providerAttempted?: boolean; responseStatus?: number };
type ClerkExternalAccount = {
  id?: string | null;
  externalAccountId?: string | null;
  provider?: string | null;
  approvedScopes?: string | string[] | null;
  verification?: { strategy?: string | null } | null;
};
type ClerkOauthToken = {
  token?: string | null;
  externalAccountId?: string | null;
};

export type YouTubeOwnedChannel = {
  accountRef: string;
  displayName: string;
  accessToken: string;
};

export type YouTubeChannelResolution =
  | { ok: true; channels: YouTubeOwnedChannel[] }
  | {
      ok: false;
      state: "attention" | "reconnect";
      error: string;
      retryable: boolean;
    };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasYouTubeUploadScope(account: ClerkExternalAccount): boolean {
  const scopes = account.approvedScopes;
  if (Array.isArray(scopes)) return scopes.includes(YOUTUBE_UPLOAD_SCOPE);
  return text(scopes).split(/[\s,]+/).includes(YOUTUBE_UPLOAD_SCOPE);
}

function isGoogleAccount(account: ClerkExternalAccount): boolean {
  return (
    text(account.provider).includes("google") ||
    account.verification?.strategy === "oauth_google"
  );
}

function reconnect(error: string): YouTubeChannelResolution {
  return { ok: false, state: "reconnect", error, retryable: false };
}

function attention(error: string, retryable = true): YouTubeChannelResolution {
  return { ok: false, state: "attention", error, retryable };
}

async function loadAuthenticatedChannel(
  accessToken: string,
): Promise<YouTubeChannelResolution> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOUTUBE_IDENTITY_TIMEOUT_MS);
  try {
    const response = await fetch(YOUTUBE_CHANNELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return reconnect(
          "Assigned YouTube channel authorization is no longer valid. Reconnect before publishing.",
        );
      }
      const retryable = response.status === 429 || response.status >= 500;
      return attention(
        `YouTube channel could not be verified (${response.status}). Try again before publishing.`,
        retryable,
      );
    }

    const payload = await response.json().catch(() => null) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>;
    } | null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length !== 1 || !text(items[0]?.id)) {
      return reconnect(
        "The connected Google account does not resolve to one YouTube channel. Reconnect the intended channel.",
      );
    }

    return {
      ok: true,
      channels: [{
        accountRef: text(items[0].id),
        displayName: text(items[0].snippet?.title) || "YouTube channel",
        accessToken,
      }],
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return attention(
      timedOut
        ? "YouTube channel verification timed out. Try again before publishing."
        : "YouTube channel could not be verified. Try again before publishing.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves the exact YouTube channel(s) controlled by a Clerk user's Google OAuth tokens.
 * Token-to-account correlation happens before YouTube is called; tokens never leave this module.
 */
export async function resolveOwnerYouTubeChannels(
  ownerUserId: string,
): Promise<YouTubeChannelResolution> {
  if (!text(ownerUserId)) return reconnect("YouTube channel owner is missing. Reconnect before publishing.");

  try {
    const client = await clerkClient();
    const owner = await client.users.getUser(ownerUserId);
    const googleAccounts = (
      owner.externalAccounts as unknown as ClerkExternalAccount[] | undefined
    )?.filter((account) => isGoogleAccount(account) && hasYouTubeUploadScope(account)) ?? [];
    if (googleAccounts.length === 0) {
      return reconnect(
        "Assigned YouTube channel is no longer connected with upload access. Reconnect before publishing.",
      );
    }

    const tokensByProvider = new Map<string, ClerkOauthToken[]>();
    for (const provider of new Set(googleAccounts.map((account) => text(account.provider)).filter(Boolean))) {
      const response = await client.users.getUserOauthAccessToken(ownerUserId, provider as never);
      tokensByProvider.set(provider, response.data as unknown as ClerkOauthToken[]);
    }

    const channelLookups: Array<Promise<YouTubeChannelResolution>> = [];
    for (const account of googleAccounts) {
      const accountIds = new Set(
        [text(account.id), text(account.externalAccountId)].filter(Boolean),
      );
      const token = (tokensByProvider.get(text(account.provider)) ?? []).find(
        (candidate) =>
          accountIds.has(text(candidate.externalAccountId)) && Boolean(text(candidate.token)),
      );
      if (token?.token) channelLookups.push(loadAuthenticatedChannel(token.token));
    }
    if (channelLookups.length === 0) {
      return reconnect(
        "Assigned YouTube channel has no usable OAuth token. Reconnect before publishing.",
      );
    }

    const resolved = await Promise.all(channelLookups);
    const failure = resolved.find(
      (result): result is Extract<YouTubeChannelResolution, { ok: false }> => !result.ok,
    );
    if (failure) return failure;

    const channels = Array.from(
      new Map(
        resolved
          .flatMap((result) => result.ok ? result.channels : [])
          .map((channel) => [channel.accountRef, channel]),
      ).values(),
    );
    return channels.length > 0
      ? { ok: true, channels }
      : reconnect("No YouTube channel is available for this connection. Reconnect before publishing.");
  } catch {
    return attention("YouTube channel could not be verified. Try again before publishing.");
  }
}

export async function publishToYouTube(params: PublishParams): Promise<PublishResult> {
  const title = (params.title ?? params.caption ?? "").trim();
  const description = (params.caption ?? "").trim();
  const videoUrl = params.imageUrl?.trim();

  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false, providerAttempted: false };
  if (!params.brandId) return { ok: false, error: "YouTube publishing requires a brandId", retryable: false, providerAttempted: false };
  if (!videoUrl) {
    return {
      ok: false,
      error: "YouTube requires a video - attach a video to the card before approving",
      retryable: false,
      providerAttempted: false,
    };
  }

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandYtAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable, providerAttempted: false };

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

  const expectedChannelId = text(acct.accountRef);
  if (!expectedChannelId) {
    return { error: "Assigned YouTube channel identity is missing - reassign it", retryable: false };
  }

  const resolution = await resolveOwnerYouTubeChannels(ownerUserId);
  if (!resolution.ok) {
    return { error: resolution.error, retryable: resolution.retryable };
  }
  const channel = resolution.channels.find(
    (candidate) => candidate.accountRef === expectedChannelId,
  );
  if (!channel) {
    return {
      error: "Assigned YouTube channel no longer matches the connected channel - reassign it before publishing",
      retryable: false,
    };
  }
  return {
    accessToken: channel.accessToken,
    channelId: channel.accountRef,
  };
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
