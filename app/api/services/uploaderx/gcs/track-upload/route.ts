import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

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
        videoType: metadata.videoType
      };
    }

    const upload = await UploaderX.create({
      userId,
      email, // ✅ Added required email field
      videoUuid,
      filename,
      gcsPath,
      publicUrl,
      size: fileSize,
      contentType,
      status: "uploaded",
      uploadedAt: new Date(),
      metadata: formattedMetadata
    });



    return NextResponse.json({ success: true, data: upload });
  } catch (error) {
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
