
import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    const videoUuid = uuidv4(); // ✅ generate unique video ID

    const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, 'base64').toString();
    const credentials = JSON.parse(credentialsJson);
    const bucketName = process.env.GCS_BUCKET_NAME!;

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      credentials
    });
    const bucket = storage.bucket(bucketName);
    const gcsPath = `${videoUuid}/${filename}`;
    const file = bucket.file(gcsPath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;


    return NextResponse.json({
      success: true,
      url,
      gcsPath,
      videoUuid,
      publicUrl,
    });
  } catch (error) {
    console.error("❌ Error generating signed URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate signed URL" },
      { status: 500 }
    );
  }
}
