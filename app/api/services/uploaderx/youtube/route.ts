import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gcsPath, videoUuid, accessToken } = body;
    let { title, description, privacyStatus } = body;

    console.log("🚀 Starting YouTube Upload:", { gcsPath, videoUuid, hasToken: !!accessToken, privacyStatus });

    if (!gcsPath || !accessToken) {
      return NextResponse.json({ success: false, error: "Missing gcsPath or accessToken" }, { status: 400 });
    }

    // Default to passed privacy or unlisted
    privacyStatus = privacyStatus || 'unlisted';
    let tags: string[] = [];

    if (videoUuid) {
      try {
        await connectToDatabase();
        const video = await UploaderX.findOne({ videoUuid });

        if (video && video.metadata) {
          console.log("📄 Found DB metadata for video:", video.metadata);

          let dbTitle, dbDescription, dbTags;

          if (video.metadata.youtube) {
            const ytMeta = video.metadata.youtube;
            dbTitle = ytMeta.title;
            dbDescription = ytMeta.description;
            dbTags = ytMeta.tags;
            // The privacyStatus is inside the nested youtube object
            if (ytMeta.youtube) {
              privacyStatus = ytMeta.youtube.privacyStatus || privacyStatus;
            } else {
              // Fallback if structure is flat under youtube key
              privacyStatus = ytMeta.privacyStatus || privacyStatus;
            }
          } else {
            // Fallback to root metadata if youtube specific not found
            dbTitle = video.metadata.title;
            dbDescription = video.metadata.description;
            dbTags = video.metadata.tags;
          }

          // Prioritize DB metadata, then request body, then defaults
          title = dbTitle || title;
          description = dbDescription || description;
          tags = dbTags || tags;
          // Use DB privacy if available, otherwise keep body privacy
          privacyStatus = privacyStatus === 'unlisted' && (dbTitle || dbDescription)
            ? (video.metadata.youtube?.privacyStatus || video.metadata.youtube?.youtube?.privacyStatus || privacyStatus)
            : privacyStatus;

          // Simplified: If DB has specific youtube privacy, use it. Otherwise rely on passed body.
          if (video.metadata.youtube && video.metadata.youtube.privacyStatus) {
            privacyStatus = video.metadata.youtube.privacyStatus;
          }

          // ✅ SPECIAL HANDLING FOR SHORTS:
          // If the video type is 'short' (saved in DB), ensure #Shorts is in the title/desc
          // This overrides the "clean" title from DB to ensure YouTube detects it as a Short.
          const videoType = video.metadata.videoType;
          if (videoType === 'short') {
            if (title && !title.toLowerCase().includes('#shorts')) {
              title = `${title} #Shorts`;
              console.log("🩳 Appended #Shorts to title based on videoType");
            }
            if (description && !description.toLowerCase().includes('#shorts')) {
              description = `${description} \n#Shorts`;
            }
          }
        }
      } catch (dbError) {
        console.error("⚠️ Failed to fetch video metadata:", dbError);
      }
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
        snippet: {
          title: title || "UploaderX Video",
          description: description || "Uploaded via UploaderX",
          tags: tags
        },
        status: { privacyStatus: privacyStatus },
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
