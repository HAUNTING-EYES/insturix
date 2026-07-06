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
import { fetchUploaderXBuffer, resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";


export const maxDuration = 300;

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";
const UPLOADERX_LINKEDIN_PROVIDER = "linkedin-api";
const UPLOADERX_LINKEDIN_MODEL = `linkedin-rest-${LINKEDIN_REST_API_VERSION}`;
const UPLOADERX_LINKEDIN_ROUTE = "/api/services/uploaderx/linkedin";
const UPLOADERX_LINKEDIN_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "linkedin",
});

type LinkedInMediaType = "image" | "video" | "document";
type LinkedInCostOperation = "social_media_upload" | "social_publish";
type LinkedInCostPhase =
  | "rest_video_initialize"
  | "rest_video_transfer"
  | "rest_video_finalize"
  | "rest_media_initialize"
  | "rest_media_transfer"
  | "legacy_media_register"
  | "legacy_media_transfer"
  | "post_create";

interface LinkedInCostBaseContext {
  userId: string;
  videoUuid?: string;
  postType: string;
  publishPath: string;
}

interface LinkedInProviderCostContext {
  operation: LinkedInCostOperation;
  phase: LinkedInCostPhase;
  videoUuid?: string;
  mediaType?: string;
  postType?: string;
  publishPath?: string;
  providerPostId?: string;
  providerAssetId?: string;
  requestCount?: number;
  chunkBytes?: number;
  uploadPartCount?: number;
  providerStatusCode?: number;
}

