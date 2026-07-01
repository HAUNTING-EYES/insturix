import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import FormData from "form-data";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import {
  requireAllowedUploaderXUploadUrl,
  UploaderXUploadUrlError,
} from "../../utils/platform-upload-url";

const FACEBOOK_MIN_SCHEDULE_DELAY_MS = 10 * 60 * 1000;
const FACEBOOK_PAGE_VIDEO_MAX_SCHEDULE_DELAY_MS = 75 * 24 * 60 * 60 * 1000;
const FACEBOOK_REEL_MAX_SCHEDULE_DELAY_MS = 29 * 24 * 60 * 60 * 1000;

function parseOptionalPublishAt(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function validateFacebookSchedule(publishAt: Date, isReel: boolean): string | null {
  const delayMs = publishAt.getTime() - Date.now();
  if (delayMs < FACEBOOK_MIN_SCHEDULE_DELAY_MS) {
    return "Facebook scheduled videos must be at least 10 minutes in the future.";
  }
  if (isReel && delayMs > FACEBOOK_REEL_MAX_SCHEDULE_DELAY_MS) {
    return "Facebook scheduled Reels must be within 29 days.";
  }
  if (!isReel && delayMs > FACEBOOK_PAGE_VIDEO_MAX_SCHEDULE_DELAY_MS) {
    return "Facebook scheduled videos must be within 75 days.";
  }
  return null;
}

function facebookScheduleFields(publishAt: Date | null): Record<string, boolean | number> {
  if (!publishAt) {
    return {};
  }

  return {
    published: false,
    scheduled_publish_time: Math.floor(publishAt.getTime() / 1000),
  };
}

function facebookReelFinishFields(publishAt: Date | null): Record<string, number | string> {
  if (!publishAt) {
    return { video_state: "PUBLISHED" };
  }

  return {
    video_state: "SCHEDULED",
    scheduled_publish_time: Math.floor(publishAt.getTime() / 1000),
  };
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
      publishAt,
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

    // â”€â”€â”€ PHASE: START â”€â”€â”€
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

        const safeUploadUrl = requireAllowedUploaderXUploadUrl(initData.upload_url, "facebook");
        await UploaderXVideo.updateOne(
          { userId: session.userId, videoUuid },
          {
            $set: {
              "metadata.facebook.activeUpload": {
                uploadUrl: safeUploadUrl,
                uploadSessionId: initData.video_id,
                videoId: initData.video_id,
                postType: "reel",
                createdAt: new Date(),
              },
            },
          }
        );

        return NextResponse.json({
          success: true,
          videoId: initData.video_id,
          uploadUrl: safeUploadUrl,
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

    // â”€â”€â”€ PHASE: TRANSFER â”€â”€â”€
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
        const safeUploadUrl = requireAllowedUploaderXUploadUrl(uploadUrl, "facebook");
        const videoDoc = (await UploaderXVideo.findOne({ userId: session.userId, videoUuid }).lean()) as any;
        const activeUpload = (videoDoc?.metadata as any)?.facebook?.activeUpload;
        if (
          !activeUpload?.uploadUrl ||
          activeUpload.uploadUrl !== safeUploadUrl ||
          (uploadSessionId && String(activeUpload.uploadSessionId) !== String(uploadSessionId))
        ) {
          return NextResponse.json({ success: false, error: "Invalid or expired Facebook upload URL" }, { status: 400 });
        }

        await axios.post(safeUploadUrl, chunkBuffer, {
          headers: {
            "Authorization": `OAuth ${targetPage.pageAccessToken}`,
            "offset": String(startOffset),
            "file_size": String(fileSize),
            "Content-Type": "application/octet-stream",
          },
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          maxRedirects: 0,
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

    // â”€â”€â”€ PHASE: FINISH â”€â”€â”€
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

      const requestPublishAt = parseOptionalPublishAt(publishAt);
      if (requestPublishAt === undefined) {
        return NextResponse.json({ success: false, error: "Invalid Facebook publishAt date" }, { status: 400 });
      }

      let scheduledPublishAt = requestPublishAt;
      if (!scheduledPublishAt && typeof videoDoc?.metadata?.facebook?.scheduledTime === "string") {
        const metadataPublishAt = parseOptionalPublishAt(videoDoc.metadata.facebook.scheduledTime);
        if (metadataPublishAt === undefined) {
          return NextResponse.json({ success: false, error: "Invalid saved Facebook scheduledTime date" }, { status: 400 });
        }
        scheduledPublishAt = metadataPublishAt;
      }

      if (scheduledPublishAt) {
        const scheduleError = validateFacebookSchedule(scheduledPublishAt, isReel);
        if (scheduleError) {
          return NextResponse.json({ success: false, error: scheduleError }, { status: 400 });
        }
      }

      if (isReel) {
        const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/video_reels?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const finishRes = await axios.post(
          finishUrl,
          {
            upload_phase: "finish",
            video_id: videoId,
            ...facebookReelFinishFields(scheduledPublishAt),
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
            ...facebookScheduleFields(scheduledPublishAt),
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
            "metadata.facebook.publishState": scheduledPublishAt ? "scheduled" : "published",
            ...(scheduledPublishAt ? { "metadata.facebook.scheduledTime": scheduledPublishAt.toISOString() } : {}),
          },
          $unset: {
            "metadata.facebook.activeUpload": "",
          },
        }
      );

      if (!scheduledPublishAt) {
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
      }

      return NextResponse.json({
        success: true,
        facebookUrl,
        videoId,
        pageName: targetPage.pageName,
        postType: postType || (isReel ? "reel" : "video"),
        scheduled: Boolean(scheduledPublishAt),
        publishAt: scheduledPublishAt?.toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    if (error instanceof UploaderXUploadUrlError) {
      return NextResponse.json({ success: false, error: "Invalid Facebook upload URL" }, { status: 400 });
    }

    console.error("Facebook chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Facebook upload failed" },
      { status: 500 }
    );
  }
}
