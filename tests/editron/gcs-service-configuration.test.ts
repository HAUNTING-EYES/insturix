import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
const originalBucketName = process.env.GCS_BUCKET_NAME;

function restoreEnvironment(): void {
  if (originalCredentials === undefined) delete process.env.GOOGLE_CLOUD_CREDENTIALS;
  else process.env.GOOGLE_CLOUD_CREDENTIALS = originalCredentials;

  if (originalBucketName === undefined) delete process.env.GCS_BUCKET_NAME;
  else process.env.GCS_BUCKET_NAME = originalBucketName;
}

describe('gcs-service configuration boundary', () => {
  afterEach(() => {
    restoreEnvironment();
    vi.resetModules();
  });

  it('can be imported without GCS configuration and validates on first use', async () => {
    delete process.env.GOOGLE_CLOUD_CREDENTIALS;
    delete process.env.GCS_BUCKET_NAME;
    vi.resetModules();

    const service = await import('@/lib/editron/services/gcs-service');

    await expect(service.fileExists('unused/canary-object')).rejects.toThrow(
      'Please define the GOOGLE_CLOUD_CREDENTIALS environment variable',
    );
  });
});
