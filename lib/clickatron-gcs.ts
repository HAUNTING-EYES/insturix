import { Storage } from '@google-cloud/storage';
import { JobError } from '../types/clickatron';

// Parse GCS credentials from environment variables
const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

// Validate required configuration
if (!gcsCredentials || !process.env.GCS_BUCKET_NAME) {
  console.warn('GCS configuration missing for Clickatron. Image storage will be disabled.');
}

// Initialize GCS client if credentials are available
let storage: Storage | null = null;
let bucket: ReturnType<Storage['bucket']> | null = null;

if (gcsCredentials && process.env.GCS_BUCKET_NAME) {
  try {
    storage = new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    });
    
    bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    if (process.env.NODE_ENV === 'development') {
      console.log('Clickatron GCS client initialized successfully');
    }
  } catch (error) {
    console.error('Failed to initialize Clickatron GCS client:', error);
  }
}

export class ClickatronGCSManager {
  /**
   * Upload a buffer to GCS and return the public URL
   */
  static async uploadImageBuffer(
    userId: string,
    sessionId: string,
    variationId: string,
    buffer: Buffer,
    contentType: string = 'image/jpeg'
  ): Promise<string> {
    if (!bucket) {
      throw {
        code: 'GCS_NOT_CONFIGURED',
        message: 'GCS is not configured for image storage',
      } as JobError;
    }

    try {
      // Create GCS path following service convention
      const timestamp = Date.now();
      const gcsPath = `user_${userId}/clickatron-thumbnails/session_${sessionId}/variation_${variationId}/${timestamp}.jpg`;
      const file = bucket.file(gcsPath);

      // Upload buffer to GCS
      await file.save(buffer, {
        metadata: {
          contentType,
        },
        resumable: false,
      });

      // Instead of a public URL, generate a signed URL for temporary access
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1-hour expiration
      });
      return signedUrl;
    } catch (error) {
      console.error('Failed to upload image to GCS:', error);
      throw {
        code: 'GCS_UPLOAD_ERROR',
        message: 'Failed to upload generated image',
        details: error instanceof Error ? error.message : 'Unknown error',
      } as JobError;
    }
  }

  /**
   * Upload an image from URL to GCS
   */
  static async uploadImageFromUrl(
    userId: string,
    sessionId: string,
    variationId: string,
    imageUrl: string
  ): Promise<string> {
    if (!bucket) {
      throw {
        code: 'GCS_NOT_CONFIGURED',
        message: 'GCS is not configured for image storage',
      } as JobError;
    }

    try {
      // Fetch image from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Upload buffer to GCS
      return await this.uploadImageBuffer(userId, sessionId, variationId, Buffer.from(buffer), contentType);
    } catch (error) {
      console.error('Failed to upload image from URL to GCS:', error);
      throw {
        code: 'GCS_UPLOAD_ERROR',
        message: 'Failed to upload generated image from URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      } as JobError;
    }
  }

  /**
   * Delete a file from GCS
   */
  static async deleteImage(gcsPath: string): Promise<void> {
    if (!bucket) {
      throw {
        code: 'GCS_NOT_CONFIGURED',
        message: 'GCS is not configured for image storage',
      } as JobError;
    }
  
    try {
      // Extract relative path from full GCS URL or signed URL
      let relativePath = gcsPath;
  
      // Remove query parameters first
      if (relativePath.includes('?')) {
        relativePath = relativePath.split('?')[0];
      }
  
      // If it's a full HTTPS URL, extract the path after the bucket
      if (relativePath.startsWith(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`)) {
        relativePath = relativePath.replace(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`, '');
      } else if (relativePath.startsWith('https://storage.googleapis.com/')) {
        // General case: remove protocol and bucket part
        const url = new URL(relativePath);
        relativePath = url.pathname.substring(1); // Remove leading '/'
      }
  
      console.log('Deleting GCS file with relative path:', relativePath);
  
      const file = bucket.file(relativePath);
      await file.delete();
      console.log(`Successfully deleted GCS file: ${relativePath}`);
    } catch (error) {
      console.error('Failed to delete image from GCS:', error);
      // Log but don't throw if file doesn't exist (already deleted)
      if (error instanceof Error && error.message.includes('No such object')) {
        console.log('GCS file already deleted or not found:', gcsPath);
      } else {
        throw {
          code: 'GCS_DELETE_ERROR',
          message: 'Failed to delete image',
          details: error instanceof Error ? error.message : 'Unknown error',
        } as JobError;
      }
    }
  }

  /**
   * Get a signed URL for a GCS file
   */
  static async getSignedUrl(gcsUrl: string): Promise<string> {
    if (!bucket) {
      throw {
        code: 'GCS_NOT_CONFIGURED',
        message: 'GCS is not configured for image storage',
      } as JobError;
    }

    try {
      console.log('Getting signed URL for GCS URL:', gcsUrl);
      // Extract the file path from the GCS URL
      let filePath = gcsUrl;
      
      // If it's a full GCS URL, extract the file path
      if (gcsUrl.startsWith(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`)) {
        filePath = gcsUrl.replace(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`, '');
      }
      
      // If it's a signed URL, extract the file path by removing query parameters
      if (filePath.includes('?')) {
        filePath = filePath.split('?')[0];
      }
      
      // Decode the file path to handle special characters
      filePath = decodeURIComponent(filePath);
      
      console.log('Extracted file path:', filePath);
      const file = bucket.file(filePath);

      // Generate a signed URL for temporary access (even if file doesn't exist)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1-hour expiration
      });
      return signedUrl;
    } catch (error) {
      console.error('Failed to get signed URL:', error);
      throw {
        code: 'GCS_SIGN_URL_ERROR',
        message: 'Failed to get signed URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      } as JobError;
    }
  }
}