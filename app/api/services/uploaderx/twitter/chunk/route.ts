import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { emitUploaderXVideoPublished } from "@/lib/uploaderx/video-publish-events";
import { resolveUploaderXVideo } from "@/lib/uploaderx-storage";
import { checkCredits, type CreditCheckResult } from "@/lib/services/creditsMiddleware";
import { getCreditCost } from "@/lib/config/creditCosts";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

const UPLOADERX_TWITTER_PUBLISH_CREDITS = getCreditCost("uploaderx", "platform_publish", {
  requestType: "twitter",
});

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
      mediaId,
      segmentIndex,
      startOffset,
      chunkSize,
      title,
      description,
      replySettings,
      postType,
    } = body;

    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
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
        { success: false, error: "Twitter not connected. Please connect your Twitter account first." },
        { status: 403 }
      );
    }

    const twitterTokens = user.twitterTokens;
    let accessToken = twitterTokens.accessToken;
    const now = new Date();

    // Refresh token if needed
    if (!twitterTokens.expiresAt || twitterTokens.expiresAt < now) {
      if (!twitterTokens.refreshToken) {
        return NextResponse.json(
          { success: false, error: "Twitter token expired and no refresh token available. Please reconnect Twitter." },
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
        if (refreshRes.status === 200 && refreshData.access_token) {
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
        }
      } catch (err) {
        console.warn("Failed to refresh Twitter token:", err);
      }
    }

    // ─── PHASE: START ───
    if (phase === "start") {
      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);

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

      const initData = await initResponse.json();
      if (!initResponse.ok || initData.error) {
        await recordUploaderXTwitterCost({
          status: "failed",
          operation: "social_media_upload",
          userId: session.userId,
          videoUuid,
          requestCount: 1,
          responseStatus: initResponse.status,
          phase: "start",
          postType: postType || "video",
        });
        return NextResponse.json(
          { success: false, error: "Failed to initialize Twitter upload", details: initData },
          { status: 500 }
        );
      }

      const returnedMediaId = initData.data?.id || initData.media_id || initData.media_id_string;
      await recordUploaderXTwitterCost({
        status: "success",
        operation: "social_media_upload",
        userId: session.userId,
        videoUuid,
        mediaId: returnedMediaId,
        requestCount: 1,
        responseStatus: initResponse.status,
        phase: "start",
        postType: postType || "video",
      });
      return NextResponse.json({
        success: true,
        mediaId: returnedMediaId,
        fileSize,
      });
    }

    // ─── PHASE: TRANSFER ───
    if (phase === "transfer") {
      if (!mediaId || segmentIndex === undefined || startOffset === undefined || !chunkSize) {
        return NextResponse.json({ success: false, error: "Missing transfer parameters" }, { status: 400 });
      }

      const videoAsset = await resolveUploaderXVideo({ userId: session.userId, videoUuid });
      const fileSize = Number(videoAsset.size || 0);
      const endByte = Math.min(startOffset + chunkSize - 1, fileSize - 1);

      const chunkBuffer = await fetchUploaderXRange(videoAsset.publicUrl, startOffset, endByte);

      const appendResponse = await fetch(`https://api.x.com/2/media/upload/${mediaId}/append`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          segment_index: segmentIndex,
          media: chunkBuffer.toString("base64"),
        }),
      });

      if (!appendResponse.ok) {
        const appendError = await appendResponse.json();
        await recordUploaderXTwitterCost({
          status: "failed",
          operation: "social_media_upload",
          userId: session.userId,
          videoUuid,
          mediaId,
          requestCount: 1,
          responseStatus: appendResponse.status,
          phase: "transfer",
          segmentIndex,
          postType: postType || "video",
        });
        return NextResponse.json(
          { success: false, error: `Failed to upload chunk segment ${segmentIndex}`, details: appendError },
          { status: 500 }
        );
      }

      await recordUploaderXTwitterCost({
        status: "success",
        operation: "social_media_upload",
        userId: session.userId,
        videoUuid,
        mediaId,
        requestCount: 1,
        responseStatus: appendResponse.status,
        phase: "transfer",
        segmentIndex,
        postType: postType || "video",
      });
      return NextResponse.json({
        success: true,
        nextOffset: startOffset + chunkBuffer.length,
      });
    }

    // ─── PHASE: FINALIZE ───
    if (phase === "finalize") {
      if (!mediaId) {
        return NextResponse.json({ success: false, error: "Missing mediaId" }, { status: 400 });
      }

      const finalizeRes = await fetch(`https://api.x.com/2/media/upload/${mediaId}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      let finalizeData: any = {};
      const finalizeText = await finalizeRes.text();
      if (finalizeText) {
        try {
          finalizeData = JSON.parse(finalizeText);
        } catch (e) {
          console.error("Twitter finalize JSON parse error:", e, "Response text:", finalizeText);
          // Twitter may return empty response or malformed JSON, treat as success if status is 200
          if (finalizeRes.ok) {
            finalizeData = {};
          } else {
            throw new Error("Failed to parse Twitter finalize response");
          }
        }
      }
      if (!finalizeRes.ok || finalizeData.error) {
        console.error("Twitter finalize failed:", finalizeData.error || finalizeRes.statusText);
        await recordUploaderXTwitterCost({
          status: "failed",
          operation: "social_media_upload",
          userId: session.userId,
          videoUuid,
          mediaId,
          requestCount: 1,
          responseStatus: finalizeRes.status,
          phase: "finalize",
          postType: postType || "video",
        });
        throw new Error(finalizeData.error || "Failed to finalize Twitter chunked upload");
      }

      await recordUploaderXTwitterCost({
        status: "success",
        operation: "social_media_upload",
        userId: session.userId,
        videoUuid,
        mediaId,
        requestCount: 1,
        responseStatus: finalizeRes.status,
        phase: "finalize",
        postType: postType || "video",
      });
      return NextResponse.json({
        success: true,
        details: finalizeData,
      });
    }

    // ─── PHASE: POLL ───
    if (phase === "poll") {
      if (!mediaId) {
        return NextResponse.json({ success: false, error: "Missing mediaId" }, { status: 400 });
      }

      const statusRes = await fetch(`https://api.x.com/2/media/upload/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await statusRes.json();
      if (!statusRes.ok || data.error) {
        await recordUploaderXTwitterCost({
          status: "failed",
          operation: "social_media_upload",
          userId: session.userId,
          videoUuid,
          mediaId,
          requestCount: 1,
          responseStatus: statusRes.status,
          phase: "poll",
          postType: postType || "video",
        });
        return NextResponse.json({ success: false, error: "Failed to query Twitter media status", details: data }, { status: 500 });
      }

      const processingInfo = data.processing_info || data.data?.processing_info;
      if (!processingInfo) {
        await recordUploaderXTwitterCost({
          status: "success",
          operation: "social_media_upload",
          userId: session.userId,
          videoUuid,
          mediaId,
          requestCount: 1,
          responseStatus: statusRes.status,
          phase: "poll",
          processingState: "succeeded",
          postType: postType || "video",
        });
        return NextResponse.json({ success: true, state: "succeeded" });
      }

      await recordUploaderXTwitterCost({
        status: "success",
        operation: "social_media_upload",
        userId: session.userId,
        videoUuid,
        mediaId,
        requestCount: 1,
        responseStatus: statusRes.status,
        phase: "poll",
        processingState: processingInfo.state,
        postType: postType || "video",
      });
      return NextResponse.json({
        success: true,
        state: processingInfo.state, // succeeded, failed, in_progress
      });
    }

    // ─── PHASE: PUBLISH ───
    if (phase === "publish") {
      if (!mediaId) {
        return NextResponse.json({ success: false, error: "Missing mediaId" }, { status: 400 });
      }

      let finalTitle = title;
      let finalDescription = description;

      const videoDoc = await UploaderXVideo.findOne({ userId: session.userId, videoUuid });
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

      const publishCreditCheck = await checkCredits(session.userId, "uploaderx", "platform_publish", {
        requestType: "twitter",
      });
      if (!publishCreditCheck.allowed) {
        return publishCreditCheck.errorResponse!;
      }
      const tweetPayload: any = {
        text: tweetText,
      };
      if (replySettings && replySettings !== "everyone") {
        tweetPayload.reply_settings = replySettings;
      }
      tweetPayload.media = { media_ids: [mediaId] };

      const tweetResponse = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(tweetPayload),
      });

      const tweetData = await tweetResponse.json();
      if (!tweetResponse.ok || tweetData.error) {
        await recordUploaderXTwitterCost({
          status: "failed",
          operation: "social_publish",
          userId: session.userId,
          videoUuid,
          mediaId,
          requestCount: 1,
          responseStatus: tweetResponse.status,
          phase: "publish",
          postType: postType || "video",
        });
        return NextResponse.json(
          { success: false, error: tweetData.error?.message || tweetData.detail || "Failed to create tweet", details: tweetData },
          { status: 500 }
        );
      }

      const tweetId = tweetData.data?.id;
      const tweetUrl = `https://x.com/${twitterTokens.userName}/status/${tweetId}`;

      await UploaderXVideo.updateOne(
        { userId: session.userId, videoUuid },
        {
          $set: {
            "metadata.twitter.mediaId": mediaId,
            "metadata.twitter.tweetId": tweetId,
            "metadata.twitter.tweetUrl": tweetUrl,
            "metadata.twitter.lastUploadedAt": new Date(),
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
        mediaType: "video",
        postType,
      }).catch((eventErr) =>
        console.warn("[UploaderX:Twitter] video_published event failed:", eventErr)
      );

      const deductResult = await deductPublishCredits(publishCreditCheck);
      await recordUploaderXTwitterCost({
        status: "success",
        operation: "social_publish",
        userId: session.userId,
        videoUuid,
        mediaId,
        tweetId,
        chargedCredits: deductResult.transactionId ? UPLOADERX_TWITTER_PUBLISH_CREDITS : undefined,
        creditTransactionId: deductResult.transactionId,
        requestCount: 1,
        responseStatus: tweetResponse.status,
        phase: "publish",
        postType: postType || "video",
      });

      return NextResponse.json({
        success: true,
        tweetUrl,
        tweetId,
        mediaId,
        accountUsername: twitterTokens.userName,
        postType: postType || "video",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid phase" }, { status: 400 });
  } catch (error: any) {
    console.error("Twitter chunked upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Twitter upload failed" },
      { status: 500 }
    );
  }
}

