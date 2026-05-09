import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "@/lib/editron/services/r2-service";
import { getCollections } from "../../../utils/mongodb";

const BUCKET = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";
const CDN_WORKER_URL = process.env.CDN_WORKER_URL;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

function buildPublicUrl(key: string): string {
  if (CDN_WORKER_URL) {
    return `${CDN_WORKER_URL}/asset/${key}`;
  }
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { uploadId, key, parts, filename, fileSize, contentType } = await req.json();

    if (!uploadId || !key || !parts || !Array.isArray(parts)) {
      return NextResponse.json(
        { error: "Missing uploadId, key, or parts" },
        { status: 400 }
      );
    }

    // Sort parts by PartNumber for S3 compliance
    const sortedParts = parts
      .map((p: { partNumber: number; etag: string }) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
      }))
      .sort((a: { PartNumber: number }, b: { PartNumber: number }) => a.PartNumber - b.PartNumber);

    const client = getS3Client();
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts },
      })
    );

    const publicUrl = buildPublicUrl(key);

    // Track upload in MongoDB (merged from old track-upload POST)
    try {
      const { uploadTracking } = await getCollections();
      await uploadTracking.insertOne({
        uploadId,
        userId: session.userId,
        storageKey: key,
        gcsPath: key, // backward compat
        publicUrl,
        filename: filename || key.split("/").pop(),
        fileSize: fileSize || 0,
        uploadedAt: new Date(),
        status: "uploaded",
        storage: "r2",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: {
          contentType: contentType || "video/mp4",
          originalName: filename,
          storage: "r2",
          multipart: true,
          partsCount: sortedParts.length,
        },
      });
    } catch (trackErr) {
      // Non-fatal: upload succeeded even if tracking fails
      console.warn("[R2 Complete] Tracking insert failed:", trackErr);
    }

    return NextResponse.json({
      success: true,
      storageKey: key,
      publicUrl,
      storage: "r2",
    });
  } catch (error) {
    console.error("[R2 Multipart Complete]", error);
    return NextResponse.json(
      { error: "Failed to complete upload" },
      { status: 500 }
    );
  }
}
