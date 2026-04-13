import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

/**
 * POST /api/services/uploaderx/twitter
 * Uploads a video to Twitter/X using the Chunked Media Upload API.
 * Flow: INIT → APPEND (5MB chunks) → FINALIZE → STATUS → TWEET
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { gcsPath, videoUuid, title, description } = body;

        if (!gcsPath) {
            return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Get the Twitter tokens from the user document
        const user = await User.findOne({
            clerkUserId: session.userId,
            twitterTokens: { $exists: true, $ne: null },
            "twitterTokens.accessToken": { $exists: true, $ne: null },
        });

        if (!user || !user.twitterTokens || !user.twitterTokens.accessToken) {
            return NextResponse.json({
                success: false,
                error: "Twitter not connected. Please connect your Twitter account first.",
            }, { status: 403 });
        }

        const twitterTokens = user.twitterTokens;

        // Check if token is expired and try to refresh
        const now = new Date();
        let accessToken = twitterTokens.accessToken;

        if (!twitterTokens.expiresAt || twitterTokens.expiresAt < now) {
            // Try to refresh the access token
            if (!twitterTokens.refreshToken) {
                return NextResponse.json({
                    success: false,
                    error: "Twitter token expired and no refresh token available. Please reconnect your Twitter account.",
                }, { status: 401 });
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
                        "Authorization": `Basic ${credentials}`,
                    },
                    body: refreshBody.toString(),
                });

                const refreshData = await refreshRes.json();

                if (refreshRes.status !== 200 || refreshData.error) {
                    return NextResponse.json({
                        success: false,
                        error: "Twitter token refresh failed. Please reconnect your Twitter account.",
                    }, { status: 401 });
                }

                // Update tokens in database
                const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
                await User.updateOne(
                    { clerkUserId: session.userId },
                    {
                        $set: {
                            "twitterTokens.accessToken": refreshData.access_token,
                            "twitterTokens.refreshToken": refreshData.refresh_token,
                            "twitterTokens.expiresAt": newExpiresAt,
                        }
                    }
                );

                accessToken = refreshData.access_token;
            } catch (refreshError) {
                return NextResponse.json({
                    success: false,
                    error: "Failed to refresh Twitter token. Please reconnect your Twitter account.",
                }, { status: 401 });
            }
        }

        // Check if video already has a Twitter ID (for updates)
        let existingTweetId: string | null = null;
        let videoDoc = null;

        if (videoUuid) {
            videoDoc = await UploaderX.findOne({ videoUuid });
            if (videoDoc?.metadata?.twitter?.tweetId) {
                existingTweetId = videoDoc.metadata.twitter.tweetId;
                console.log("🔄 Existing Twitter tweet ID found:", existingTweetId);
            }
        }

        // Get video metadata from DB
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

        // Combine title and description for tweet text
        // Twitter has 280 character limit for tweets
        let tweetText = finalTitle || "";
        if (finalDescription) {
            tweetText = tweetText ? `${tweetText}\n\n${finalDescription}` : finalDescription;
        }
        tweetText = tweetText || "Uploaded via UploaderX";

        // Truncate if exceeds 280 characters
        if (tweetText.length > 280) {
            tweetText = tweetText.substring(0, 277) + "...";
            console.log("⚠️ Tweet text truncated to 280 characters");
        }

        if (existingTweetId) {
            // ================= UPDATE EXISTING TWEET =================
            // Note: Twitter API doesn't support updating existing tweets
            // We'll return the existing tweet info
            console.log(`📝 Existing tweet found: ${existingTweetId}`);
            console.log("⚠️ Twitter doesn't support updating existing tweets. Returning existing tweet info.");

            const tweetUrl = `https://x.com/${twitterTokens.userName}/status/${existingTweetId}`;

            return NextResponse.json({
                success: true,
                tweetUrl,
                tweetId: existingTweetId,
                updated: false,
                note: "Twitter doesn't support updating existing tweets. Returning existing tweet.",
            });
        }

        // ================= UPLOAD NEW VIDEO =================
        // Get video from GCS
        const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, "base64").toString();
        const credentials = JSON.parse(credentialsJson);

        const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            credentials,
        });

        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
        const file = bucket.file(gcsPath);

        const [exists] = await file.exists();
        if (!exists) {
            console.error("❌ GCS File not found:", gcsPath);
            return NextResponse.json({ success: false, error: "File not found in GCS" }, { status: 404 });
        }

        // Get file metadata for size
        const [metadata] = await file.getMetadata();
        const fileSize = metadata.size as number;
        const fileName = gcsPath.split("/").pop() || "video.mp4";

        console.log(`📦 File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`📦 File name: ${fileName}`);

        // Twitter video limits
        const MAX_VIDEO_SIZE = 512 * 1024 * 1024; // 512 MB
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks

        if (fileSize > MAX_VIDEO_SIZE) {
            console.error("❌ File too large for Twitter:", fileSize);
            return NextResponse.json({
                success: false,
                error: `File too large. Twitter maximum size is 512MB, your file is ${(fileSize / (1024 * 1024)).toFixed(2)}MB`,
            }, { status: 400 });
        }

        // Download file from GCS to buffer
        console.log("📥 Downloading video from GCS...");
        const [fileBuffer] = await file.download();
        console.log(`✅ Downloaded ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

        // ================= CHUNKED UPLOAD =================
        console.log("🐦 Starting Twitter Chunked Media Upload...");

        // Step 1: INIT - Initialize the upload
        console.log("📤 Step 1/4: INITIALIZING upload...");
        const initResponse = await twitterApiRequest(
            "POST",
            "https://upload.twitter.com/1.1/media/upload.json",
            {
                command: "INIT",
                total_bytes: fileSize.toString(),
                media_type: "video/mp4",
                media_category: "tweet_video",
            },
            accessToken
        );

        if (!initResponse.media_id_string) {
            console.error("❌ Twitter INIT failed:", initResponse);
            return NextResponse.json({
                success: false,
                error: "Failed to initialize Twitter upload",
                details: initResponse,
            }, { status: 500 });
        }

        const mediaId = initResponse.media_id_string;
        console.log("✅ INIT successful, media_id:", mediaId);

        // Step 2: APPEND - Upload video in chunks
        console.log("📤 Step 2/4: UPLOADING chunks...");
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
        console.log(`📦 Total chunks: ${totalChunks}`);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunk = fileBuffer.slice(start, end);

            console.log(`📦 Uploading chunk ${i + 1}/${totalChunks} (${(chunk.length / 1024).toFixed(2)} KB)`);

            await twitterApiRequest(
                "POST",
                "https://upload.twitter.com/1.1/media/upload.json",
                {
                    command: "APPEND",
                    media_id: mediaId,
                    segment_index: i.toString(),
                },
                accessToken,
                chunk // Media chunk
            );

            console.log(`✅ Chunk ${i + 1}/${totalChunks} uploaded`);
        }

        console.log("✅ All chunks uploaded successfully");

        // Step 3: FINALIZE - Finalize the upload
        console.log("📤 Step 3/4: FINALIZING upload...");
        const finalizeResponse = await twitterApiRequest(
            "POST",
            "https://upload.twitter.com/1.1/media/upload.json",
            {
                command: "FINALIZE",
                media_id: mediaId,
            },
            accessToken
        );

        if (!finalizeResponse.media_id_string) {
            console.error("❌ Twitter FINALIZE failed:", finalizeResponse);
            return NextResponse.json({
                success: false,
                error: "Failed to finalize Twitter upload",
                details: finalizeResponse,
            }, { status: 500 });
        }

        console.log("✅ FINALIZE successful");

        // Step 4: STATUS - Poll until processing complete
        console.log("📤 Step 4/4: POLLING status...");
        const processingState = await pollMediaStatus(mediaId, accessToken);

        if (processingState !== "succeeded") {
            console.error("❌ Twitter video processing failed:", processingState);
            return NextResponse.json({
                success: false,
                error: `Twitter video processing failed: ${processingState}`,
            }, { status: 500 });
        }

        console.log("✅ Video processing succeeded");

        // ================= CREATE TWEET =================
        console.log("🐦 Creating tweet with uploaded video...");

        const tweetPayload = {
            text: tweetText,
            media: {
                media_ids: [mediaId],
            },
        };

        const tweetResponse = await fetch("https://api.x.com/2/tweets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify(tweetPayload),
        });

        const tweetData = await tweetResponse.json();

        if (tweetResponse.status !== 201 || tweetData.error) {
            console.error("❌ Tweet creation failed:", tweetData);
            return NextResponse.json({
                success: false,
                error: tweetData.error?.message || "Failed to create tweet",
                details: tweetData,
            }, { status: 500 });
        }

        const tweetId = tweetData.data.id;
        const tweetUrl = `https://x.com/${twitterTokens.userName}/status/${tweetId}`;

        console.log("✅ Tweet created successfully:", tweetUrl);

        // ================= SAVE TO DB =================
        if (videoUuid) {
            await UploaderX.updateOne(
                { videoUuid },
                {
                    $set: {
                        "metadata.twitter.mediaId": mediaId,
                        "metadata.twitter.tweetId": tweetId,
                        "metadata.twitter.tweetUrl": tweetUrl,
                        "metadata.twitter.lastUploadedAt": new Date(),
                        "metadata.twitter.processingState": processingState,
                    },
                }
            );
            console.log("💾 Saved Twitter metadata to database");
        }

        return NextResponse.json({
            success: true,
            tweetUrl,
            tweetId,
            mediaId,
            accountUsername: twitterTokens.userName,
        });
    } catch (error: any) {
        console.error("❌ Twitter upload error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Twitter upload failed",
        }, { status: 500 });
    }
}

/**
 * Make authenticated request to Twitter API
 */
