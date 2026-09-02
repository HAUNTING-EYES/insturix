import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeMediaTimestampPreviewIdentitySha256V1 } from '@/lib/editron/services/native-media-timestamp-r2-preview-audio-surface-v1';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createRuntime: vi.fn(),
  getProjectRevision: vi.fn(),
  readAudioSegment: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1', () => ({
  createMediaSourcePtsCadenceR2RuntimePortsV1: mocks.createRuntime,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { getProjectRevision: mocks.getProjectRevision },
}));

import { GET } from '@/app/api/services/editron/media/timestamp-preview/audio/[projectId]/[audioHandle]/route';

const USER_ID = 'user-owner';
const PROJECT_ID = 'project-1';
const HANDLE = 'nmpa1_' + '1'.repeat(64);
const WAV = Uint8Array.from([
  82, 73, 70, 70, 52, 0, 0, 0, 87, 65, 86, 69,
  102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 2, 0,
  128, 187, 0, 0, 0, 220, 5, 0, 8, 0, 32, 0,
  100, 97, 116, 97, 16, 0, 0, 0,
  0, 0, 0, 0, 255, 255, 255, 127,
  0, 0, 0, 128, 1, 2, 3, 4,
]);
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
};

function available(userId = USER_ID, projectId = PROJECT_ID) {
  return {
    disposition: 'AVAILABLE' as const,
    binding: {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      audioHandle: HANDLE,
      userIdSha256: nativeMediaTimestampPreviewIdentitySha256V1(userId),
      projectIdSha256: nativeMediaTimestampPreviewIdentitySha256V1(projectId),
      projectRevision: REVISION,
      sequenceIdSha256: '2'.repeat(64),
      overlayIdSha256: '3'.repeat(64),
      audioMappingSha256: '4'.repeat(64),
      audioSampleEpochMapSha256: '5'.repeat(64),
      sourceVersionSha256: '6'.repeat(64),
      storageVersionSha256: '7'.repeat(64),
      decodedPcmSha256: '8'.repeat(64),
      sampleRate: 48_000,
      channelCount: 2,
      sourceStartSampleFrame: '10',
      sourceEndExclusiveSampleFrame: '12',
      decodedStartSamplePosition: {
        numerator: '21',
        denominator: '2',
        disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
      },
      decodedEndExclusiveSamplePosition: {
        numerator: '23',
        denominator: '2',
        disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
      },
      timelineStartSamplePosition: {
        numerator: '201',
        denominator: '2',
        disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
      },
      timelineEndExclusiveSamplePosition: {
        numerator: '203',
        denominator: '2',
        disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
      },
      segmentIdentitySha256: '9'.repeat(64),
      segmentPcmSha256: 'a'.repeat(64),
      pcmByteLength: 16,
      wavContentSha256: 'b'.repeat(64),
      wavByteLength: WAV.byteLength,
      expiresAtEpochMs: 1_900_000_000_000,
    },
    wavBytes: WAV,
  };
}

function request(
  headers: HeadersInit = {},
  projectId = PROJECT_ID,
  audioHandle = HANDLE,
): Promise<Response> {
  return GET(
    new Request(
      'http://localhost/api/services/editron/media/timestamp-preview/audio/'
        + projectId + '/' + audioHandle,
      { headers },
    ),
    { params: Promise.resolve({ projectId, audioHandle }) },
  );
}

