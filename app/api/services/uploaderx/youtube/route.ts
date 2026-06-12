import { google } from "googleapis";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { fetchUploaderXStream, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

const debugYouTubeUpload = (...args: unknown[]) => {
  if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
    console.log(...args);
  }
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(session.userId);

    const googleAccount = user.externalAccounts.find((account) => account.provider.includes("google"));
    const providerId = googleAccount ? googleAccount.provider : "oauth_google";

    debugYouTubeUpload("[UploaderX:YouTube] OAuth provider selected:", providerId);

    let accessToken: string | null = null;

    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(session.userId, providerId as any);
      debugYouTubeUpload("[UploaderX:YouTube] OAuth token count:", tokenResponse.data.length);
      accessToken = tokenResponse.data.length > 0 ? tokenResponse.data[0].token : null;
    } catch (tokenError: any) {
      console.error("Failed to get OAuth access token:", tokenError?.errors || tokenError);
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Google account not connected or missing permissions. Please sign in with Google again.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { gcsPath, videoUuid } = body;
    let { title, description, privacyStatus, postType } = body;
    const requestCategoryId = typeof body.categoryId === "string" && body.categoryId.trim()
      ? body.categoryId.trim()
      : null;
    const requestPublishAt = typeof body.publishAt === "string" && body.publishAt.trim()
      ? body.publishAt.trim()
      : null;
    const thumbnailPublicUrl = typeof body.thumbnailPublicUrl === "string" && body.thumbnailPublicUrl.trim()
      ? body.thumbnailPublicUrl.trim()
      : null;
    let categoryId = requestCategoryId || "22";
    let publishAt = requestPublishAt;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    privacyStatus = privacyStatus || "unlisted";
    let tags: string[] = [];
    let existingVideoId: string | null = null;
    let dbVideoType: string | null = null;

    if (videoUuid) {
      try {
        await connectToDatabase();
        const video = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });

        if (video?.metadata) {
          if (video.metadata.youtube?.videoId) {
            existingVideoId = video.metadata.youtube.videoId;
          }

          let dbTitle;
          let dbDescription;
          let dbTags;

          if (video.metadata.youtube) {
            const ytMeta = video.metadata.youtube;
            dbTitle = ytMeta.title;
            dbDescription = ytMeta.description;
            dbTags = ytMeta.tags;
            if (!requestCategoryId && typeof ytMeta.categoryId === "string" && ytMeta.categoryId.trim()) {
              categoryId = ytMeta.categoryId.trim();
            }
            if (!requestPublishAt && typeof ytMeta.scheduledTime === "string" && ytMeta.scheduledTime.trim()) {
              publishAt = ytMeta.scheduledTime.trim();
            }
            privacyStatus = ytMeta.youtube?.privacyStatus || ytMeta.privacyStatus || privacyStatus;
          } else {
            dbTitle = video.metadata.title;
            dbDescription = video.metadata.description;
            dbTags = video.metadata.tags;
            if (!requestCategoryId && typeof video.metadata.categoryId === "string" && video.metadata.categoryId.trim()) {
              categoryId = video.metadata.categoryId.trim();
            }
            if (!requestPublishAt && typeof video.metadata.scheduledTime === "string" && video.metadata.scheduledTime.trim()) {
              publishAt = video.metadata.scheduledTime.trim();
            }
          }

          title = dbTitle || title;
          description = dbDescription || description;
          tags = dbTags || tags;

          if (video.metadata.youtube?.privacyStatus) {
            privacyStatus = video.metadata.youtube.privacyStatus;
          }

          if (typeof video.metadata.videoType === "string") {
            dbVideoType = video.metadata.videoType;
          }
        }
      } catch (dbError) {
        console.error("Failed to fetch video metadata:", dbError);
      }
    }



    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const scheduledPublishAt = publishAt ? new Date(publishAt) : null;
    if (scheduledPublishAt && Number.isNaN(scheduledPublishAt.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid YouTube publishAt date" }, { status: 400 });
    }
    const youtubeStatus = scheduledPublishAt
      ? { privacyStatus: "private", publishAt: scheduledPublishAt.toISOString() }
      : { privacyStatus };

    let videoId: string;
    let youtubeUrl: string;

    if (existingVideoId) {
      await youtube.videos.update({
        part: ["snippet", "status"],
        requestBody: {
          id: existingVideoId,
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags,
            categoryId,
          },
          status: youtubeStatus,
        },
      });

      videoId = existingVideoId;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
      const { stream } = await fetchUploaderXStream(videoAsset.publicUrl);

      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags,
            categoryId,
          },
          status: youtubeStatus,
        },
        media: { body: stream },
      });

      videoId = res.data.id!;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (videoUuid) {
        await UploaderXVideo.updateOne(
          { userId: session.userId, videoUuid },
          {
            $set: {
              "metadata.youtube.videoId": videoId,
              "metadata.youtube.url": youtubeUrl,
              "metadata.youtube.lastUploadedAt": new Date(),
            },
          }
        );
        await emitUploaderXVideoPublished({
          userId: session.userId,
          videoUuid,
          platform: "youtube",
          platformPostId: videoId,
          platformUrl: youtubeUrl,
          mediaType: "video",
        }).catch((eventErr) =>
          console.warn("[UploaderX:YouTube] video_published event failed:", eventErr),
        );
      }
    }

    if (thumbnailPublicUrl) {
      const { stream: thumbnailStream, contentType, contentLength } = await fetchUploaderXStream(thumbnailPublicUrl);
      if (!["image/jpeg", "image/png"].includes(contentType)) {
        return NextResponse.json({ success: false, error: "YouTube thumbnail must be JPEG or PNG" }, { status: 400 });
      }
      if (contentLength > 2 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "YouTube thumbnail must be 2MB or smaller" }, { status: 400 });
      }

      await youtube.thumbnails.set({
        videoId,
        media: { body: thumbnailStream },
      });
    }

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    console.error("YouTube operation failed:", error);
    if (error.response) {
      console.error("[UploaderX:YouTube] Google API error status:", error.response.status);
    }
    return NextResponse.json(
      { success: false, error: error.message, details: error.response?.data },
      { status: 500 }
    );
  }
}
