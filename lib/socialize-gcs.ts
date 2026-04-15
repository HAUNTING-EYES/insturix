import { Storage } from '@google-cloud/storage';

// Parse GCS credentials from environment variables or use Application Default Credentials
const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
    ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
    : null;

// Validate required configuration
if (!process.env.GCS_BUCKET_NAME) {
    console.warn('GCS_BUCKET_NAME environment variable is missing. Banner storage will be disabled.');
}

// Initialize GCS client
let storage: Storage | null = null;
let bucket: ReturnType<Storage['bucket']> | null = null;

if (process.env.GCS_BUCKET_NAME) {
    try {
        // Use credentials if provided, otherwise use Application Default Credentials
        const storageConfig = gcsCredentials
            ? {
                projectId: gcsCredentials.project_id,
                credentials: gcsCredentials,
            }
            : {
                projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'insturix-493414',
            };

        storage = new Storage(storageConfig);
        bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

        if (process.env.NODE_ENV === 'development') {
            console.log('Socialize GCS client initialized successfully');
            console.log('Using bucket:', process.env.GCS_BUCKET_NAME);
        }
    } catch (error) {
        console.error('Failed to initialize Socialize GCS client:', error);
    }
}

export class SocializeGCSManager {
    /**
     * Upload a banner image buffer to GCS and return the public URL
     */
    static async uploadBannerImage(
        userId: string,
        buffer: Buffer,
        contentType: string,
        originalFilename: string
    ): Promise<{ gcsPath: string; publicUrl: string }> {
        if (!bucket) {
            throw new Error('GCS is not configured for banner storage');
        }

        try {
            // Create GCS path for banner images
            const timestamp = Date.now();
            const fileExtension = originalFilename.split('.').pop() || 'jpg';
            const gcsPath = `socialize/banners/user_${userId}/banner_${timestamp}.${fileExtension}`;
            const file = bucket.file(gcsPath);

            // Upload buffer to GCS
            await file.save(buffer, {
                metadata: {
                    contentType,
                    cacheControl: 'public, max-age=31536000', // 1 year cache
                },
                resumable: false,
                // Do NOT set per-object ACLs when Uniform Bucket-Level Access is enabled
            });

            // Generate public URL for reference
            const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

            if (process.env.NODE_ENV === 'development') {
                console.log('Banner uploaded to GCS:', { gcsPath, publicUrl });
            }

            // Return both GCS path and public URL
            return { gcsPath, publicUrl };
        } catch (error) {
            console.error('Failed to upload banner to GCS:', error);
            throw new Error('Failed to upload banner image');
        }
    }

    /**
     * Delete a banner image from GCS
     */
    static async deleteBannerImage(gcsUrl: string): Promise<void> {
        if (!bucket) {
            throw new Error('GCS is not configured for banner storage');
        }

        try {
            // Extract the file path from the GCS URL
            const url = new URL(gcsUrl);
            const pathSegments = url.pathname.split('/');
            const bucketName = pathSegments[1];
            const filePath = pathSegments.slice(2).join('/');

            // Verify it's from our bucket
            if (bucketName !== process.env.GCS_BUCKET_NAME) {
                throw new Error('Invalid bucket name in URL');
            }

            const file = bucket.file(filePath);
            await file.delete();

            if (process.env.NODE_ENV === 'development') {
                console.log('Banner deleted from GCS:', gcsUrl);
            }
        } catch (error) {
            console.error('Failed to delete banner from GCS:', error);
            throw new Error('Failed to delete banner image');
        }
    }

    /**
     * Generate a signed URL for a GCS path on-demand
     */
    static async generateSignedUrl(gcsPath: string, expirationHours: number = 24): Promise<string> {
        if (!bucket) {
            throw new Error('GCS is not configured for banner storage');
        }

        try {
            const file = bucket.file(gcsPath);

            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new Error('File not found in GCS');
            }

            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + (expirationHours * 60 * 60 * 1000),
            });

            if (process.env.NODE_ENV === 'development') {
                console.log('Generated signed URL for:', gcsPath);
            }

            return signedUrl;
        } catch (error) {
            console.error('Failed to generate signed URL:', error);
            throw new Error('Failed to generate signed URL');
        }
    }

    /**
     * Check if GCS is properly configured
     */
    static isConfigured(): boolean {
        return bucket !== null;
    }

    /**
     * Get a signed URL for a banner image (if needed for private access)
     */
    static async getSignedUrl(gcsUrl: string, expirationHours: number = 24): Promise<string> {
        if (!bucket) {
            throw new Error('GCS is not configured for banner storage');
        }

        try {
            // Extract the file path from the GCS URL
            const url = new URL(gcsUrl);
            const pathSegments = url.pathname.split('/');
            const bucketName = pathSegments[1];
            const filePath = pathSegments.slice(2).join('/');

            // Verify it's from our bucket
            if (bucketName !== process.env.GCS_BUCKET_NAME) {
                throw new Error('Invalid bucket name in URL');
            }

            const file = bucket.file(filePath);
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + (expirationHours * 60 * 60 * 1000),
            });

            return signedUrl;
        } catch (error) {
            console.error('Failed to generate signed URL:', error);
            throw new Error('Failed to generate signed URL');
        }
    }
}
