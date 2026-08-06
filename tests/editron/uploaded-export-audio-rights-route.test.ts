import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  attest: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/uploaded-export-audio-rights-attestation', () => {
  class MockAttestationError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly httpStatus: number,
    ) {
      super(message);
      this.name = 'UploadedExportAudioRightsAttestationError';
    }
  }
  return {
    reattestUploadedExportAudioRights: mocks.attest,
    UploadedExportAudioRightsAttestationError: MockAttestationError,
  };
});

import { POST } from '@/app/api/services/editron/projects/[projectId]/uploaded-export-audio-rights/route';
import { UploadedExportAudioRightsAttestationError } from '@/lib/editron/services/uploaded-export-audio-rights-attestation';

const context = {
  params: Promise.resolve({ projectId: 'proj_legacy' }),
};

function request(body: unknown): Request {
  return new Request(
    'https://app.example.com/api/services/editron/projects/proj_legacy/uploaded-export-audio-rights',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: 'user_owner' });
  mocks.attest.mockResolvedValue({
    replayed: false,
    attestedAssetIds: ['voiceover_legacy_1'],
    rightsByAssetId: {
      voiceover_legacy_1: {
        mediaRole: 'voiceover',
        source: 'user-upload',
        userChoice: 'attested',
        licensed: true,
      },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('uploaded export-audio rights attestation route', () => {
  it('requires authentication before accepting consent', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(request({}) as never, context);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.attest).not.toHaveBeenCalled();
  });

  it('binds owner and project identity on the server', async () => {
    const attestation = {
      accepted: true,
      version: 'audio-rights-attestation-v1',
    };

    const response = await POST(request({
      userId: 'victim_user',
      projectId: 'victim_project',
      attestation,
    }) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.attest).toHaveBeenCalledWith({
      userId: 'user_owner',
      projectId: 'proj_legacy',
      attestation,
    });
    expect(await response.json()).toMatchObject({
      success: true,
      attestedAssetIds: ['voiceover_legacy_1'],
    });
  });

  it('rejects malformed and oversized JSON before the domain service', async () => {
    const malformed = new Request('https://app.example.com/uploaded-export-audio-rights', {
      method: 'POST',
      body: '{',
    });
    const oversized = request({ attestation: 'x'.repeat(9 * 1_024) });

    for (const candidate of [malformed, request([]), oversized]) {
      const response = await POST(candidate as never, context);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        code: 'INVALID_REQUEST',
      });
    }
    expect(mocks.attest).not.toHaveBeenCalled();
  });

  it('preserves typed status and redacts unexpected failures', async () => {
    mocks.attest.mockRejectedValueOnce(
      new UploadedExportAudioRightsAttestationError(
        'PROJECT_REVISION_CONFLICT',
        'Review the latest timeline and retry.',
        409,
      ),
    );
    const conflict = await POST(request({ attestation: {} }) as never, context);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      success: false,
      error: 'Review the latest timeline and retry.',
      code: 'PROJECT_REVISION_CONFLICT',
    });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.attest.mockRejectedValueOnce(new Error('database credentials leaked'));
    const internal = await POST(request({ attestation: {} }) as never, context);
    expect(internal.status).toBe(500);
    expect(await internal.json()).toEqual({
      success: false,
      error: 'Uploaded audio rights confirmation failed',
      code: 'INTERNAL_ERROR',
    });
  });
});
