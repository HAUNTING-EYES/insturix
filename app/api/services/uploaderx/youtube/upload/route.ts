import { google } from "googleapis";
import { NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import { Storage } from "@google-cloud/storage";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

type LegacyYouTubeUploadOperation = "social_media_upload";

const UPLOADERX_LEGACY_YOUTUBE_PROVIDER = "youtube-data-api";
const UPLOADERX_LEGACY_YOUTUBE_MODEL = "youtube-v3";
const UPLOADERX_LEGACY_YOUTUBE_UPLOAD_ROUTE = "/api/services/uploaderx/youtube/upload";
const UPLOADERX_LEGACY_YOUTUBE_OPERATION: LegacyYouTubeUploadOperation = "social_media_upload";

export async function POST(req: Request) {
  const startTime = Date.now();
  let providerCallStarted = false;
  let providerCostRecorded = false;
  let providerRequestCount = 0;
  let responseStatus: number | undefined;
  let providerVideoId: string | undefined;
  let hasLegacyUserReference = false;
  let hasProvidedTokens = false;
  let hasGcsSource = false;

  try {
    const { email, gcsPath, title, description, tokens } = await req.json();
    hasLegacyUserReference = typeof email === "string" && email.trim().length > 0;
    hasProvidedTokens = Boolean(tokens);
    hasGcsSource = typeof gcsPath === "string" && gcsPath.trim().length > 0;

    // ✅ Check GCS + YouTube credentials
    if (
      !process.env.YOUTUBE_CLIENT_ID ||
      !process.env.YOUTUBE_CLIENT_SECRET ||
      !process.env.YOUTUBE_REDIRECT_URI
    ) {
      throw new Error("Missing YouTube OAuth environment variables");
    }

    if (
      !process.env.GOOGLE_CLOUD_PROJECT ||
      !process.env.GOOGLE_CLOUD_CREDENTIALS ||
      !process.env.GCS_BUCKET_NAME
    ) {
      throw new Error("Missing Google Cloud Storage configuration");
    }

    // ✅ Connect to MongoDB
    await connectToDatabase();

    // ✅ Get YouTube tokens (from frontend or DB)
    let userTokens = tokens;
    if (!userTokens && email) {
      const user = await UploaderX.findOne({ email });
      if (!user || !user.youtubeTokens) {
        return NextResponse.json(
          { error: "User not connected to YouTube" },
          { status: 401 }
        );
      }
      userTokens = user.youtubeTokens;
    }

    if (!userTokens) {
      return NextResponse.json(
        { error: "Missing YouTube tokens" },
        { status: 400 }
      );
    }

    // ✅ Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID!,
      process.env.YOUTUBE_CLIENT_SECRET!,
      process.env.YOUTUBE_REDIRECT_URI!
    );
    oauth2Client.setCredentials(userTokens);

    // ✅ YouTube API client
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // ✅ GCS Storage setup
    // ✅ GCS Storage setup
    const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, 'base64').toString();
    const credentials = JSON.parse(credentialsJson);

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
      credentials,
    });

    // ✅ Read file from GCS
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    if (!gcsPath) {
      return NextResponse.json(
        { error: "Missing gcsPath" },
        { status: 400 }
      );
    }

    const file = bucket.file(gcsPath);
    const stream = file.createReadStream();

    // ✅ Upload video to YouTube
    providerCallStarted = true;
    providerRequestCount += 1;
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "unlisted" },
      },
      media: { body: stream },
    });
    responseStatus = response.status;
    providerVideoId = response.data.id ?? undefined;

    await recordUploaderXLegacyYouTubeUploadCost({
      status: "success",
      requestCount: providerRequestCount,
      functionMs: Date.now() - startTime,
      responseStatus,
      providerVideoId,
      hasLegacyUserReference,
      hasProvidedTokens,
      hasGcsSource,
    });
    providerCostRecorded = true;

    // ✅ Optionally save YouTube video ID in DB
    if (email) {
      await UploaderX.findOneAndUpdate(
        { email },
        { $set: { lastUploadedVideoId: response.data.id } },
        { new: true }
      );
    }



    return NextResponse.json({
      success: true,
      videoId: response.data.id,
      message: "Video uploaded to YouTube successfully!",
    });
  } catch (error: any) {
    if (providerCallStarted && !providerCostRecorded) {
      await recordUploaderXLegacyYouTubeUploadCost({
        status: "failed",
        requestCount: providerRequestCount,
        functionMs: Date.now() - startTime,
        responseStatus,
        providerVideoId,
        hasLegacyUserReference,
        hasProvidedTokens,
        hasGcsSource,
        error,
      });
    }

    console.error("YouTube upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "YouTube upload failed" },
      { status: 500 }
    );
  }
}

async function recordUploaderXLegacyYouTubeUploadCost(input: {
  status: ProviderCostEventStatus;
  requestCount: number;
  functionMs: number;
  responseStatus?: number;
  providerVideoId?: string;
  hasLegacyUserReference: boolean;
  hasProvidedTokens: boolean;
  hasGcsSource: boolean;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    status: input.status,
    service: "uploaderx",
    action: "platform_publish",
    route: UPLOADERX_LEGACY_YOUTUBE_UPLOAD_ROUTE,
    provider: UPLOADERX_LEGACY_YOUTUBE_PROVIDER,
    model: UPLOADERX_LEGACY_YOUTUBE_MODEL,
    operation: UPLOADERX_LEGACY_YOUTUBE_OPERATION,
    providerJobId: input.providerVideoId,
    units: {
      requestCount: input.requestCount,
      functionMs: input.functionMs,
    },
    metadata: {
      platform: "youtube",
      routeMode: "legacy_gcs_upload",
      responseStatus: input.responseStatus,
      hasProviderVideoId: Boolean(input.providerVideoId),
      hasLegacyUserReference: input.hasLegacyUserReference,
      hasProvidedTokens: input.hasProvidedTokens,
      hasGcsSource: input.hasGcsSource,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
