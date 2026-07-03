import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "@/lib/editron/services/r2-service";
import { getCollections } from "../../../utils/mongodb";
import {
  AlyzitronStorageOwnershipError,
  requireAlyzitronOwnedStorageKey,
} from "../../../utils/storage-ownership";

const BUCKET = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { uploadId, key, partNumber } = await req.json();
    if (!uploadId || !key || !partNumber) {
      return NextResponse.json(
        { error: "Missing uploadId, key, or partNumber" },
        { status: 400 }
      );
    }

    const ownedKey = requireAlyzitronOwnedStorageKey(session.userId, key);
    const numericPartNumber = Number(partNumber);
    if (!Number.isInteger(numericPartNumber) || numericPartNumber < 1 || numericPartNumber > 10000) {
      return NextResponse.json({ error: "Invalid partNumber" }, { status: 400 });
    }

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

    await uploadTracking.updateOne(
      { _id: uploadRecord._id },
      { $set: { status: "multipart_uploading", updatedAt: new Date() } }
    );

    const client = getS3Client();
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: ownedKey,
        UploadId: uploadId,
        PartNumber: numericPartNumber,
      }),
      { expiresIn: 15 * 60 }
    );

    return NextResponse.json({ url, partNumber: numericPartNumber });
  } catch (error) {
    if (error instanceof AlyzitronStorageOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[R2 Sign Part]", error);
    return NextResponse.json(
      { error: "Failed to sign part URL" },
      { status: 500 }
    );
  }
}
