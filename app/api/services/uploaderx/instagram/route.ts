import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";

export const maxDuration = 500;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, accountId: requestedAccountId, postType } = body;

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

    const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
    const mediaUrl = videoAsset.publicUrl;
    const contentType = videoAsset.contentType || "video/mp4";
    const isVideo = contentType.startsWith("video/");
    const mediaType = isVideo ? "REELS" : "IMAGE";
    const fullCaption = finalCaption ? `${finalCaption}\n\n${finalDescription}`.trim() : finalDescription;

    const createContainerUrl = `https://graph.instagram.com/v21.0/me/media`;
    const containerParams = new URLSearchParams();
    containerParams.set(isVideo ? "video_url" : "image_url", mediaUrl);
    if (isVideo) {
      containerParams.set("media_type", "REELS");
    }
    containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
    containerParams.set("access_token", igUserAccessToken);

    const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
      method: "POST",
    });
    const containerData = await containerRes.json();

    if (containerData.error) {
      return NextResponse.json(
        {
          success: false,
          error: containerData.error.message || `Failed to create Instagram ${isVideo ? "Reel" : "post"}`,
        },
        { status: 500 }
      );
    }

    const containerId = containerData.id;

    if (isVideo) {
      let containerStatus = "IN_PROGRESS";
      let attempts = 0;
      const maxAttempts = 60;

      while (containerStatus === "IN_PROGRESS" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        const statusUrl = `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${igUserAccessToken}`;
        const statusRes = await fetch(statusUrl);
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
        return NextResponse.json(
          { success: false, error: "Instagram Reel processing timed out. Please try again later." },
          { status: 500 }
        );
      }
    }

    const publishUrl = `https://graph.instagram.com/v21.0/me/media_publish`;
    const publishParams = new URLSearchParams();
    publishParams.set("creation_id", containerId);
    publishParams.set("access_token", igUserAccessToken);

    const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
    const publishData = await publishRes.json();

    if (publishData.error) {
      return NextResponse.json(
        {
          success: false,
          error: publishData.error.message || `Failed to publish Instagram ${isVideo ? "Reel" : "post"}`,
        },
        { status: 500 }
      );
    }

    const mediaId = publishData.id;
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

    return NextResponse.json({
      success: true,
      instagramUrl,
      mediaId,
      accountUsername: targetAccount.instagramUsername,
      mediaType,
      postType: postType || "reel",
    });
  } catch (error: any) {
    console.error("Instagram operation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Instagram publish failed" },
      { status: 500 }
    );
  }
}