async function deductPublishCredits(creditCheck: CreditCheckResult): Promise<{ transactionId?: string }> {
  try {
    return await creditCheck.deduct();
  } catch (error) {
    console.error("[UploaderX:Twitter] publish credit deduction failed:", error);
    return {};
  }
}

type XCostOperation = "social_publish" | "social_media_upload";

async function recordUploaderXTwitterCost(input: {
  status: ProviderCostEventStatus;
  operation: XCostOperation;
  userId: string;
  videoUuid: string;
  mediaId?: string;
  tweetId?: string;
  chargedCredits?: number;
  creditTransactionId?: string;
  requestCount: number;
  responseStatus?: number;
  phase: string;
  postType?: string;
  segmentIndex?: number;
  processingState?: string;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.operation === "social_publish" && input.tweetId
        ? `uploaderx:twitter:chunk:publish:${input.tweetId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    assetId: input.videoUuid,
    taskId: input.videoUuid,
    creditTransactionId: input.creditTransactionId,
    service: "uploaderx",
    action: "platform_publish",
    route: "/api/services/uploaderx/twitter/chunk",
    provider: "x-api",
    model: "twitter-v2",
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    providerJobId: input.tweetId ?? input.mediaId,
    units: { requestCount: input.requestCount },
    metadata: {
      platform: "twitter",
      phase: input.phase,
      postType: input.postType,
      responseStatus: input.responseStatus,
      hasMedia: Boolean(input.mediaId),
      segmentIndex: input.segmentIndex,
      processingState: input.processingState,
    },
  });
}
