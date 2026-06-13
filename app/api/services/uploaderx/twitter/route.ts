import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { fetchUploaderXBuffer, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

<<<<<<< HEAD
<<<<<<< HEAD
export const maxDuration = 300;
=======
>>>>>>> parent of 20c2481e (fix:failed to fetch errors)
=======
export const maxDuration = 900;

>>>>>>> parent of f7e2f2cb (chnage upload duration from 800->500 acc. to vercel plans)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, replySettings, postType } = body;
    const supportedReplySettings = new Set(["following", "mentionedUsers", "subscribers", "verified"]);
    if (
      replySettings !== undefined &&
      replySettings !== "everyone" &&
      !supportedReplySettings.has(replySettings)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid X reply setting." },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      twitterTokens: { $exists: true, $ne: null },
      "twitterTokens.accessToken": { $exists: true, $ne: null },
    });

    if (!user?.twitterTokens?.accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Twitter not connected. Please connect your Twitter account first.",
        },
        { status: 403 }
      );
    }

    const twitterTokens = user.twitterTokens;
    let accessToken = twitterTokens.accessToken;
    const now = new Date();

    if (!twitterTokens.expiresAt || twitterTokens.expiresAt < now) {
      if (!twitterTokens.refreshToken) {
        return NextResponse.json(
          {
            success: false,
            error: "Twitter token expired and no refresh token available. Please reconnect your Twitter account.",
          },
          { status: 401 }
        );
      }

      try {
        const clientId = process.env.TWITTER_CLIENT_ID!;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const refreshBody = new URLSearchParams();
        refreshBody.set("grant_type", "refresh_token");
        refreshBody.set("refresh_token", twitterTokens.refreshToken);

        const refreshRes = await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: refreshBody,
        });

        const refreshData = await refreshRes.json();
        if (refreshRes.status !== 200 || refreshData.error) {
          return NextResponse.json(
            {
              success: false,
              error: "Twitter token refresh failed. Please reconnect your Twitter account.",
            },
            { status: 401 }
          );
        }

        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
        await User.updateOne(
          { clerkUserId: session.userId },
          {
            $set: {
              "twitterTokens.accessToken": refreshData.access_token,
              "twitterTokens.refreshToken": refreshData.refresh_token,
              "twitterTokens.expiresAt": newExpiresAt,
            },
          }
        );

        accessToken = refreshData.access_token;
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to refresh Twitter token. Please reconnect your Twitter account.",
          },
          { status: 401 }
        );
      }
    }

    let existingTweetId: string | null = null;
    let videoDoc = null;

    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
      if (videoDoc?.metadata?.twitter?.tweetId) {
        existingTweetId = videoDoc.metadata.twitter.tweetId;
      }
    }

    let finalTitle = title;
    let finalDescription = description;

    if (videoDoc?.metadata) {
      const meta = videoDoc.metadata;
      if (meta.twitter) {
        finalTitle = finalTitle || meta.twitter.title || meta.title;
        finalDescription = finalDescription || meta.twitter.description || meta.description;
      } else {
        finalTitle = finalTitle || meta.title;
        finalDescription = finalDescription || meta.description;
      }
    }

    let tweetText = finalTitle || "";
    if (finalDescription) {
      tweetText = tweetText ? `${tweetText}\n\n${finalDescription}` : finalDescription;
    }
    tweetText = tweetText || "Uploaded via UploaderX";

    if (tweetText.length > 280) {
      tweetText = `${tweetText.substring(0, 277)}...`;
    }

    if (existingTweetId) {
      return NextResponse.json({
        success: true,
        tweetUrl: `https://x.com/${twitterTokens.userName}/status/${existingTweetId}`,
        tweetId: existingTweetId,
        updated: false,
        note: "Twitter doesn't support updating existing tweets. Returning existing tweet.",
      });
    }

    let mediaId: string | undefined;
    let processingState: string | undefined;
    if (gcsPath) {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid, gcsPath });
      const fileSize = Number(videoAsset.size || 0);
      const fileBuffer = await fetchUploaderXBuffer(videoAsset.publicUrl);

      const MAX_VIDEO_SIZE = 512 * 1024 * 1024;
      const CHUNK_SIZE = 2 * 1024 * 1024;

      if (fileSize > MAX_VIDEO_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `File too large. Twitter maximum size is 512MB, your file is ${(fileSize / (1024 * 1024)).toFixed(2)}MB`,
          },
          { status: 400 }
        );
      }

      const initResponse = await fetch("https://api.x.com/2/media/upload/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: videoAsset.contentType || "video/mp4",
          total_bytes: fileSize,
          media_category: "tweet_video",
        }),
      });

      let initData: any = {};
      const initResponseText = await initResponse.text();
      if (initResponseText) {
        try {
          initData = JSON.parse(initResponseText);
        } catch {
          initData = { error: "Invalid JSON response from Twitter" };
        }
      }

      if (!initResponse.ok || initData.error) {
        return NextResponse.json(
          { success: false, error: "Failed to initialize Twitter upload", details: initData },
          { status: 500 }
        );
      }

      mediaId = initData.data?.id || initData.media_id || initData.media_id_string;
      if (!mediaId) {
        return NextResponse.json(
          { success: false, error: "Failed to get media ID from Twitter" },
          { status: 500 }
        );
      }

      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunk = fileBuffer.slice(start, end);

        const appendResponse = await fetch(`https://api.x.com/2/media/upload/${mediaId}/append`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            segment_index: i,
            media: chunk.toString("base64"),
          }),
        });

        if (!appendResponse.ok) {
          let appendError: any = {};
          const responseText = await appendResponse.text();
          if (responseText) {
            try {
              appendError = JSON.parse(responseText);
            } catch {
              appendError = { raw_response: responseText };
            }
          }

          return NextResponse.json(
            {
              success: false,
              error: `Failed to upload chunk ${i + 1} of ${totalChunks}`,
              details: appendError,
            },
            { status: 500 }
          );
        }
      }

      const finalizeResponse = await fetch(`https://api.x.com/2/media/upload/${mediaId}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      let finalizeData: any = {};
      const finalizeResponseText = await finalizeResponse.text();
      if (finalizeResponseText) {
        try {
          finalizeData = JSON.parse(finalizeResponseText);
        } catch {
          finalizeData = {};
        }
      }

      if (!finalizeResponse.ok || finalizeData.error) {
        return NextResponse.json(
          { success: false, error: "Failed to finalize Twitter upload", details: finalizeData },
          { status: 500 }
        );
      }

      processingState = await pollMediaStatusV2(mediaId, accessToken);
      if (processingState !== "succeeded") {
        return NextResponse.json(
          { success: false, error: `Twitter video processing failed: ${processingState}` },
          { status: 500 }
        );
      }
    }

    const tweetPayload: any = {
      text: tweetText,
    };
    if (replySettings && replySettings !== "everyone") {
      tweetPayload.reply_settings = replySettings;
    }
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const tweetResponse = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(tweetPayload),
    });

    let tweetData: any = {};
    const tweetResponseText = await tweetResponse.text();
    if (tweetResponseText) {
      try {
        tweetData = JSON.parse(tweetResponseText);
      } catch {
        tweetData = { error: "Invalid JSON response from Twitter" };
      }
    }

    if (!tweetResponse.ok || tweetData.error) {
      return NextResponse.json(
        {
          success: false,
          error: tweetData.error?.message || tweetData.detail || "Failed to create tweet",
          details: tweetData,
        },
        { status: 500 }
      );
    }

    const tweetId = tweetData.data?.id;
    const tweetUrl = `https://x.com/${twitterTokens.userName}/status/${tweetId}`;

    if (videoUuid) {
      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.twitter.mediaId": mediaId,
            "metadata.twitter.tweetId": tweetId,
            "metadata.twitter.tweetUrl": tweetUrl,
            "metadata.twitter.lastUploadedAt": new Date(),
            "metadata.twitter.processingState": processingState,
            "metadata.twitter.postType": postType || "video",
          },
        }
      );
      await emitUploaderXVideoPublished({
        userId: session.userId,
        videoUuid,
        platform: "twitter",
        platformPostId: tweetId,
        platformUrl: tweetUrl,
        accountUsername: twitterTokens.userName,
        mediaType: mediaId ? "video" : "text",
      }).catch((eventErr) =>
        console.warn("[UploaderX:Twitter] video_published event failed:", eventErr),
      );
    }

    return NextResponse.json({
      success: true,
      tweetUrl,
      tweetId,
      mediaId: mediaId || null,
      accountUsername: twitterTokens.userName,
      postType: postType || "video",
    });
  } catch (error: any) {
    console.error("Twitter upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Twitter upload failed" },
      { status: 500 }
    );
  }
}

async function pollMediaStatusV2(mediaId: string, accessToken: string): Promise<string> {
  const maxAttempts = 60;
  const interval = 5000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;

    const response = await fetch(`https://api.x.com/2/media/upload/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let data: any = {};
    const responseText = await response.text();
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = {};
      }
    }

    if (data.error) {
      throw new Error(data.error.message || "Failed to check media status");
    }

    const processingInfo = data.processing_info;
    if (!processingInfo) {
      return "succeeded";
    }

    const state = processingInfo.state;
    if (state === "succeeded") {
      return "succeeded";
    }
    if (state === "failed") {
      return "failed";
    }
  }

  return "timed_out";
}
