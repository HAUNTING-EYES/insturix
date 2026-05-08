import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "@/lib/editron/services/r2-service";

const BUCKET = process.env.ALYZITRON_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "editron-cdn";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
    }

    const normalizedUserId = session.userId.replace("user_", "");
    const cleanFilename = filename.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    const timestamp = Date.now();
    const key = `user_${normalizedUserId}/alyzitron-uploads/${timestamp}_${cleanFilename}`;

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
