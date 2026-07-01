import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadR2ServiceWithCdn(value: string | undefined) {
  vi.resetModules();
  process.env = { ...originalEnv };
  process.env.R2_ACCOUNT_ID = 'account123';
  process.env.R2_BUCKET_NAME = 'editron-cdn';

  if (value === undefined) {
    delete process.env.CDN_WORKER_URL;
  } else {
    process.env.CDN_WORKER_URL = value;
  }

  return import('../../lib/editron/services/r2-service');
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('getR2PublicUrl', () => {
  it('normalizes literal escaped newlines and trailing slashes in CDN_WORKER_URL', async () => {
    const { getR2PublicUrl } = await loadR2ServiceWithCdn('https://cdn.example.com/\\n');

    expect(getR2PublicUrl('asset_123')).toBe('https://cdn.example.com/asset/asset_123');
  });

  it('normalizes actual control whitespace in CDN_WORKER_URL', async () => {
    const { getR2PublicUrl } = await loadR2ServiceWithCdn(' https://cdn.example.com/\n\t');

    expect(getR2PublicUrl('asset_123')).toBe('https://cdn.example.com/asset/asset_123');
  });

  it('falls back to the direct R2 URL when CDN_WORKER_URL is empty after normalization', async () => {
    const { getR2PublicUrl } = await loadR2ServiceWithCdn(' \\n ');

    expect(getR2PublicUrl('asset_123')).toBe(
      'https://account123.r2.cloudflarestorage.com/editron-cdn/asset_123',
    );
  });
});