async function twitterApiRequest(
    method: string,
    url: string,
    params: Record<string, string>,
    accessToken: string,
    mediaChunk?: Buffer
): Promise<any> {
    // If we have a media chunk (APPEND command), send raw binary
    if (mediaChunk) {
        const appendUrl = new URL(url);
        for (const [key, value] of Object.entries(params)) {
            appendUrl.searchParams.set(key, value);
        }

        const response = await fetch(appendUrl.toString(), {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/octet-stream",
            },
            body: mediaChunk,
        });

        let data: any = {};
        const responseText = await response.text();
        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.warn("⚠️ Failed to parse Twitter API response as JSON:", parseError);
                data = {};
            }
        }

        if (response.status >= 400) {
            console.error("❌ Twitter API error:", data);
            console.error("❌ Response status:", response.status);
            console.error("❌ Response headers:", Object.fromEntries(response.headers.entries()));
            throw new Error(data.error?.message || `Twitter API returned ${response.status}`);
        }

        return data;
    }

    // For other commands (INIT, FINALIZE, STATUS), use query params
    const queryParams = new URL(url);
    for (const [key, value] of Object.entries(params)) {
        queryParams.searchParams.set(key, value);
    }

    const fullUrl = queryParams.toString();

    const response = await fetch(fullUrl, {
        method,
        headers: {
            "Authorization": `Bearer ${accessToken}`,
        },
    });

    let data: any = {};
    const responseText = await response.text();
    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.warn("⚠️ Failed to parse Twitter API response as JSON:", parseError);
            data = {};
        }
    }

    if (response.status >= 400) {
        console.error("❌ Twitter API error:", data);
        console.error("❌ Response status:", response.status);
        console.error("❌ Response headers:", Object.fromEntries(response.headers.entries()));
        throw new Error(data.error?.message || `Twitter API returned ${response.status}`);
    }

    return data;
}

