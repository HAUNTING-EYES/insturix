import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

/**
 * POST /api/services/uploaderx/linkedin
 * Uploads media to LinkedIn and creates a post
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { gcsPath, videoUuid, title, description, postType = 'personal', organizationId } = body;

        console.log("🔗 Starting LinkedIn Upload:", { gcsPath, videoUuid, postType, organizationId });

        if (!gcsPath) {
            return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Get LinkedIn tokens
        const user = await User.findOne({
            clerkUserId: session.userId,
            linkedinTokens: { $exists: true, $ne: null },
        });

        if (!user || !user.linkedinTokens) {
            return NextResponse.json({
                success: false,
                error: "LinkedIn not connected. Please connect your LinkedIn account first.",
            }, { status: 403 });
        }

        const tokens = user.linkedinTokens;
        const accessToken = tokens.accessToken;

        // Check if token is expired
        const now = new Date();
        if (tokens.expiresAt && tokens.expiresAt < now) {
            return NextResponse.json({
                success: false,
                error: "LinkedIn token expired. Please reconnect your LinkedIn account.",
            }, { status: 401 });
        }

        // Determine author URN based on post type
        let authorUrn: string;
        if (postType === 'organization') {
            if (!organizationId) {
                return NextResponse.json({
                    success: false,
                    error: "Organization ID is required for LinkedIn organization posts.",
                }, { status: 400 });
            }
            const org = tokens.organizations?.find((o: any) => o.id === organizationId);
            if (!org) {
                return NextResponse.json({
                    success: false,
                    error: "Organization not found or you don't have access to it.",
                }, { status: 400 });
            }
            authorUrn = `urn:li:organization:${organizationId}`;
        } else {
            if (!tokens.userId) {
                return NextResponse.json({
                    success: false,
                    error: "LinkedIn personal posting requires profile access. Reconnect with the LinkedIn profile permission enabled.",
                }, { status: 400 });
            }
            authorUrn = `urn:li:person:${tokens.userId}`;
        }

        // Get file from GCS
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
            return NextResponse.json({ success: false, error: "File not found in GCS" }, { status: 404 });
        }

        const [metadata] = await file.getMetadata();
        const fileSize = Number(metadata.size);
        const fileName = gcsPath.split("/").pop() || "file";
        const contentType = metadata.contentType || "application/octet-stream";

        console.log(`📦 File: ${fileName}, Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB, Type: ${contentType}`);

        // Download file from GCS
        const [fileBuffer] = await file.download();

        // Determine media type for LinkedIn
        let mediaType: string;
        if (contentType.startsWith('video/')) {
            mediaType = 'video';
        } else if (contentType.startsWith('image/')) {
            mediaType = 'image';
        } else if (contentType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
            mediaType = 'document';
        } else {
            // For other files, treat as document
            mediaType = 'document';
        }

        // Step 1: Register upload
        console.log("📤 Step 1: Registering upload with LinkedIn...");

        const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify({
                registerUploadRequest: {
                    recipes: [`urn:li:digitalmediaRecipe:feedshare-${mediaType}`],
                    owner: authorUrn,
                    serviceRelationships: [{
                        relationshipType: "OWNER",
                        identifier: "urn:li:userGeneratedContent"
                    }]
                }
            }),
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok || registerData.error) {
            console.error("❌ LinkedIn register upload failed:", registerData);
            return NextResponse.json({
                success: false,
                error: "Failed to register upload with LinkedIn",
                details: registerData,
            }, { status: 500 });
        }

        const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        const assetUrn = registerData.value.asset;

        console.log("✅ Upload registered, asset URN:", assetUrn);

        // Step 2: Upload binary data
        console.log("📤 Step 2: Uploading file to LinkedIn...");

        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': contentType,
            },
            body: fileBuffer,
        });

        if (!uploadResponse.ok) {
            console.error("❌ LinkedIn file upload failed:", uploadResponse.status);
            return NextResponse.json({
                success: false,
                error: "Failed to upload file to LinkedIn",
            }, { status: 500 });
        }

        console.log("✅ File uploaded successfully");

        // Step 3: Create post
        console.log("📤 Step 3: Creating LinkedIn post...");

        const postText = title || description || "Posted via Insturix UploaderX";

        const postBody: any = {
            author: authorUrn,
            lifecycleState: "PUBLISHED",
            specificContent: {
                "com.linkedin.ugc.ShareContent": {
                    shareCommentary: {
                        text: postText
                    },
                    shareMediaCategory: mediaType.toUpperCase(),
                }
            },
            visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        };

        // Add media reference
        if (mediaType === 'video') {
            postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{
                status: "READY",
                description: {
                    text: description || title || "Video uploaded via Insturix UploaderX"
                },
                media: assetUrn,
                title: {
                    text: title || fileName
                }
            }];
        } else if (mediaType === 'image') {
            postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{
                status: "READY",
                description: {
                    text: description || title || "Image uploaded via Insturix UploaderX"
                },
                media: assetUrn,
                title: {
                    text: title || fileName
                }
            }];
        } else if (mediaType === 'document') {
            postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{
                status: "READY",
                description: {
                    text: description || title || "Document uploaded via Insturix UploaderX"
                },
                media: assetUrn,
                title: {
                    text: title || fileName
                }
            }];
        }

        const postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify(postBody),
        });

        const postData = await postResponse.json();

        if (!postResponse.ok || postData.error) {
            console.error("❌ LinkedIn post creation failed:", postData);
            return NextResponse.json({
                success: false,
                error: "Failed to create LinkedIn post",
                details: postData,
            }, { status: 500 });
        }

        const postId = postData.id;
        const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

        console.log("✅ LinkedIn post created:", postUrl);

        // Store metadata in database
        if (videoUuid) {
            await UploaderX.updateOne(
                { videoUuid },
                {
                    $set: {
                        [`metadata.linkedin.${postType === 'organization' ? 'organization' : 'personal'}`]: {
                            postId: postId,
                            postUrl: postUrl,
                            assetUrn: assetUrn,
                            mediaType: mediaType,
                            organizationId: postType === 'organization' ? organizationId : null,
                            uploadedAt: new Date(),
                        }
                    },
                }
            );
        }

        return NextResponse.json({
            success: true,
            postUrl,
            postId,
            mediaType,
            postType,
            organizationId: postType === 'organization' ? organizationId : null,
        });

    } catch (error) {
        console.error("❌ LinkedIn upload error:", error);
        return NextResponse.json({
            success: false,
            error: "Failed to upload to LinkedIn",
        }, { status: 500 });
    }
}