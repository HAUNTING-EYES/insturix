import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import { Storage } from "@google-cloud/storage";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";


const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, 'base64').toString();
const credentials = JSON.parse(credentialsJson);

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials,
});
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.formData();
    const file = data.get("file") as File;
    const title = data.get("title")?.toString() || "Untitled";
    const description = data.get("description")?.toString() || "";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // ✅ Create temp file path
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPath = path.join("/tmp", `${randomUUID()}-${file.name}`);
    await fs.writeFile(tempPath, buffer);

    // ✅ Upload to GCS
    const destination = `uploads/${session.userId}/${randomUUID()}-${file.name}`;
    await bucket.upload(tempPath, { destination });
    await fs.unlink(tempPath);

    const gcsPath = destination;
    const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

    // ✅ Save metadata to MongoDB
    await connectToDatabase();
    const video = await UploaderX.create({
      userId: session.userId,
      videoUuid: randomUUID(),
      filename: file.name,
      gcsPath,
      publicUrl,
      size: file.size,
      contentType: file.type,
      status: "uploaded",
      uploadedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Video uploaded to GCS successfully",
      video,
    });
  } catch (error: any) {
    console.error("❌ GCS upload failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


export async function GET() {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const videos = await UploaderX.find({ userId: session.userId })
      .sort({ uploadedAt: -1 })
      .lean();

    // ✅ Generate signed playback URLs (valid 1 hour)
    const signedVideos = await Promise.all(
      videos.map(async (video) => {
        try {
          const file = bucket.file(video.gcsPath);
          const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });
          return { ...video, publicUrl: signedUrl };
        } catch (err) {
          console.error("⚠️ Could not sign URL for", video.filename, err);
          return { ...video, publicUrl: null };
        }
      })
    );

    return NextResponse.json({ success: true, videos: signedVideos });
  } catch (error) {
    console.error("❌ Error fetching uploads:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch uploads" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { videoUuid } = await request.json();
    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await UploaderX.findOneAndDelete({
      userId: session.userId,
      videoUuid,
    });

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    // ✅ Delete from GCS
    try {
      await bucket.file(deleted.gcsPath).delete();

    } catch (err) {
      console.warn("⚠️ GCS deletion failed:", err);
    }

    return NextResponse.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("❌ Error deleting video:", error);
    return NextResponse.json({ success: false, error: "Failed to delete video" }, { status: 500 });
  }
}
