import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { gcsPath, title, description, accessToken } = await req.json();

  

    if (!gcsPath || !accessToken) {
      return NextResponse.json({ success: false, error: "Missing gcsPath or accessToken" }, { status: 400 });
    }

    // ✅ Create Google API client and set token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      keyFilename: process.env.GOOGLE_CLOUD_CREDENTIALS,
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(gcsPath);
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

    const videoId = res.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    console.error("❌ YouTube upload failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
