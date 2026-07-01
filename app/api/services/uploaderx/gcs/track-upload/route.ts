import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import { buildUploaderXPublicUrl } from "@/lib/uploaderx-storage";
import {
  requireUploaderXOwnedStorageKey,
  StorageOwnershipError,
} from "@/app/api/services/shared/storage-ownership";

function deriveUploaderXPublicUrl(storageKey: string, requestedPublicUrl: unknown): string {
  const rawPublicUrl = typeof requestedPublicUrl === "string" ? requestedPublicUrl.trim() : "";
  const gcsBucketName = process.env.GCS_BUCKET_NAME?.trim();

  if (rawPublicUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawPublicUrl);
    } catch {
      throw new StorageOwnershipError("Invalid public URL", 400);
    }

    if (parsedUrl.protocol !== "https:") {
      throw new StorageOwnershipError("Invalid public URL", 400);
    }

    if (gcsBucketName && parsedUrl.hostname === "storage.googleapis.com") {
      const expectedPath = `/${gcsBucketName}/${storageKey}`;
      if (decodeURIComponent(parsedUrl.pathname) === expectedPath) {
        return `https://storage.googleapis.com/${gcsBucketName}/${storageKey}`;
      }
    }
  }

  try {
    return buildUploaderXPublicUrl(storageKey);
  } catch (error) {
    if (gcsBucketName) {
      return `https://storage.googleapis.com/${gcsBucketName}/${storageKey}`;
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    const { userId } = await auth();

    if (!userId || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, gcsPath, fileSize, contentType, videoUuid, publicUrl, progress, metadata } = body;

    // 🟡 Case 1: Only progress update
    if (progress !== undefined && (!filename || !gcsPath)) {

      return NextResponse.json({ success: true, message: "Progress updated" });
    }

    // 🟢 Case 2: Complete upload record
    if (!filename || !gcsPath || !fileSize || !contentType || !videoUuid) {
      console.error("⚠️ Missing required fields:", body);
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const ownedGcsPath = requireUploaderXOwnedStorageKey(userId, gcsPath);
    const derivedPublicUrl = deriveUploaderXPublicUrl(ownedGcsPath, publicUrl);

    await connectToDatabase();

    // Get primary email
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ success: false, error: "User email not found" }, { status: 400 });
    }

    // Format metadata correctly
    let formattedMetadata = {};
    if (metadata) {
      formattedMetadata = {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        youtube: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          privacyStatus: metadata.privacyStatus || 'private' // Default to private for initial upload
        },
        videoType: metadata.videoType,
        videoMetadata: metadata.videoMetadata
      };
    }

    const upload = await UploaderXVideo.create({
      userId,
      email, // ✅ Added required email field
      videoUuid,
      filename,
      gcsPath: ownedGcsPath,
      publicUrl: derivedPublicUrl,
      size: fileSize,
      contentType,
      status: "uploaded",
      uploadedAt: new Date(),
      metadata: formattedMetadata
    });



    return NextResponse.json({ success: true, data: upload });
  } catch (error) {
    if (error instanceof StorageOwnershipError) {
      return NextResponse.json({ success: false, error: "Invalid upload path" }, { status: error.status });
    }

    const err = error as any;
    console.error("❌ Error saving upload:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
      errors: err.errors // Mongoose validation errors
    });
    return NextResponse.json({
      success: false,
      error: "Failed to track upload",
      details: err.message
    }, { status: 500 });
  }
}
