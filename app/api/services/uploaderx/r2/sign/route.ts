import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import {
  buildUploaderXPublicUrl,
  getUploaderXR2BucketName,
  getUploaderXR2Client,
} from "@/lib/uploaderx-storage";
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
    const key = buildUploaderXStorageKey(session.userId, videoUuid, filename);

    const url = await getSignedUrl(
      getUploaderXR2Client() as any,
      new PutObjectCommand({
        Bucket: getUploaderXR2BucketName(),
        Key: key,
        ContentType: contentType,
      }) as any,
      { expiresIn: 15 * 60 },
    );

    return NextResponse.json({
      success: true,
      url,
      gcsPath: key,
      videoUuid,
      publicUrl: buildUploaderXPublicUrl(key),
    });
  } catch (error) {
    console.error("R2 sign error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sign upload URL" },
      { status: 500 },
    );
  }
}
