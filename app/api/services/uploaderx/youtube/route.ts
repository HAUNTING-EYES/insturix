import { google } from "googleapis";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import { fetchUploaderXStream, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      console.log("YouTube Upload: No active session");
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log(`Fetching OAuth token for user: ${session.userId}`);

    const client = await clerkClient();
    const user = await client.users.getUser(session.userId);
    console.log(
      "User External Accounts:",
      user.externalAccounts.map((account) => ({
        provider: account.provider,
        id: account.id,
        label: account.emailAddress,
      }))
    );

    const googleAccount = user.externalAccounts.find((account) => account.provider.includes("google"));
    const providerId = googleAccount ? googleAccount.provider : "oauth_google";

    console.log(`Using Provider ID: ${providerId}`);

    let accessToken: string | null = null;

    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(session.userId, providerId as any);
      console.log(`Token Response Length: ${tokenResponse.data.length}`);
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
    let { title, description, privacyStatus } = body;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    privacyStatus = privacyStatus || "unlisted";
    let tags: string[] = [];
    let existingVideoId: string | null = null;

    if (videoUuid) {
      try {
        await connectToDatabase();
        const video = await UploaderX.findOne({ videoUuid });

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
            privacyStatus = ytMeta.youtube?.privacyStatus || ytMeta.privacyStatus || privacyStatus;
          } else {
            dbTitle = video.metadata.title;
            dbDescription = video.metadata.description;
            dbTags = video.metadata.tags;
          }

          title = dbTitle || title;
          description = dbDescription || description;
          tags = dbTags || tags;

          if (video.metadata.youtube?.privacyStatus) {
            privacyStatus = video.metadata.youtube.privacyStatus;
          }

          if (video.metadata.videoType === "short") {
            if (title && !title.toLowerCase().includes("#shorts")) {
              title = `${title} #Shorts`;
            }
            if (description && !description.toLowerCase().includes("#shorts")) {
              description = `${description}\n#Shorts`;
            }
          }
        }
      } catch (dbError) {
        console.error("Failed to fetch video metadata:", dbError);
      }
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

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
            categoryId: "22",
          },
          status: { privacyStatus },
        },
      });

      videoId = existingVideoId;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const videoAsset = await resolveUploaderXVideo({ videoUuid, gcsPath });
      const { stream } = await fetchUploaderXStream(videoAsset.publicUrl);

      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: title || "UploaderX Video",
            description: description || "Uploaded via UploaderX",
            tags,
          },
          status: { privacyStatus },
        },
        media: { body: stream },
      });

      videoId = res.data.id!;
      youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (videoUuid) {
        await UploaderX.updateOne(
          { videoUuid },
          {
            $set: {
              "metadata.youtube.videoId": videoId,
              "metadata.youtube.url": youtubeUrl,
              "metadata.youtube.lastUploadedAt": new Date(),
            },
          }
        );
      }
    }

    return NextResponse.json({ success: true, youtubeUrl });
  } catch (error: any) {
    console.error("YouTube operation failed:", error);
    if (error.response) {
      console.error("Google API Error Data:", JSON.stringify(error.response.data, null, 2));
    }
    return NextResponse.json(
      { success: false, error: error.message, details: error.response?.data },
      { status: 500 }
    );
  }
}
