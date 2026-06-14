import { google } from "googleapis";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { fetchUploaderXStream, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

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

    const client = await clerkClient();
    const user = await client.users.getUser(session.userId);

    const googleAccount = user.externalAccounts.find((account) => account.provider.includes("google"));
    const providerId = googleAccount ? googleAccount.provider : "oauth_google";

    let accessToken: string | null = null;
    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(session.userId, providerId as any);
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
    const {
      phase,
      videoUuid,
      uploadUrl,
      startOffset,
      chunkSize,
      videoId,
      title,
      description,
      privacyStatus,
      categoryId: requestCategoryId,
      publishAt: requestPublishAt,
      thumbnailPublicUrl,
      postType,
    } = body;

    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();

    // ─── PHASE: START ───
    if (phase === "start") {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);
      const contentType = videoAsset.contentType || "video/mp4";

      let finalTitle = title || videoAsset.filename || "UploaderX Video";
      let finalDescription = description || "Uploaded via UploaderX";
      let finalPrivacyStatus = privacyStatus || "unlisted";
      let finalCategoryId = requestCategoryId || "22";
      let finalPublishAt = requestPublishAt;
      let tags: string[] = [];

      const videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      if (videoDoc?.metadata) {
        const ytMeta = videoDoc.metadata.youtube;
        if (ytMeta) {
          finalTitle = finalTitle || ytMeta.title;
          finalDescription = finalDescription || ytMeta.description;
          tags = ytMeta.tags || tags;
          if (!requestCategoryId && ytMeta.categoryId) {
            finalCategoryId = ytMeta.categoryId;
          }
          if (!requestPublishAt && ytMeta.scheduledTime) {
            finalPublishAt = ytMeta.scheduledTime;
          }
          finalPrivacyStatus = ytMeta.privacyStatus || finalPrivacyStatus;
        } else {
          finalTitle = finalTitle || videoDoc.metadata.title || "";
          finalDescription = finalDescription || videoDoc.metadata.description || "";
          tags = videoDoc.metadata.tags || tags;
        }
      }

      const scheduledPublishAt = finalPublishAt ? new Date(finalPublishAt) : null;
      const youtubeStatus = scheduledPublishAt
        ? { privacyStatus: "private", publishAt: scheduledPublishAt.toISOString() }
        : { privacyStatus: finalPrivacyStatus };

      const googleInitUrl = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
      const initResponse = await fetch(googleInitUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Length": String(fileSize),
          "X-Upload-Content-Type": contentType,
        },
        body: JSON.stringify({
          snippet: {
            title: finalTitle,
            description: finalDescription,
            tags,
            categoryId: finalCategoryId,
          },
          status: youtubeStatus,
        }),
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        return NextResponse.json(
          { success: false, error: "Failed to initialize YouTube resumable upload", details: errorText },
          { status: 500 }
        );
      }

      const locationUrl = initResponse.headers.get("Location");
      if (!locationUrl) {
        return NextResponse.json({ success: false, error: "Failed to get upload location from Google API" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        uploadUrl: locationUrl,
        fileSize,
      });
    }

    // ─── PHASE: TRANSFER ───
    if (phase === "transfer") {
      if (!uploadUrl || startOffset === undefined || !chunkSize) {
        return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
      }

      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);
      const endByte = Math.min(startOffset + chunkSize - 1, fileSize - 1);

      const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, startOffset, endByte);

      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${startOffset}-${endByte}/${fileSize}`,
          "Content-Length": String(chunkBuffer.length),
        },
        body: chunkBuffer,
      });

      if (response.status === 308) {
        return NextResponse.json({
          success: true,
          finished: false,
          nextOffset: endByte + 1,
        });
      }

      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        return NextResponse.json({
          success: true,
          finished: true,
          videoId: data.id,
        });
      }

      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: "Google upload failed with status " + response.status, details: errorText },
        { status: 500 }
      );
    }

    // ─── PHASE: FINISH ───
    if (phase === "finish") {
      if (!videoId) {
        return NextResponse.json({ success: false, error: "Missing videoId" }, { status: 400 });
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const scheduledPublishAt = requestPublishAt ? new Date(requestPublishAt) : null;
      if (scheduledPublishAt && Number.isNaN(scheduledPublishAt.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid YouTube publishAt date" }, { status: 400 });
      }

      // Update DB
      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.youtube.videoId": videoId,
            "metadata.youtube.url": youtubeUrl,
            "metadata.youtube.lastUploadedAt": new Date(),
            "metadata.youtube.publishState": scheduledPublishAt ? "scheduled" : "published",
            ...(scheduledPublishAt ? { "metadata.youtube.scheduledTime": scheduledPublishAt.toISOString() } : {}),
          },
        }
      );

      // Handle Thumbnail if provided
      if (thumbnailPublicUrl) {
        try {
          const { stream: thumbnailStream, contentType, contentLength } = await fetchUploaderXStream(thumbnailPublicUrl);
          if (["image/jpeg", "image/png"].includes(contentType) && contentLength <= 2 * 1024 * 1024) {
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const youtube = google.youtube({ version: "v3", auth: oauth2Client });

            await youtube.thumbnails.set({
              videoId,
              media: { body: thumbnailStream },
            });
          }
        } catch (thumbError) {
          console.warn("YouTube thumbnail set failed:", thumbError);
        }
      }

      if (!scheduledPublishAt) {
        await emitUploaderXVideoPublished({
          userId: session.userId,
          videoUuid,
          platform: "youtube",
          platformPostId: videoId,
          platformUrl: youtubeUrl,
          mediaType: "video",
          postType,
        }).catch((eventErr) =>
          console.warn("[UploaderX:YouTube] video_published event failed:", eventErr)
        );
      }

      return NextResponse.json({
        success: true,
        youtubeUrl,
        videoId,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    console.error("YouTube chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "YouTube upload failed" },
      { status: 500 }
    );
  }
}
