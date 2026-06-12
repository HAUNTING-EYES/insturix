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

export const maxDuration = 500;

const LINKEDIN_REST_API_VERSION = process.env.LINKEDIN_REST_API_VERSION || "202605";

type LinkedInMediaType = "image" | "video" | "document";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    let { gcsPath, videoUuid, title, description, postType = "personal", organizationId, videoPostType } = body;
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

    let mediaType = "NONE";
    let assetUrn: string | undefined;
    let fileName = title || "LinkedIn post";
    const useRestMediaPath = hasMedia && shouldUseLinkedInRestMediaPath();
    const publishPath = hasMedia
      ? useRestMediaPath
        ? "linkedin-rest-media"
        : "linkedin-legacy-media"
      : "linkedin-rest-text";

    if (hasMedia) {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
      fileName = videoAsset.filename || gcsPath.split("/").pop() || "file";
      const contentType = videoAsset.contentType || "application/octet-stream";
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
        });
      } else {
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

        const registerData = await registerResponse.json();
        if (!registerResponse.ok || registerData.error) {
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

        const uploadUrl =
          registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
            .uploadUrl;
        assetUrn = registerData.value.asset;

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
          },
          body: fileBuffer,
        });

        if (!uploadResponse.ok) {
          return NextResponse.json(
            { success: false, error: "Failed to upload file to LinkedIn", publishPath, step: "upload-media" },
            { status: 500 }
          );
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

      const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      const postData = await postResponse.json();
      if (!postResponse.ok || postData.error) {
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
    }

    if (!postId) {
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
    console.error("LinkedIn upload error:", error);
    return NextResponse.json({ success: false, error: "Failed to upload to LinkedIn" }, { status: 500 });
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
}: {
  accessToken: string;
  authorUrn: string;
  postText: string;
  media?: { id: string; type: LinkedInMediaType; title: string };
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

async function uploadLinkedInRestMedia({
  accessToken,
  authorUrn,
  fileBuffer,
  fileName,
  contentType,
  mediaType,
}: {
  accessToken: string;
  authorUrn: string;
  fileBuffer: Buffer;
  fileName: string;
  contentType: string;
  mediaType: LinkedInMediaType;
}) {
  if (mediaType === "video") {
    return uploadLinkedInRestVideo({ accessToken, authorUrn, fileBuffer });
  }

  const endpoint =
    mediaType === "image"
      ? "https://api.linkedin.com/rest/images?action=initializeUpload"
      : "https://api.linkedin.com/rest/documents?action=initializeUpload";
  const urnField = mediaType === "image" ? "image" : "document";

  const initResponse = await fetch(endpoint, {
    method: "POST",
    headers: linkedInRestHeaders(accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
  });
  const initData = await safeJson(initResponse);
  const uploadUrl = initData.value?.uploadUrl;
  const mediaUrn = initData.value?.[urnField];

  if (!initResponse.ok || initData.error || !uploadUrl || !mediaUrn) {
    const errorDetails = initData.error || initData.message || JSON.stringify(initData);
    throw new Error(
      `Failed to initialize LinkedIn ${mediaType} upload: ${initResponse.status} - ${errorDetails}`
    );
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload LinkedIn ${mediaType}`);
  }

  return mediaUrn;
}

async function uploadLinkedInRestVideo({
  accessToken,
  authorUrn,
  fileBuffer,
}: {
  accessToken: string;
  authorUrn: string;
  fileBuffer: Buffer;
}) {
  const initResponse = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
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
  const initData = await safeJson(initResponse);
  const videoUrn = initData.value?.video;
  const uploadInstructions = Array.isArray(initData.value?.uploadInstructions)
    ? initData.value.uploadInstructions
    : [];

  if (!initResponse.ok || initData.error || !videoUrn || uploadInstructions.length === 0) {
    const errorDetails = initData.error || initData.message || JSON.stringify(initData);
    throw new Error(
      `Failed to initialize LinkedIn video upload: ${initResponse.status} - ${errorDetails}`
    );
  }

  const uploadedPartIds: string[] = [];
  for (const instruction of uploadInstructions) {
    const firstByte = Number(instruction.firstByte);
    const lastByte = Number(instruction.lastByte);
    if (!instruction.uploadUrl || Number.isNaN(firstByte) || Number.isNaN(lastByte)) {
      throw new Error("LinkedIn video upload instructions are invalid");
    }

    const uploadResponse = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(fileBuffer.subarray(firstByte, lastByte + 1)),
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload LinkedIn video part");
    }

    const etag = uploadResponse.headers.get("etag");
    if (etag) {
      uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
    }
  }

  const finalizeResponse = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
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
  const finalizeData = await safeJson(finalizeResponse);
  if (!finalizeResponse.ok || finalizeData.error) {
    const errorDetails = finalizeData.error || finalizeData.message || JSON.stringify(finalizeData);
    throw new Error(
      `Failed to finalize LinkedIn video upload: ${finalizeResponse.status} - ${errorDetails}`
    );
  }

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
