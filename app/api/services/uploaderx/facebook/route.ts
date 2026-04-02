import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import axios from "axios";
import FormData from "form-data";

/**
 * POST /api/services/uploaderx/facebook
 * Uploads a video to a Facebook Page using the Graph API.
 * Reads the video from GCS and uploads it via the Resumable Upload API.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            console.error("❌ Facebook Upload: No active session");
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { gcsPath, videoUuid, title, description, pageId: requestedPageId } = body;

        console.log("🔵 Starting Facebook Upload:", { gcsPath, videoUuid, requestedPageId });

        if (!gcsPath) {
            console.error("❌ Facebook Upload: Missing gcsPath");
            return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Get the Facebook tokens from the user document
        const user = await User.findOne({
            clerkUserId: session.userId,
            facebookTokens: { $exists: true, $ne: null },
        });

        console.log("🔍 Facebook user lookup result:", {
            userFound: !!user,
            hasTokens: !!user?.facebookTokens,
            pagesCount: user?.facebookTokens?.pages?.length || 0,
            clerkUserId: session.userId
        });

        if (!user || !user.facebookTokens) {
            console.error("❌ Facebook not connected for user:", session.userId);
            return NextResponse.json({
                success: false,
                error: "Facebook not connected. Please connect your Facebook account first.",
            }, { status: 403 });
        }

        const fb = user.facebookTokens as any;
        const pages = fb.pages || [];

        if (pages.length === 0) {
            console.error("❌ No Facebook Pages found for user. Pages:", pages);
            return NextResponse.json({
                success: false,
                error: "No Facebook Pages found. You need at least one Page to upload videos.",
            }, { status: 400 });
        }

        // Use requested page or default to first page
        const targetPage = requestedPageId
            ? pages.find((p: any) => p.pageId === requestedPageId)
            : pages[0];

        if (!targetPage) {
            return NextResponse.json({
                success: false,
                error: "Requested Facebook Page not found.",
            }, { status: 400 });
        }

        console.log(`📄 Uploading to Page: ${targetPage.pageName} (${targetPage.pageId})`);
        console.log("🔑 Page Access Token present:", !!targetPage.pageAccessToken);
        console.log("🔑 Page Access Token length:", targetPage.pageAccessToken?.length || 0);
        console.log("🔑 Page Access Token preview:", targetPage.pageAccessToken ? targetPage.pageAccessToken.substring(0, 20) + "..." : "MISSING");

        // 🔁 Refresh page access token to ensure it's valid
        console.log("🔄 Refreshing page access token...");
        try {
            const refreshPageTokenRes = await fetch(
                `https://graph.facebook.com/v21.0/${targetPage.pageId}?fields=access_token&access_token=${fb.userAccessToken}`
            );
            const refreshPageTokenData = await refreshPageTokenRes.json();
            
            if (refreshPageTokenData.access_token) {
                console.log("✅ Refreshed page access token");
                targetPage.pageAccessToken = refreshPageTokenData.access_token;
            } else {
                console.warn("⚠️ Could not refresh page token, using stored token");
            }
        } catch (refreshError) {
            console.warn("⚠️ Failed to refresh page token:", refreshError);
        }

        // Check if video already has a Facebook ID (for updates)
        let existingFbVideoId: string | null = null;
        let videoDoc = null;

        if (videoUuid) {
            videoDoc = await UploaderX.findOne({ videoUuid });
            if (videoDoc?.metadata?.facebook?.videoId) {
                existingFbVideoId = videoDoc.metadata.facebook.videoId;
                console.log("🔄 Existing Facebook video ID found:", existingFbVideoId);
            }
        }

        // Get video metadata from DB
        let finalTitle = title;
        let finalDescription = description;

        if (videoDoc?.metadata) {
            const meta = videoDoc.metadata;
            if (meta.facebook) {
                finalTitle = finalTitle || meta.facebook.title || meta.title;
                finalDescription = finalDescription || meta.facebook.description || meta.description;
            } else {
                finalTitle = finalTitle || meta.title;
                finalDescription = finalDescription || meta.description;
            }
        }

        finalTitle = finalTitle || "Uploaded via UploaderX";
        finalDescription = finalDescription || "";

        if (existingFbVideoId) {
            // ================= UPDATE EXISTING VIDEO =================
            console.log(`📝 Updating existing Facebook video: ${existingFbVideoId}`);

            const updateRes = await fetch(
                `https://graph.facebook.com/v21.0/${existingFbVideoId}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        access_token: targetPage.pageAccessToken,
                        title: finalTitle,
                        description: finalDescription,
                    }),
                }
            );

            const updateData = await updateRes.json();

            if (updateData.error) {
                console.error("❌ Facebook update error:", updateData.error);
                return NextResponse.json({
                    success: false,
                    error: updateData.error.message || "Failed to update video on Facebook",
                }, { status: 500 });
            }

            console.log("✅ Facebook video updated successfully");
            const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${existingFbVideoId}`;

            return NextResponse.json({
                success: true,
                facebookUrl,
                videoId: existingFbVideoId,
                updated: true,
            });

        } else {
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

            // For small files (< 10MB), use simple upload instead of resumable
            const useResumableUpload = fileSize > 10 * 1024 * 1024;
            
            if (!useResumableUpload) {
                console.log("📬 Using simple upload (file < 10MB)");
                // Simple one-step upload for small videos
                const nodeFormData = new FormData();
                
                // Don't append access_token - use URL parameter instead
                nodeFormData.append("source", file.createReadStream(), {
                    filename: fileName,
                    contentType: "video/mp4",
                });
                if (finalTitle) {
                    nodeFormData.append("title", finalTitle);
                }
                if (finalDescription) {
                    nodeFormData.append("description", finalDescription);
                }

                // Use access token as URL parameter (more reliable)
                const simpleUploadUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
                console.log("📍 Simple upload URL:", `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=***`);
                
                try {
                    const simpleRes = await axios.post(simpleUploadUrl, nodeFormData, {
                        headers: nodeFormData.getHeaders(),
                        timeout: 120000,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                    });

                    const simpleData = simpleRes.data;
                    
                    if (simpleData.error) {
                        console.error("❌ Simple upload error:", simpleData.error);
                        // Fallback to resumable upload
                        console.log("🔄 Falling back to resumable upload...");
                    } else {
                        console.log("✅ Simple upload complete! Video ID:", simpleData.id);
                        const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${simpleData.id}`;
                        
                        if (videoUuid) {
                            await UploaderX.updateOne(
                                { videoUuid },
                                {
                                    $set: {
                                        "metadata.facebook.videoId": simpleData.id,
                                        "metadata.facebook.url": facebookUrl,
                                        "metadata.facebook.pageId": targetPage.pageId,
                                        "metadata.facebook.pageName": targetPage.pageName,
                                        "metadata.facebook.lastUploadedAt": new Date(),
                                    },
                                }
                            );
                        }
                        
                        return NextResponse.json({
                            success: true,
                            facebookUrl,
                            videoId: simpleData.id,
                            pageName: targetPage.pageName,
                        });
                    }
                } catch (simpleError: any) {
                    console.error("❌ Simple upload request failed:", simpleError.message);
                    console.log("🔄 Falling back to resumable upload...");
                }
            }

            // Step 1: Initialize resumable upload session
            console.log("📤 Initiating Facebook resumable upload...");
            console.log("🔑 Init access token present:", !!targetPage.pageAccessToken);

            // Use access token as URL parameter for init
            const initUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
            
            const initRes = await fetch(
                initUrl,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        upload_phase: "start",
                        file_size: fileSize,
                    }),
                }
            );

            const initData = await initRes.json();

            if (initData.error) {
                console.error("❌ Facebook upload init error:", initData.error);
                return NextResponse.json({
                    success: false,
                    error: initData.error.message || "Failed to initialize Facebook upload",
                }, { status: 500 });
            }

            const uploadSessionId = initData.upload_session_id;
            const videoId = initData.video_id;
            console.log("✅ Upload session started:", { uploadSessionId, videoId });

            // Step 2: Download from GCS to buffer and upload to Facebook
            console.log("📥 Downloading from GCS...");
            const [fileBuffer] = await file.download();
            console.log(`📦 Downloaded ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

            // Step 3: Upload the video chunk using axios for better reliability
            console.log("📤 Uploading video to Facebook...");
            console.log("🔑 Transfer access token present:", !!targetPage.pageAccessToken);
            console.log("🔑 Transfer access token length:", targetPage.pageAccessToken?.length || 0);
            console.log("📦 File buffer size:", fileBuffer.length, "bytes");

            const nodeFormData = new FormData();
            
            nodeFormData.append("upload_phase", "transfer");
            nodeFormData.append("upload_session_id", uploadSessionId);
            nodeFormData.append("start_offset", "0");
            nodeFormData.append("video_file_chunk", fileBuffer, {
                filename: fileName,
                contentType: "video/mp4",
            });

            // Use access token as URL parameter
            const transferUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
            console.log("📍 Transfer URL:", `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=***`);

            try {
                const transferRes = await axios.post(transferUrl, nodeFormData, {
                    headers: nodeFormData.getHeaders(),
                    timeout: 120000, // 2 minute timeout
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                });

                const transferData = transferRes.data;
                console.log("📥 Transfer response status:", transferRes.status);

                if (transferData.error) {
                    console.error("❌ Facebook transfer error:", JSON.stringify(transferData.error, null, 2));
                    return NextResponse.json({
                        success: false,
                        error: transferData.error.message || "Failed to transfer video to Facebook",
                    }, { status: 500 });
                }

                console.log("✅ Video transferred successfully");
            } catch (transferError: any) {
                console.error("❌ Transfer request failed:", transferError.message);
                if (transferError.code === 'ECONNABORTED') {
                    return NextResponse.json({
                        success: false,
                        error: "Upload timed out. Please try again with a smaller video or better connection.",
                    }, { status: 500 });
                }
                throw transferError;
            }

            // Step 4: Finish the upload
            console.log("🏁 Finishing Facebook upload...");
            console.log("🔑 Finish access token present:", !!targetPage.pageAccessToken);

            // Use access token as URL parameter for finish
            const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

            try {
                const finishRes = await axios.post(finishUrl, {
                    upload_phase: "finish",
                    upload_session_id: uploadSessionId,
                    title: finalTitle,
                    description: finalDescription,
                }, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 60000,
                });

                const finishData = finishRes.data;

                if (finishData.error) {
                    console.error("❌ Facebook finish error:", finishData.error);
                    return NextResponse.json({
                        success: false,
                        error: finishData.error.message || "Failed to finish Facebook upload",
                    }, { status: 500 });
                }

                console.log("✅ Facebook upload complete! Video ID:", videoId);
            } catch (finishError: any) {
                console.error("❌ Finish request failed:", finishError.message);
                return NextResponse.json({
                    success: false,
                    error: "Failed to finish Facebook upload: " + finishError.message,
                }, { status: 500 });
            }

            const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${videoId}`;

            // Save Facebook video ID to database
            if (videoUuid) {
                await UploaderX.updateOne(
                    { videoUuid },
                    {
                        $set: {
                            "metadata.facebook.videoId": videoId,
                            "metadata.facebook.url": facebookUrl,
                            "metadata.facebook.pageId": targetPage.pageId,
                            "metadata.facebook.pageName": targetPage.pageName,
                            "metadata.facebook.lastUploadedAt": new Date(),
                        },
                    }
                );
                console.log("💾 Saved Facebook video ID to database");
            }

            return NextResponse.json({
                success: true,
                facebookUrl,
                videoId,
                pageName: targetPage.pageName,
            });
        }
    } catch (error: any) {
        console.error("❌ Facebook operation failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Facebook upload failed",
        }, { status: 500 });
    }
}
