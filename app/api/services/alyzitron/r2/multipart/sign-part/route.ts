import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "@/lib/editron/services/r2-service";

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

    const client = getS3Client();
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 15 * 60 }
    );

    return NextResponse.json({ url, partNumber });
  } catch (error) {
    console.error("[R2 Sign Part]", error);
    return NextResponse.json(
      { error: "Failed to sign part URL" },
      { status: 500 }
    );
  }
}
