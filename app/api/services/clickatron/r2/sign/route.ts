import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    const videoUuid = uuidv4();
    const key = `${videoUuid}/${filename}`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 15 * 60 }
    );

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`;

    return NextResponse.json({
      success: true,
      url,
      gcsPath: key,   // keep name for frontend compat, or rename to r2Key
      videoUuid,
      publicUrl,
    });
  } catch (error) {
    console.error("❌ R2 sign error:", error);
    return NextResponse.json({ success: false, error: "Failed to sign" }, { status: 500 });
  }
}