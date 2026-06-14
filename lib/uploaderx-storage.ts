import { Readable } from "stream";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";

type ResolvedUploaderXVideo = {
  videoUuid?: string;
  gcsPath: string;
  publicUrl: string;
  filename: string;
  contentType: string;
  size?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
};

let r2Client: S3Client | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getUploaderXR2Client() {
  if (!r2Client) {
    const accountId = (process.env.UPLOADERX_R2_ACCOUNT_ID || getRequiredEnv("R2_ACCOUNT_ID")).trim();
    const accessKeyId = (process.env.UPLOADERX_R2_ACCESS_KEY_ID || getRequiredEnv("R2_ACCESS_KEY_ID")).trim();
    const secretAccessKey = (process.env.UPLOADERX_R2_SECRET_ACCESS_KEY || getRequiredEnv("R2_SECRET_ACCESS_KEY")).trim();

    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  return r2Client;
}

export function getUploaderXR2BucketName() {
  return (process.env.UPLOADERX_R2_BUCKET_NAME || getRequiredEnv("R2_BUCKET_NAME")).trim();
}

export function buildUploaderXPublicUrl(key: string) {
  const baseUrl = (process.env.UPLOADERX_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Missing required environment variable: UPLOADERX_R2_PUBLIC_BASE_URL (or R2_PUBLIC_BASE_URL)");
  return `${baseUrl}/${key}`;
}

export async function uploadUploaderXObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await getUploaderXR2Client().send(
    new PutObjectCommand({
      Bucket: getUploaderXR2BucketName(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}

export async function deleteUploaderXObject(key: string) {
  await getUploaderXR2Client().send(
    new DeleteObjectCommand({
      Bucket: getUploaderXR2BucketName(),
      Key: key,
    })
  );
}

export async function resolveUploaderXVideo(params: {
  userId?: string;
  videoUuid?: string;
  gcsPath?: string;
}): Promise<ResolvedUploaderXVideo> {
  await connectToDatabase();

  const lookup = params.videoUuid
    ? { videoUuid: params.videoUuid }
    : params.gcsPath
      ? { gcsPath: params.gcsPath }
      : null;

  if (!lookup) {
    throw new Error("UploaderX video lookup key required");
  }

  const query = params.userId ? { userId: params.userId, ...lookup } : lookup;
  const video = await UploaderXVideo.findOne(query).lean<ResolvedUploaderXVideo | null>();

  if (!video?.gcsPath) {
    throw new Error("UploaderX video record not found");
  }

  return {
    videoUuid: video.videoUuid,
    gcsPath: video.gcsPath,
    publicUrl: video.publicUrl || buildUploaderXPublicUrl(video.gcsPath),
    filename: video.filename || video.gcsPath.split("/").pop() || "upload.bin",
    contentType: video.contentType || "application/octet-stream",
    size: video.size,
    duration: readVideoDuration(video.metadata),
  };
}

function readVideoDuration(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const videoMetadata = (metadata as { videoMetadata?: unknown }).videoMetadata;
  if (!videoMetadata || typeof videoMetadata !== "object") {
    return undefined;
  }

  const duration = (videoMetadata as { duration?: unknown }).duration;
  return typeof duration === "number" && Number.isFinite(duration) ? duration : undefined;
}

export async function fetchUploaderXBuffer(publicUrl: string, start?: number, end?: number) {
  const headers = start !== undefined && end !== undefined
    ? { Range: `bytes=${start}-${end}` }
    : undefined;
  const response = await fetch(publicUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download uploaderx media: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function fetchUploaderXStream(publicUrl: string) {
  const response = await fetch(publicUrl);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to stream uploaderx media: ${response.status}`);
  }

  return {
    stream: Readable.fromWeb(response.body as any),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: Number(response.headers.get("content-length") || 0),
  };
}
