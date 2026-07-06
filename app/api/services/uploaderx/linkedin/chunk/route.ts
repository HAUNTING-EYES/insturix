import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import {
  getExistingLinkedInPublishedPost,
  linkedinOrganizationMetadataKey,
  normalizeLinkedInPostTarget,
} from "@/lib/uploaderx/linkedin-publish-state";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import {
  normalizeLinkedInUploadInstruction,
  requireAllowedUploaderXUploadUrl,
  UploaderXUploadUrlError,
} from "../../utils/platform-upload-url";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";
const UPLOADERX_LINKEDIN_CHUNK_PROVIDER = "linkedin-api";
const UPLOADERX_LINKEDIN_CHUNK_MODEL = `linkedin-rest-${LINKEDIN_REST_API_VERSION}`;
const UPLOADERX_LINKEDIN_CHUNK_ROUTE = "/api/services/uploaderx/linkedin/chunk";
const UPLOADERX_LINKEDIN_CHUNK_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "linkedin",
});

type LinkedInChunkCostOperation = "social_media_upload" | "social_publish";
type LinkedInChunkCostPhase = "start" | "transfer" | "finish" | "post_create";

interface LinkedInChunkCostBaseContext {
  userId: string;
  videoUuid?: string;
  postType: string;
  publishPath: string;
}

interface LinkedInChunkProviderCostContext {
  operation: LinkedInChunkCostOperation;
  phase: LinkedInChunkCostPhase;
  videoUuid?: string;
  providerPostId?: string;
  providerAssetId?: string;
  postType?: string;
  publishPath?: string;
  requestCount?: number;
  chunkStartOffset?: number;
  chunkBytes?: number;
  uploadPartCount?: number;
  providerStatusCode?: number;
}

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

function linkedInRestHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_REST_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function createLinkedInRestPost({
  accessToken,
  authorUrn,
  postText,
  media,
  costContext,
}: {
  accessToken: string;
  authorUrn: string;
  postText: string;
  media?: { id: string; type: "video"; title: string };
  costContext: LinkedInChunkCostBaseContext;
}) {
  const body: Record<string, unknown> = {
    author: authorUrn,
    commentary: postText,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (media) {
    body.content = {
      media: {
        id: media.id,
        title: media.title,
      },
    };
  }

  const providerCost: LinkedInChunkProviderCostContext = {
    operation: "social_publish",
    phase: "post_create",
    videoUuid: costContext.videoUuid,
    providerAssetId: media?.id,
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    requestCount: 1,
  };

  let postResponse: Response;
  try {
    postResponse = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: linkedInRestHeaders(accessToken),
      body: JSON.stringify(body),
    });
  } catch (error) {
    await recordUploaderXLinkedInChunkCost({
      status: "failed",
      userId: costContext.userId,
      ...providerCost,
      error,
    });
    throw error;
  }

  const responseText = await postResponse.text();
  let postData: any = {};
  if (responseText) {
    try {
      postData = JSON.parse(responseText);
    } catch {
      postData = { raw: responseText };
    }
  }

  if (!postResponse.ok || postData.error) {
    await recordUploaderXLinkedInChunkCost({
      status: "failed",
      userId: costContext.userId,
      ...providerCost,
      providerStatusCode: postResponse.status,
    });
    throw new Error("Failed to create LinkedIn post");
  }

  return postResponse.headers.get("x-restli-id") || postData.id;
}

