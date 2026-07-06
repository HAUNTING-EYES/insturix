import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";

export const maxDuration = 300;

type InstagramCostOperation = "social_media_upload" | "social_publish";
type InstagramCostPhase = "container_create" | "chunk_transfer" | "status_poll" | "publish";
type InstagramUploadMethod = "direct" | "resumable";

interface InstagramProviderCostContext {
  operation: InstagramCostOperation;
  phase: InstagramCostPhase;
  videoUuid?: string;
  providerJobId?: string;
  containerId?: string;
  mediaType?: string;
  uploadMethod?: InstagramUploadMethod;
  httpStatus?: number;
  requestCount?: number;
  pollAttempts?: number;
  chunkIndex?: number;
  chunkBytes?: number;
}

const UPLOADERX_INSTAGRAM_PROVIDER = "instagram-graph-api";
const UPLOADERX_INSTAGRAM_MODEL = "instagram-graph-v21";
const UPLOADERX_INSTAGRAM_ROUTE = "/api/services/uploaderx/instagram";
const UPLOADERX_INSTAGRAM_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "instagram",
});

export async function POST(req: Request) {
  let currentUserId: string | undefined;
  let telemetryVideoUuid: string | undefined;
  let attemptedProviderCost: InstagramProviderCostContext | undefined;
  let pendingCompletedProviderCost: InstagramProviderCostContext | undefined;
  let recordedPendingProviderCost = false;

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    currentUserId = session.userId;

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, accountId: requestedAccountId, postType } = body;
    telemetryVideoUuid = typeof videoUuid === "string" ? videoUuid : undefined;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      instagramTokens: { $exists: true, $ne: null },
    });

    if (!user?.instagramTokens) {
      return NextResponse.json(
        {
          success: false,
          error: "Instagram not connected. Please connect your Instagram account first.",
        },
        { status: 403 }
      );
    }

    const ig = user.instagramTokens as any;
    const accounts = ig.accounts || [];
    if (accounts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No Instagram accounts connected. Please connect your Instagram account first.",
        },
        { status: 400 }
      );
    }

    const targetAccount = requestedAccountId
      ? accounts.find((account: any) => account.instagramAccountId === requestedAccountId)
      : accounts[0];

    if (!targetAccount) {
      return NextResponse.json(
        { success: false, error: "Requested Instagram account not found." },
        { status: 400 }
      );
    }

    // Instagram Login flow: use the user access token directly (no Page token needed)
    const igUserAccessToken = ig.userAccessToken;

    if (!igUserAccessToken) {
      return NextResponse.json(
        { success: false, error: "Instagram access token missing. Please reconnect your account." },
        { status: 400 }
      );
    }
    let finalCaption = title || "";
    let finalDescription = description || "";
    let videoDoc = null;

    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      if (videoDoc?.metadata) {
        const meta = videoDoc.metadata;
        if (meta.instagram) {
          finalCaption = finalCaption || meta.instagram.caption || meta.title;
          finalDescription = finalDescription || meta.instagram.description || meta.description;
        } else {
          finalCaption = finalCaption || meta.title;
          finalDescription = finalDescription || meta.description;
        }
      }
    }

    const igAccountId = targetAccount.instagramAccountId;
    const existingInstagram = videoDoc?.metadata?.instagram || null;
    const existingIgMediaId = existingInstagram?.mediaId || null;
    const existingIgAccountId = existingInstagram?.instagramAccountId || null;

    if (existingIgMediaId && (!existingIgAccountId || String(existingIgAccountId) === String(igAccountId))) {
      return NextResponse.json({
        success: true,
        instagramUrl: `https://www.instagram.com/p/${existingIgMediaId}`,
        mediaId: existingIgMediaId,
        accountUsername: targetAccount.instagramUsername,
        mediaType: existingInstagram?.mediaType || "MEDIA",
        updated: false,
        note: "Instagram doesn't support updating published media captions. Returning existing media.",
      });
    }

    const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
      requestType: "instagram",
    });
    if (!publishCreditCheck.allowed) {
      return publishCreditCheck.errorResponse!;
    }

    const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
    const mediaUrl = videoAsset.publicUrl;
    const contentType = videoAsset.contentType || "video/mp4";
    const isVideo = contentType.startsWith("video/");
    const mediaType = isVideo ? "REELS" : "IMAGE";
    const fullCaption = finalCaption ? `${finalCaption}\n\n${finalDescription}`.trim() : finalDescription;

    // For videos > 2 minutes (120 seconds) or > 100MB, use chunked upload instead of direct upload
    // Instagram's direct upload (video_url parameter) has limitations for large videos
    const shouldUseChunkedUpload = (videoAsset.duration ?? 0) > 120 || (videoAsset.size && videoAsset.size > 100 * 1024 * 1024);

    let containerId: string;
    if (shouldUseChunkedUpload && isVideo) {
      // Use chunked upload flow for large videos
      const createContainerUrl = `https://graph.instagram.com/v21.0/me/media`;
      const containerParams = new URLSearchParams();
      containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
      containerParams.set("access_token", igUserAccessToken);

      attemptedProviderCost = {
        operation: "social_media_upload",
        phase: "container_create",
        videoUuid: telemetryVideoUuid,
        mediaType,
        uploadMethod: "resumable",
      };
      const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
        method: "POST",
      });
      const containerData = await containerRes.json();

      if (containerData.error) {
        await recordUploaderXInstagramCost({
          status: "failed",
          userId: session.userId,
          ...attemptedProviderCost,
          requestCount: 1,
          httpStatus: containerRes.status,
          error: containerData.error,
        });
        attemptedProviderCost = undefined;
        return NextResponse.json(
          {
            success: false,
            error: containerData.error.message || "Failed to initialize Instagram upload container",
          },
          { status: 500 }
        );
      }

      containerId = containerData.id;
      await recordUploaderXInstagramCost({
        status: "success",
        userId: session.userId,
        ...attemptedProviderCost,
        providerJobId: containerId,
        containerId,
        requestCount: 1,
        httpStatus: containerRes.status,
      });
      attemptedProviderCost = undefined;

      // Now transfer the video in chunks using direct binary upload
      const fileSize = Number(videoAsset.size || 0);
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startOffset = chunkIndex * CHUNK_SIZE;
        const endOffset = Math.min(startOffset + CHUNK_SIZE - 1, fileSize - 1);

        const chunkBuffer = await fetch(videoAsset.publicUrl, {
          headers: {
            Range: `bytes=${startOffset}-${endOffset}`,
          },
        }).then(res => res.arrayBuffer());

        const chunkPayload = Buffer.from(chunkBuffer);
        const ruploadUrl = `https://rupload.facebook.com/ig-api-upload/v21.0/${containerId}`;
        attemptedProviderCost = {
          operation: "social_media_upload",
          phase: "chunk_transfer",
          videoUuid: telemetryVideoUuid,
          providerJobId: containerId,
          containerId,
          mediaType,
          uploadMethod: "resumable",
          chunkIndex,
          chunkBytes: chunkPayload.byteLength,
        };
        const transferRes = await fetch(ruploadUrl, {
          method: "POST",
          headers: {
            "Authorization": `OAuth ${igUserAccessToken}`,
            "offset": String(startOffset),
            "file_size": String(fileSize),
            "Content-Type": "application/octet-stream",
          },
          body: chunkPayload,
        });

        if (!transferRes.ok) {
          const errorData = await transferRes.json().catch(() => ({}));
          await recordUploaderXInstagramCost({
            status: "failed",
            userId: session.userId,
            ...attemptedProviderCost,
            requestCount: 1,
            httpStatus: transferRes.status,
            error: errorData.error,
          });
          attemptedProviderCost = undefined;
          return NextResponse.json(
            {
              success: false,
              error: errorData.error?.message || `Failed to upload chunk ${chunkIndex + 1} to Instagram`,
            },
            { status: 500 }
          );
        }

        await recordUploaderXInstagramCost({
          status: "success",
          userId: session.userId,
          ...attemptedProviderCost,
          requestCount: 1,
          httpStatus: transferRes.status,
        });
        attemptedProviderCost = undefined;
      }

      // Finalize by publishing
      const publishUrl = `https://graph.instagram.com/v21.0/me/media_publish`;
      const publishParams = new URLSearchParams();
      publishParams.set("creation_id", containerId);
      publishParams.set("access_token", igUserAccessToken);

      attemptedProviderCost = {
        operation: "social_publish",
        phase: "publish",
        videoUuid: telemetryVideoUuid,
        providerJobId: containerId,
        containerId,
        mediaType,
        uploadMethod: "resumable",
      };
      const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
      const publishData = await publishRes.json();

      if (publishData.error) {
        await recordUploaderXInstagramCost({
          status: "failed",
          userId: session.userId,
          ...attemptedProviderCost,
          requestCount: 1,
          httpStatus: publishRes.status,
          error: publishData.error,
        });
        attemptedProviderCost = undefined;
        return NextResponse.json(
          {
            success: false,
            error: publishData.error.message || "Failed to publish Instagram media container",
          },
          { status: 500 }
        );
      }

      const mediaId = publishData.id;
      const publishProviderCost: InstagramProviderCostContext = {
        ...attemptedProviderCost,
        providerJobId: mediaId,
        httpStatus: publishRes.status,
      };
      attemptedProviderCost = undefined;
      pendingCompletedProviderCost = publishProviderCost;
      const instagramUrl = `https://www.instagram.com/p/${mediaId}`;

      if (videoUuid) {
        await UploaderXVideo.updateOne(
          { userId: session.userId, videoUuid },
          {
            $set: {
              "metadata.instagram.mediaId": mediaId,
              "metadata.instagram.url": instagramUrl,
              "metadata.instagram.instagramAccountId": igAccountId,
              "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
              "metadata.instagram.lastUploadedAt": new Date(),
              "metadata.instagram.postType": postType || "reel",
            },
          }
        );
        await emitUploaderXVideoPublished({
          userId: session.userId,
          videoUuid,
          platform: "instagram",
          platformPostId: mediaId,
          platformUrl: instagramUrl,
          accountUsername: targetAccount.instagramUsername,
          mediaType,
        }).catch((eventErr) =>
          console.warn("[UploaderX:Instagram] video_published event failed:", eventErr),
        );
      }

      const deductResult = await deductPublishCredits(publishCreditCheck);
      await recordUploaderXInstagramCost({
        status: "success",
        userId: session.userId,
        ...publishProviderCost,
        chargedCredits: deductResult.transactionId ? UPLOADERX_INSTAGRAM_PUBLISH_CREDITS : undefined,
        creditTransactionId: deductResult.transactionId,
        requestCount: 1,
      });
      recordedPendingProviderCost = true;

      return NextResponse.json({
        success: true,
        instagramUrl,
        mediaId,
        accountUsername: targetAccount.instagramUsername,
        mediaType,
        postType: postType || "reel",
      });
    }

    // Use direct upload for small videos
    const createContainerUrl = `https://graph.instagram.com/v21.0/me/media`;
    const containerParams = new URLSearchParams();
    containerParams.set(isVideo ? "video_url" : "image_url", mediaUrl);
    if (isVideo) {
      containerParams.set("media_type", "REELS");
    }
    containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
    containerParams.set("access_token", igUserAccessToken);

    attemptedProviderCost = {
      operation: "social_media_upload",
      phase: "container_create",
      videoUuid: telemetryVideoUuid,
      mediaType,
      uploadMethod: "direct",
    };
    const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
      method: "POST",
    });
    const containerData = await containerRes.json();

    if (containerData.error) {
      await recordUploaderXInstagramCost({
        status: "failed",
        userId: session.userId,
        ...attemptedProviderCost,
        requestCount: 1,
        httpStatus: containerRes.status,
        error: containerData.error,
      });
      attemptedProviderCost = undefined;
      return NextResponse.json(
        {
          success: false,
          error: containerData.error.message || `Failed to create Instagram ${isVideo ? "Reel" : "post"}`,
        },
        { status: 500 }
      );
    }

    containerId = containerData.id;
    await recordUploaderXInstagramCost({
      status: "success",
      userId: session.userId,
      ...attemptedProviderCost,
      providerJobId: containerId,
      containerId,
      requestCount: 1,
      httpStatus: containerRes.status,
    });
    attemptedProviderCost = undefined;

    if (isVideo) {
      let containerStatus = "IN_PROGRESS";
      let attempts = 0;
      let lastStatusHttpStatus: number | undefined;
      const maxAttempts = 60;

      while (containerStatus === "IN_PROGRESS" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        const statusUrl = `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${igUserAccessToken}`;
        const statusRes = await fetch(statusUrl);
        lastStatusHttpStatus = statusRes.status;
        const statusData = await statusRes.json();
        if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
          console.log("[IG] Poll status:", {
            attempts,
            statusCode: statusData.status_code,
            hasError: !!statusData.error,
          });
        }
        containerStatus = statusData.status_code;

        if (containerStatus === "ERROR") {
          await recordUploaderXInstagramCost({
            status: "failed",
            userId: session.userId,
            operation: "social_media_upload",
            phase: "status_poll",
            videoUuid: telemetryVideoUuid,
            providerJobId: containerId,
            containerId,
            mediaType,
            uploadMethod: "direct",
            requestCount: attempts,
            pollAttempts: attempts,
            httpStatus: lastStatusHttpStatus,
            error: statusData.error,
          });
          return NextResponse.json(
            {
              success: false,
              error: `Instagram processing error: ${statusData.error?.message || "Unknown error"}`,
            },
            { status: 500 }
          );
        }
      }

      if (containerStatus !== "FINISHED") {
        await recordUploaderXInstagramCost({
          status: "failed",
          userId: session.userId,
          operation: "social_media_upload",
          phase: "status_poll",
          videoUuid: telemetryVideoUuid,
          providerJobId: containerId,
          containerId,
          mediaType,
          uploadMethod: "direct",
          requestCount: attempts,
          pollAttempts: attempts,
          httpStatus: lastStatusHttpStatus,
          error: new Error("Instagram processing timed out"),
        });
        return NextResponse.json(
          { success: false, error: "Instagram Reel processing timed out. Please try again later." },
          { status: 500 }
        );
      }

      await recordUploaderXInstagramCost({
        status: "success",
        userId: session.userId,
        operation: "social_media_upload",
        phase: "status_poll",
        videoUuid: telemetryVideoUuid,
        providerJobId: containerId,
        containerId,
        mediaType,
        uploadMethod: "direct",
        requestCount: attempts,
        pollAttempts: attempts,
        httpStatus: lastStatusHttpStatus,
      });
    }

    const publishUrl = `https://graph.instagram.com/v21.0/me/media_publish`;
    const publishParams = new URLSearchParams();
    publishParams.set("creation_id", containerId);
    publishParams.set("access_token", igUserAccessToken);

    attemptedProviderCost = {
      operation: "social_publish",
      phase: "publish",
      videoUuid: telemetryVideoUuid,
      providerJobId: containerId,
      containerId,
      mediaType,
      uploadMethod: "direct",
    };
    const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
    const publishData = await publishRes.json();

    if (publishData.error) {
      await recordUploaderXInstagramCost({
        status: "failed",
        userId: session.userId,
        ...attemptedProviderCost,
        requestCount: 1,
        httpStatus: publishRes.status,
        error: publishData.error,
      });
      attemptedProviderCost = undefined;
      return NextResponse.json(
        {
          success: false,
          error: publishData.error.message || `Failed to publish Instagram ${isVideo ? "Reel" : "post"}`,
        },
        { status: 500 }
      );
    }

    const mediaId = publishData.id;
    const publishProviderCost: InstagramProviderCostContext = {
      ...attemptedProviderCost,
      providerJobId: mediaId,
      httpStatus: publishRes.status,
    };
    attemptedProviderCost = undefined;
    pendingCompletedProviderCost = publishProviderCost;
    const instagramUrl = `https://www.instagram.com/p/${mediaId}`;

    if (videoUuid) {
      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.instagram.mediaId": mediaId,
            "metadata.instagram.url": instagramUrl,
            "metadata.instagram.instagramAccountId": igAccountId,
            "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
            "metadata.instagram.lastUploadedAt": new Date(),
            "metadata.instagram.postType": postType || "reel",
          },
        }
      );
      await emitUploaderXVideoPublished({
        userId: session.userId,
        videoUuid,
        platform: "instagram",
        platformPostId: mediaId,
        platformUrl: instagramUrl,
        accountUsername: targetAccount.instagramUsername,
        mediaType,
      }).catch((eventErr) =>
        console.warn("[UploaderX:Instagram] video_published event failed:", eventErr),
      );
    }

    const deductResult = await deductPublishCredits(publishCreditCheck);
    await recordUploaderXInstagramCost({
      status: "success",
      userId: session.userId,
      ...publishProviderCost,
      chargedCredits: deductResult.transactionId ? UPLOADERX_INSTAGRAM_PUBLISH_CREDITS : undefined,
      creditTransactionId: deductResult.transactionId,
      requestCount: 1,
    });
    recordedPendingProviderCost = true;

    return NextResponse.json({
      success: true,
      instagramUrl,
      mediaId,
      accountUsername: targetAccount.instagramUsername,
      mediaType,
      postType: postType || "reel",
    });
  } catch (error: any) {
    if (currentUserId && pendingCompletedProviderCost && !recordedPendingProviderCost) {
      await recordUploaderXInstagramCost({
        status: "success",
        userId: currentUserId,
        ...pendingCompletedProviderCost,
        requestCount: 1,
      });
    } else if (currentUserId && attemptedProviderCost) {
      await recordUploaderXInstagramCost({
        status: "failed",
        userId: currentUserId,
        ...attemptedProviderCost,
        requestCount: attemptedProviderCost.requestCount ?? 1,
        error,
      });
    }

    console.error("Instagram operation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Instagram publish failed" },
      { status: 500 }
    );
  }
}

