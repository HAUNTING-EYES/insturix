import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { JobError } from "../types/clickatron";

function getEnv(name: string, fallbacks: string[] = []): string | undefined {
  return process.env[name] ?? fallbacks.map((k) => process.env[k]).find(Boolean);
}

function buildPublicClickatronUrl(key: string): string {
  const workerUrl = getEnv("CLICKATRON_R2_WORKER_URL");
  if (workerUrl) return `${workerUrl.replace(/\/$/, "")}/clickatron/${key}`;

  const publicBaseUrl = getEnv("R2_PUBLIC_BASE_URL_CLICKATRON", ["R2_PUBLIC_BASE_URL_clickatron"]);
  if (!publicBaseUrl) {
    throw new Error("CLICKATRON_R2_WORKER_URL or R2_PUBLIC_BASE_URL_CLICKATRON not configured");
  }
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

function extractR2KeyFromUrlOrKey(input: string): string {
  let value = input;

  if (value.includes("?")) value = value.split("?")[0];

  const publicBaseUrl = getEnv("R2_PUBLIC_BASE_URL_CLICKATRON", ["R2_PUBLIC_BASE_URL_clickatron"]);
  if (publicBaseUrl && value.startsWith(publicBaseUrl.replace(/\/$/, ""))) {
    value = value.replace(publicBaseUrl.replace(/\/$/, "") + "/", "");
  }

  const workerUrl = getEnv("CLICKATRON_R2_WORKER_URL");
  if (workerUrl) {
    const prefix = workerUrl.replace(/\/$/, "") + "/clickatron/";
    if (value.startsWith(prefix)) value = value.replace(prefix, "");
  }

  value = decodeURIComponent(value);
  return value;
}

let s3Client: S3Client | null = null;

function getClickatronR2Client(): S3Client {
  if (s3Client) return s3Client;

  const r2AccountId = getEnv("R2_ACCOUNT_ID_CLICKATRON", ["R2_ACCOUNT_ID_clickatron"]);
  const r2AccessKeyId = getEnv("R2_ACCESS_KEY_ID_CLICKATRON", ["R2_ACCESS_KEY_ID_clickatron"]);
  const r2SecretAccessKey = getEnv("R2_SECRET_ACCESS_KEY_CLICKATRON", ["R2_SECRET_ACCESS_KEY_clickatron"]);

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error("R2 configuration missing for Clickatron");
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
  return s3Client;
}

function getClickatronR2Bucket(): string {
  const bucket = getEnv("R2_BUCKET_NAME_CLICKATRON", ["R2_BUCKET_NAME_clickatron"]);
  if (!bucket) throw new Error("R2_BUCKET_NAME_CLICKATRON not configured");
  return bucket;
}

export class ClickatronR2Manager {
  /**
   * Helper to wrap operations with retry logic for transient network errors
   */
  private static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isTransient =
          error.code === "ECONNRESET" ||
          error.code === "ETIMEDOUT" ||
          error.code === "ENOTFOUND" ||
          error.message?.includes("socket disconnected") ||
          error.message?.includes("TLS connection");

        if (isTransient && i < maxRetries - 1) {
          const backoff = delayMs * Math.pow(2, i);
          console.warn(
            `Transient R2 error (${error.code || error.message}). Retrying in ${backoff}ms... (Attempt ${i + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Upload a buffer to R2 and return the public URL
   */
  static async uploadImageBuffer(
    userId: string,
    sessionId: string,
    variationId: string,
    buffer: Buffer,
    contentType: string = "image/jpeg",
  ): Promise<string> {
    try {
      // Create R2 path following service convention
      const timestamp = Date.now();
      const r2Path = `user_${userId}/clickatron-thumbnails/session_${sessionId}/variation_${variationId}/${timestamp}.jpg`;
      const bucketName = getClickatronR2Bucket();

      // Upload buffer to R2 with retry logic
      await this.withRetry(async () => {
        await getClickatronR2Client().send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: buffer,
          ContentType: contentType,
        }));
      });

      return buildPublicClickatronUrl(r2Path);
    } catch (error) {
      console.error(
        "Failed to upload image to R2 (after retries if applicable):",
        error,
      );
      throw {
        code: "R2_UPLOAD_ERROR",
        message: "Failed to upload generated image",
        details: error instanceof Error ? error.message : "Unknown error",
      } as JobError;
    }
  }

  /**
   * Upload an image from URL to R2
   */
  static async uploadImageFromUrl(
    userId: string,
    sessionId: string,
    variationId: string,
    imageUrl: string,
  ): Promise<string> {
    try {
      // Fetch image from URL with retry logic
      const response = await this.withRetry(async () => {
        const res = await fetch(imageUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
        }
        return res;
      });

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Upload buffer to R2
      return await this.uploadImageBuffer(userId, sessionId, variationId, Buffer.from(buffer), contentType);
    } catch (error) {
      console.error('Failed to upload image from URL to R2 (after retries):', error);
      throw {
        code: 'R2_UPLOAD_ERROR',
        message: 'Failed to upload generated image from URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      } as JobError;
    }
  }

  /**
   * Upload a webp thumbnail image
   */
  static async uploadThumbnailBuffer(
    userId: string,
    sessionId: string,
    variationId: string,
    buffer: Buffer,
  ): Promise<string> {
    const timestamp = Date.now();
    const r2Path =
      `user_${userId}/clickatron-thumbnails/` +
      `session_${sessionId}/variation_${variationId}/${timestamp}.webp`;

    const bucketName = getClickatronR2Bucket();

    try {
      await this.withRetry(async () => {
        await getClickatronR2Client().send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: buffer,
          ContentType: 'image/webp',
        }));
      });

      return buildPublicClickatronUrl(r2Path);
    } catch (error) {
      console.error('Failed to upload thumbnail to R2 (after retries):', error);
      throw {
        code: 'R2_UPLOAD_ERROR',
        message: 'Failed to upload thumbnail',
        details: error instanceof Error ? error.message : 'Unknown error',
      } as JobError;
    }
  }

  /**
   * Upload a mask image for generative fill
   */
  static async uploadMaskImage(
    userId: string,
    sessionId: string,
    variationId: string,
    maskBuffer: Buffer,
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const r2Path = `user_${userId}/clickatron-masks/session_${sessionId}/variation_${variationId}/mask_${timestamp}.png`;
      const bucketName = getClickatronR2Bucket();

      await this.withRetry(async () => {
        await getClickatronR2Client().send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: maskBuffer,
          ContentType: 'image/png',
        }));
      });

      return buildPublicClickatronUrl(r2Path);
    } catch (error) {
      console.error("Failed to upload mask image to R2:", error);
      throw {
        code: "R2_UPLOAD_ERROR",
        message: "Failed to upload mask image",
        details: error instanceof Error ? error.message : "Unknown error",
      } as JobError;
    }
  }

  /**
   * Delete a file from R2
   */
  static async deleteImage(r2Path: string): Promise<void> {
    try {
      const key = extractR2KeyFromUrlOrKey(r2Path);
      console.log("Deleting R2 file with key:", key);

      const bucketName = getClickatronR2Bucket();
      await getClickatronR2Client().send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));

      console.log(`Successfully deleted R2 file: ${key}`);
    } catch (error) {
      console.error("Failed to delete image from R2:", error);
      if (error instanceof Error && error.message.includes("NoSuchKey")) {
        console.log("R2 file already deleted or not found:", r2Path);
      } else {
        throw {
          code: "R2_DELETE_ERROR",
          message: "Failed to delete image",
          details: error instanceof Error ? error.message : "Unknown error",
        } as JobError;
      }
    }
  }

  /**
   * Get a signed URL for an R2 file (for compatibility)
   */
  static async getSignedUrl(r2Url: string): Promise<string> {
    try {
      console.log("Getting signed URL for R2 URL:", r2Url);
      const fileKey = extractR2KeyFromUrlOrKey(r2Url);
      console.log("Extracted file key:", fileKey);
      const bucketName = getClickatronR2Bucket();
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      });

      const signedUrl = await getSignedUrl(getClickatronR2Client(), command, { expiresIn: 3600 });
      return signedUrl;
    } catch (error) {
      console.error("Failed to get signed URL:", error);
      throw {
        code: "R2_SIGN_URL_ERROR",
        message: "Failed to get signed URL",
        details: error instanceof Error ? error.message : "Unknown error",
      } as JobError;
    }
  }
}
