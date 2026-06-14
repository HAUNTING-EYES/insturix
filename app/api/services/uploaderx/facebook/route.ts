import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import FormData from "form-data";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { fetchUploaderXBuffer, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

export const maxDuration = 300;

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

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, pageId: requestedPageId, postType } = body;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      facebookTokens: { $exists: true, $ne: null },
    });

    if (!user?.facebookTokens) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook not connected. Please connect your Facebook account first.",
        },
        { status: 403 }
      );
    }

    const fb = user.facebookTokens as any;
    const pages = fb.pages || [];
    if (pages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No Facebook Pages found. You need at least one Page to upload videos.",
        },
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

    let existingFbVideoId: string | null = null;
    let videoDoc = null;

    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      if (videoDoc?.metadata?.facebook?.videoId) {
        existingFbVideoId = videoDoc.metadata.facebook.videoId;
      }
    }

    let finalTitle = title;
    let finalDescription = description;

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

    const requestPublishAt = parseOptionalPublishAt(body.publishAt);
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

    const isReel = postType === "reel";

    if (scheduledPublishAt) {
      const scheduleError = validateFacebookSchedule(scheduledPublishAt, isReel);
      if (scheduleError) {
        return NextResponse.json({ success: false, error: scheduleError }, { status: 400 });
      }
    }

    if (existingFbVideoId) {
      if (scheduledPublishAt) {
        return NextResponse.json(
          { success: false, error: "Cannot schedule an existing Facebook video from UploaderX. Clear the saved Facebook video ID and publish again." },
          { status: 400 }
        );
      }

      const updateRes = await fetch(`https://graph.facebook.com/v21.0/${existingFbVideoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: targetPage.pageAccessToken,
          title: finalTitle,
          description: finalDescription,
        }),
      });

      const updateData = await updateRes.json();
      if (updateData.error) {
        return NextResponse.json(
          {
            success: false,
            error: updateData.error.message || "Failed to update video on Facebook",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        facebookUrl: `https://www.facebook.com/${targetPage.pageId}/videos/${existingFbVideoId}`,
        videoId: existingFbVideoId,
        updated: true,
      });
    }

    const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
    const fileSize = Number(videoAsset.size || 0);
    const fileName = videoAsset.filename || gcsPath.split("/").pop() || "video.mp4";
    const contentType = videoAsset.contentType || "video/mp4";
    const scheduleFields = facebookScheduleFields(scheduledPublishAt);

    if (!isReel) {
      const useResumableUpload = fileSize > 10 * 1024 * 1024;
      if (!useResumableUpload) {
        const nodeFormData = new FormData();
        const videoResponse = await axios.get(videoAsset.publicUrl, { responseType: "stream" });

        nodeFormData.append("source", videoResponse.data, {
          filename: fileName,
          contentType,
        });
        if (finalTitle) {
          nodeFormData.append("title", finalTitle);
        }
        if (finalDescription) {
          nodeFormData.append("description", finalDescription);
        }
        if (scheduledPublishAt) {
          nodeFormData.append("published", "false");
          nodeFormData.append("scheduled_publish_time", String(scheduleFields.scheduled_publish_time));
        }

        const simpleUploadUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

        try {
          const simpleRes = await axios.post(simpleUploadUrl, nodeFormData, {
            headers: nodeFormData.getHeaders(),
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          const simpleData = simpleRes.data;
          if (!simpleData.error) {
            const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${simpleData.id}`;
            if (videoUuid) {
              await UploaderXVideo.updateOne(
                { userId: session.userId, videoUuid },
                {
                  $set: {
                    "metadata.facebook.videoId": simpleData.id,
                    "metadata.facebook.url": facebookUrl,
                    "metadata.facebook.pageId": targetPage.pageId,
                    "metadata.facebook.pageName": targetPage.pageName,
                    "metadata.facebook.lastUploadedAt": new Date(),
                    "metadata.facebook.postType": postType || "video",
                    "metadata.facebook.publishState": scheduledPublishAt ? "scheduled" : "published",
                    ...(scheduledPublishAt ? { "metadata.facebook.scheduledTime": scheduledPublishAt.toISOString() } : {}),
                  },
                }
              );
              if (!scheduledPublishAt) {
                await emitUploaderXVideoPublished({
                  userId: session.userId,
                  videoUuid,
                  platform: "facebook",
                  platformPostId: simpleData.id,
                  platformUrl: facebookUrl,
                  accountUsername: targetPage.pageName,
                  mediaType: "video",
                }).catch((eventErr) =>
                  console.warn("[UploaderX:Facebook] video_published event failed:", eventErr),
                );
              }
            }

            return NextResponse.json({
              success: true,
              facebookUrl,
              videoId: simpleData.id,
              pageName: targetPage.pageName,
              postType: postType || "video",
              scheduled: Boolean(scheduledPublishAt),
              publishAt: scheduledPublishAt?.toISOString(),
            });
          }
        } catch (simpleError: any) {
          console.warn("Facebook simple upload failed, falling back to resumable upload:", simpleError.message);
        }
      }
    }

    let uploadSessionId: string;
    let videoId: string;
    let uploadUrl: string | undefined;

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
          {
            success: false,
            error: initData.error.message || "Failed to initialize Facebook Reel upload",
          },
          { status: 500 }
        );
      }

      videoId = initData.video_id;
      uploadUrl = initData.upload_url;
      uploadSessionId = videoId;
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
          {
            success: false,
            error: initData.error.message || "Failed to initialize Facebook upload",
          },
          { status: 500 }
        );
      }

      uploadSessionId = initData.upload_session_id;
      videoId = initData.video_id;
    }

    const fileBuffer = await fetchUploaderXBuffer(videoAsset.publicUrl);

    if (isReel && uploadUrl) {
      try {
        const transferRes = await axios.post(uploadUrl, fileBuffer, {
          headers: {
            "Authorization": `OAuth ${targetPage.pageAccessToken}`,
            "offset": "0",
            "file_size": String(fileSize),
            "Content-Type": "application/octet-stream",
          },
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        if (transferRes.data?.error) {
          return NextResponse.json(
            {
              success: false,
              error: transferRes.data.error.message || "Failed to transfer Reel to Facebook",
            },
            { status: 500 }
          );
        }
      } catch (transferError: any) {
        if (transferError.code === "ECONNABORTED") {
          return NextResponse.json(
            {
              success: false,
              error: "Reel upload timed out. Please try again with a smaller video or better connection.",
            },
            { status: 500 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: `Failed to transfer Reel to Facebook: ${transferError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      const transferFormData = new FormData();
      transferFormData.append("upload_phase", "transfer");
      transferFormData.append("upload_session_id", uploadSessionId);
      transferFormData.append("start_offset", "0");
      transferFormData.append("video_file_chunk", fileBuffer, {
        filename: fileName,
        contentType,
      });

      const transferUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

      try {
        const transferRes = await axios.post(transferUrl, transferFormData, {
          headers: transferFormData.getHeaders(),
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        if (transferRes.data?.error) {
          return NextResponse.json(
            {
              success: false,
              error: transferRes.data.error.message || "Failed to transfer video to Facebook",
            },
            { status: 500 }
          );
        }
      } catch (transferError: any) {
        if (transferError.code === "ECONNABORTED") {
          return NextResponse.json(
            {
              success: false,
              error: "Upload timed out. Please try again with a smaller video or better connection.",
            },
            { status: 500 }
          );
        }
        throw transferError;
      }
    }

    try {
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
            {
              success: false,
              error: finishRes.data.error.message || "Failed to finish Facebook Reel upload",
            },
            { status: 500 }
          );
        }
      } else {
        const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
        const finishRes = await axios.post(
          finishUrl,
          {
            upload_phase: "finish",
            upload_session_id: uploadSessionId,
            title: finalTitle,
            description: finalDescription,
            ...scheduleFields,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
          }
        );

        if (finishRes.data?.error) {
          return NextResponse.json(
            {
              success: false,
              error: finishRes.data.error.message || "Failed to finish Facebook upload",
            },
            { status: 500 }
          );
        }
      }
    } catch (finishError: any) {
      return NextResponse.json(
        { success: false, error: `Failed to finish Facebook upload: ${finishError.message}` },
        { status: 500 }
      );
    }

    const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${videoId}`;
    if (videoUuid) {
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
        }).catch((eventErr) =>
          console.warn("[UploaderX:Facebook] video_published event failed:", eventErr),
        );
      }
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
  } catch (error: any) {
    console.error("Facebook operation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Facebook upload failed" },
      { status: 500 }
    );
  }
}
