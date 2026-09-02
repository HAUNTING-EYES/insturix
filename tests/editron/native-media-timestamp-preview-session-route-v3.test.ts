import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  materialize: vi.fn(),
  createRuntime: vi.fn(),
  createPictureReader: vi.fn(),
  createPictureStore: vi.fn(),
  createAudioReader: vi.fn(),
  createAudioStore: vi.fn(),
  readPicture: vi.fn(),
  deletePicture: vi.fn(),
  readAudioSegment: vi.fn(),
  deleteAudioSegment: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/native-media-timestamp-preview-materializer-v1',
  async (importActual) => ({
    ...await importActual<
      typeof import('@/lib/editron/services/native-media-timestamp-preview-materializer-v1')
    >(),
    materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1: mocks.materialize,
  }));
vi.mock('@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1', () => ({
  createMediaSourcePtsCadenceR2RuntimePortsV1: mocks.createRuntime,
}));

import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
} from '@/lib/editron/services/native-media-timestamp-preview-session-server-v1';
import {
  DELETE,
  POST,
} from '@/app/api/services/editron/media/timestamp-preview/session/route';

describe('native media timestamp preview session route V3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.readPicture.mockImplementation(async (pictureHandle: string) => ({
      disposition: 'NOT_FOUND' as const,
      pictureHandle,
    }));
    mocks.readAudioSegment.mockImplementation(async (audioHandle: string) => ({
      disposition: 'NOT_FOUND' as const,
      audioHandle,
    }));
    mocks.deletePicture.mockResolvedValue(undefined);
    mocks.deleteAudioSegment.mockResolvedValue(undefined);
    mocks.createPictureReader.mockImplementation(() => ({
      readPicture: mocks.readPicture,
    }));
    mocks.createPictureStore.mockImplementation(() => ({
      deletePicture: mocks.deletePicture,
    }));
    mocks.createAudioReader.mockImplementation(() => ({
      readAudioSegment: mocks.readAudioSegment,
    }));
    mocks.createAudioStore.mockImplementation(() => ({
      deleteAudioSegment: mocks.deleteAudioSegment,
    }));
    mocks.createRuntime.mockReturnValue({
      previewSurface: {
        createReader: mocks.createPictureReader,
        createStore: mocks.createPictureStore,
      },
      audioPreviewSurface: {
        createReader: mocks.createAudioReader,
        createStore: mocks.createAudioStore,
      },
    });
    mocks.materialize.mockImplementation(async (input) => (
      'deliveryContract' in input
        ? {
            disposition: 'SESSION_WINDOW_MATERIALIZED',
            sessionWindow: exactSessionWindow(),
            sourcePtsCadenceMapStateSha256V3: hex('a'),
            transformSha256: hex('b'),
            materializedPictureCount: 2,
            materializedAudioSegmentCount: 1,
          }
        : {
            disposition: 'WINDOW_MATERIALIZED',
            window: pictureWindow('NO_AUDIO_MAPPING_REQUESTED'),
            sourcePtsCadenceMapStateSha256V3: hex('a'),
            transformSha256: hex('b'),
            materializedPictureCount: 2,
          }
    ));
  });

  it('authenticates before parsing or runtime work', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request('POST', materializeV3()))).status).toBe(401);
    expect((await DELETE(request('DELETE', releaseV2()))).status).toBe(401);
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.readPicture).not.toHaveBeenCalled();
  });

  it('keeps V2 picture materialization separate from paired V3', async () => {
    const v2 = await POST(request('POST', materializeV2()));
    expect(v2.status).toBe(200);
    expect(await v2.json()).toMatchObject({ disposition: 'WINDOW_MATERIALIZED' });
    expect(mocks.materialize).toHaveBeenLastCalledWith(expect.not.objectContaining({
      deliveryContract: expect.anything(),
    }));

    const v3 = await POST(request('POST', materializeV3()));
    expect(v3.status).toBe(200);
    expect(await v3.json()).toMatchObject({ disposition: 'SESSION_WINDOW_MATERIALIZED' });
    expect(mocks.materialize).toHaveBeenLastCalledWith(expect.objectContaining({
      userId: 'user-1',
      deliveryContract: 'PAIRED_SESSION_V3',
    }));
  });

  it('routes V1 picture and V2 paired release without reinterpretation', async () => {
    const v1 = await DELETE(request('DELETE', releaseV1()));
    expect(v1.status).toBe(200);
    expect(await v1.json()).toEqual({
      disposition: 'RELEASED', deletedPictureCount: 0, alreadyAbsentPictureCount: 2,
    });
    expect(mocks.readAudioSegment).not.toHaveBeenCalled();

    const v2 = await DELETE(request('DELETE', releaseV2()));
    expect(v2.status).toBe(200);
    expect(await v2.json()).toEqual({
      disposition: 'RELEASED',
      deletedPictureCount: 0,
      alreadyAbsentPictureCount: 2,
      deletedAudioCount: 0,
      alreadyAbsentAudioCount: 1,
    });
    expect(mocks.readAudioSegment).toHaveBeenCalledWith(AUDIO_HANDLE);
  });

  it('rejects mixed or unknown command identities', async () => {
    const mixedPost = await POST(request('POST', {
      ...materializeV3(),
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
    }));
    expect(mixedPost.status).toBe(400);
    const mixedDelete = await DELETE(request('DELETE', {
      ...releaseV2(),
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
    }));
    expect(mixedDelete.status).toBe(400);
  });

  it('distinguishes unexpected runtime failures from invalid commands', async () => {
    mocks.materialize.mockRejectedValueOnce(new Error('provider unavailable'));
    const post = await POST(request('POST', materializeV3()));
    expect(post.status).toBe(503);
    expect(await post.json()).toEqual({
      disposition: 'UNVERIFIABLE', reason: 'RUNTIME_UNAVAILABLE',
    });

    mocks.createPictureReader.mockImplementationOnce(() => {
      throw new Error('not configured');
    });
    const deletion = await DELETE(request('DELETE', releaseV2()));
    expect(deletion.status).toBe(503);
    expect(await deletion.json()).toEqual({
      disposition: 'UNVERIFIABLE', reason: 'RUNTIME_UNAVAILABLE',
    });
  });
});