export async function POST(req: Request) {
  let currentUserId: string | undefined;
  let telemetryVideoUuid: string | undefined;
  let attemptedProviderCost: LinkedInChunkProviderCostContext | undefined;
  let pendingCompletedProviderCost: LinkedInChunkProviderCostContext | undefined;
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
      uploadUrl,
      firstByte,
      lastByte,
      videoUrn,
      uploadToken,
      uploadedPartIds,
      title,
      description,
      postType = "personal",
      organizationId,
      videoPostType,
    } = body;

    const normalizedPostType = normalizeLinkedInPostTarget(postType);
    telemetryVideoUuid = typeof videoUuid === "string" ? videoUuid : undefined;
    const publishPath = "linkedin-chunked-video";
    const baseCostContext: LinkedInChunkCostBaseContext = {
      userId: session.userId,
      videoUuid: telemetryVideoUuid,
      postType: normalizedPostType,
      publishPath,
    };

    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      linkedinTokens: { $exists: true, $ne: null },
    });

    if (!user?.linkedinTokens) {
      return NextResponse.json(
        { success: false, error: "LinkedIn not connected. Please connect your LinkedIn account first." },
        { status: 403 }
      );
    }

    const tokens = user.linkedinTokens;
    let accessToken = tokens.accessToken;
    let userId = tokens.userId;

    const now = new Date();
    if (tokens.expiresAt && tokens.expiresAt < now) {
      if (!tokens.refreshToken) {
        return NextResponse.json({ success: false, error: "LinkedIn token expired. Please reconnect." }, { status: 401 });
      }

      try {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (clientId && clientSecret) {
          const refreshResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: tokens.refreshToken,
              client_id: clientId,
              client_secret: clientSecret,
            }),
          });

          const refreshData = await refreshResponse.json();
          if (refreshResponse.ok && refreshData.access_token) {
            const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
            await User.updateOne(
              { clerkUserId: session.userId },
              {
                $set: {
                  "linkedinTokens.accessToken": refreshData.access_token,
                  "linkedinTokens.refreshToken": refreshData.refresh_token || tokens.refreshToken,
                  "linkedinTokens.expiresAt": newExpiresAt,
                },
              }
            );
            accessToken = refreshData.access_token;
          }
        }
      } catch (refreshError) {
        console.warn("Failed to refresh LinkedIn token:", refreshError);
      }
    }

    let authorUrn: string;
    if (normalizedPostType === "organization") {
      const orgId = organizationId || (tokens.organizations && tokens.organizations[0]?.id);
      if (!orgId) {
        return NextResponse.json({ success: false, error: "Organization ID is required" }, { status: 400 });
      }
      authorUrn = `urn:li:organization:${orgId}`;
    } else {
      if (!userId) {
        return NextResponse.json({ success: false, error: "LinkedIn user ID missing" }, { status: 400 });
      }
      authorUrn = `urn:li:person:${userId}`;
    }

    // â”€â”€â”€ PHASE: START â”€â”€â”€
    if (phase === "start") {
      const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
        requestType: "linkedin",
      });
      if (!publishCreditCheck.allowed) {
        return publishCreditCheck.errorResponse!;
      }
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);
      const initProviderCost: LinkedInChunkProviderCostContext = {
        operation: "social_media_upload",
        phase: "start",
        videoUuid: telemetryVideoUuid,
        postType: normalizedPostType,
        publishPath,
        requestCount: 1,
      };
      attemptedProviderCost = initProviderCost;

      const initResponse = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
        method: "POST",
        headers: linkedInRestHeaders(accessToken),
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: authorUrn,
            fileSizeBytes: fileSize,
            uploadCaptions: false,
            uploadThumbnail: false,
          },
        }),
      });

      const initData = await initResponse.json();
      if (!initResponse.ok || initData.error) {
        await recordUploaderXLinkedInChunkCost({
          status: "failed",
          userId: session.userId,
          ...initProviderCost,
          providerStatusCode: initResponse.status,
        });
        attemptedProviderCost = undefined;
        const errorDetails = initData.error || initData.message || JSON.stringify(initData);
        console.error("LinkedIn init failed:", errorDetails);
        return NextResponse.json(
          { success: false, error: "Failed to initialize LinkedIn upload", details: errorDetails },
          { status: 500 }
        );
      }

      const uploadInstructions = (initData.value?.uploadInstructions || []).map(normalizeLinkedInUploadInstruction);
      await recordUploaderXLinkedInChunkCost({
        status: "success",
        userId: session.userId,
        ...initProviderCost,
        providerAssetId: initData.value?.video,
        uploadPartCount: uploadInstructions.length,
        providerStatusCode: initResponse.status,
      });
      attemptedProviderCost = undefined;
      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.linkedin.activeUpload": {
              videoUrn: initData.value?.video,
              uploadToken: initData.value?.uploadToken,
              uploadInstructions,
              owner: authorUrn,
              createdAt: new Date(),
            },
          },
        }
      );

      return NextResponse.json({
        success: true,
        videoUrn: initData.value?.video,
        uploadToken: initData.value?.uploadToken,
        uploadInstructions,
        fileSize,
      });
    }

    // â”€â”€â”€ PHASE: TRANSFER â”€â”€â”€
    if (phase === "transfer") {
      if (!uploadUrl || firstByte === undefined || lastByte === undefined) {
        return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
      }

      const safeUploadUrl = requireAllowedUploaderXUploadUrl(uploadUrl, "linkedin");
      const requestedFirstByte = Number(firstByte);
      const requestedLastByte = Number(lastByte);
      const videoDoc = (await UploaderXVideo.findOne({ userId: session.userId, videoUuid }).lean()) as any;
      const activeUpload = (videoDoc?.metadata as any)?.linkedin?.activeUpload;
      const matchingInstruction = activeUpload?.uploadInstructions?.some((instruction: any) =>
        instruction.uploadUrl === safeUploadUrl &&
        Number(instruction.firstByte) === requestedFirstByte &&
        Number(instruction.lastByte) === requestedLastByte
      );
      if (!matchingInstruction) {
        return NextResponse.json({ success: false, error: "Invalid or expired LinkedIn upload URL" }, { status: 400 });
      }

      // Credit check AFTER the upload-URL ownership/allow-list guard, before the transfer work.
      const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
        requestType: "linkedin",
      });
      if (!publishCreditCheck.allowed) {
        return publishCreditCheck.errorResponse!;
      }

      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, requestedFirstByte, requestedLastByte);
      const transferProviderCost: LinkedInChunkProviderCostContext = {
        operation: "social_media_upload",
        phase: "transfer",
        videoUuid: telemetryVideoUuid,
        providerAssetId: activeUpload?.videoUrn,
        postType: normalizedPostType,
        publishPath,
        requestCount: 1,
        chunkStartOffset: requestedFirstByte,
        chunkBytes: chunkBuffer.length,
        uploadPartCount: Array.isArray(activeUpload?.uploadInstructions) ? activeUpload.uploadInstructions.length : undefined,
      };
      attemptedProviderCost = transferProviderCost;

      const uploadResponse = await fetch(safeUploadUrl, {
        method: "PUT",
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(chunkBuffer),
      });

      if (!uploadResponse.ok) {
        await recordUploaderXLinkedInChunkCost({
          status: "failed",
          userId: session.userId,
          ...transferProviderCost,
          providerStatusCode: uploadResponse.status,
        });
        attemptedProviderCost = undefined;
        console.error("LinkedIn transfer failed: status", uploadResponse.status);
        return NextResponse.json(
          { success: false, error: "Failed to upload chunk to LinkedIn" },
          { status: 500 }
        );
      }

      await recordUploaderXLinkedInChunkCost({
        status: "success",
        userId: session.userId,
        ...transferProviderCost,
        providerStatusCode: uploadResponse.status,
      });
      attemptedProviderCost = undefined;

      const etag = uploadResponse.headers.get("etag");
      const cleanEtag = etag ? etag.replace(/^"|"$/g, "") : "";

      return NextResponse.json({
        success: true,
        etag: cleanEtag,
      });
    }

    // â”€â”€â”€ PHASE: FINISH â”€â”€â”€
    if (phase === "finish") {
      if (!videoUrn || !uploadToken) {
        console.error("LinkedIn finalize missing parameters:", { videoUrn, uploadToken });
        return NextResponse.json({ success: false, error: "Missing finalize parameters" }, { status: 400 });
      }

      // For LinkedIn, the finish phase doesn't need uploadedPartIds
      // The video is already uploaded in the transfer phase
      // We just need to finalize the upload
      const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
        requestType: "linkedin",
      });
      if (!publishCreditCheck.allowed) {
        return publishCreditCheck.errorResponse!;
      }
      const finalizeProviderCost: LinkedInChunkProviderCostContext = {
        operation: "social_media_upload",
        phase: "finish",
        videoUuid: telemetryVideoUuid,
        providerAssetId: videoUrn,
        postType: normalizedPostType,
        publishPath,
        requestCount: 1,
        uploadPartCount: Array.isArray(uploadedPartIds) ? uploadedPartIds.length : undefined,
      };
      attemptedProviderCost = finalizeProviderCost;
      const finalizeResponse = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
        method: "POST",
        headers: linkedInRestHeaders(accessToken),
        body: JSON.stringify({
          finalizeUploadRequest: {
            video: videoUrn,
            uploadToken,
            uploadedPartIds: [], // Empty array for LinkedIn single PUT upload
          },
        }),
      });

      let finalizeData: any = {};
      const finalizeText = await finalizeResponse.text();
      if (finalizeText) {
        try {
          finalizeData = JSON.parse(finalizeText);
        } catch (e) {
          console.error("LinkedIn finalize JSON parse error:", e, "Response text:", finalizeText);
          finalizeData = { raw: finalizeText };
        }
      }

      if (!finalizeResponse.ok || finalizeData.error) {
        await recordUploaderXLinkedInChunkCost({
          status: "failed",
          userId: session.userId,
          ...finalizeProviderCost,
          providerStatusCode: finalizeResponse.status,
        });
        attemptedProviderCost = undefined;
        const errorDetails = finalizeData.error || finalizeData.message || JSON.stringify(finalizeData);
        console.error("LinkedIn finalize failed:", errorDetails);
        return NextResponse.json(
          { success: false, error: "Failed to finalize LinkedIn video upload", details: errorDetails },
          { status: 500 }
        );
      }

      await recordUploaderXLinkedInChunkCost({
        status: "success",
        userId: session.userId,
        ...finalizeProviderCost,
        providerStatusCode: finalizeResponse.status,
      });
      attemptedProviderCost = undefined;

      // Share UGC Post
      const videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      const fileName = videoDoc?.filename || "video.mp4";
      const postText = title || description || "Posted via Insturix UploaderX";

      const postId = await createLinkedInRestPost({
        accessToken,
        authorUrn,
        postText,
        media: {
          id: videoUrn,
          type: "video",
          title: title || fileName,
        },
        costContext: baseCostContext,
      });

      if (!postId) {
        await recordUploaderXLinkedInChunkCost({
          status: "failed",
          userId: session.userId,
          operation: "social_publish",
          phase: "post_create",
          videoUuid: telemetryVideoUuid,
          providerAssetId: videoUrn,
          postType: normalizedPostType,
          publishPath,
          requestCount: 1,
        });
        return NextResponse.json(
          { success: false, error: "LinkedIn did not return a post id." },
          { status: 500 }
        );
      }

      pendingCompletedProviderCost = {
        operation: "social_publish",
        phase: "post_create",
        videoUuid: telemetryVideoUuid,
        providerPostId: postId,
        providerAssetId: videoUrn,
        postType: normalizedPostType,
        publishPath,
        requestCount: 1,
      };

      const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

      const linkedInMetadata = {
        postId,
        postUrl,
        assetUrn: videoUrn,
        mediaType: "video",
        publishPath: "linkedin-chunked-video",
        organizationId: normalizedPostType === "organization" ? organizationId : null,
        uploadedAt: new Date(),
        postType: videoPostType || "video",
      };

      const metadataSet: Record<string, unknown> = {
        [`metadata.linkedin.${normalizedPostType}`]: linkedInMetadata,
      };

      const organizationMetadataKey =
        normalizedPostType === "organization" ? linkedinOrganizationMetadataKey(organizationId) : null;
      if (organizationMetadataKey) {
        metadataSet[`metadata.linkedin.organizations.${organizationMetadataKey}`] = linkedInMetadata;
      }

      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: metadataSet,
          $unset: {
            "metadata.linkedin.activeUpload": "",
          },
        }
      );

      await emitUploaderXVideoPublished({
        userId: session.userId,
        videoUuid,
        platform: "linkedin",
        platformPostId: postId,
        platformUrl: postUrl,
        mediaType: "video",
        postType: normalizedPostType,
        organizationId: normalizedPostType === "organization" ? organizationId : null,
      }).catch((eventErr) =>
        console.warn("[UploaderX:LinkedIn] video_published event failed:", eventErr)
      );

      const deductResult = await deductPublishCredits(publishCreditCheck);
      await recordUploaderXLinkedInChunkCost({
        status: "success",
        userId: session.userId,
        ...pendingCompletedProviderCost,
        chargedCredits: deductResult.transactionId ? UPLOADERX_LINKEDIN_CHUNK_PUBLISH_CREDITS : undefined,
        creditTransactionId: deductResult.transactionId,
      });
      recordedPendingProviderCost = true;

      return NextResponse.json({
        success: true,
        postUrl,
        postId,
        mediaType: "video",
        postType: normalizedPostType,
        publishPath: "linkedin-chunked-video",
        organizationId: normalizedPostType === "organization" ? organizationId : null,
        videoPostType: videoPostType || "video",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    if (error instanceof UploaderXUploadUrlError) {
      return NextResponse.json({ success: false, error: "Invalid LinkedIn upload URL" }, { status: 400 });
    }

    if (currentUserId && pendingCompletedProviderCost && !recordedPendingProviderCost) {
      await recordUploaderXLinkedInChunkCost({
        status: "success",
        userId: currentUserId,
        ...pendingCompletedProviderCost,
      });
    } else if (currentUserId && attemptedProviderCost) {
      await recordUploaderXLinkedInChunkCost({
        status: "failed",
        userId: currentUserId,
        ...attemptedProviderCost,
        error,
      });
    }

    console.error("LinkedIn chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "LinkedIn upload failed" },
      { status: 500 }
    );
  }
}
async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:LinkedIn] chunk publish credit deduction failed:", error);
    return {};
  }
}

