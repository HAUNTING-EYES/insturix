import { google } from "googleapis";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { fetchUploaderXStream, resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

const debugYouTubeUpload = (...args: unknown[]) => {
  if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
    console.log(...args);
  }
};

type YouTubeCostOperation = "social_publish" | "social_media_upload" | "social_thumbnail_upload";

const UPLOADERX_YOUTUBE_PROVIDER = "youtube-data-api";
const UPLOADERX_YOUTUBE_MODEL = "youtube-v3";
const UPLOADERX_YOUTUBE_ROUTE = "/api/services/uploaderx/youtube";
const UPLOADERX_YOUTUBE_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "youtube",
});

export const maxDuration = 300;
export async function POST(req: Request) {
  let currentUserId: string | undefined;
  let telemetryVideoUuid: string | undefined;
  let telemetryVideoId: string | undefined;
  let attemptedProviderOperation: YouTubeCostOperation | undefined;
  let completedVideoProviderOperation: YouTubeCostOperation | undefined;
  let recordedCompletedVideoProviderCost = false;

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    currentUserId = session.userId;

    const client = await clerkClient();
    const user = await client.users.getUser(session.userId);

    const googleAccount = user.externalAccounts.find((account) => account.provider.includes("google"));
    const providerId = googleAccount ? googleAccount.provider : "oauth_google";

    debugYouTubeUpload("[UploaderX:YouTube] OAuth provider selected:", providerId);

    let accessToken: string | null = null;

    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(session.userId, providerId as any);
      debugYouTubeUpload("[UploaderX:YouTube] OAuth token count:", tokenResponse.data.length);
      accessToken = tokenResponse.data.length > 0 ? tokenResponse.data[0].token : null;
    } catch (tokenError: any) {
      console.error("Failed to get OAuth access token:", tokenError?.errors || tokenError);
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Google account not connected or missing permissions. Please sign in with Google again.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { gcsPath, videoUuid } = body;
    telemetryVideoUuid = typeof videoUuid === "string" ? videoUuid : undefined;
    let { title, description, privacyStatus, postType } = body;
    const requestCategoryId = typeof body.categoryId === "string" && body.categoryId.trim()
      ? body.categoryId.trim()
      : null;
    const requestPublishAt = typeof body.publishAt === "string" && body.publishAt.trim()
      ? body.publishAt.trim()
      : null;
    const thumbnailPublicUrl = typeof body.thumbnailPublicUrl === "string" && body.thumbnailPublicUrl.trim()
      ? body.thumbnailPublicUrl.trim()
      : null;
    let categoryId = requestCategoryId || "22";
    let publishAt = requestPublishAt;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    privacyStatus = privacyStatus || "unlisted";
    let tags: string[] = [];
    let existingVideoId: string | null = null;
    let dbVideoType: string | null = null;

    if (videoUuid) {
      try {
        await connectToDatabase();
        const video = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });

        if (video?.metadata) {
          if (video.metadata.youtube?.videoId) {
            existingVideoId = video.metadata.youtube.videoId;
          }

          let dbTitle;
          let dbDescription;
          let dbTags;

          if (video.metadata.youtube) {
            const ytMeta = video.metadata.youtube;
            dbTitle = ytMeta.title;
            dbDescription = ytMeta.description;
            dbTags = ytMeta.tags;
            if (!requestCategoryId && typeof ytMeta.categoryId === "string" && ytMeta.categoryId.trim()) {
              categoryId = ytMeta.categoryId.trim();
            }
            if (!requestPublishAt && typeof ytMeta.scheduledTime === "string" && ytMeta.scheduledTime.trim()) {
              publishAt = ytMeta.scheduledTime.trim();
            }
            privacyStatus = ytMeta.youtube?.privacyStatus || ytMeta.privacyStatus || privacyStatus;
          } else {
            dbTitle = video.metadata.title;
            dbDescription = video.metadata.description;
            dbTags = video.metadata.tags;
            if (!requestCategoryId && typeof video.metadata.categoryId === "string" && video.metadata.categoryId.trim()) {
              categoryId = video.metadata.categoryId.trim();
            }
            if (!requestPublishAt && typeof video.metadata.scheduledTime === "string" && video.metadata.scheduledTime.trim()) {
              publishAt = video.metadata.scheduledTime.trim();
            }
          }

          title = dbTitle || title;
          description = dbDescription || description;
          tags = dbTags || tags;

          if (video.metadata.youtube?.privacyStatus) {
            privacyStatus = video.metadata.youtube.privacyStatus;
          }

          if (typeof video.metadata.videoType === "string") {
            dbVideoType = video.metadata.videoType;
          }
        }
      } catch (dbError) {
        console.error("Failed to fetch video metadata:", dbError);
      }
    }



    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const scheduledPublishAt = publishAt ? new Date(publishAt) : null;
    if (scheduledPublishAt && Number.isNaN(scheduledPublishAt.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid YouTube publishAt date" }, { status: 400 });
    }
    const youtubeStatus = scheduledPublishAt
      ? { privacyStatus: "private", publishAt: scheduledPublishAt.toISOString() }
      : { privacyStatus };

    let thumbnailUpload: Awaited<ReturnType<typeof fetchUploaderXStream>> | null = null;
    if (thumbnailPublicUrl) {
      thumbnailUpload = await fetchUploaderXStream(thumbnailPublicUrl);
      if (!["image/jpeg", "image/png"].includes(thumbnailUpload.contentType)) {
        return NextResponse.json({ success: false, error: "YouTube thumbnail must be JPEG or PNG" }, { status: 400 });
      }
      if (thumbnailUpload.contentLength > 2 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "YouTube thumbnail must be 2MB or smaller" }, { status: 400 });
      }
    }

    const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
      requestType: "youtube",
    });
    if (!publishCreditCheck.allowed) {
      return publishCreditCheck.errorResponse!;
    }

    let videoId: string;
    let youtubeUrl: string;

    if (existingVideoId) {
      attemptedProviderOperation = "social_publish";
      await youtube.videos.update({
        part: ["snippet", "status"],
        requestBody: {
          id: existingVideoId,
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags,
            categoryId,
          },
          status: youtubeStatus,
        },
      });

      videoId = existingVideoId;
      telemetryVideoId = videoId;
      completedVideoProviderOperation = "social_publish";
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
      const { stream } = await fetchUploaderXStream(videoAsset.publicUrl);

      attemptedProviderOperation = "social_media_upload";
      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags,
            categoryId,
          },
          status: youtubeStatus,
        },
        media: { body: stream },
      });

      videoId = res.data.id!;
      telemetryVideoId = videoId;
      completedVideoProviderOperation = "social_media_upload";
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (videoUuid) {
        await UploaderXVideo.updateOne(
          { userId: session.userId, videoUuid },
          {
            $set: {
              "metadata.youtube.videoId": videoId,
              "metadata.youtube.url": youtubeUrl,
              "metadata.youtube.lastUploadedAt": new Date(),
              "metadata.youtube.publishState": scheduledPublishAt ? "scheduled" : "published",
              ...(scheduledPublishAt ? { "metadata.youtube.scheduledTime": scheduledPublishAt.toISOString() } : {}),
            },
          }
        );
        if (!scheduledPublishAt) {
          await emitUploaderXVideoPublished({
            userId: session.userId,
            videoUuid,
            platform: "youtube",
            platformPostId: videoId,
            platformUrl: youtubeUrl,
            mediaType: "video",
          }).catch((eventErr) =>
            console.warn("[UploaderX:YouTube] video_published event failed:", eventErr),
          );
        }
      }
    }

    if (thumbnailUpload) {
      attemptedProviderOperation = "social_thumbnail_upload";
      await youtube.thumbnails.set({
        videoId,
        media: { body: thumbnailUpload.stream },
      });
      await recordUploaderXYouTubeCost({
        status: "success",
        operation: "social_thumbnail_upload",
        userId: session.userId,
        videoUuid: telemetryVideoUuid,
        videoId,
        requestCount: 1,
      });
    }

    const deductResult = await deductPublishCredits(publishCreditCheck);
    await recordUploaderXYouTubeCost({
      status: "success",
      operation: completedVideoProviderOperation,
      userId: session.userId,
      videoUuid: telemetryVideoUuid,
      videoId,
      chargedCredits: deductResult.transactionId ? UPLOADERX_YOUTUBE_PUBLISH_CREDITS : undefined,
      creditTransactionId: deductResult.transactionId,
      requestCount: 1,
    });
    recordedCompletedVideoProviderCost = true;

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    if (currentUserId) {
      if (completedVideoProviderOperation && !recordedCompletedVideoProviderCost) {
        await recordUploaderXYouTubeCost({
          status: "success",
          operation: completedVideoProviderOperation,
          userId: currentUserId,
          videoUuid: telemetryVideoUuid,
          videoId: telemetryVideoId,
          requestCount: 1,
        });
      }

      if (attemptedProviderOperation && attemptedProviderOperation !== completedVideoProviderOperation) {
        await recordUploaderXYouTubeCost({
          status: "failed",
          operation: attemptedProviderOperation,
          userId: currentUserId,
          videoUuid: telemetryVideoUuid,
          videoId: telemetryVideoId,
          requestCount: 1,
          error,
        });
      }
    }

    console.error("YouTube operation failed:", error);
    if (error.response) {
      console.error("[UploaderX:YouTube] Google API error status:", error.response.status);
    }
    return NextResponse.json(
      { success: false, error: error.message, details: error.response?.data },
      { status: 500 }
    );
  }
}

async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:YouTube] publish credit deduction failed:", error);
    return {};
  }
}

async function recordUploaderXYouTubeCost(input: {
  status: ProviderCostEventStatus;
  operation: YouTubeCostOperation | undefined;
  userId: string;
  videoUuid?: string;
  videoId?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount: number;
  error?: unknown;
}) {
  if (!input.operation) return;

  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `uploaderx:youtube:${input.operation}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_YOUTUBE_ROUTE,
    provider: UPLOADERX_YOUTUBE_PROVIDER,
    model: UPLOADERX_YOUTUBE_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.videoId,
    units: { requestCount: input.requestCount },
    metadata: {
      platform: "youtube",
      hasProviderVideoId: Boolean(input.videoId),
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