export async function POST(req: Request) {
  let currentUserId: string | undefined;
  let telemetryVideoUuid: string | undefined;
  let attemptedProviderCost: LinkedInProviderCostContext | undefined;
  let pendingCompletedProviderCost: LinkedInProviderCostContext | undefined;
  let recordedPendingProviderCost = false;

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    currentUserId = session.userId;

    const body = await req.json();
    let { gcsPath, videoUuid, title, description, postType = "personal", organizationId, videoPostType } = body;
    telemetryVideoUuid = typeof videoUuid === "string" ? videoUuid : undefined;
    postType = normalizeLinkedInPostTarget(postType);
    const postText = title || description || "Posted via Insturix UploaderX";
    const hasMedia = !!gcsPath;

    if (!hasMedia && !postText.trim()) {
      return NextResponse.json(
        { success: false, error: "LinkedIn post content is required." },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      linkedinTokens: { $exists: true, $ne: null },
    });

    if (!user?.linkedinTokens) {
      return NextResponse.json(
        {
          success: false,
          error: "LinkedIn not connected. Please connect your LinkedIn account first.",
        },
        { status: 403 }
      );
    }

    const tokens = user.linkedinTokens;
    let accessToken = tokens.accessToken;
    let userId = tokens.userId;

    if (!userId) {
      try {
        const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          userId = profileData.id;
          await User.updateOne(
            { clerkUserId: session.userId },
            { $set: { "linkedinTokens.userId": userId } }
          );
        }
      } catch (profileError) {
        console.warn("Error fetching LinkedIn profile:", profileError);
      }
    }

    const now = new Date();
    if (tokens.expiresAt && tokens.expiresAt < now) {
      if (!tokens.refreshToken) {
        return NextResponse.json(
          { success: false, error: "LinkedIn token expired. Please reconnect your LinkedIn account." },
          { status: 401 }
        );
      }

      const clientId = process.env.LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { success: false, error: "LinkedIn token expired. Please reconnect your LinkedIn account." },
          { status: 401 }
        );
      }

      try {
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
        if (!refreshResponse.ok || !refreshData.access_token) {
          return NextResponse.json(
            { success: false, error: "LinkedIn token expired. Please reconnect your LinkedIn account." },
            { status: 401 }
          );
        }

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
      } catch (refreshError) {
        console.error("LinkedIn token refresh error:", refreshError);
        return NextResponse.json(
          { success: false, error: "LinkedIn token expired. Please reconnect your LinkedIn account." },
          { status: 401 }
        );
      }
    }

    const canPostPersonal = !!userId;
    const organizations = tokens.organizations || [];
    const hasOrganizations = organizations.length > 0;
    const missingScopes = tokens.missingScopes || [];

    if (!canPostPersonal && !hasOrganizations) {
      return NextResponse.json(
        {
          success: false,
          error: missingScopes.includes("profile") || missingScopes.includes("openid")
            ? "LinkedIn personal posting needs OpenID profile access. Please reconnect LinkedIn and grant profile permission."
            : "LinkedIn posting target is unavailable. Please reconnect LinkedIn and grant the required permissions.",
          missingScopes,
        },
        { status: 400 }
      );
    }

    let authorUrn: string;
    if (postType === "organization") {
      if (!organizationId) {
        if (!hasOrganizations) {
          return NextResponse.json(
            { success: false, error: "Organization ID is required for LinkedIn organization posts." },
            { status: 400 }
          );
        }
        organizationId = organizations[0].id;
      }

      const org = organizations.find((item: any) => String(item.id) === String(organizationId));
      if (!org) {
        return NextResponse.json(
          { success: false, error: "Organization not found or you don't have access to it." },
          { status: 400 }
        );
      }
      authorUrn = `urn:li:organization:${organizationId}`;
    } else {
      if (!userId) {
        return NextResponse.json(
          {
            success: false,
            error: hasOrganizations
              ? "Personal profile posting not available. Please use organization posting by specifying organizationId."
              : "LinkedIn personal posting requires profile access. Reconnect with the LinkedIn profile permission enabled.",
          },
          { status: 400 }
        );
      }
      authorUrn = `urn:li:person:${userId}`;
    }

    let videoDoc = null;
    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      const existingPost = getExistingLinkedInPublishedPost(
        videoDoc?.metadata,
        postType,
        postType === "organization" ? organizationId : null,
      );

      if (existingPost) {
        return NextResponse.json({
          success: true,
          postUrl: existingPost.postUrl,
          postId: existingPost.postId,
          mediaType: existingPost.mediaType || (hasMedia ? "media" : "text"),
          postType,
          organizationId: existingPost.organizationId,
          publishPath: hasMedia ? "linkedin-existing-media" : "linkedin-existing-text",
          updated: false,
          note: "LinkedIn post already exists for this target. Returning existing post.",
        });
      }
    }

    const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
      requestType: "linkedin",
    });
    if (!publishCreditCheck.allowed) {
      return publishCreditCheck.errorResponse!;
    }

    let mediaType = "NONE";
    let assetUrn: string | undefined;
    let fileName = title || "LinkedIn post";
    const useRestMediaPath = hasMedia && shouldUseLinkedInRestMediaPath();
    const publishPath = hasMedia
      ? useRestMediaPath
        ? "linkedin-rest-media"
        : "linkedin-legacy-media"
      : "linkedin-rest-text";
    const baseCostContext: LinkedInCostBaseContext = {
      userId: session.userId,
      videoUuid: telemetryVideoUuid,
      postType,
      publishPath,
    };

    if (hasMedia) {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
      fileName = videoAsset.filename || gcsPath.split("/").pop() || "file";
      const contentType = videoAsset.contentType || "application/octet-stream";
      
      // For large videos (> 10 min / 600s or > 500MB), use chunked upload
      const shouldUseChunkedUpload = (videoAsset.duration ?? 0) > 600 || (videoAsset.size && videoAsset.size > 500 * 1024 * 1024);

      if (shouldUseChunkedUpload && contentType.startsWith("video/")) {
        // Use LinkedIn's chunked video upload API
        const initProviderCost: LinkedInProviderCostContext = {
          operation: "social_media_upload",
          phase: "rest_video_initialize",
          videoUuid: telemetryVideoUuid,
          mediaType: "video",
          postType,
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
              fileSizeBytes: videoAsset.size,
              uploadCaptions: false,
              uploadThumbnail: false,
            },
          }),
        });
        const initData = await safeJson(initResponse);
        const videoUrn = initData.value?.video;
        const uploadToken = initData.value?.uploadToken;
        const uploadInstructions = Array.isArray(initData.value?.uploadInstructions) ? initData.value.uploadInstructions : [];

        if (!initResponse.ok || initData.error || !videoUrn || uploadInstructions.length === 0) {
          await recordUploaderXLinkedInCost({
            status: "failed",
            userId: session.userId,
            ...initProviderCost,
            providerStatusCode: initResponse.status,
          });
          attemptedProviderCost = undefined;
          const errorDetails = initData.error || initData.message || JSON.stringify(initData);
          return NextResponse.json(
            {
              success: false,
              error: "Failed to initialize LinkedIn video upload",
              details: errorDetails,
            },
            { status: 500 }
          );
        }

        await recordUploaderXLinkedInCost({
          status: "success",
          userId: session.userId,
          ...initProviderCost,
          providerAssetId: videoUrn,
          uploadPartCount: uploadInstructions.length,
          providerStatusCode: initResponse.status,
        });
        attemptedProviderCost = undefined;

        // Upload video in chunks
        const uploadedPartIds: string[] = [];
        for (const instruction of uploadInstructions) {
          const firstByte = Number(instruction.firstByte);
          const lastByte = Number(instruction.lastByte);
          if (!instruction.uploadUrl || Number.isNaN(firstByte) || Number.isNaN(lastByte)) {
            return NextResponse.json(
              { success: false, error: "LinkedIn video upload instructions are invalid" },
              { status: 500 }
            );
          }

          const chunkBuffer = await fetchUploaderXBuffer(videoAsset.publicUrl, firstByte, lastByte);
          const chunkBytes = Math.max(0, lastByte - firstByte + 1);
          const transferProviderCost: LinkedInProviderCostContext = {
            operation: "social_media_upload",
            phase: "rest_video_transfer",
            videoUuid: telemetryVideoUuid,
            mediaType: "video",
            postType,
            publishPath,
            providerAssetId: videoUrn,
            requestCount: 1,
            chunkBytes,
            uploadPartCount: uploadInstructions.length,
          };
          attemptedProviderCost = transferProviderCost;

          const uploadResponse = await fetch(instruction.uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/octet-stream",
            },
            body: new Uint8Array(chunkBuffer),
          });

          if (!uploadResponse.ok) {
            await recordUploaderXLinkedInCost({
              status: "failed",
              userId: session.userId,
              ...transferProviderCost,
              providerStatusCode: uploadResponse.status,
            });
            attemptedProviderCost = undefined;
            return NextResponse.json(
              { success: false, error: "Failed to upload LinkedIn video part" },
              { status: 500 }
            );
          }

          await recordUploaderXLinkedInCost({
            status: "success",
            userId: session.userId,
            ...transferProviderCost,
            providerStatusCode: uploadResponse.status,
          });
          attemptedProviderCost = undefined;

          const etag = uploadResponse.headers.get("etag");
          if (etag) {
            uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
          }
        }

        // Finalize upload
        const finalizeProviderCost: LinkedInProviderCostContext = {
          operation: "social_media_upload",
          phase: "rest_video_finalize",
          videoUuid: telemetryVideoUuid,
          mediaType: "video",
          postType,
          publishPath,
          providerAssetId: videoUrn,
          requestCount: 1,
          uploadPartCount: uploadedPartIds.length,
        };
        attemptedProviderCost = finalizeProviderCost;
        const finalizeResponse = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
          method: "POST",
          headers: linkedInRestHeaders(accessToken),
          body: JSON.stringify({
            finalizeUploadRequest: {
              video: videoUrn,
              uploadToken,
              uploadedPartIds,
            },
          }),
        });
        const finalizeData = await safeJson(finalizeResponse);
        if (!finalizeResponse.ok || finalizeData.error) {
          await recordUploaderXLinkedInCost({
            status: "failed",
            userId: session.userId,
            ...finalizeProviderCost,
            providerStatusCode: finalizeResponse.status,
          });
          attemptedProviderCost = undefined;
          const errorDetails = finalizeData.error || finalizeData.message || JSON.stringify(finalizeData);
          return NextResponse.json(
            { success: false, error: "Failed to finalize LinkedIn video upload", details: errorDetails },
            { status: 500 }
          );
        }

        await recordUploaderXLinkedInCost({
          status: "success",
          userId: session.userId,
          ...finalizeProviderCost,
          providerStatusCode: finalizeResponse.status,
        });
        attemptedProviderCost = undefined;

        assetUrn = videoUrn;
        mediaType = "video";
      } else {
        // Use standard upload for small videos
        const fileBuffer = await fetchUploaderXBuffer(videoAsset.publicUrl);

        mediaType = "document";
        if (contentType.startsWith("video/")) {
          mediaType = "video";
        } else if (contentType.startsWith("image/")) {
          mediaType = "image";
        } else if (contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
          mediaType = "document";
        }

        if (useRestMediaPath) {
          assetUrn = await uploadLinkedInRestMedia({
            accessToken,
            authorUrn,
            fileBuffer,
            fileName,
            contentType,
            mediaType: mediaType as LinkedInMediaType,
            costContext: baseCostContext,
          });
        } else {
          const registerProviderCost: LinkedInProviderCostContext = {
            operation: "social_media_upload",
            phase: "legacy_media_register",
            videoUuid: telemetryVideoUuid,
            mediaType,
            postType,
            publishPath,
            requestCount: 1,
          };
          attemptedProviderCost = registerProviderCost;
          const registerResponse = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: [`urn:li:digitalmediaRecipe:feedshare-${mediaType}`],
                owner: authorUrn,
                serviceRelationships: [
                  {
                    relationshipType: "OWNER",
                    identifier: "urn:li:userGeneratedContent",
                  },
                ],
              },
            }),
          });

          const registerData = await safeJson(registerResponse);
          const uploadUrl =
            registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
              ?.uploadUrl;
          assetUrn = registerData.value?.asset;

          if (!registerResponse.ok || registerData.error || !uploadUrl || !assetUrn) {
            await recordUploaderXLinkedInCost({
              status: "failed",
              userId: session.userId,
              ...registerProviderCost,
              providerStatusCode: registerResponse.status,
            });
            attemptedProviderCost = undefined;
            return NextResponse.json(
              {
                success: false,
                error: "Failed to register upload with LinkedIn",
                publishPath,
                step: "register-upload",
                details: registerData,
              },
              { status: 500 }
            );
          }

          await recordUploaderXLinkedInCost({
            status: "success",
            userId: session.userId,
            ...registerProviderCost,
            providerAssetId: assetUrn,
            providerStatusCode: registerResponse.status,
          });
          attemptedProviderCost = undefined;

          const legacyTransferProviderCost: LinkedInProviderCostContext = {
            operation: "social_media_upload",
            phase: "legacy_media_transfer",
            videoUuid: telemetryVideoUuid,
            mediaType,
            postType,
            publishPath,
            providerAssetId: assetUrn,
            requestCount: 1,
            chunkBytes: fileBuffer.length,
          };
          attemptedProviderCost = legacyTransferProviderCost;
          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": contentType,
            },
            body: fileBuffer,
          });

          if (!uploadResponse.ok) {
            await recordUploaderXLinkedInCost({
              status: "failed",
              userId: session.userId,
              ...legacyTransferProviderCost,
              providerStatusCode: uploadResponse.status,
            });
            attemptedProviderCost = undefined;
            return NextResponse.json(
              { success: false, error: "Failed to upload file to LinkedIn", publishPath, step: "upload-media" },
              { status: 500 }
            );
          }

          await recordUploaderXLinkedInCost({
            status: "success",
            userId: session.userId,
            ...legacyTransferProviderCost,
            providerStatusCode: uploadResponse.status,
          });
          attemptedProviderCost = undefined;
        }
      }
    }

    const shareContent: any = {
      shareCommentary: { text: postText },
      shareMediaCategory: hasMedia ? mediaType.toUpperCase() : "NONE",
    };

    if (hasMedia && assetUrn) {
      shareContent.media = [
        {
          status: "READY",
          description: { text: description || title || `Uploaded via Insturix UploaderX` },
          media: assetUrn,
          title: { text: title || fileName },
        },
      ];
    }

    let postId: string | undefined;

    if (!hasMedia || useRestMediaPath) {
      postId = await createLinkedInRestPost({
        accessToken,
        authorUrn,
        postText,
        media: hasMedia && assetUrn
          ? {
              id: assetUrn,
              type: mediaType as LinkedInMediaType,
              title: title || fileName,
            }
          : undefined,
        costContext: baseCostContext,
      });
    } else {
      const postBody: any = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": shareContent,
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const postProviderCost: LinkedInProviderCostContext = {
        operation: "social_publish",
        phase: "post_create",
        videoUuid: telemetryVideoUuid,
        mediaType: hasMedia ? mediaType : "text",
        postType,
        publishPath,
        providerAssetId: assetUrn,
        requestCount: 1,
      };
      attemptedProviderCost = postProviderCost;
      const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      const postData = await safeJson(postResponse);
      if (!postResponse.ok || postData.error) {
        await recordUploaderXLinkedInCost({
          status: "failed",
          userId: session.userId,
          ...postProviderCost,
          providerStatusCode: postResponse.status,
        });
        attemptedProviderCost = undefined;
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create LinkedIn post",
            publishPath,
            step: "create-post",
            details: postData,
          },
          { status: 500 }
        );
      }

      postId = postData.id;
      attemptedProviderCost = undefined;
    }

    if (!postId) {
      await recordUploaderXLinkedInCost({
        status: "failed",
        userId: session.userId,
        operation: "social_publish",
        phase: "post_create",
        videoUuid: telemetryVideoUuid,
        mediaType: hasMedia ? mediaType : "text",
        postType,
        publishPath,
        providerAssetId: assetUrn,
        requestCount: 1,
      });
      return NextResponse.json(
        {
          success: false,
          error: "LinkedIn did not return a post id.",
          publishPath,
          step: "create-post",
        },
        { status: 500 }
      );
    }

    pendingCompletedProviderCost = {
      operation: "social_publish",
      phase: "post_create",
      videoUuid: telemetryVideoUuid,
      mediaType: hasMedia ? mediaType : "text",
      postType,
      publishPath,
      providerPostId: postId,
      providerAssetId: assetUrn,
      requestCount: 1,
    };

    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    if (videoUuid) {
      const linkedInMetadata = {
        postId,
        postUrl,
        assetUrn,
        mediaType,
        publishPath,
        organizationId: postType === "organization" ? organizationId : null,
        uploadedAt: new Date(),
        postType: videoPostType || "video",
      };
      const metadataSet: Record<string, unknown> = {
        [`metadata.linkedin.${postType}`]: linkedInMetadata,
      };
      const organizationMetadataKey =
        postType === "organization" ? linkedinOrganizationMetadataKey(organizationId) : null;
      if (organizationMetadataKey) {
        metadataSet[`metadata.linkedin.organizations.${organizationMetadataKey}`] = linkedInMetadata;
      }

      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: metadataSet,
        }
      );
      await emitUploaderXVideoPublished({
        userId: session.userId,
        videoUuid,
        platform: "linkedin",
        platformPostId: postId,
        platformUrl: postUrl,
        mediaType: hasMedia ? mediaType : "text",
        postType,
        organizationId: postType === "organization" ? organizationId : null,
      }).catch((eventErr) =>
        console.warn("[UploaderX:LinkedIn] video_published event failed:", eventErr),
      );
    }

    const deductResult = await deductPublishCredits(publishCreditCheck);
    await recordUploaderXLinkedInCost({
      status: "success",
      userId: session.userId,
      ...pendingCompletedProviderCost,
      chargedCredits: deductResult.transactionId ? UPLOADERX_LINKEDIN_PUBLISH_CREDITS : undefined,
      creditTransactionId: deductResult.transactionId,
    });
    recordedPendingProviderCost = true;

    return NextResponse.json({
      success: true,
      postUrl,
      postId,
      mediaType: hasMedia ? mediaType : "text",
      postType,
      publishPath,
      organizationId: postType === "organization" ? organizationId : null,
      videoPostType: videoPostType || "video",
    });
  } catch (error) {
    if (currentUserId && pendingCompletedProviderCost && !recordedPendingProviderCost) {
      await recordUploaderXLinkedInCost({
        status: "success",
        userId: currentUserId,
        ...pendingCompletedProviderCost,
      });
    } else if (currentUserId && attemptedProviderCost) {
      await recordUploaderXLinkedInCost({
        status: "failed",
        userId: currentUserId,
        ...attemptedProviderCost,
        error,
      });
    }

    console.error("LinkedIn upload error:", error);
    return NextResponse.json({ success: false, error: "Failed to upload to LinkedIn" }, { status: 500 });
  }
}

