import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "@/lib/editron/services/r2-service";
import { getCollections } from "../../../utils/mongodb";
import {
  AlyzitronStorageOwnershipError,
  buildAlyzitronPublicUrl,
  requireAlyzitronOwnedStorageKey,
  sanitizeAlyzitronFilename,
} from "../../../utils/storage-ownership";

const BUCKET = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";

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

    const ownedKey = requireAlyzitronOwnedStorageKey(session.userId, key);
    const { uploadTracking } = await getCollections();
    const uploadRecord = await uploadTracking.findOne({
      uploadId,
      userId: session.userId,
      storageKey: ownedKey,
      status: { $in: ["multipart_initialized", "multipart_uploading"] },
    });

    if (!uploadRecord) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const sortedParts = parts
      .map((p: { partNumber: number; etag: string }) => ({
        PartNumber: Number(p.partNumber),
        ETag: p.etag,
      }))
      .filter((p: { PartNumber: number; ETag: string }) => Number.isInteger(p.PartNumber) && p.PartNumber > 0 && typeof p.ETag === "string" && p.ETag.length > 0)
      .sort((a: { PartNumber: number }, b: { PartNumber: number }) => a.PartNumber - b.PartNumber);

    if (sortedParts.length !== parts.length || sortedParts.length === 0) {
      return NextResponse.json({ error: "Invalid multipart parts" }, { status: 400 });
    }

    const client = getS3Client();
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: ownedKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts },
      })
    );

    const publicUrl = buildAlyzitronPublicUrl(ownedKey, "r2");
    const cleanFilename = sanitizeAlyzitronFilename(filename || ownedKey.split("/").pop());

    try {
      await uploadTracking.updateOne(
        { _id: uploadRecord._id },
        {
          $set: {
            storageKey: ownedKey,
            gcsPath: ownedKey,
            publicUrl,
            filename: cleanFilename,
            fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : 0,
            uploadedAt: new Date(),
            updatedAt: new Date(),
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
          },
        }
      );
    } catch (trackErr) {
      console.warn("[R2 Complete] Tracking update failed:", trackErr);
    }

    return NextResponse.json({
      success: true,
      storageKey: ownedKey,
      publicUrl,
      storage: "r2",
    });
  } catch (error) {
    if (error instanceof AlyzitronStorageOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[R2 Multipart Complete]", error);
    return NextResponse.json(
      { error: "Failed to complete upload" },
      { status: 500 }
    );
  }
}
