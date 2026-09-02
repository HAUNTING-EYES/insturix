import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createRuntime: vi.fn(),
  getProjectRevision: vi.fn(),
  readPicture: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1', () => ({
  createMediaSourcePtsCadenceR2RuntimePortsV1: mocks.createRuntime,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { getProjectRevision: mocks.getProjectRevision },
}));

import { GET } from '@/app/api/services/editron/media/timestamp-preview/[pictureHandle]/route';

const HANDLE = `nmpv1_${'1'.repeat(64)}`;
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
};

function available(userId = 'user_owner') {
  return {
    disposition: 'AVAILABLE' as const,
    binding: {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      pictureHandle: HANDLE,
      userId,
      projectId: 'project-1',
      projectRevision: REVISION,
      sequenceIdSha256: '2'.repeat(64),
      overlayIdSha256: '3'.repeat(64),
      decoderRequestSha256: '4'.repeat(64),
      decoderPictureRequestSha256: '5'.repeat(64),
      sourceVersionSha256: '6'.repeat(64),
      storageVersionSha256: '7'.repeat(64),
      decodedPictureContentSha256: '8'.repeat(64),
      pngContentSha256: '9'.repeat(64),
      pngByteLength: PNG.byteLength,
      width: 1,
      height: 1,
      expiresAtEpochMs: 1_900_000_000_000,
    },
    pngBytes: PNG,
  };
}

function request(pictureHandle = HANDLE): Promise<Response> {
  return GET(
    new Request(`http://localhost/api/services/editron/media/timestamp-preview/${pictureHandle}`),
    { params: Promise.resolve({ pictureHandle }) },
  );
}

describe('native timestamp preview authenticated route V1', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ userId: 'user_owner' });
    mocks.getProjectRevision.mockReset().mockResolvedValue(REVISION);
    mocks.readPicture.mockReset().mockResolvedValue(available());
    mocks.createRuntime.mockReset().mockReturnValue({
      previewSurface: {
        createReader: () => ({ readPicture: mocks.readPicture }),
      },
    });
  });

  it('authenticates before storage access', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await request();

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('UNAUTHORIZED');
    expect(mocks.readPicture).not.toHaveBeenCalled();
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('returns exact current-revision PNG bytes with private response headers', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe(String(PNG.byteLength));
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('CURRENT');
    expect(mocks.readPicture).toHaveBeenCalledWith(HANDLE);
    expect(mocks.getProjectRevision).toHaveBeenCalledWith('user_owner', 'project-1');
  });

  it('conceals a cross-user handle and never samples that project revision', async () => {
    mocks.readPicture.mockResolvedValue(available('different-user'));

    const response = await request();

    expect(response.status).toBe(404);
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('NOT_FOUND');
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('rejects a surface after the bound project revision changes', async () => {
    mocks.getProjectRevision.mockResolvedValue({ ...REVISION, value: 8 });

    const response = await request();

    expect(response.status).toBe(409);
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('STALE_PROJECT_REVISION');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it.each([
    [{ disposition: 'NOT_FOUND', pictureHandle: HANDLE }, 404, 'NOT_FOUND'],
    [{ disposition: 'EXPIRED', binding: available().binding }, 410, 'EXPIRED'],
  ] as const)('maps unavailable private surface %# without returning bytes', async (
    result,
    status,
    disposition,
  ) => {
    mocks.readPicture.mockResolvedValue(result);

    const response = await request();

    expect(response.status).toBe(status);
    expect(response.headers.get('X-Editron-Preview-Status')).toBe(disposition);
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('maps malformed handles, storage failures, and inaccessible projects without leakage', async () => {
    mocks.readPicture.mockRejectedValueOnce(
      new Error('NATIVE_MEDIA_PREVIEW_SURFACE_HANDLE_INVALID'),
    );
    const malformed = await request('bad-handle');
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('X-Editron-Preview-Status')).toBe('INVALID_HANDLE');

    mocks.readPicture.mockRejectedValueOnce(new Error('provider diagnostic must stay private'));
    const unavailable = await request();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('X-Editron-Preview-Status')).toBe('SURFACE_UNAVAILABLE');

    mocks.readPicture.mockResolvedValueOnce(available());
    mocks.getProjectRevision.mockRejectedValueOnce(new Error('forbidden'));
    const inaccessible = await request();
    expect(inaccessible.status).toBe(404);
    expect(inaccessible.headers.get('X-Editron-Preview-Status')).toBe('NOT_FOUND');
  });
});