async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:LinkedIn] publish credit deduction failed:", error);
    return {};
  }
}

function shouldUseLinkedInRestMediaPath() {
  return process.env.UPLOADERX_LINKEDIN_REST_MEDIA === "true";
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
  media?: { id: string; type: LinkedInMediaType; title: string };
  costContext: LinkedInCostBaseContext;
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
        ...(media.type === "image" ? {} : { title: media.title }),
      },
    };
  }

  const providerCost: LinkedInProviderCostContext = {
    operation: "social_publish",
    phase: "post_create",
    videoUuid: costContext.videoUuid,
    mediaType: media?.type ?? "text",
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    providerAssetId: media?.id,
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
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...providerCost,
      error,
    });
    throw error;
  }

  const postData = await safeJson(postResponse);
  if (!postResponse.ok || postData.error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...providerCost,
      providerStatusCode: postResponse.status,
    });
    throw new Error("Failed to create LinkedIn post");
  }

  return postResponse.headers.get("x-restli-id") || postData.id;
}

async function uploadLinkedInRestMedia({
  accessToken,
  authorUrn,
  fileBuffer,
  fileName,
  contentType,
  mediaType,
  costContext,
}: {
  accessToken: string;
  authorUrn: string;
  fileBuffer: Buffer;
  fileName: string;
  contentType: string;
  mediaType: LinkedInMediaType;
  costContext: LinkedInCostBaseContext;
}) {
  if (mediaType === "video") {
    return uploadLinkedInRestVideo({ accessToken, authorUrn, fileBuffer, costContext });
  }

  const endpoint =
    mediaType === "image"
      ? "https://api.linkedin.com/rest/images?action=initializeUpload"
      : "https://api.linkedin.com/rest/documents?action=initializeUpload";
  const urnField = mediaType === "image" ? "image" : "document";
  const initProviderCost: LinkedInProviderCostContext = {
    operation: "social_media_upload",
    phase: "rest_media_initialize",
    videoUuid: costContext.videoUuid,
    mediaType,
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    requestCount: 1,
  };

  let initResponse: Response;
  try {
    initResponse = await fetch(endpoint, {
      method: "POST",
      headers: linkedInRestHeaders(accessToken),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    });
  } catch (error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...initProviderCost,
      error,
    });
    throw error;
  }
  const initData = await safeJson(initResponse);
  const uploadUrl = initData.value?.uploadUrl;
  const mediaUrn = initData.value?.[urnField];

  if (!initResponse.ok || initData.error || !uploadUrl || !mediaUrn) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...initProviderCost,
      providerStatusCode: initResponse.status,
    });
    const errorDetails = initData.error || initData.message || JSON.stringify(initData);
    throw new Error(
      `Failed to initialize LinkedIn ${mediaType} upload: ${initResponse.status} - ${errorDetails}`
    );
  }

  await recordUploaderXLinkedInCost({
    status: "success",
    userId: costContext.userId,
    ...initProviderCost,
    providerAssetId: mediaUrn,
    providerStatusCode: initResponse.status,
  });

  const transferProviderCost: LinkedInProviderCostContext = {
    operation: "social_media_upload",
    phase: "rest_media_transfer",
    videoUuid: costContext.videoUuid,
    mediaType,
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    providerAssetId: mediaUrn,
    requestCount: 1,
    chunkBytes: fileBuffer.length,
  };

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType || "application/octet-stream",
      },
      body: new Uint8Array(fileBuffer),
    });
  } catch (error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...transferProviderCost,
      error,
    });
    throw error;
  }

  if (!uploadResponse.ok) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...transferProviderCost,
      providerStatusCode: uploadResponse.status,
    });
    throw new Error(`Failed to upload LinkedIn ${mediaType}`);
  }

  await recordUploaderXLinkedInCost({
    status: "success",
    userId: costContext.userId,
    ...transferProviderCost,
    providerStatusCode: uploadResponse.status,
  });

  return mediaUrn;
}

