import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      console.log("❌ YouTube Upload: No active session");
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log(`🔐 Fetching OAuth token for user: ${session.userId}`);

    // 🔐 Get Secure Token from Clerk Backend API
    const client = await clerkClient();

    // 🔍 DEBUG: Fetch full user to see external accounts
    const user = await client.users.getUser(session.userId);
    console.log("👤 User External Accounts:", user.externalAccounts.map(a => ({
      provider: a.provider,
      id: a.id,
      label: a.emailAddress
    })));

    // Find the correct provider ID dynamically
    const googleAccount = user.externalAccounts.find(a => a.provider.includes("google"));
    const providerId = googleAccount ? googleAccount.provider : "oauth_google";

    console.log(`🔑 Using Provider ID: ${providerId}`);

    let accessToken = null;

    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(session.userId, providerId as any);
      console.log(`🎟️ Token Response Length: ${tokenResponse.data.length}`);
      accessToken = tokenResponse.data.length > 0 ? tokenResponse.data[0].token : null;
    } catch (tokenError: any) {
      console.error("❌ Failed to get Oauth Access Token:", tokenError?.errors || tokenError);
    }

    if (!accessToken) {
      console.error("❌ No Google OAuth token found for user");
      return NextResponse.json({
        success: false,
        error: "Google account not connected or missing permissions. Please sign in with Google again."
      }, { status: 403 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid } = body;
    let { title, description, privacyStatus } = body;

    console.log("🚀 Starting YouTube Process:", { gcsPath, videoUuid, privacyStatus });

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    // Default to passed privacy or unlisted
    privacyStatus = privacyStatus || 'unlisted';
    let tags: string[] = [];
    let existingVideoId: string | null = null;

    if (videoUuid) {
      try {
        await connectToDatabase();
        const video = await UploaderX.findOne({ videoUuid });

        if (video && video.metadata) {
          console.log("📄 Found DB metadata for video:", video.metadata);

          // Check if we already have a YouTube ID
          if (video.metadata.youtube && video.metadata.youtube.videoId) {
            existingVideoId = video.metadata.youtube.videoId;
            console.log("🔄 Existing YouTube ID found:", existingVideoId);
          }

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

    let videoId: string;
    let youtubeUrl: string;

    if (existingVideoId) {
      // ================= UPDATE EXISTING VIDEO =================
      console.log(`📝 Updating existing video: ${existingVideoId}`);

      await youtube.videos.update({
        part: ["snippet", "status"],
        requestBody: {
          id: existingVideoId,
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags: tags,
            categoryId: "22" // People & Blogs default
          },
          status: { privacyStatus: privacyStatus },
        },
      });

      videoId = existingVideoId;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log("✅ YouTube Update Success");

    } else {
      // ================= UPLOAD NEW VIDEO =================
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

      console.log("📤 Stream created, initiating insert...");

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
      videoId = res.data.id!;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // ================= SAVE ID TO DB ================= 
      if (videoUuid) {
        await UploaderX.updateOne(
          { videoUuid },
          {
            $set: {
              "metadata.youtube.videoId": videoId,
              "metadata.youtube.url": youtubeUrl,
              "metadata.youtube.lastUploadedAt": new Date()
            }
          }
        );
        console.log("💾 Saved YouTube ID to database");
      }
    }

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    console.error("❌ YouTube operation failed:", error);
    if (error.response) {
      console.error("🚨 Google API Error Data:", JSON.stringify(error.response.data, null, 2));
    }
    return NextResponse.json({ success: false, error: error.message, details: error.response?.data }, { status: 500 });
  }
}
