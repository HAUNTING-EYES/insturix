import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gcsPath, title, description, accessToken } = body;
    console.log("🚀 Starting YouTube Upload:", { gcsPath, title, hasToken: !!accessToken });

    if (!gcsPath || !accessToken) {
      return NextResponse.json({ success: false, error: "Missing gcsPath or accessToken" }, { status: 400 });
    }

    // ✅ Create Google API client and set token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, 'base64').toString();
    const credentials = JSON.parse(credentialsJson);

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      credentials,
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(gcsPath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error("❌ GCS File not found:", gcsPath);
      return NextResponse.json({ success: false, error: "File not found in GCS" }, { status: 404 });
    }

    const stream = file.createReadStream();

    // ✅ Upload to YouTube
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: title || "UploaderX Video", description: description || "Uploaded via UploaderX" },
        status: { privacyStatus: "unlisted" },
      },
      media: { body: stream },
    });

    console.log("✅ YouTube Upload Success. Video ID:", res.data.id);
    const videoId = res.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    console.error("❌ YouTube upload failed:", error.response ? error.response.data : error.message);
    return NextResponse.json({ success: false, error: error.message, details: error.response?.data }, { status: 500 });
  }
}
