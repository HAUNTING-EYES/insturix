import { google } from "googleapis";
import { Readable } from "stream";
import type { PublishParams, PublishResult } from "./contract";

/**
 * CalOS YouTube publisher — SESSIONLESS. The odd one out: YouTube uploads a VIDEO FILE and its tokens
 * live in the UploaderX collection keyed by EMAIL (its own Google OAuth app), not User.<platform>Tokens.
 *
 * Model A: a brand assigns its YouTube channel (calos_connected_accounts); we map the assigning owner
 * (clerkUserId) → User.email → UploaderX.youtubeTokens → google.auth.OAuth2, then stream the card's
 * video (params.imageUrl carries the deliverable assetUrl — a video URL for a YT card) into
 * videos.insert. Mirrors app/api/services/uploaderx/youtube/upload/route.ts.
 *
 * v1 posts a card that ALREADY has a video URL; the "put a video on a card" UX is a separate piece, so
 * if the card has no video we FAIL LOUD (no silent empty upload). OAuth2 auto-refreshes the token for
 * the call when a refresh_token is present.
 */

type YtAuth = { tokens: object; channelId?: string | null } | { error: string; retryable: boolean };

export async function publishToYouTube(params: PublishParams): Promise<PublishResult> {
  const title = (params.title ?? params.caption ?? "").trim();
  const description = (params.caption ?? "").trim();
  const videoUrl = params.imageUrl?.trim(); // the deliverable's assetUrl (a video URL for a YT card)

  if (!params.ownerUserId) return { ok: false, error: "Missing ownerUserId", retryable: false };
  if (!params.brandId) return { ok: false, error: "YouTube publishing requires a brandId", retryable: false };
  if (!videoUrl) {
    return {
      ok: false,
      error: "YouTube requires a video — attach a video to the card before approving",
      retryable: false,
    };
  }
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
    return { ok: false, error: "YouTube OAuth env not configured", retryable: false };
  }

  const connectToDatabase = (await import("@/schemas/ConnectToDatabase")).default;
  await connectToDatabase();

  const auth = await resolveBrandYtAuth(params.brandId, params.accountRef);
  if ("error" in auth) return { ok: false, error: auth.error, retryable: auth.retryable };

  return uploadVideo(auth.tokens, videoUrl, title || "Untitled", description);
}

/** Per-brand YouTube auth (Model A) — channel token from the assigning owner's UploaderX.youtubeTokens. */
async function resolveBrandYtAuth(brandId: string, accountRef?: string | null): Promise<YtAuth> {
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  const acct = await CalosConnectedAccount.findOne({
    brandId,
    platform: "youtube",
    ...(accountRef ? { accountRef } : {}),
  });
  if (!acct) return { error: "No YouTube channel assigned for this brand", retryable: false };

  const { User } = await import("@/schemas/user");
  const owner = await User.findOne({ clerkUserId: acct.ownerUserId }).select("email").lean<{ email?: string } | null>();
  if (!owner?.email) {
    return { error: "Cannot resolve the YouTube channel owner's email — reconnect", retryable: false };
  }

  const { default: UploaderX } = await import("@/schemas/uploaderx");
  const ux = await UploaderX.findOne({ email: owner.email }).select("youtubeTokens").lean<{ youtubeTokens?: object } | null>();
  if (!ux?.youtubeTokens) {
    return { error: "Assigned YouTube channel is no longer connected for this owner — reconnect", retryable: false };
  }

  return { tokens: ux.youtubeTokens, channelId: acct.accountRef };
}

/** Stream the video URL into youtube.videos.insert (public). Fails loud on fetch/API errors. */
async function uploadVideo(
  tokens: object,
  videoUrl: string,
  title: string,
  description: string,
): Promise<PublishResult> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      const retryable = videoRes.status >= 500 || videoRes.status === 429;
      return { ok: false, error: `Could not fetch the card's video (${videoRes.status})`, retryable };
    }
    const body = Readable.fromWeb(videoRes.body as Parameters<typeof Readable.fromWeb>[0]);

    const insert = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "public" },
      },
      media: { body },
    });

    const id = insert.data.id;
    if (!id) return { ok: false, error: "YouTube returned no video id", retryable: true };
    return { ok: true, postId: id, postUrl: `https://www.youtube.com/watch?v=${id}` };
  } catch (e) {
    const err = e as { code?: number; response?: { status?: number }; message?: string };
    const status = err.response?.status ?? err.code;
    const retryable = typeof status === "number" && (status >= 500 || status === 429);
    return { ok: false, error: `YouTube upload failed: ${err.message || "unknown error"}`, retryable };
  }
}
