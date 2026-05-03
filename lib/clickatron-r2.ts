import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { JobError } from "../types/clickatron";

// Validate required R2 configuration
if (!process.env.R2_ACCOUNT_ID_CLICKATRON || !process.env.R2_ACCESS_KEY_ID_CLICKATRON || !process.env.R2_SECRET_ACCESS_KEY_CLICKATRON || !process.env.R2_BUCKET_NAME_CLICKATRON) {
  console.warn(
    "R2 configuration missing for Clickatron. Image storage will be disabled.",
  );
}

// Initialize R2 client if credentials are available
let s3Client: S3Client | null = null;

if (process.env.R2_ACCOUNT_ID_CLICKATRON && process.env.R2_ACCESS_KEY_ID_CLICKATRON && process.env.R2_SECRET_ACCESS_KEY_CLICKATRON && process.env.R2_BUCKET_NAME_CLICKATRON) {
  try {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID_CLICKATRON}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID_CLICKATRON,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY_CLICKATRON,
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.log("Clickatron R2 client initialized successfully");
    }
  } catch (error) {
    console.error("Failed to initialize Clickatron R2 client:", error);
  }
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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured for image storage",
      } as JobError;
    }

    try {
      // Create R2 path following service convention
      const timestamp = Date.now();
      const r2Path = `user_${userId}/clickatron-thumbnails/session_${sessionId}/variation_${variationId}/${timestamp}.jpg`;
      const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;

      // Upload buffer to R2 with retry logic
      await this.withRetry(async () => {
        await s3Client!.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: buffer,
          ContentType: contentType,
        }));
      });

      // Return the public URL via Cloudflare Worker (with CORS headers)
      const workerUrl = process.env.CLICKATRON_R2_WORKER_URL || process.env.R2_PUBLIC_BASE_URL_CLICKATRON;
      if (!workerUrl) {
        throw new Error("CLICKATRON_R2_WORKER_URL or R2_PUBLIC_BASE_URL_CLICKATRON not configured");
      }
      return `${workerUrl}/clickatron/${r2Path}`;
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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured for image storage",
      } as JobError;
    }

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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured for image storage",
      } as JobError;
    }

    const timestamp = Date.now();
    const r2Path =
      `user_${userId}/clickatron-thumbnails/` +
      `session_${sessionId}/variation_${variationId}/${timestamp}.webp`;

    const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;

    try {
      await this.withRetry(async () => {
        await s3Client!.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: buffer,
          ContentType: 'image/webp',
        }));
      });

      // Return the public URL via Cloudflare Worker (with CORS headers)
      const workerUrl = process.env.CLICKATRON_R2_WORKER_URL || process.env.R2_PUBLIC_BASE_URL_CLICKATRON;
      if (!workerUrl) {
        throw new Error("CLICKATRON_R2_WORKER_URL or R2_PUBLIC_BASE_URL_CLICKATRON not configured");
      }
      return `${workerUrl}/clickatron/${r2Path}`;
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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured for image storage",
      } as JobError;
    }

    try {
      const timestamp = Date.now();
      const r2Path = `user_${userId}/clickatron-masks/session_${sessionId}/variation_${variationId}/mask_${timestamp}.png`;
      const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;

      await this.withRetry(async () => {
        await s3Client!.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Path,
          Body: maskBuffer,
          ContentType: 'image/png',
        }));
      });

      // Return the public URL via Cloudflare Worker (with CORS headers)
      const workerUrl = process.env.CLICKATRON_R2_WORKER_URL || process.env.R2_PUBLIC_BASE_URL_CLICKATRON;
      if (!workerUrl) {
        throw new Error("CLICKATRON_R2_WORKER_URL or R2_PUBLIC_BASE_URL_CLICKATRON not configured");
      }
      return `${workerUrl}/clickatron/${r2Path}`;
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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured for image storage",
      } as JobError;
    }

    try {
      let relativePath = r2Path;

      // Remove query parameters
      if (relativePath.includes("?")) {
        relativePath = relativePath.split("?")[0];
      }

      // Extract path from full URL
      const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL_CLICKATRON;
      if (publicBaseUrl && relativePath.startsWith(publicBaseUrl)) {
        relativePath = relativePath.replace(`${publicBaseUrl}/`, "");
      }

      console.log("Deleting R2 file with path:", relativePath);

      const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;
      await s3Client!.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: relativePath,
      }));

      console.log(`Successfully deleted R2 file: ${relativePath}`);
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
    if (!s3Client) {
      throw {
        code: "R2_NOT_CONFIGURED",
        message: "R2 is not configured",
      } as JobError;
    }

    try {
      console.log("Getting signed URL for R2 URL:", r2Url);
      let filePath = r2Url;

      const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL_CLICKATRON;
      if (publicBaseUrl && r2Url.startsWith(publicBaseUrl)) {
        filePath = r2Url.replace(`${publicBaseUrl}/`, "");
      }

      if (filePath.includes("?")) {
        filePath = filePath.split("?")[0];
      }

      filePath = decodeURIComponent(filePath);

      console.log("Extracted file path:", filePath);
      const bucketName = process.env.R2_BUCKET_NAME_CLICKATRON!;
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: filePath,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
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