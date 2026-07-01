import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "@/lib/editron/services/r2-service";
import { getCollections } from "../../../utils/mongodb";
import {
  buildAlyzitronPublicUrl,
  getAlyzitronUserStoragePrefix,
  sanitizeAlyzitronFilename,
} from "../../../utils/storage-ownership";

const BUCKET = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType, fileSize } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
    }

    const cleanFilename = sanitizeAlyzitronFilename(filename);
    const timestamp = Date.now();
    const key = `${getAlyzitronUserStoragePrefix(session.userId)}${timestamp}_${cleanFilename}`;

    const client = getS3Client();
    const { UploadId } = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      })
    );

    if (!UploadId) {
      return NextResponse.json({ error: "Failed to init multipart upload" }, { status: 500 });
    }

    const now = new Date();
    const { uploadTracking } = await getCollections();
    await uploadTracking.insertOne({
      uploadId: UploadId,
      userId: session.userId,
      storageKey: key,
      gcsPath: key,
      publicUrl: buildAlyzitronPublicUrl(key, "r2"),
      filename: cleanFilename,
      fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : 0,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      status: "multipart_initialized",
      storage: "r2",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        contentType,
        originalName: filename,
        storage: "r2",
        multipart: true,
      },
    });

    return NextResponse.json({
      uploadId: UploadId,
      key,
    });
  } catch (error) {
    console.error("[R2 Multipart Init]", error);
    return NextResponse.json(
      { error: "Failed to initialize upload" },
      { status: 500 }
    );
  }
}
