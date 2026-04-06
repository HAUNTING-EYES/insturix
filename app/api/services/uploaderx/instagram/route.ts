import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

/**
 * POST /api/services/uploaderx/instagram
 * Publishes a video/image to an Instagram Business account using the Instagram Graph API.
 * 
 * Instagram publishing requires a publicly accessible URL for the media.
 * We generate a signed URL from GCS with temporary access.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            console.error("❌ Instagram Publish: No active session");
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { gcsPath, videoUuid, title, description, accountId: requestedAccountId } = body;

        console.log("🟣 Starting Instagram Publish:", { gcsPath, videoUuid, requestedAccountId });

        if (!gcsPath) {
            console.error("❌ Instagram Publish: Missing gcsPath");
            return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Get the Instagram tokens from the user document
        const user = await User.findOne({
            clerkUserId: session.userId,
            instagramTokens: { $exists: true, $ne: null },
        });

        console.log("🔍 Instagram user lookup result:", {
            userFound: !!user,
            hasTokens: !!user?.instagramTokens,
            accountsCount: user?.instagramTokens?.accounts?.length || 0,
            clerkUserId: session.userId
        });

        if (!user || !user.instagramTokens) {
            console.error("❌ Instagram not connected for user:", session.userId);
            return NextResponse.json({
                success: false,
                error: "Instagram not connected. Please connect your Instagram account first.",
            }, { status: 403 });
        }

        const ig = user.instagramTokens as any;
        const accounts = ig.accounts || [];

        if (accounts.length === 0) {
            console.error("❌ No Instagram Accounts found for user.");
            return NextResponse.json({
                success: false,
                error: "No Instagram Business accounts found. You need at least one connected account.",
            }, { status: 400 });
        }

        // Use requested account or default to first account
        const targetAccount = requestedAccountId
            ? accounts.find((a: any) => a.instagramAccountId === requestedAccountId)
            : accounts[0];

        if (!targetAccount) {
            return NextResponse.json({
                success: false,
                error: "Requested Instagram account not found.",
            }, { status: 400 });
        }

        console.log(`📄 Publishing to: ${targetAccount.instagramUsername} (${targetAccount.instagramAccountId})`);
        console.log(`🔗 Connected to Page: ${targetAccount.facebookPageName} (${targetAccount.facebookPageId})`);

        // 🔁 Refresh page access token to ensure it's valid
        console.log("🔄 Refreshing page access token...");
        try {
            const refreshPageTokenRes = await fetch(
                `https://graph.facebook.com/v21.0/${targetAccount.facebookPageId}?fields=access_token&access_token=${ig.userAccessToken}`
            );
            const refreshPageTokenData = await refreshPageTokenRes.json();

            if (refreshPageTokenData.access_token) {
                console.log("✅ Refreshed page access token");
                targetAccount.facebookPageAccessToken = refreshPageTokenData.access_token;
            } else {
                console.warn("⚠️ Could not refresh page token, using stored token");
            }
        } catch (refreshError) {
            console.warn("⚠️ Failed to refresh page token:", refreshError);
        }

        // Get video metadata from DB
        let finalCaption = title || "";
        let finalDescription = description || "";

        let videoDoc = null;
        if (videoUuid) {
            videoDoc = await UploaderX.findOne({ videoUuid });

            if (videoDoc?.metadata) {
                const meta = videoDoc.metadata;
                if (meta.instagram) {
                    finalCaption = finalCaption || meta.instagram.caption || meta.title;
                    finalDescription = finalDescription || meta.instagram.description || meta.description;
                } else {
                    finalCaption = finalCaption || meta.title;
                    finalDescription = finalDescription || meta.description;
                }
            }
        }

        // Check if video already has an Instagram ID (for updates)
        let existingIgMediaId: string | null = null;
        if (videoDoc?.metadata?.instagram?.mediaId) {
            existingIgMediaId = videoDoc.metadata.instagram.mediaId;
            console.log("🔄 Existing Instagram media ID found:", existingIgMediaId);
        }

        // Step 1: Generate a publicly accessible URL from GCS
        console.log("🔗 Generating signed GCS URL...");
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
        const [fileMetadata] = await file.getMetadata();
        const fileSize = fileMetadata.size as number;
        const fileName = gcsPath.split("/").pop() || "video.mp4";

        console.log(`📦 File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`📦 File name: ${fileName}`);

        // Generate a signed URL that expires in 1 hour
        const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        console.log("✅ Signed URL generated:", signedUrl.substring(0, 50) + "...");

        // Get file metadata to determine media type
        const contentType = fileMetadata.contentType as string || "video/mp4";
        const isVideo = contentType.startsWith("video/");

        console.log(`📦 Media type: ${contentType}, isVideo: ${isVideo}`);
        console.log("🔑 Page access token present:", !!targetAccount.facebookPageAccessToken);
        console.log("🔑 Page access token length:", targetAccount.facebookPageAccessToken?.length || 0);

        // Determine content type for Instagram API
        const mediaType = isVideo ? "REELS" : "IMAGE";

        // Combine caption and description for Instagram caption
        const fullCaption = finalCaption ? `${finalCaption}\n\n${finalDescription}`.trim() : finalDescription;

        if (isVideo) {
            // ================= VIDEO (REELS) PUBLISHING =================
            console.log("🎬 Publishing as Instagram Reel...");

            const igAccountId = targetAccount.instagramAccountId;
            const igPageAccessToken = targetAccount.facebookPageAccessToken;

            if (existingIgMediaId) {
                // ================= UPDATE EXISTING MEDIA =================
                // Instagram Graph API doesn't support updating captions on published media
                // We return the existing media info instead
                console.log(`📝 Existing Instagram media found: ${existingIgMediaId}`);
                console.log("⚠️ Instagram API doesn't support updating published media captions. Returning existing media info.");

                const instagramUrl = `https://www.instagram.com/p/${existingIgMediaId}`;

                return NextResponse.json({
                    success: true,
                    instagramUrl,
                    mediaId: existingIgMediaId,
                    accountUsername: targetAccount.instagramUsername,
                    mediaType: "REELS",
                    updated: false,
                    note: "Instagram doesn't support updating published media captions. Returning existing media.",
                });
            }

            // Step 1: Create a media container for the Reel
            console.log("📤 Creating Reel container...");
            const createContainerUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media`;

            const containerParams = new URLSearchParams();
            containerParams.set("video_url", signedUrl);
            containerParams.set("media_type", "REELS");
            containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
            containerParams.set("access_token", igPageAccessToken);

            const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
                method: "POST",
            });

            const containerData = await containerRes.json();

            if (containerData.error) {
                console.error("❌ Instagram container creation error:", containerData.error);
                return NextResponse.json({
                    success: false,
                    error: containerData.error.message || "Failed to create Instagram Reel",
                }, { status: 500 });
            }

            const containerId = containerData.id;
            console.log("✅ Reel container created:", containerId);

            // Step 2: Poll for container status
            console.log("⏳ Waiting for container to be ready...");
            let containerStatus = "IN_PROGRESS";
            let attempts = 0;
            const maxAttempts = 60; // Max 5 minutes (5s intervals)

            while (containerStatus === "IN_PROGRESS" && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                attempts++;

                const statusUrl = `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status_message&access_token=${igPageAccessToken}`;
                const statusRes = await fetch(statusUrl);
                const statusData = await statusRes.json();

                console.log(`🔄 Container status (attempt ${attempts}):`, statusData.status_code);

                containerStatus = statusData.status_code;

                if (containerStatus === "ERROR") {
                    console.error("❌ Container processing error:", statusData.status_message);
                    return NextResponse.json({
                        success: false,
                        error: `Instagram processing error: ${statusData.status_message || "Unknown error"}`,
                    }, { status: 500 });
                }
            }

            if (containerStatus !== "FINISHED") {
                console.error("❌ Container timed out:", containerStatus);
                return NextResponse.json({
                    success: false,
                    error: "Instagram Reel processing timed out. Please try again later.",
                }, { status: 500 });
            }

            console.log("✅ Container ready, publishing...");

            // Step 3: Publish the container
            console.log("🚀 Publishing Reel...");
            const publishUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`;
            const publishParams = new URLSearchParams();
            publishParams.set("creation_id", containerId);
            publishParams.set("access_token", igPageAccessToken);

            const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, {
                method: "POST",
            });

            const publishData = await publishRes.json();

            if (publishData.error) {
                console.error("❌ Instagram publish error:", publishData.error);
                return NextResponse.json({
                    success: false,
                    error: publishData.error.message || "Failed to publish Instagram Reel",
                }, { status: 500 });
            }

            console.log("✅ Instagram Reel published successfully! Media ID:", publishData.id);

            const instagramUrl = `https://www.instagram.com/p/${publishData.id}`;
            const mediaId = publishData.id;

            // Save Instagram media ID to database
            if (videoUuid) {
                await UploaderX.updateOne(
                    { videoUuid },
                    {
                        $set: {
                            "metadata.instagram.mediaId": mediaId,
                            "metadata.instagram.url": instagramUrl,
                            "metadata.instagram.instagramAccountId": igAccountId,
                            "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
                            "metadata.instagram.lastUploadedAt": new Date(),
                        },
                    }
                );
                console.log("💾 Saved Instagram media ID to database");
            }

            return NextResponse.json({
                success: true,
                instagramUrl,
                mediaId,
                accountUsername: targetAccount.instagramUsername,
                mediaType: "REELS",
            });

        } else {
            // ================= IMAGE PUBLISHING =================
            console.log("🖼️ Publishing as Instagram Image...");

            const igAccountId = targetAccount.instagramAccountId;
            const igPageAccessToken = targetAccount.facebookPageAccessToken;

            if (existingIgMediaId) {
                // ================= UPDATE EXISTING MEDIA =================
                console.log(`📝 Existing Instagram media found: ${existingIgMediaId}`);
                console.log("⚠️ Instagram API doesn't support updating published media captions. Returning existing media info.");

                const instagramUrl = `https://www.instagram.com/p/${existingIgMediaId}`;

                return NextResponse.json({
                    success: true,
                    instagramUrl,
                    mediaId: existingIgMediaId,
                    accountUsername: targetAccount.instagramUsername,
                    mediaType: "IMAGE",
                    updated: false,
                    note: "Instagram doesn't support updating published media captions. Returning existing media.",
                });
            }

            // Step 1: Create a media container for the image
            console.log("📤 Creating image container...");
            const createContainerUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media`;

            const containerParams = new URLSearchParams();
            containerParams.set("image_url", signedUrl);
            containerParams.set("caption", fullCaption || "Uploaded via UploaderX");
            containerParams.set("access_token", igPageAccessToken);

            const containerRes = await fetch(`${createContainerUrl}?${containerParams.toString()}`, {
                method: "POST",
            });

            const containerData = await containerRes.json();

            if (containerData.error) {
                console.error("❌ Instagram container creation error:", containerData.error);
                return NextResponse.json({
                    success: false,
                    error: containerData.error.message || "Failed to create Instagram post",
                }, { status: 500 });
            }

            const containerId = containerData.id;
            console.log("✅ Image container created:", containerId);

            // Step 2: Publish the container
            console.log("🚀 Publishing image post...");
            const publishUrl = `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`;
            const publishParams = new URLSearchParams();
            publishParams.set("creation_id", containerId);
            publishParams.set("access_token", igPageAccessToken);

            const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, {
                method: "POST",
            });

            const publishData = await publishRes.json();

            if (publishData.error) {
                console.error("❌ Instagram publish error:", publishData.error);
                return NextResponse.json({
                    success: false,
                    error: publishData.error.message || "Failed to publish Instagram post",
                }, { status: 500 });
            }

            console.log("✅ Instagram image published successfully! Media ID:", publishData.id);

            const instagramUrl = `https://www.instagram.com/p/${publishData.id}`;
            const mediaId = publishData.id;

            // Save Instagram media ID to database
            if (videoUuid) {
                await UploaderX.updateOne(
                    { videoUuid },
                    {
                        $set: {
                            "metadata.instagram.mediaId": mediaId,
                            "metadata.instagram.url": instagramUrl,
                            "metadata.instagram.instagramAccountId": igAccountId,
                            "metadata.instagram.instagramUsername": targetAccount.instagramUsername,
                            "metadata.instagram.lastUploadedAt": new Date(),
                        },
                    }
                );
                console.log("💾 Saved Instagram media ID to database");
            }

            return NextResponse.json({
                success: true,
                instagramUrl,
                mediaId,
                accountUsername: targetAccount.instagramUsername,
                mediaType: "IMAGE",
            });
        }
    } catch (error: any) {
        console.error("❌ Instagram operation failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Instagram publish failed",
        }, { status: 500 });
    }
}
