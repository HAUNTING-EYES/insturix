import { Storage } from '@google-cloud/storage';
import { ServiceError } from '../types';

const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcsCredentials || !process.env.GCS_BUCKET_NAME) {
  throw new Error('Missing required GCS environment variables: GOOGLE_CLOUD_CREDENTIALS and GCS_BUCKET_NAME');
}

// Initialize GCS
const storage = new Storage({
  projectId: gcsCredentials.project_id,
  credentials: gcsCredentials,
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

export class GCSManager {
  /**
   * Generate a signed URL for uploading a file
   */
  static async getSignedUploadUrl(
    userId: string,
    filename: string,
    contentType: string
  ): Promise<{ url: string; gcsPath: string }> {
    try {
      // Create GCS path following service convention
      const gcsPath = `user_${userId}/alyzitron-uploads/${Date.now()}_${filename}`;
      const file = bucket.file(gcsPath);

      // Generate signed URL with 15-minute expiry
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });

      return { url, gcsPath };
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
      const file = bucket.file(gcsPath);
      await file.delete();
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