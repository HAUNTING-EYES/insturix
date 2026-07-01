import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import { buildUploaderXStorageKey } from "@/app/api/services/shared/storage-ownership";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType } = await req.json();
    if (typeof filename !== "string" || !filename.trim() || typeof contentType !== "string" || !contentType.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing filename or contentType" },
        { status: 400 },
      );
    }

    const videoUuid = uuidv4();

    const credentialsJson = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS!, "base64").toString();
    const credentials = JSON.parse(credentialsJson);
    const bucketName = process.env.GCS_BUCKET_NAME!;

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      credentials,
    });
    const bucket = storage.bucket(bucketName);
    const gcsPath = buildUploaderXStorageKey(session.userId, videoUuid, filename);
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
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
}