function request(method: 'POST' | 'DELETE', body: unknown): Request {
  const text = JSON.stringify(body);
  return new Request('http://localhost/api/services/editron/media/timestamp-preview/session', {
    method,
    headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
    body: text,
  });
}

function materializeV2() {
  return {
    schemaVersion: 2,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
    ...materializeScope(),
  };
}

function materializeV3() {
  return {
    schemaVersion: 3,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
    ...materializeScope(),
  };
}

function materializeScope() {
  return {
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    expectedProjectRevision: revision(), windowLocalStartFrame: 0, windowDurationInFrames: 2,
  };
}

function releaseV1() {
  return {
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
    window: pictureWindow('NO_AUDIO_MAPPING_REQUESTED'),
  };
}

function releaseV2() {
  return {
    schemaVersion: 2,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
    sessionWindow: exactSessionWindow(),
  };
}

function exactSessionWindow() {
  return {
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_V1',
    pictureWindow: pictureWindow('EXACT_SAMPLE_MAPPING_BOUND'),
    audioWindow: audioWindow(),
  };
}

function pictureWindow(
  audioDisposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED',
) {
  return {
    schemaVersion: 2,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
    receiptSha256: hex('1'), decoderRequestSha256: hex('2'),
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    projectRevision: revision(),
    overlayFromFrame: 0, overlayDurationInFrames: 2,
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
    lease: lease(),
    audioOwnership: {
      disposition: audioDisposition,
      audioMappingSha256: audioDisposition === 'EXACT_SAMPLE_MAPPING_BOUND'
        ? AUDIO_MAPPING_SHA256
        : null,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: [0, 1].map((localFrame) => ({
      localFrame, projectFrame: localFrame,
      pictureHandle: `nmpv1_${hex(String(localFrame + 3))}`,
      decoderPictureRequestSha256: hex(String(localFrame + 5)),
      decodedPictureContentSha256: hex(String(localFrame + 7)),
    })),
  };
}

function audioWindow() {
  return {
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1',
    windowSha256: hex('9'),
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    projectRevision: revision(),
    audioMappingSha256: AUDIO_MAPPING_SHA256,
    audioSampleEpochMapSha256: hex('b'), decodedPcmSha256: hex('c'),
    sampleRate: 48_000, channelCount: 2,
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
    windowProjectStartFrame: 0, windowProjectEndExclusiveFrame: 2,
    canonicalWindowStartSamplePosition: position('0'),
    canonicalWindowEndExclusiveSamplePosition: position('3200'),
    lease: lease(),
    segments: [{
      kind: 'PCM', audioEpochId: 'audio-epoch-1', audioHandle: AUDIO_HANDLE,
      segmentIdentitySha256: hex('d'),
      sourceStartSampleFrame: '0', sourceEndExclusiveSampleFrame: '3200',
      decodedStartSamplePosition: position('0'),
      decodedEndExclusiveSamplePosition: position('3200'),
      timelineStartSamplePosition: position('0'),
      timelineEndExclusiveSamplePosition: position('3200'),
    }],
  };
}

function lease() {
  return {
    leaseId: `nmpwl2_${hex('e')}`,
    issuedAtEpochMs: 1_000, renewAfterEpochMs: 2_000, expiresAtEpochMs: 3_000,
  };
}

function revision() {
  return {
    schemaVersion: 1, value: 9,
    compatibilityUpdatedAt: '2026-08-29T15:00:00.000Z',
  };
}

function position(numerator: string) {
  return { numerator, denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME' };
}

function hex(character: string): string {
  return character.repeat(64);
}

const AUDIO_MAPPING_SHA256 = hex('a');
const AUDIO_HANDLE = `nmpa1_${hex('f')}`;
