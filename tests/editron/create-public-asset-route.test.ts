import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createPublicAsset: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    createPublicAsset: mocks.createPublicAsset,
  },
}));

import { POST } from '@/app/api/services/editron/assets/create-public/route';

function request(body: unknown): Request {
  return new Request('https://app.example.com/api/services/editron/assets/create-public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Editron public asset creation route', () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ userId: 'user_123' });
    mocks.createPublicAsset.mockImplementation(async (params) => ({
      assetId: 'asset_123',
      ...params,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires an authenticated owner before creating assets', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });

    const response = await POST(request({
      publicUrl: 'https://videos.pexels.com/video-files/123/clip.mp4',
      type: 'video',
      filename: 'clip.mp4',
    }));

    expect(response.status).toBe(401);
    expect(mocks.createPublicAsset).not.toHaveBeenCalled();
  });

  it('ignores caller-supplied userId and binds assets to the Clerk user', async () => {
    const response = await POST(request({
      publicUrl: 'https://videos.pexels.com/video-files/123/clip.mp4',
      type: 'video',
      filename: 'pexels-video-123.mp4',
      userId: 'victim_user',
      thumbnail: 'https://images.pexels.com/videos/123/thumbnail.jpg',
      dimensions: { width: 1920, height: 1080 },
    }));

    expect(response.status).toBe(200);
    expect(mocks.createPublicAsset).toHaveBeenCalledWith(expect.objectContaining({
      publicUrl: 'https://videos.pexels.com/video-files/123/clip.mp4',
      type: 'video',
      filename: 'pexels-video-123.mp4',
      userId: 'user_123',
      thumbnail: 'https://images.pexels.com/videos/123/thumbnail.jpg',
      dimensions: { width: 1920, height: 1080 },
    }));
  });

  it('accepts the bundled stock sound provider without a client userId', async () => {
    const response = await POST(request({
      publicUrl: 'https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-1.mp3?t=2024-11-04T03%3A52%3A06.297Z',
      type: 'audio',
      filename: 'Upbeat Corporate.mp3',
      duration: 15,
    }));

    expect(response.status).toBe(200);
    expect(mocks.createPublicAsset).toHaveBeenCalledWith(expect.objectContaining({
      type: 'audio',
      userId: 'user_123',
      duration: 15,
    }));
  });

  it('rejects arbitrary external public URLs', async () => {
    const response = await POST(request({
      publicUrl: 'https://evil.example.com/clip.mp4',
      type: 'video',
      filename: 'clip.mp4',
      userId: 'victim_user',
    }));

    expect(response.status).toBe(400);
    expect(mocks.createPublicAsset).not.toHaveBeenCalled();
  });
});