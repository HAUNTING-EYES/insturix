import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import {
  buildUploaderXPublicUrl,
  getUploaderXR2BucketName,
  getUploaderXR2Client,
} from "@/lib/uploaderx-storage";

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    const videoUuid = uuidv4();
    const key = `${videoUuid}/${filename}`;

    const url = await getSignedUrl(
      getUploaderXR2Client() as any,
      new PutObjectCommand({
        Bucket: getUploaderXR2BucketName(),
        Key: key,
        ContentType: contentType,
      }) as any,
      { expiresIn: 15 * 60 }
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
      { status: 500 }
    );
  }
}
