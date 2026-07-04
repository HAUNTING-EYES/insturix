import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";

type InstagramChunkCostOperation = "social_media_upload" | "social_publish";
type InstagramChunkCostPhase = "container_create" | "chunk_transfer" | "status_poll" | "publish";
type InstagramChunkUploadMethod = "direct" | "resumable";

interface InstagramChunkProviderCostContext {
  operation: InstagramChunkCostOperation;
  phase: InstagramChunkCostPhase;
  videoUuid?: string;
  providerJobId?: string;
  containerId?: string;
  mediaType?: string;
  postType?: string;
  uploadMethod?: InstagramChunkUploadMethod;
  httpStatus?: number;
  requestCount?: number;
  chunkStartOffset?: number;
  chunkBytes?: number;
  providerStatusCode?: string;
}

const UPLOADERX_INSTAGRAM_CHUNK_PROVIDER = "instagram-graph-api";
const UPLOADERX_INSTAGRAM_CHUNK_MODEL = "instagram-graph-v21";
const UPLOADERX_INSTAGRAM_CHUNK_ROUTE = "/api/services/uploaderx/instagram/chunk";
const UPLOADERX_INSTAGRAM_CHUNK_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "instagram",
});

async function fetchUploaderXRange(publicUrl: string, start: number, end: number) {
  const response = await fetch(publicUrl, {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to download chunk from R2: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(req: Request) {
  let currentUserId: string | undefined;
  let telemetryVideoUuid: string | undefined;
  let attemptedProviderCost: InstagramChunkProviderCostContext | undefined;
  let pendingCompletedProviderCost: InstagramChunkProviderCostContext | undefined;
  let recordedPendingProviderCost = false;

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    currentUserId = session.userId;

    const body = await req.json();
    const {
      phase,
      videoUuid,
      accountId: requestedAccountId,
      uploadSessionId, // acts as containerId
      startOffset,
      chunkSize,
      title,
      description,
      postType,
      useDirectUpload: requestedUseDirectUpload,
    } = body;
    telemetryVideoUuid = typeof videoUuid === "string" ? videoUuid : undefined;

    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      instagramTokens: { $exists: true, $ne: null },
    });

    if (!user?.instagramTokens) {
      return NextResponse.json(
        { success: false, error: "Instagram not connected. Please connect your Instagram account first." },
        { status: 403 }
      );
    }

    const ig = user.instagramTokens as any;
    const accounts = ig.accounts || [];
    if (accounts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No Instagram accounts connected. Please connect your Instagram account first." },
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

    const igUserAccessToken = ig.userAccessToken;
    if (!igUserAccessToken) {
      return NextResponse.json(
        { success: false, error: "Instagram access token missing. Please reconnect your account." },
        { status: 400 }
      );
    }

      // ─── PHASE: START ───
      if (phase === "start") {
        const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
          requestType: "instagram",
        });
        if (!publishCreditCheck.allowed) {
          return publishCreditCheck.errorResponse!;
        }

        const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
        const fileSize = Number(videoAsset.size || 0);

        let finalCaption = title || "";
        let finalDescription = description || "";
        const videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
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

        const fullCaption = finalCaption ? `${finalCaption}\n\n${finalDescription}`.trim() : finalDescription;

        // For videos > 2 minutes (120 seconds), use direct binary upload instead of resumable
        // Instagram's resumable upload requires video_url parameter which causes errors for large videos
        const useDirectUpload = fileSize > 0 && (fileSize > 120 * 1024 * 1024 || (videoAsset.duration ?? 0) > 120);
        const uploadMethod: InstagramChunkUploadMethod = useDirectUpload ? "direct" : "resumable";

        const createContainerUrl = `https://graph.instagram.com/v21.0/me/media`;
        const containerParams = new URLSearchParams();
        
        if (useDirectUpload) {
          // Direct binary upload for large videos - no upload_type or media_type parameters
          containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
          containerParams.set("access_token", igUserAccessToken);
        } else {
          // Resumable upload for small videos
          containerParams.set("upload_type", "resumable");
          containerParams.set("media_type", "REELS");
          containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
          containerParams.set("access_token", igUserAccessToken);
        }

        attemptedProviderCost = {
          operation: "social_media_upload",
          phase: "container_create",
          videoUuid: telemetryVideoUuid,
          mediaType: "REELS",
          postType: postType || "reel",
          uploadMethod,
        };
        const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
          method: "POST",
        });
        const containerData = await containerRes.json();

        if (containerData.error) {
          await recordUploaderXInstagramChunkCost({
            status: "failed",
            userId: session.userId,
            ...attemptedProviderCost,
            requestCount: 1,
            httpStatus: containerRes.status,
            error: containerData.error,
          });
          attemptedProviderCost = undefined;
          console.error("Instagram start error:", containerData.error);
          return NextResponse.json(
            { success: false, error: containerData.error.message || "Failed to initialize Instagram upload container" },
            { status: 500 }
          );
        }

        await recordUploaderXInstagramChunkCost({
          status: "success",
          userId: session.userId,
          ...attemptedProviderCost,
          providerJobId: containerData.id,
          containerId: containerData.id,
          requestCount: 1,
          httpStatus: containerRes.status,
        });
        attemptedProviderCost = undefined;

        return NextResponse.json({
          success: true,
          uploadSessionId: containerData.id, // containerId
          fileSize,
          useDirectUpload, // Pass this flag to transfer phase
        });
      }

      // ─── PHASE: TRANSFER ───
      if (phase === "transfer") {
        if (!uploadSessionId || startOffset === undefined || !chunkSize) {
          return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
        }

        const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
          requestType: "instagram",
        });
        if (!publishCreditCheck.allowed) {
          return publishCreditCheck.errorResponse!;
        }

        const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
        const fileSize = Number(videoAsset.size || 0);
        const endByte = Math.min(startOffset + chunkSize - 1, fileSize - 1);
        const useDirectUpload = Boolean(requestedUseDirectUpload);
        const uploadMethod: InstagramChunkUploadMethod = useDirectUpload ? "direct" : "resumable";

        const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, startOffset, endByte);

        let transferRes;
        if (useDirectUpload) {
          // Direct binary upload for large videos - upload to the container URL directly
          const uploadUrl = `https://graph.instagram.com/v21.0/${uploadSessionId}/media`;
          
          attemptedProviderCost = {
            operation: "social_media_upload",
            phase: "chunk_transfer",
            videoUuid: telemetryVideoUuid,
            providerJobId: uploadSessionId,
            containerId: uploadSessionId,
            mediaType: "REELS",
            postType: postType || "reel",
            uploadMethod,
            chunkStartOffset: Number(startOffset),
            chunkBytes: chunkBuffer.length,
          };
          transferRes = await axios.post(uploadUrl, chunkBuffer, {
            headers: {
              "Authorization": `OAuth ${igUserAccessToken}`,
              "Content-Type": "application/octet-stream",
              "offset": String(startOffset),
              "file_size": String(fileSize),
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
        } else {
          // Resumable upload for small videos - use the rupload endpoint
          const ruploadUrl = `https://rupload.facebook.com/ig-api-upload/v21.0/${uploadSessionId}`;

          attemptedProviderCost = {
            operation: "social_media_upload",
            phase: "chunk_transfer",
            videoUuid: telemetryVideoUuid,
            providerJobId: uploadSessionId,
            containerId: uploadSessionId,
            mediaType: "REELS",
            postType: postType || "reel",
            uploadMethod,
            chunkStartOffset: Number(startOffset),
            chunkBytes: chunkBuffer.length,
          };
          transferRes = await axios.post(ruploadUrl, chunkBuffer, {
            headers: {
              "Authorization": `OAuth ${igUserAccessToken}`,
              "offset": String(startOffset),
              "file_size": String(fileSize),
              "Content-Type": "application/octet-stream",
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
        }

        if (transferRes.data?.error) {
          await recordUploaderXInstagramChunkCost({
            status: "failed",
            userId: session.userId,
            ...attemptedProviderCost,
            requestCount: 1,
            httpStatus: transferRes.status,
            error: transferRes.data.error,
          });
          attemptedProviderCost = undefined;
          return NextResponse.json(
            { success: false, error: transferRes.data.error.message || "Failed to transfer chunk to Instagram" },
            { status: 500 }
          );
        }

        await recordUploaderXInstagramChunkCost({
          status: "success",
          userId: session.userId,
          ...attemptedProviderCost,
          requestCount: 1,
          httpStatus: transferRes.status,
        });
        attemptedProviderCost = undefined;

        return NextResponse.json({
          success: true,
          nextOffset: startOffset + chunkBuffer.length,
        });
      }

    // ─── PHASE: POLL ───
    if (phase === "poll") {
      if (!uploadSessionId) {
        return NextResponse.json({ success: false, error: "Missing uploadSessionId" }, { status: 400 });
      }

      attemptedProviderCost = {
        operation: "social_media_upload",
        phase: "status_poll",
        videoUuid: telemetryVideoUuid,
        providerJobId: uploadSessionId,
        containerId: uploadSessionId,
        mediaType: "REELS",
        postType: postType || "reel",
        requestCount: 1,
      };
      const statusUrl = `https://graph.instagram.com/v21.0/${uploadSessionId}?fields=status_code,error&access_token=${igUserAccessToken}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();

      if (statusData.error) {
        await recordUploaderXInstagramChunkCost({
          status: "failed",
          userId: session.userId,
          ...attemptedProviderCost,
          httpStatus: statusRes.status,
          providerStatusCode: statusData.status_code,
          error: statusData.error,
        });
        attemptedProviderCost = undefined;
        return NextResponse.json({
          success: false,
          error: statusData.error.message || "Failed to query Instagram status",
        }, { status: 500 });
      }

      await recordUploaderXInstagramChunkCost({
        status: "success",
        userId: session.userId,
        ...attemptedProviderCost,
        httpStatus: statusRes.status,
        providerStatusCode: statusData.status_code,
      });
      attemptedProviderCost = undefined;

      return NextResponse.json({
        success: true,
        statusCode: statusData.status_code, // IN_PROGRESS, FINISHED, ERROR
        details: statusData,
      });
    }

      // ─── PHASE: PUBLISH ───
      if (phase === "publish") {
        if (!uploadSessionId) {
          return NextResponse.json({ success: false, error: "Missing uploadSessionId" }, { status: 400 });
        }

        const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
          requestType: "instagram",
        });
        if (!publishCreditCheck.allowed) {
          return publishCreditCheck.errorResponse!;
        }

        const publishUrl = `https://graph.instagram.com/v21.0/me/media_publish`;
        const publishParams = new URLSearchParams();
        publishParams.set("creation_id", uploadSessionId);
        publishParams.set("access_token", igUserAccessToken);

        const useDirectUpload = Boolean(requestedUseDirectUpload);
        const uploadMethod: InstagramChunkUploadMethod = useDirectUpload ? "direct" : "resumable";
        attemptedProviderCost = {
          operation: "social_publish",
          phase: "publish",
          videoUuid: telemetryVideoUuid,
          providerJobId: uploadSessionId,
          containerId: uploadSessionId,
          mediaType: "REELS",
          postType: postType || "reel",
          uploadMethod,
        };
        const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
        const publishData = await publishRes.json();

        if (publishData.error) {
          await recordUploaderXInstagramChunkCost({
            status: "failed",
            userId: session.userId,
            ...attemptedProviderCost,
            requestCount: 1,
            httpStatus: publishRes.status,
            error: publishData.error,
          });
          attemptedProviderCost = undefined;
          return NextResponse.json(
            { success: false, error: publishData.error.message || "Failed to publish Instagram media container" },
            { status: 500 }
          );
        }

        const mediaId = publishData.id;
        const instagramUrl = `https://www.instagram.com/p/${mediaId}`;
        const publishProviderCost: InstagramChunkProviderCostContext = {
          ...attemptedProviderCost!,
          providerJobId: mediaId,
          httpStatus: publishRes.status,
        };
        attemptedProviderCost = undefined;
        pendingCompletedProviderCost = publishProviderCost;

        await UploaderXVideo.updateOne(
          { userId: session.userId, videoUuid },
          {
            $set: {
              "metadata.instagram.mediaId": mediaId,
              "metadata.instagram.url": instagramUrl,
              "metadata.instagram.instagramAccountId": targetAccount.instagramAccountId,
              "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
              "metadata.instagram.lastUploadedAt": new Date(),
              "metadata.instagram.postType": postType || "reel",
              "metadata.instagram.uploadMethod": useDirectUpload ? "direct" : "resumable",
            },
          }
        );

        const mediaType = "REELS";

        await emitUploaderXVideoPublished({
          userId: session.userId,
          videoUuid,
          platform: "instagram",
          platformPostId: mediaId,
          platformUrl: instagramUrl,
          accountUsername: targetAccount.instagramUsername,
          mediaType,
          postType,
        }).catch((eventErr) =>
          console.warn("[UploaderX:Instagram] video_published event failed:", eventErr)
        );

        const deductResult = await deductPublishCredits(publishCreditCheck);
        await recordUploaderXInstagramChunkCost({
          status: "success",
          userId: session.userId,
          ...publishProviderCost,
          chargedCredits: deductResult.transactionId ? UPLOADERX_INSTAGRAM_CHUNK_PUBLISH_CREDITS : undefined,
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

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    if (currentUserId && pendingCompletedProviderCost && !recordedPendingProviderCost) {
      await recordUploaderXInstagramChunkCost({
        status: "success",
        userId: currentUserId,
        ...pendingCompletedProviderCost,
        requestCount: pendingCompletedProviderCost.requestCount ?? 1,
      });
    } else if (currentUserId && attemptedProviderCost) {
      await recordUploaderXInstagramChunkCost({
        status: "failed",
        userId: currentUserId,
        ...attemptedProviderCost,
        requestCount: attemptedProviderCost.requestCount ?? 1,
        error,
      });
    }

    console.error("Instagram chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Instagram upload failed" },
      { status: 500 }
    );
  }
}

async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:Instagram] chunk publish credit deduction failed:", error);
    return {};
  }
}

async function recordUploaderXInstagramChunkCost(input: {
  status: ProviderCostEventStatus;
  operation: InstagramChunkCostOperation;
  phase: InstagramChunkCostPhase;
  userId: string;
  videoUuid?: string;
  providerJobId?: string;
  containerId?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount?: number;
  mediaType?: string;
  postType?: string;
  uploadMethod?: InstagramChunkUploadMethod;
  httpStatus?: number;
  chunkStartOffset?: number;
  chunkBytes?: number;
  providerStatusCode?: string;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `uploaderx:instagram:chunk:${input.phase}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_INSTAGRAM_CHUNK_ROUTE,
    provider: UPLOADERX_INSTAGRAM_CHUNK_PROVIDER,
    model: UPLOADERX_INSTAGRAM_CHUNK_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.providerJobId,
    units: {
      requestCount: input.requestCount ?? 1,
      bytesIn: input.chunkBytes,
    },
    metadata: {
      platform: "instagram",
      uploadMode: "chunk",
      phase: input.phase,
      mediaType: input.mediaType,
      postType: input.postType,
      uploadMethod: input.uploadMethod,
      hasProviderContainerId: Boolean(input.containerId),
      hasProviderMediaId: input.phase === "publish" && Boolean(input.providerJobId),
      httpStatus: input.httpStatus,
      providerStatusCode: input.providerStatusCode,
      chunkStartOffset: input.chunkStartOffset,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
