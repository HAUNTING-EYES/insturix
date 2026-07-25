import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  assignBackgroundMusic: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/background-music-assignment', () => {
  class MockBackgroundMusicAssignmentError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly httpStatus: number,
    ) {
      super(message);
      this.name = 'BackgroundMusicAssignmentError';
    }
  }
  return {
    assignBackgroundMusic: mocks.assignBackgroundMusic,
    BackgroundMusicAssignmentError: MockBackgroundMusicAssignmentError,
  };
});

import { POST } from '@/app/api/services/editron/projects/[projectId]/background-music/route';
import { BackgroundMusicAssignmentError } from '@/lib/editron/services/background-music-assignment';

const context = {
  params: Promise.resolve({ projectId: 'project_1' }),
};

function request(body: unknown): Request {
  return new Request(
    'https://app.example.com/api/services/editron/projects/project_1/background-music',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: 'user_1' });
  mocks.assignBackgroundMusic.mockResolvedValue({
    replayed: false,
    sourceAssetId: 'audio_1',
    derivativeAssetId: 'bgm_assignment_1',
    overlays: [{ id: 9, type: 'sound', row: 3 }],
    musicRights: { source: 'user-upload', userChoice: 'attested', licensed: true },
    beatGrid: { bpm: 120, beats: [] },
    musicCoveragePlan: { mode: 'full' },
    snappedCutCount: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('background music assignment route', () => {
  it('requires Clerk authentication before parsing or assigning', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(request({}) as never, context);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.assignBackgroundMusic).not.toHaveBeenCalled();
  });

  it('binds user and project identity server-side and returns the committed timeline', async () => {
    const response = await POST(request({
      userId: 'victim_user',
      projectId: 'victim_project',
      assetId: 'audio_1',
      idempotencyKey: 'assign_001',
      rightsAttestation: {
        accepted: true,
        version: 'music-rights-attestation-v1',
      },
    }) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.assignBackgroundMusic).toHaveBeenCalledWith({
      userId: 'user_1',
      projectId: 'project_1',
      assetId: 'audio_1',
      idempotencyKey: 'assign_001',
      rightsAttestation: {
        accepted: true,
        version: 'music-rights-attestation-v1',
      },
    });
    expect(await response.json()).toMatchObject({
      success: true,
      derivativeAssetId: 'bgm_assignment_1',
      overlays: [{ id: 9, type: 'sound', row: 3 }],
    });
  });

  it('rejects empty, malformed, array, and primitive JSON bodies', async () => {
    const malformed = new Request('https://app.example.com/background-music', {
      method: 'POST',
      body: '{',
    });
    const empty = new Request('https://app.example.com/background-music', {
      method: 'POST',
    });

    for (const candidate of [malformed, empty, request([]), request('audio_1')]) {
      const response = await POST(candidate as never, context);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        code: 'INVALID_REQUEST',
      });
    }
    expect(mocks.assignBackgroundMusic).not.toHaveBeenCalled();
  });

  it('preserves typed domain status and code', async () => {
    mocks.assignBackgroundMusic.mockRejectedValue(new BackgroundMusicAssignmentError(
      'RIGHTS_ATTESTATION_REQUIRED',
      'Rights attestation required',
      422,
    ));

    const response = await POST(request({
      assetId: 'audio_1',
      idempotencyKey: 'assign_001',
    }) as never, context);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Rights attestation required',
      code: 'RIGHTS_ATTESTATION_REQUIRED',
    });
  });

  it('does not expose unexpected internal failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.assignBackgroundMusic.mockRejectedValue(new Error('database credentials leaked'));

    const response = await POST(request({
      assetId: 'audio_1',
      idempotencyKey: 'assign_001',
    }) as never, context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Background music assignment failed',
      code: 'INTERNAL_ERROR',
    });
  });
});