async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:Instagram] publish credit deduction failed:", error);
    return {};
  }
}

async function recordUploaderXInstagramCost(input: {
  status: ProviderCostEventStatus;
  operation: InstagramCostOperation;
  phase: InstagramCostPhase;
  userId: string;
  videoUuid?: string;
  providerJobId?: string;
  containerId?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount?: number;
  mediaType?: string;
  uploadMethod?: InstagramUploadMethod;
  httpStatus?: number;
  pollAttempts?: number;
  chunkIndex?: number;
  chunkBytes?: number;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `uploaderx:instagram:${input.phase}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_INSTAGRAM_ROUTE,
    provider: UPLOADERX_INSTAGRAM_PROVIDER,
    model: UPLOADERX_INSTAGRAM_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.providerJobId,
    units: {
      requestCount: input.requestCount ?? 1,
      bytesIn: input.chunkBytes,
    },
    metadata: {
      platform: "instagram",
      phase: input.phase,
      mediaType: input.mediaType,
      uploadMethod: input.uploadMethod,
      hasProviderContainerId: Boolean(input.containerId),
      hasProviderMediaId: input.phase === "publish" && Boolean(input.providerJobId),
      httpStatus: input.httpStatus,
      pollAttempts: input.pollAttempts,
      chunkIndex: input.chunkIndex,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}