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

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";

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
}: {
  accessToken: string;
  authorUrn: string;
  postText: string;
  media?: { id: string; type: "video"; title: string };
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

  const postResponse = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInRestHeaders(accessToken),
    body: JSON.stringify(body),
  });

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
    throw new Error("Failed to create LinkedIn post");
  }

  return postResponse.headers.get("x-restli-id") || postData.id;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

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

    // ─── PHASE: START ───
    if (phase === "start") {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);

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
        const errorDetails = initData.error || initData.message || JSON.stringify(initData);
        return NextResponse.json(
          { success: false, error: "Failed to initialize LinkedIn upload", details: errorDetails },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        videoUrn: initData.value?.video,
        uploadToken: initData.value?.uploadToken,
        uploadInstructions: initData.value?.uploadInstructions || [],
        fileSize,
      });
    }

    // ─── PHASE: TRANSFER ───
    if (phase === "transfer") {
      if (!uploadUrl || firstByte === undefined || lastByte === undefined) {
        return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
      }

      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, firstByte, lastByte);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(chunkBuffer),
      });

      if (!uploadResponse.ok) {
        return NextResponse.json(
          { success: false, error: "Failed to upload chunk to LinkedIn" },
          { status: 500 }
        );
      }

      const etag = uploadResponse.headers.get("etag");
      const cleanEtag = etag ? etag.replace(/^"|"$/g, "") : "";

      return NextResponse.json({
        success: true,
        etag: cleanEtag,
      });
    }

    // ─── PHASE: FINISH ───
    if (phase === "finish") {
      if (!videoUrn || !uploadToken || !Array.isArray(uploadedPartIds)) {
        return NextResponse.json({ success: false, error: "Missing finalize parameters" }, { status: 400 });
      }

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

      const finalizeData = await finalizeResponse.json();
      if (!finalizeResponse.ok || finalizeData.error) {
        const errorDetails = finalizeData.error || finalizeData.message || JSON.stringify(finalizeData);
        return NextResponse.json(
          { success: false, error: "Failed to finalize LinkedIn video upload", details: errorDetails },
          { status: 500 }
        );
      }

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
      });

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
    console.error("LinkedIn chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "LinkedIn upload failed" },
      { status: 500 }
    );
  }
}