async function recordUploaderXLinkedInChunkCost(input: {
  status: ProviderCostEventStatus;
  operation: LinkedInChunkCostOperation;
  phase: LinkedInChunkCostPhase;
  userId: string;
  videoUuid?: string;
  providerPostId?: string;
  providerAssetId?: string;
  postType?: string;
  publishPath?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount?: number;
  chunkStartOffset?: number;
  chunkBytes?: number;
  uploadPartCount?: number;
  providerStatusCode?: number;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `uploaderx:linkedin:chunk:${input.phase}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_LINKEDIN_CHUNK_ROUTE,
    provider: UPLOADERX_LINKEDIN_CHUNK_PROVIDER,
    model: UPLOADERX_LINKEDIN_CHUNK_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.providerPostId ?? input.providerAssetId,
    units: {
      requestCount: input.requestCount ?? 1,
      bytesIn: input.chunkBytes,
    },
    metadata: {
      platform: "linkedin",
      uploadMode: "chunk",
      phase: input.phase,
      postType: input.postType,
      publishPath: input.publishPath,
      hasProviderPostId: Boolean(input.providerPostId),
      hasProviderAssetId: Boolean(input.providerAssetId),
      uploadPartCount: input.uploadPartCount,
      providerStatusCode: input.providerStatusCode,
      chunkStartOffset: input.chunkStartOffset,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
