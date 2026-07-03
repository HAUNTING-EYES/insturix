import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { buildClickatronStorageKey } from "@/app/api/services/shared/storage-ownership";

let s3: S3Client | null = null;

function getEnv(name: string, fallbacks: string[] = []): string | undefined {
  return process.env[name] ?? fallbacks.map((fallback) => process.env[fallback]).find(Boolean);
}

function requireEnv(name: string, fallbacks: string[] = []): string {
  const value = getEnv(name, fallbacks);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getR2Client() {
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID_CLICKATRON", ["R2_ACCOUNT_ID"])}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID_CLICKATRON", ["R2_ACCESS_KEY_ID"]),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY_CLICKATRON", ["R2_SECRET_ACCESS_KEY"]),
      },
    });
  }
  return s3;
}

function getBucketName(): string {
  return requireEnv("R2_BUCKET_NAME_CLICKATRON", ["R2_BUCKET_NAME"]);
}

function buildPublicUrl(key: string): string {
  const workerUrl = getEnv("CLICKATRON_R2_WORKER_URL");
  if (workerUrl) return `${workerUrl.replace(/\/$/, "")}/clickatron/${key}`;

  const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL_CLICKATRON", ["R2_PUBLIC_BASE_URL"]);
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType } = await req.json();
    if (typeof filename !== "string" || !filename.trim() || typeof contentType !== "string" || !contentType.trim()) {
      return NextResponse.json({ success: false, error: "Missing filename or contentType" }, { status: 400 });
    }
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Unsupported content type" }, { status: 400 });
    }

    const videoUuid = uuidv4();
    const key = buildClickatronStorageKey(session.userId, videoUuid, filename);

    const url = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 15 * 60 },
    );

    return NextResponse.json({
      success: true,
      url,
      gcsPath: key,
      videoUuid,
      publicUrl: buildPublicUrl(key),
    });
  } catch (error) {
    console.error("R2 sign error:", error);
    return NextResponse.json({ success: false, error: "Failed to sign" }, { status: 500 });
  }
}
