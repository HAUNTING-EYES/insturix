import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, accountId: requestedAccountId } = body;

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
    const pageTokens = ig.pageTokens || [];
    if (accounts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No Instagram Business accounts found. You need at least one connected account.",
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

    // Get the corresponding page access token for this Instagram account
    const pageTokenEntry = pageTokens.find(
      (pt: any) => pt.instagramAccountId === targetAccount.instagramAccountId
    );

    if (!pageTokenEntry) {
      return NextResponse.json(
        { success: false, error: "No Page Access Token found for this Instagram account. Please reconnect." },
        { status: 400 }
      );
    }

    const igUserAccessToken = pageTokenEntry.pageAccessToken;
    let finalCaption = title || "";
    let finalDescription = description || "";
    let videoDoc = null;

    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ videoUuid });
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

    const existingIgMediaId = videoDoc?.metadata?.instagram?.mediaId || null;
    const videoAsset = await resolveUploaderXVideo({ videoUuid, gcsPath });
    const mediaUrl = videoAsset.publicUrl;
    const contentType = videoAsset.contentType || "video/mp4";
    const isVideo = contentType.startsWith("video/");
    const mediaType = isVideo ? "REELS" : "IMAGE";
    const fullCaption = finalCaption ? `${finalCaption}\n\n${finalDescription}`.trim() : finalDescription;

    const igAccountId = targetAccount.instagramAccountId;

    if (existingIgMediaId) {
      return NextResponse.json({
        success: true,
        instagramUrl: `https://www.instagram.com/p/${existingIgMediaId}`,
        mediaId: existingIgMediaId,
        accountUsername: targetAccount.instagramUsername,
        mediaType,
        updated: false,
        note: "Instagram doesn't support updating published media captions. Returning existing media.",
      });
    }

    const createContainerUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media`;
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

        const statusUrl = `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status_message&access_token=${igUserAccessToken}`;
        const statusRes = await fetch(statusUrl);
        const statusData = await statusRes.json();
        containerStatus = statusData.status_code;

        if (containerStatus === "ERROR") {
          return NextResponse.json(
            {
              success: false,
              error: `Instagram processing error: ${statusData.status_message || "Unknown error"}`,
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

    const publishUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`;
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
        { videoUuid },
        {
          $set: {
            "metadata.instagram.mediaId": mediaId,
            "metadata.instagram.url": instagramUrl,
            "metadata.instagram.instagramAccountId": igAccountId,
            "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
            "metadata.instagram.lastUploadedAt": new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      instagramUrl,
      mediaId,
      accountUsername: targetAccount.instagramUsername,
      mediaType,
    });
  } catch (error: any) {
    console.error("Instagram operation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Instagram publish failed" },
      { status: 500 }
    );
  }
}