async function uploadLinkedInRestVideo({
  accessToken,
  authorUrn,
  fileBuffer,
  costContext,
}: {
  accessToken: string;
  authorUrn: string;
  fileBuffer: Buffer;
  costContext: LinkedInCostBaseContext;
}) {
  const initProviderCost: LinkedInProviderCostContext = {
    operation: "social_media_upload",
    phase: "rest_video_initialize",
    videoUuid: costContext.videoUuid,
    mediaType: "video",
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    requestCount: 1,
  };

  let initResponse: Response;
  try {
    initResponse = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST",
      headers: linkedInRestHeaders(accessToken),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes: fileBuffer.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });
  } catch (error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...initProviderCost,
      error,
    });
    throw error;
  }
  const initData = await safeJson(initResponse);
  const videoUrn = initData.value?.video;
  const uploadInstructions = Array.isArray(initData.value?.uploadInstructions)
    ? initData.value.uploadInstructions
    : [];

  if (!initResponse.ok || initData.error || !videoUrn || uploadInstructions.length === 0) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...initProviderCost,
      providerStatusCode: initResponse.status,
    });
    const errorDetails = initData.error || initData.message || JSON.stringify(initData);
    throw new Error(
      `Failed to initialize LinkedIn video upload: ${initResponse.status} - ${errorDetails}`
    );
  }

  await recordUploaderXLinkedInCost({
    status: "success",
    userId: costContext.userId,
    ...initProviderCost,
    providerAssetId: videoUrn,
    uploadPartCount: uploadInstructions.length,
    providerStatusCode: initResponse.status,
  });

  const uploadedPartIds: string[] = [];
  for (const instruction of uploadInstructions) {
    const firstByte = Number(instruction.firstByte);
    const lastByte = Number(instruction.lastByte);
    if (!instruction.uploadUrl || Number.isNaN(firstByte) || Number.isNaN(lastByte)) {
      throw new Error("LinkedIn video upload instructions are invalid");
    }

    const chunkBytes = Math.max(0, lastByte - firstByte + 1);
    const transferProviderCost: LinkedInProviderCostContext = {
      operation: "social_media_upload",
      phase: "rest_video_transfer",
      videoUuid: costContext.videoUuid,
      mediaType: "video",
      postType: costContext.postType,
      publishPath: costContext.publishPath,
      providerAssetId: videoUrn,
      requestCount: 1,
      chunkBytes,
      uploadPartCount: uploadInstructions.length,
    };

    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(instruction.uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(fileBuffer.subarray(firstByte, lastByte + 1)),
      });
    } catch (error) {
      await recordUploaderXLinkedInCost({
        status: "failed",
        userId: costContext.userId,
        ...transferProviderCost,
        error,
      });
      throw error;
    }

    if (!uploadResponse.ok) {
      await recordUploaderXLinkedInCost({
        status: "failed",
        userId: costContext.userId,
        ...transferProviderCost,
        providerStatusCode: uploadResponse.status,
      });
      throw new Error("Failed to upload LinkedIn video part");
    }

    await recordUploaderXLinkedInCost({
      status: "success",
      userId: costContext.userId,
      ...transferProviderCost,
      providerStatusCode: uploadResponse.status,
    });

    const etag = uploadResponse.headers.get("etag");
    if (etag) {
      uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
    }
  }

  const finalizeProviderCost: LinkedInProviderCostContext = {
    operation: "social_media_upload",
    phase: "rest_video_finalize",
    videoUuid: costContext.videoUuid,
    mediaType: "video",
    postType: costContext.postType,
    publishPath: costContext.publishPath,
    providerAssetId: videoUrn,
    requestCount: 1,
    uploadPartCount: uploadedPartIds.length,
  };

  let finalizeResponse: Response;
  try {
    finalizeResponse = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST",
      headers: linkedInRestHeaders(accessToken),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: initData.value?.uploadToken || "",
          uploadedPartIds,
        },
      }),
    });
  } catch (error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...finalizeProviderCost,
      error,
    });
    throw error;
  }
  const finalizeData = await safeJson(finalizeResponse);
  if (!finalizeResponse.ok || finalizeData.error) {
    await recordUploaderXLinkedInCost({
      status: "failed",
      userId: costContext.userId,
      ...finalizeProviderCost,
      providerStatusCode: finalizeResponse.status,
    });
    const errorDetails = finalizeData.error || finalizeData.message || JSON.stringify(finalizeData);
    throw new Error(
      `Failed to finalize LinkedIn video upload: ${finalizeResponse.status} - ${errorDetails}`
    );
  }

  await recordUploaderXLinkedInCost({
    status: "success",
    userId: costContext.userId,
    ...finalizeProviderCost,
    providerStatusCode: finalizeResponse.status,
  });

  return videoUrn;
}

async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function recordUploaderXLinkedInCost(input: {
  status: ProviderCostEventStatus;
  operation: LinkedInCostOperation;
  phase: LinkedInCostPhase;
  userId: string;
  videoUuid?: string;
  mediaType?: string;
  postType?: string;
  publishPath?: string;
  providerPostId?: string;
  providerAssetId?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount?: number;
  chunkBytes?: number;
  uploadPartCount?: number;
  providerStatusCode?: number;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `uploaderx:linkedin:${input.phase}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_LINKEDIN_ROUTE,
    provider: UPLOADERX_LINKEDIN_PROVIDER,
    model: UPLOADERX_LINKEDIN_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.providerPostId ?? input.providerAssetId,
    units: {
      requestCount: input.requestCount ?? 1,
      bytesIn: input.chunkBytes,
    },
    metadata: {
      platform: "linkedin",
      phase: input.phase,
      mediaType: input.mediaType,
      postType: input.postType,
      publishPath: input.publishPath,
      hasProviderPostId: Boolean(input.providerPostId),
      hasProviderAssetId: Boolean(input.providerAssetId),
      uploadPartCount: input.uploadPartCount,
      providerStatusCode: input.providerStatusCode,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
