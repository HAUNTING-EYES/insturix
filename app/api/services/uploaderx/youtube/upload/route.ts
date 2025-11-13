import { google } from "googleapis";
import { NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import { Storage } from "@google-cloud/storage";

export async function POST(req: Request) {
  try {
    const { email, gcsPath, title, description, tokens } = await req.json();
   
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
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
      keyFilename: process.env.GOOGLE_CLOUD_CREDENTIALS!,
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
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "unlisted" },
      },
      media: { body: stream },
    });

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
    console.error("❌ YouTube upload failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "YouTube upload failed" },
      { status: 500 }
    );
  }
}
