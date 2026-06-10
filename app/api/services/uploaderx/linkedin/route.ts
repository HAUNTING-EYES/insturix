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

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    let { gcsPath, videoUuid, title, description, postType = "personal", organizationId } = body;
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
          updated: false,
          note: "LinkedIn post already exists for this target. Returning existing post.",
        });
      }
    }

    let mediaType = "NONE";
    let assetUrn: string | undefined;
    let fileName = title || "LinkedIn post";

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
          { success: false, error: "Failed to upload file to LinkedIn" },
          { status: 500 }
        );
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
          details: postData,
        },
        { status: 500 }
      );
    }

    const postId = postData.id;
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    if (videoUuid) {
      const linkedInMetadata = {
        postId,
        postUrl,
        assetUrn,
        mediaType,
        organizationId: postType === "organization" ? organizationId : null,
        uploadedAt: new Date(),
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
      organizationId: postType === "organization" ? organizationId : null,
    });
  } catch (error) {
    console.error("LinkedIn upload error:", error);
    return NextResponse.json({ success: false, error: "Failed to upload to LinkedIn" }, { status: 500 });
  }
}
