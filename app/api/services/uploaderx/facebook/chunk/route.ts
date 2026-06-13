import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import FormData from "form-data";
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
      postType,
      pageId: requestedPageId,
      uploadSessionId,
      videoId,
      uploadUrl,
      startOffset,
      chunkSize,
      title,
      description,
    } = body;

    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      facebookTokens: { $exists: true, $ne: null },
    });

    if (!user?.facebookTokens) {
      return NextResponse.json(
        { success: false, error: "Facebook not connected. Please connect your Facebook account first." },
        { status: 403 }
      );
    }

    const fb = user.facebookTokens as any;
    const pages = fb.pages || [];
    if (pages.length === 0) {
      return NextResponse.json(
        { success: false, error: "No Facebook Pages found. You need at least one Page to upload videos." },
        { status: 400 }
      );
    }

    const targetPage = requestedPageId
      ? pages.find((page: any) => page.pageId === requestedPageId)
      : pages[0];

    if (!targetPage) {
      return NextResponse.json(
        { success: false, error: "Requested Facebook Page not found." },
        { status: 400 }
      );
    }

    // Refresh token if possible
    try {
      const refreshPageTokenRes = await fetch(
        `https://graph.facebook.com/v21.0/${targetPage.pageId}?fields=access_token&access_token=${fb.userAccessToken}`
      );
      const refreshPageTokenData = await refreshPageTokenRes.json();
      if (refreshPageTokenData.access_token) {
        targetPage.pageAccessToken = refreshPageTokenData.access_token;
      }
    } catch (refreshError) {
      console.warn("Failed to refresh Facebook page token:", refreshError);
    }

    const isReel = postType === "reel";

    // ─── PHASE: START ───
    if (phase === "start") {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);

      if (isReel) {
        const initUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/video_reels?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const initRes = await fetch(initUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_phase: "start",
          }),
        });

        const initData = await initRes.json();
        if (initData.error) {
          return NextResponse.json(
            { success: false, error: initData.error.message || "Failed to initialize Reel upload" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          videoId: initData.video_id,
          uploadUrl: initData.upload_url,
          uploadSessionId: initData.video_id,
          fileSize,
        });
      } else {
        const initUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const initRes = await fetch(initUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_phase: "start",
            file_size: fileSize,
          }),
        });

        const initData = await initRes.json();
        if (initData.error) {
          return NextResponse.json(
            { success: false, error: initData.error.message || "Failed to initialize Facebook upload" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          uploadSessionId: initData.upload_session_id,
          videoId: initData.video_id,
          fileSize,
        });
      }
    }

    // ─── PHASE: TRANSFER ───
    if (phase === "transfer") {
      if (startOffset === undefined || !chunkSize) {
        return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
      }

      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);
      const endByte = Math.min(startOffset + chunkSize - 1, fileSize - 1);

      const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, startOffset, endByte);
      const fileName = videoAsset.filename || "video.mp4";
      const contentType = videoAsset.contentType || "video/mp4";

      if (isReel && uploadUrl) {
        await axios.post(uploadUrl, chunkBuffer, {
          headers: {
            "Authorization": `OAuth ${targetPage.pageAccessToken}`,
            "offset": String(startOffset),
            "file_size": String(fileSize),
            "Content-Type": "application/octet-stream",
          },
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        return NextResponse.json({
          success: true,
          nextOffset: startOffset + chunkBuffer.length,
        });
      } else {
        if (!uploadSessionId) {
          return NextResponse.json({ success: false, error: "Missing uploadSessionId" }, { status: 400 });
        }

        const transferFormData = new FormData();
        transferFormData.append("upload_phase", "transfer");
        transferFormData.append("upload_session_id", uploadSessionId);
        transferFormData.append("start_offset", String(startOffset));
        transferFormData.append("video_file_chunk", chunkBuffer, {
          filename: fileName,
          contentType,
        });

        const transferUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

        const transferRes = await axios.post(transferUrl, transferFormData, {
          headers: transferFormData.getHeaders(),
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        if (transferRes.data?.error) {
          return NextResponse.json(
            { success: false, error: transferRes.data.error.message || "Failed to transfer chunk" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          nextOffset: Number(transferRes.data.start_offset),
        });
      }
    }

    // ─── PHASE: FINISH ───
    if (phase === "finish") {
      if (!videoId) {
        return NextResponse.json({ success: false, error: "Missing videoId" }, { status: 400 });
      }

      let finalTitle = title;
      let finalDescription = description;

      const videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      if (videoDoc?.metadata) {
        const meta = videoDoc.metadata;
        if (meta.facebook) {
          finalTitle = finalTitle || meta.facebook.title || meta.title;
          finalDescription = finalDescription || meta.facebook.description || meta.description;
        } else {
          finalTitle = finalTitle || meta.title;
          finalDescription = finalDescription || meta.description;
        }
      }

      finalTitle = finalTitle || "Uploaded via UploaderX";
      finalDescription = finalDescription || "";

      if (isReel) {
        const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/video_reels?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const finishRes = await axios.post(
          finishUrl,
          {
            upload_phase: "finish",
            video_id: videoId,
            video_state: "PUBLISHED",
            title: finalTitle,
            description: finalDescription,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
          }
        );

        if (finishRes.data?.error) {
          return NextResponse.json(
            { success: false, error: finishRes.data.error.message || "Failed to finish Facebook Reel upload" },
            { status: 500 }
          );
        }
      } else {
        if (!uploadSessionId) {
          return NextResponse.json({ success: false, error: "Missing uploadSessionId" }, { status: 400 });
        }
        const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const finishRes = await axios.post(
          finishUrl,
          {
            upload_phase: "finish",
            upload_session_id: uploadSessionId,
            title: finalTitle,
            description: finalDescription,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
          }
        );

        if (finishRes.data?.error) {
          return NextResponse.json(
            { success: false, error: finishRes.data.error.message || "Failed to finish Facebook upload" },
            { status: 500 }
          );
        }
      }

      const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${videoId}`;
      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.facebook.videoId": videoId,
            "metadata.facebook.url": facebookUrl,
            "metadata.facebook.pageId": targetPage.pageId,
            "metadata.facebook.pageName": targetPage.pageName,
            "metadata.facebook.lastUploadedAt": new Date(),
            "metadata.facebook.postType": postType || (isReel ? "reel" : "video"),
          },
        }
      );

      await emitUploaderXVideoPublished({
        userId: session.userId,
        videoUuid,
        platform: "facebook",
        platformPostId: videoId,
        platformUrl: facebookUrl,
        accountUsername: targetPage.pageName,
        mediaType: "video",
        postType,
      }).catch((eventErr) =>
        console.warn("[UploaderX:Facebook] video_published event failed:", eventErr)
      );

      return NextResponse.json({
        success: true,
        facebookUrl,
        videoId,
        pageName: targetPage.pageName,
        postType: postType || (isReel ? "reel" : "video"),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    console.error("Facebook chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Facebook upload failed" },
      { status: 500 }
    );
  }
}
