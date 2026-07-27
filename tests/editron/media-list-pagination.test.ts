import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  getDatabase: vi.fn(),
  getOrRefreshUrl: vi.fn(),
  refreshSignedUrl: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { getOrRefreshUrl: mocks.getOrRefreshUrl },
}));
vi.mock('@/lib/editron/services/gcs-service', () => ({
  refreshSignedUrl: mocks.refreshSignedUrl,
}));

function asset(index: number, uploadedAt = new Date(2026, 6, 13, 10, 0, 0, index)): Record<string, unknown> {
  return {
    assetId: `asset_${String(index).padStart(3, '0')}`,
    userId: 'user_1',
    filename: `clip-${index}.mp4`,
    type: 'video',
    source: 'user-upload',
    gcsPath: `uploads/clip-${index}.mp4`,
    cachedUrl: `https://cached.test/${index}`,
    urlExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    size: 1000 + index,
    uploadedAt,
  };
}

function mockCursor(rows: Array<Record<string, unknown>>) {
  const cursor = {
    allowDiskUse: vi.fn(),
    limit: vi.fn(),
    sort: vi.fn(),
    toArray: vi.fn(async () => rows),
  };
  cursor.sort.mockReturnValue(cursor);
  cursor.limit.mockReturnValue(cursor);
  cursor.allowDiskUse.mockReturnValue(cursor);
  return cursor;
}

describe('Editron media-list pagination', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.getOrRefreshUrl.mockImplementation(async (entry: { assetId: string }) => `https://cdn.test/${entry.assetId}`);
    mocks.refreshSignedUrl.mockResolvedValue({
      url: 'https://thumbs.test/refreshed.webp',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
  });

  it('uses a bounded projected query and returns a stable continuation cursor', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => asset(200 - index));
    const cursor = mockCursor(rows);
    mocks.find.mockReturnValue(cursor);
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find })),
    });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const response = await GET(new Request('http://localhost/api/services/editron/media/list?limit=100') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toHaveLength(100);
    expect(body.hasMore).toBe(true);
    expect(typeof body.nextCursor).toBe('string');
    expect(cursor.sort).toHaveBeenCalledWith({ uploadedAt: -1, assetId: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(101);
    expect(cursor.allowDiskUse).toHaveBeenCalledWith(true);
    expect(mocks.find).toHaveBeenCalledWith(
      { userId: 'user_1', type: { $in: ['video', 'audio', 'image'] } },
      expect.objectContaining({
        projection: expect.objectContaining({
          semanticEmbedding: 0,
          transcription: 0,
          analysis: 0,
        }),
      }),
    );
  });

  it('uses the bounded default page size when limit is omitted', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => asset(100 - index));
    const cursor = mockCursor(rows);
    mocks.find.mockReturnValue(cursor);
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find })),
    });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const response = await GET(new Request('http://localhost/api/services/editron/media/list') as never);
    const body = await response.json();

    expect(body.assets).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(cursor.limit).toHaveBeenCalledWith(51);
  });

  it('rejects malformed cursors before querying Mongo', async () => {
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find })),
    });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const response = await GET(new Request('http://localhost/api/services/editron/media/list?cursor=not-a-cursor') as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid media-list cursor');
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('continues strictly after the prior uploadedAt and assetId tuple', async () => {
    const firstRows = Array.from({ length: 3 }, (_, index) => asset(3 - index, new Date('2026-07-13T10:00:00.000Z')));
    const firstCursor = mockCursor(firstRows);
    mocks.find.mockReturnValueOnce(firstCursor);
    mocks.getDatabase.mockResolvedValue({ collection: vi.fn(() => ({ find: mocks.find })) });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const first = await GET(new Request('http://localhost/api/services/editron/media/list?limit=2') as never);
    const firstBody = await first.json();
    const secondCursor = mockCursor([]);
    mocks.find.mockReturnValueOnce(secondCursor);

    await GET(new Request(`http://localhost/api/services/editron/media/list?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`) as never);

    expect(mocks.find).toHaveBeenLastCalledWith(
      {
        userId: 'user_1',
        type: { $in: ['video', 'audio', 'image'] },
        $or: [
          { uploadedAt: { $lt: new Date('2026-07-13T10:00:00.000Z') } },
          { uploadedAt: new Date('2026-07-13T10:00:00.000Z'), assetId: { $lt: 'asset_002' } },
        ],
      },
      expect.any(Object),
    );
  });

  it('never returns legacy data thumbnails and keeps the original asset URL independent', async () => {
    const legacyAsset = {
      ...asset(1),
      thumbnail: `data:image/png;base64,${'A'.repeat(20_000)}`,
    };
    const cloudAsset = {
      ...asset(2),
      thumbnail: 'https://thumbs.test/asset_002.webp',
    };
    const cursor = mockCursor([legacyAsset, cloudAsset]);
    mocks.find.mockReturnValue(cursor);
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find, updateOne: mocks.updateOne })),
    });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const response = await GET(new Request('http://localhost/api/services/editron/media/list') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets[0].thumbnail).toBeUndefined();
    expect(body.assets[0].path).toBe('https://cdn.test/asset_001');
    expect(body.assets[1].thumbnail).toBe('https://thumbs.test/asset_002.webp');
    expect(JSON.stringify(body)).not.toContain('data:image');
    expect(mocks.refreshSignedUrl).not.toHaveBeenCalled();
  });

  it('refreshes an expired GCS thumbnail without changing the source URL', async () => {
    const expiredAsset = {
      ...asset(3),
      thumbnail: 'https://thumbs.test/expired.webp',
      thumbnailGcsPath: 'users/user_1/thumbnails/asset_003.webp',
      thumbnailUrlExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    const cursor = mockCursor([expiredAsset]);
    mocks.find.mockReturnValue(cursor);
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ find: mocks.find, updateOne: mocks.updateOne })),
    });

    const { GET } = await import('@/app/api/services/editron/media/list/route');
    const response = await GET(new Request('http://localhost/api/services/editron/media/list') as never);
    const body = await response.json();

    expect(body.assets[0].thumbnail).toBe('https://thumbs.test/refreshed.webp');
    expect(body.assets[0].path).toBe('https://cdn.test/asset_003');
    expect(mocks.refreshSignedUrl).toHaveBeenCalledWith('users/user_1/thumbnails/asset_003.webp');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: 'asset_003', userId: 'user_1' },
      {
        $set: {
          thumbnail: 'https://thumbs.test/refreshed.webp',
          thumbnailUrlExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      },
    );
  });
});
