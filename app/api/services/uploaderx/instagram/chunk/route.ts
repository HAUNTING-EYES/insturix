import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";

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
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

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

        const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
          method: "POST",
        });
        const containerData = await containerRes.json();

        if (containerData.error) {
          console.error("Instagram start error:", containerData.error);
          return NextResponse.json(
            { success: false, error: containerData.error.message || "Failed to initialize Instagram upload container" },
            { status: 500 }
          );
        }

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

        const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
        const fileSize = Number(videoAsset.size || 0);
        const endByte = Math.min(startOffset + chunkSize - 1, fileSize - 1);
        const useDirectUpload = Boolean(requestedUseDirectUpload);

        const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, startOffset, endByte);

        let transferRes;
        if (useDirectUpload) {
          // Direct binary upload for large videos - upload to the container URL directly
          const uploadUrl = `https://graph.instagram.com/v21.0/${uploadSessionId}/media`;
          
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
          return NextResponse.json(
            { success: false, error: transferRes.data.error.message || "Failed to transfer chunk to Instagram" },
            { status: 500 }
          );
        }

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

      const statusUrl = `https://graph.instagram.com/v21.0/${uploadSessionId}?fields=status_code,error&access_token=${igUserAccessToken}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();

      if (statusData.error) {
        return NextResponse.json({
          success: false,
          error: statusData.error.message || "Failed to query Instagram status",
        }, { status: 500 });
      }

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

        const publishUrl = `https://graph.instagram.com/v21.0/me/media_publish`;
        const publishParams = new URLSearchParams();
        publishParams.set("creation_id", uploadSessionId);
        publishParams.set("access_token", igUserAccessToken);

        const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
        const publishData = await publishRes.json();

        if (publishData.error) {
          return NextResponse.json(
            { success: false, error: publishData.error.message || "Failed to publish Instagram media container" },
            { status: 500 }
          );
        }

        const mediaId = publishData.id;
        const instagramUrl = `https://www.instagram.com/p/${mediaId}`;
        const useDirectUpload = Boolean(requestedUseDirectUpload);

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

        const contentType = "video/mp4"; // Defaulting since it's Reels
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
    console.error("Instagram chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Instagram upload failed" },
      { status: 500 }
    );
  }
}
