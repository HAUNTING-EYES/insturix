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
        let { gcsPath, videoUuid, title, description, postType = 'personal', organizationId } = body;

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
        let accessToken = tokens.accessToken;
        
        // If userId is missing, try to fetch profile from LinkedIn
        // Note: Even without r_liteprofile scope, sometimes we can get the user ID
        let userId = tokens.userId;
        if (!userId) {
            console.log("⚠️ LinkedIn userId not stored, attempting to fetch profile...");
            try {
                const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-Restli-Protocol-Version': '2.0.0',
                    },
                });
                
                if (profileResponse.ok) {
                    const profileData = await profileResponse.json();
                    userId = profileData.id;
                    console.log("✅ Fetched LinkedIn userId:", userId);
                    
                    // Update the stored userId
                    await User.updateOne(
                        { clerkUserId: session.userId },
                        { $set: { 'linkedinTokens.userId': userId } }
                    );
                } else {
                    console.warn("⚠️ Could not fetch LinkedIn profile:", profileResponse.status, profileResponse.statusText);
                    // Even if we can't get userId, the user might still be able to post
                    // We'll check if they can post to organizations
                }
            } catch (profileError) {
                console.warn("⚠️ Error fetching LinkedIn profile:", profileError);
            }
        }

        // Check if token is expired and try to refresh
        const now = new Date();
        if (tokens.expiresAt && tokens.expiresAt < now) {
            if (!tokens.refreshToken) {
                return NextResponse.json({
                    success: false,
                    error: "LinkedIn token expired. Please reconnect your LinkedIn account.",
                }, { status: 401 });
            }

            try {
                const clientId = process.env.LINKEDIN_CLIENT_ID;
                const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

                if (clientId && clientSecret) {
                    console.log("🔄 Attempting to refresh LinkedIn token...");

                    const refreshResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            refresh_token: tokens.refreshToken,
                            client_id: clientId,
                            client_secret: clientSecret,
                        }),
                    });

                    const refreshData = await refreshResponse.json();
                    console.log("📥 LinkedIn refresh response:", refreshData);

                    if (refreshResponse.ok && refreshData.access_token) {
                        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

                        await User.updateOne(
                            { clerkUserId: session.userId },
                            {
                                $set: {
                                    'linkedinTokens.accessToken': refreshData.access_token,
                                    'linkedinTokens.refreshToken': refreshData.refresh_token || tokens.refreshToken,
                                    'linkedinTokens.expiresAt': newExpiresAt,
                                }
                            }
                        );

                        accessToken = refreshData.access_token;
                        console.log("✅ LinkedIn token refreshed successfully");
                    } else {
                        console.warn("⚠️ LinkedIn token refresh failed:", refreshData);
                        return NextResponse.json({
                            success: false,
                            error: "LinkedIn token expired. Please reconnect your LinkedIn account.",
                        }, { status: 401 });
                    }
                } else {
                    console.error("❌ LinkedIn credentials not configured");
                    return NextResponse.json({
                        success: false,
                        error: "LinkedIn token expired. Please reconnect your LinkedIn account.",
                    }, { status: 401 });
                }
            } catch (refreshError) {
                console.error("❌ LinkedIn token refresh error:", refreshError);
                return NextResponse.json({
                    success: false,
                    error: "LinkedIn token expired. Please reconnect your LinkedIn account.",
                }, { status: 401 });
            }
        }

        // Determine author URN based on post type
        let authorUrn: string;
        
        // Check available posting options
        const canPostPersonal = !!userId;
        const organizations = tokens.organizations || [];
        const hasOrganizations = organizations.length > 0;
        
        console.log("[LinkedIn] Posting options - canPostPersonal:", canPostPersonal, "hasOrganizations:", hasOrganizations, "organizations:", organizations.length);
        
        // If no posting options available at all
        if (!canPostPersonal && !hasOrganizations) {
            console.error("❌ LinkedIn user has no valid posting target");
            return NextResponse.json({
                success: false,
                error: "LinkedIn account doesn't have permission to post. Please reconnect with the required permissions.",
            }, { status: 400 });
        }
        
        if (postType === 'organization') {
            // Organization posting
            if (!organizationId) {
                // If no organizationId provided but user has organizations, use first one
                if (hasOrganizations) {
                    console.log("[LinkedIn] No organizationId provided, using first organization");
                    organizationId = organizations[0].id;
                } else {
                    return NextResponse.json({
                        success: false,
                        error: "Organization ID is required for LinkedIn organization posts.",
                    }, { status: 400 });
                }
            }
            
            // Verify user has access to this organization
            const org = organizations.find((o: any) => String(o.id) === String(organizationId));
            if (!org) {
                return NextResponse.json({
                    success: false,
                    error: "Organization not found or you don't have access to it.",
                }, { status: 400 });
            }
            authorUrn = `urn:li:organization:${organizationId}`;
            console.log("[LinkedIn] Posting to organization:", organizationId, org.name);
        } else {
            // Personal profile posting
            if (!userId) {
                // If no userId but has organizations, suggest organization posting
                if (hasOrganizations) {
                    return NextResponse.json({
                        success: false,
                        error: "Personal profile posting not available. Please use organization posting by specifying organizationId.",
                    }, { status: 400 });
                }
                return NextResponse.json({
                    success: false,
                    error: "LinkedIn personal posting requires profile access. Reconnect with the LinkedIn profile permission enabled.",
                }, { status: 400 });
            }
            authorUrn = `urn:li:person:${userId}`;
            console.log("[LinkedIn] Posting to personal profile:", userId);
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