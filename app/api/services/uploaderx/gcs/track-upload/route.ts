import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, gcsPath, fileSize, contentType, videoUuid, publicUrl, progress } = body;


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

    const upload = await UploaderX.create({
      userId: session.userId,
      videoUuid,
      filename,
      gcsPath,
      publicUrl,
      size: fileSize,
      contentType,
      status: "uploaded",
      uploadedAt: new Date(),
    });

   

    return NextResponse.json({ success: true, data: upload });
  } catch (error) {
    console.error("❌ Error saving upload:", error);
    return NextResponse.json({ success: false, error: "Failed to track upload" }, { status: 500 });
  }
}