describe('native timestamp preview authenticated audio route V1', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ userId: USER_ID });
    mocks.getProjectRevision.mockReset().mockResolvedValue(REVISION);
    mocks.readAudioSegment.mockReset().mockResolvedValue(available());
    mocks.createRuntime.mockReset().mockReturnValue({
      audioPreviewSurface: {
        createReader: () => ({ readAudioSegment: mocks.readAudioSegment }),
      },
    });
  });

  it('authenticates before private storage access', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await request();

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('UNAUTHORIZED');
    expect(mocks.readAudioSegment).not.toHaveBeenCalled();
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('returns exact current-revision WAV bytes with private media headers', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WAV);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(response.headers.get('Content-Length')).toBe(String(WAV.byteLength));
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('X-Editron-Audio-Segment')).toBe('9'.repeat(64));
    expect(response.headers.get('X-Editron-Preview-Status')).toBe('CURRENT');
    expect(mocks.readAudioSegment).toHaveBeenCalledWith(HANDLE);
    expect(mocks.getProjectRevision).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
  });

  it('serves exact single ranges and falls back to full bytes for a stale If-Range', async () => {
    const partial = await request({ Range: 'bytes=4-9' });
    expect(partial.status).toBe(206);
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(WAV.subarray(4, 10));
    expect(partial.headers.get('Content-Range'))
      .toBe('bytes 4-9/' + String(WAV.byteLength));

    const suffix = await request({ Range: 'bytes=-4' });
    expect(suffix.status).toBe(206);
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(WAV.subarray(-4));

    const staleIfRange = await request({
      Range: 'bytes=4-9',
      'If-Range': '"different"',
    });
    expect(staleIfRange.status).toBe(200);
    expect(new Uint8Array(await staleIfRange.arrayBuffer())).toEqual(WAV);
  });

  it('rejects malformed, multiple, and unsatisfied byte ranges without content', async () => {
    for (const range of ['frames=0-2', 'bytes=0-1,4-5', 'bytes=999-', 'bytes=-0']) {
      const response = await request({ Range: range });
      expect(response.status).toBe(416);
      expect(response.headers.get('Content-Range')).toBe('bytes */' + String(WAV.byteLength));
      expect(response.headers.get('X-Editron-Preview-Status'))
        .toBe('RANGE_NOT_SATISFIABLE');
      expect((await response.arrayBuffer()).byteLength).toBe(0);
    }
  });

  it('conceals cross-user or cross-project handles before revision access', async () => {
    mocks.readAudioSegment.mockResolvedValueOnce(available('other-user', PROJECT_ID));
    const crossUser = await request();
    expect(crossUser.status).toBe(404);
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();

    mocks.readAudioSegment.mockResolvedValueOnce(available(USER_ID, 'other-project'));
    const crossProject = await request();
    expect(crossProject.status).toBe(404);
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
  });

  it('rejects a surface after the bound project revision changes', async () => {
    mocks.getProjectRevision.mockResolvedValue({ ...REVISION, value: 8 });

    const response = await request();

    expect(response.status).toBe(409);
    expect(response.headers.get('X-Editron-Preview-Status'))
      .toBe('STALE_PROJECT_REVISION');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('maps absent, expired, malformed, failed, and inaccessible surfaces without leakage', async () => {
    mocks.readAudioSegment.mockResolvedValueOnce({
      disposition: 'NOT_FOUND',
      audioHandle: HANDLE,
    });
    expect((await request()).status).toBe(404);

    mocks.readAudioSegment.mockResolvedValueOnce({
      disposition: 'EXPIRED',
      binding: available().binding,
    });
    expect((await request()).status).toBe(410);

    mocks.readAudioSegment.mockRejectedValueOnce(
      new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_HANDLE_INVALID'),
    );
    const malformed = await request({}, PROJECT_ID, 'bad-handle');
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('X-Editron-Preview-Status')).toBe('INVALID_HANDLE');

    mocks.readAudioSegment.mockRejectedValueOnce(new Error('provider secret diagnostic'));
    const unavailable = await request();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('X-Editron-Preview-Status')).toBe('SURFACE_UNAVAILABLE');

    mocks.readAudioSegment.mockResolvedValueOnce(available());
    mocks.getProjectRevision.mockRejectedValueOnce(new Error('forbidden'));
    const inaccessible = await request();
    expect(inaccessible.status).toBe(404);
    expect(inaccessible.headers.get('X-Editron-Preview-Status')).toBe('NOT_FOUND');
  });
});
