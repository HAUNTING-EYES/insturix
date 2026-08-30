import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  qualify: vi.fn(),
  triggerCadence: vi.fn(),
  triggerAudio: vi.fn(),
  withWorkerAuth: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/editron/security/internal-worker-auth', () => ({
  withInternalQStashWorkerAuth: mocks.withWorkerAuth,
}));
vi.mock('@/lib/editron/services/media-source-qualification-runtime-v1', () => ({
  MEDIA_SOURCE_QUALIFICATION_WORKER_ROUTE_ID_V1: 'media-source-qualification',
  assertMediaSourceQualificationWorkerMessageV1: (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalid message');
    return value;
  },
  runMediaSourceQualificationWorkerV1: mocks.qualify,
}));
vi.mock('@/lib/editron/services/media-source-pts-cadence-product-trigger-v3', () => ({
  triggerQualifiedMediaSourcePtsCadenceV3: mocks.triggerCadence,
}));
vi.mock('@/lib/editron/services/media-source-audio-product-trigger-v1', () => ({
  triggerQualifiedMediaSourceAudioMaterializationV1: mocks.triggerAudio,
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/internal/workers/media-source-qualification/route';

const MESSAGE = Object.freeze({
  assetId: 'asset-1',
  userId: 'user-1',
  sourceBindingSha256: 'a'.repeat(64),
});
const QUALIFICATION = Object.freeze({
  disposition: 'COMPLETED',
  status: 'MEASURED_TECHNICAL',
  sourceIdentity: 'ISSUED',
});

describe('media source qualification product route V3', () => {
  beforeEach(() => {
    mocks.qualify.mockReset();
    mocks.triggerCadence.mockReset();
    mocks.triggerAudio.mockReset();
    mocks.qualify.mockResolvedValue(QUALIFICATION);
    mocks.triggerAudio.mockResolvedValue({
      disposition: 'SCHEDULED',
      jobId: 'dwj_audio_1',
      created: true,
      delivery: 'CONFIRMED',
      messageId: 'qstash-audio-message-1',
    });
  });

  it('qualifies first and returns both confirmed product receipts', async () => {
    mocks.triggerCadence.mockResolvedValue({
      disposition: 'SCHEDULED',
      jobId: 'dwj_pts_v3_1',
      created: true,
      delivery: 'CONFIRMED',
      messageId: 'qstash-message-1',
    });

    const response = await POST(request(MESSAGE));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      result: QUALIFICATION,
      cadenceDispatch: {
        disposition: 'SCHEDULED',
        jobId: 'dwj_pts_v3_1',
        created: true,
        delivery: 'CONFIRMED',
        messageId: 'qstash-message-1',
      },
      audioDispatch: {
        disposition: 'SCHEDULED',
        jobId: 'dwj_audio_1',
        created: true,
        delivery: 'CONFIRMED',
        messageId: 'qstash-audio-message-1',
      },
    });
    expect(mocks.qualify).toHaveBeenCalledWith(MESSAGE);
    expect(mocks.triggerCadence).toHaveBeenCalledWith(MESSAGE);
    expect(mocks.triggerAudio).toHaveBeenCalledWith(MESSAGE);
    expect(mocks.qualify.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.triggerCadence.mock.invocationCallOrder[0]!);
    expect(mocks.triggerCadence.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.triggerAudio.mock.invocationCallOrder[0]!);
  });

  it('returns retryable HTTP while retaining the durable undelivered job', async () => {
    mocks.triggerCadence.mockResolvedValue({
      disposition: 'DELIVERY_DEFERRED',
      jobId: 'dwj_pts_v3_2',
      created: true,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    });

    const response = await POST(request(MESSAGE));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'MEDIA_SOURCE_PTS_CADENCE_DELIVERY_DEFERRED' },
      result: QUALIFICATION,
      cadenceDispatch: {
        disposition: 'DELIVERY_DEFERRED',
        jobId: 'dwj_pts_v3_2',
      },
    });
    expect(mocks.triggerAudio).not.toHaveBeenCalled();
  });

  it('returns retryable HTTP while retaining an undelivered audio job', async () => {
    mocks.triggerCadence.mockResolvedValue({
      disposition: 'SCHEDULED',
      jobId: 'dwj_pts_v3_3',
      created: false,
      delivery: 'ALREADY_CONFIRMED',
      messageId: 'qstash-message-3',
    });
    mocks.triggerAudio.mockResolvedValue({
      disposition: 'DELIVERY_DEFERRED',
      jobId: 'dwj_audio_3',
      created: true,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    });

    const response = await POST(request(MESSAGE));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'MEDIA_SOURCE_AUDIO_DELIVERY_DEFERRED' },
      result: QUALIFICATION,
      cadenceDispatch: {
        disposition: 'SCHEDULED',
        jobId: 'dwj_pts_v3_3',
      },
      audioDispatch: {
        disposition: 'DELIVERY_DEFERRED',
        jobId: 'dwj_audio_3',
      },
    });
    expect(mocks.triggerAudio).toHaveBeenCalledWith(MESSAGE);
  });

  it('rejects malformed JSON before either owner runs', async () => {
    const response = await POST(new NextRequest(
      'https://editron.example.test/api/internal/workers/media-source-qualification',
      { method: 'POST', body: '{' },
    ));
    expect(response.status).toBe(400);
    expect(mocks.qualify).not.toHaveBeenCalled();
    expect(mocks.triggerCadence).not.toHaveBeenCalled();
    expect(mocks.triggerAudio).not.toHaveBeenCalled();
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example.test/api/internal/workers/media-source-qualification',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