/**
 * Poll media status until processing is complete
 */
async function pollMediaStatus(mediaId: string, accessToken: string): Promise<string> {
    const maxAttempts = 60; // 5 minutes (5 second intervals)
    const interval = 5000; // 5 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;

        const statusUrl = new URL("https://upload.twitter.com/1.1/media/upload.json");
        statusUrl.searchParams.set("command", "STATUS");
        statusUrl.searchParams.set("media_id", mediaId);

        const response = await fetch(statusUrl.toString(), {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        let data: any = {};
        const responseText = await response.text();
        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.warn("⚠️ Failed to parse Twitter API response as JSON:", parseError);
                data = {};
            }
        }

        if (data.error) {
            console.error("❌ Media STATUS check failed:", data.error);
            throw new Error(data.error.message || "Failed to check media status");
        }

        const processingInfo = data.processing_info;

        if (!processingInfo) {
            // No processing info means it's ready immediately
            console.log("✅ Media ready (no processing required)");
            return "succeeded";
        }

        const state = processingInfo.state;
        console.log(`🔄 Media status (attempt ${attempts}):`, state);

        if (state === "succeeded") {
            return "succeeded";
        }

        if (state === "failed") {
            console.error("❌ Media processing failed:", processingInfo.error);
            return "failed";
        }

        if (state === "in_progress") {
            console.log(`⏳ Processing... ${processingInfo.progress_percent || 0}% complete`);
            continue;
        }

        if (state === "pending") {
            console.log("⏳ Processing pending...");
            continue;
        }
    }

    // Timeout
    console.error("❌ Media processing timed out after 5 minutes");
    return "timed_out";
}

