import { Storage } from '@google-cloud/storage';
import { AlyzitronR2Manager } from '@/app/api/services/alyzitron/utils/r2-manager';

/**
 * Get a signed read URL for a stored video — works for both R2 and GCS paths.
 */
export async function getGcsSignedUrl(videoUrl: string): Promise<string> {
  const cdnWorkerUrl = process.env.CDN_WORKER_URL?.replace(/\/+$/, '');
  const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '');

  // Detect R2 paths (CDN Worker URLs, direct R2 URLs, or legacy R2_PUBLIC_BASE_URL)
  const isR2 =
    videoUrl.includes('r2.cloudflarestorage.com') ||
    videoUrl.includes('r2.dev') ||
    (cdnWorkerUrl ? videoUrl.startsWith(cdnWorkerUrl) : false) ||
    (r2PublicBaseUrl ? videoUrl.startsWith(r2PublicBaseUrl) : false);

  if (isR2) {
    return AlyzitronR2Manager.getSignedReadUrl(videoUrl);
  }

  // GCS path
  const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
    ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
    : null;

  if (!gcsCredentials) {
    throw new Error('GCS credentials are not configured');
  }

  const storage = new Storage({
    projectId: gcsCredentials.project_id,
    credentials: gcsCredentials,
  });

  if (!videoUrl.startsWith('gs://')) {
    throw new Error('Invalid GCS URL');
  }

  const withoutProtocol = videoUrl.replace('gs://', '');
  const [bucketName, ...pathParts] = withoutProtocol.split('/');
  const filePath = pathParts.join('/');

  if (!bucketName || !filePath) {
    throw new Error('Invalid GCS URL format');
  }

  const file = storage.bucket(bucketName).file(filePath);

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return signedUrl;
}
