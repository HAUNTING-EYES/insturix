import { Storage } from '@google-cloud/storage';
import { ServiceError } from '../types';

// Lazy initialization to avoid throwing during Next.js build/import
let storage: Storage | null = null;
let bucket: ReturnType<Storage['bucket']> | null = null;

function initIfNeeded() {
  if (storage && bucket) return;
  const encoded = process.env.GOOGLE_CLOUD_CREDENTIALS;
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!encoded || !bucketName) {
    // Do not throw at import time; throw when a method is actually invoked
    throw new Error('Missing required GCS environment variables: GOOGLE_CLOUD_CREDENTIALS and GCS_BUCKET_NAME');
  }
  const creds = JSON.parse(Buffer.from(encoded, 'base64').toString());
  storage = new Storage({ projectId: creds.project_id, credentials: creds });
  bucket = storage.bucket(bucketName);
}

export class GCSManager {
  /**
   * Internal helper to get the bucket, ensuring initialization
   */
  static getBucket() {
    initIfNeeded();
    return bucket;
  }

  /**
   * Generate a signed URL for uploading a file
   */
  static async getSignedUploadUrl(
    userId: string,
    filename: string,
    contentType: string
  ): Promise<{ url: string; gcsPath: string; publicUrl: string }> {
    try {
      initIfNeeded();
      if (!bucket) throw new Error('GCS not initialized');

      // Sanitize inputs
      const timestamp = Date.now();
      const cleanFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const normalizedUserId = userId.replace('user_', '');

      // Create GCS path following service convention
      const gcsPath = `user_${normalizedUserId}/alyzitron-uploads/${timestamp}_${cleanFilename}`;
      const file = bucket.file(gcsPath);

      // Generate signed URL with 15-minute expiry
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
        extensionHeaders: {
          'x-goog-meta-upload-source': 'alyzitron-web'
        }
      });

      const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

      return { url, gcsPath, publicUrl };
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      throw {
        code: 'GCS_ERROR',
        message: 'Failed to generate upload URL',
        technical: error instanceof Error ? error.message : 'Unknown error',
      } as ServiceError;
    }
  }

  /**
   * Generate a signed URL for reading a file
   */
  static async getSignedReadUrl(gcsPath: string): Promise<string> {
    try {
      initIfNeeded();
      if (!bucket) throw new Error('GCS not initialized');
      const file = bucket.file(gcsPath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('File not found');
      }

      // Generate signed URL with 1-hour expiry
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      return url;
    } catch (error) {
      console.error('Failed to generate read URL:', error);
      throw {
        code: 'GCS_ERROR',
        message: 'Failed to generate video URL',
        technical: error instanceof Error ? error.message : 'Unknown error',
      } as ServiceError;
    }
  }

  /**
   * Delete a file from GCS
   */
  static async deleteFile(gcsPath: string): Promise<void> {
    try {
      initIfNeeded();
      if (!bucket) throw new Error('GCS not initialized');

      const bucketName = process.env.GCS_BUCKET_NAME;
      const objectName = gcsPath.startsWith(`gs://${bucketName}/`)
        ? gcsPath.substring(`gs://${bucketName}/`.length)
        : gcsPath;

      const file = bucket.file(objectName);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw {
        code: 'GCS_ERROR',
        message: 'Failed to delete file',
        technical: error instanceof Error ? error.message : 'Unknown error',
      } as ServiceError;
    }
  }

  /**
   * Get file metadata
   */
  static async getFileMetadata(gcsPath: string) {
    try {
      initIfNeeded();
      if (!bucket) throw new Error('GCS not initialized');
      const file = bucket.file(gcsPath);
      const [metadata] = await file.getMetadata();

      return {
        size: Number(metadata.size),
        contentType: metadata.contentType,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
      };
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      throw {
        code: 'GCS_ERROR',
        message: 'Failed to get file information',
        technical: error instanceof Error ? error.message : 'Unknown error',
      } as ServiceError;
    }
  }
}