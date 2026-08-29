import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import type { MediaSourceAudioArtifactAssetStateInputV1 } from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactManifestV1 } from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import {
  materializeNativeMediaTimestampPreviewWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewMaterializerPortsV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';
import type { NativeMediaTimestampPreviewAudioSurfaceStorePortV1 } from '@/lib/editron/services/native-media-timestamp-r2-preview-audio-surface-v1';
import type { Project } from '@/lib/editron/services/project-service';

const mocks = vi.hoisted(() => ({
  resolveBinding: vi.fn(),
  createConform: vi.fn(),
  consume: vi.fn(),
  readAudioState: vi.fn(),
  serializeManifest: vi.fn(),
  verifyArtifactSet: vi.fn(),
  createPictureWindow: vi.fn(),
  materializeAudio: vi.fn(),
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (importActual) => ({
  ...await importActual<typeof import('@/lib/editron/services/video-source-time-transform-v1')>(),
  resolveVerifiedVideoSourceEpochTimeBindingV3: mocks.resolveBinding,
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3: mocks.createConform,
}));

vi.mock('@/lib/editron/services/native-media-timestamp-consumer-v1', async (importActual) => ({
  ...await importActual<typeof import('@/lib/editron/services/native-media-timestamp-consumer-v1')>(),
  consumeNativeMediaTimestampTransformV1: mocks.consume,
}));

vi.mock('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1',
  async (importActual) => ({
    ...await importActual<
      typeof import('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1')
    >(),
    readMediaSourceAudioArtifactAssetStateV1: mocks.readAudioState,
  }));

vi.mock('@/lib/editron/services/media-source-audio-private-artifact-v1',
  async (importActual) => ({
    ...await importActual<
      typeof import('@/lib/editron/services/media-source-audio-private-artifact-v1')
    >(),
    serializeMediaSourceAudioPrivateArtifactManifestV1: mocks.serializeManifest,
    verifyMediaSourceAudioPrivateArtifactSetV1: mocks.verifyArtifactSet,
  }));

vi.mock(
  '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2',
  async (importActual) => ({
    ...await importActual<
      typeof import('@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2')
    >(),
    createNativeMediaTimestampPreviewWindowV2: mocks.createPictureWindow,
  }),
);

vi.mock('@/lib/editron/services/native-media-timestamp-preview-audio-materializer-v1',
  async (importActual) => ({
    ...await importActual<
      typeof import('@/lib/editron/services/native-media-timestamp-preview-audio-materializer-v1')
    >(),
    materializeNativeMediaTimestampPreviewAudioWindowV1: mocks.materializeAudio,
  }));

describe('native media timestamp paired materializer V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBinding.mockReturnValue(binding());
    mocks.readAudioState.mockReturnValue(audioState());
    mocks.serializeManifest.mockReturnValue({ reference: manifestReference() });
    mocks.verifyArtifactSet.mockReturnValue(audioEvidence());
    mocks.createConform.mockResolvedValue({
      disposition: 'CONFORM_CREATED',
      transform: transform(),
    });
    mocks.consume.mockResolvedValue({
      disposition: 'CONSUMED',
      receipt: consumptionReceipt(),
    });
    mocks.createPictureWindow.mockImplementation((input) => pictureWindow(input.lease));
    mocks.materializeAudio.mockImplementation(async (input) => ({
      disposition: 'AUDIO_WINDOW_MATERIALIZED',
      window: audioWindow(input.lease),
    }));
  });

  it('keeps V2 picture-only and never allocates an audio surface', async () => {
    const harness = ports();
    const result = await materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(),
      harness.ports,
    );
    expect(result).toMatchObject({ disposition: 'WINDOW_MATERIALIZED' });
    expect(harness.createSurfaceStore).not.toHaveBeenCalled();
    expect(mocks.materializeAudio).not.toHaveBeenCalled();
  });

  it('materializes and pairs exact audio for the explicit V3 delivery contract', async () => {
    const harness = ports();
    const result = await materializeNativeMediaTimestampPreviewWindowV1(
      { ...materializerInput(), deliveryContract: 'PAIRED_SESSION_V3' },
      harness.ports,
    );
    expect(result).toMatchObject({
      disposition: 'SESSION_WINDOW_MATERIALIZED',
      materializedPictureCount: 2,
      materializedAudioSegmentCount: 1,
      sessionWindow: {
        pictureWindow: { audioOwnership: { disposition: 'EXACT_SAMPLE_MAPPING_BOUND' } },
        audioWindow: { audioMappingSha256: AUDIO_MAPPING_SHA256 },
      },
    });
    expect(harness.createSurfaceStore).toHaveBeenCalledWith(expect.objectContaining({
      leaseScope: expect.objectContaining({
        userId: 'user-1', projectId: 'project-1', projectRevision: revision(),
      }),
    }));
    expect(mocks.materializeAudio).toHaveBeenCalledWith(expect.objectContaining({
      expectedAssetId: 'asset-1',
      manifestSha256: MANIFEST_SHA256,
      manifestReference: manifestReference(),
      windowLocalStartFrame: 0,
      windowDurationInFrames: 2,
    }), expect.objectContaining({
      pcmReader: harness.pcmReader,
      surfaceStore: harness.audioSurfaceStore,
    }));
    expect(harness.assetReader.load).toHaveBeenCalledTimes(3);
    expect(harness.projectRevisionReader.getProjectRevision).toHaveBeenCalledTimes(2);
  });

  it('blocks V3 when the exact audio runtime is absent and releases pictures', async () => {
    const harness = ports();
    const { audioPreview: _audioPreview, ...withoutAudioPreview } = harness.ports;
    const result = await materializeNativeMediaTimestampPreviewWindowV1(
      { ...materializerInput(), deliveryContract: 'PAIRED_SESSION_V3' },
      withoutAudioPreview,
    );
    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_WINDOW_MATERIALIZATION_FAILED',
      diagnostic: 'NATIVE_MEDIA_PREVIEW_AUDIO_RUNTIME_REQUIRED',
    });
    expect(harness.releaseDecodedBatch).toHaveBeenCalledWith(DECODER_REQUEST_SHA256);
    expect(mocks.materializeAudio).not.toHaveBeenCalled();
  });

  it('deletes audio and pictures when the project becomes stale after audio', async () => {
    const harness = ports();
    harness.projectRevisionReader.getProjectRevision
      .mockResolvedValueOnce(revision())
      .mockResolvedValueOnce({ ...revision(), value: 10 });
    const result = await materializeNativeMediaTimestampPreviewWindowV1(
      { ...materializerInput(), deliveryContract: 'PAIRED_SESSION_V3' },
      harness.ports,
    );
    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PROJECT_CHANGED_DURING_MATERIALIZATION',
      diagnostic: null,
    });
    expect(harness.deleteAudioSegment).toHaveBeenCalledWith(AUDIO_HANDLE);
    expect(harness.releaseDecodedBatch).toHaveBeenCalledWith(DECODER_REQUEST_SHA256);
  });
});

function ports() {
  const assetReader = { load: vi.fn(async () => asset()) };
  const projectRevisionReader = {
    getProjectRevision: vi.fn(async () => revision()),
  };
  const releaseDecodedBatch = vi.fn(async () => undefined);
  const deleteAudioSegment = vi.fn(async () => undefined);
  const audioSurfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1 = {
    putAudioSegment: vi.fn(async () => ({
      audioHandle: AUDIO_HANDLE,
      segmentIdentitySha256: SEGMENT_SHA256,
      expiresAtEpochMs: 3_601_000,
    })),
    deleteAudioSegment,
  };
  const createSurfaceStore = vi.fn(() => audioSurfaceStore);
  const pcmReader = {
    readPcmSampleRange: vi.fn(async () => { throw new Error('MOCK_OWNER_HANDLES_PCM'); }),
  };
  const result: NativeMediaTimestampPreviewMaterializerPortsV1 = {
    projectSnapshotReader: {
      loadProjectForMutation: vi.fn(async () => ({
        project: projectFixture(), revision: revision(),
      })),
    },
    projectRevisionReader,
    assetReader,
    storedObjectReader: {
      read: vi.fn(async () => { throw new Error('MOCK_CONFORM_HANDLES_OBJECTS'); }),
    },
    audioArtifactReader: {
      readArtifactSet: vi.fn(async () => ({
        manifest: manifest() as unknown as MediaSourceAudioPrivateArtifactManifestV1,
        mapCanonicalJson: '{}',
      })),
    },
    audioPreview: { pcmReader, createSurfaceStore },
    createDecoder: vi.fn(() => ({
      decoder: {
        decodePictures: vi.fn(async () => { throw new Error('MOCK_CONSUMER_HANDLES_DECODE'); }),
        releaseDecodedBatch,
      },
      surfaceExpiresAtEpochMs: 3_601_000,
    })),
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
    now: () => 1_000,
  };
  return {
    ports: result,
    assetReader,
    projectRevisionReader,
    releaseDecodedBatch,
    deleteAudioSegment,
    audioSurfaceStore,
    createSurfaceStore,
    pcmReader,
  };
}

function materializerInput() {
  return {
    userId: 'user-1', projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    expectedProjectRevision: revision(), windowLocalStartFrame: 0, windowDurationInFrames: 2,
  } as const;
}

function projectFixture(): Project {
  return {
    projectId: 'project-1', userId: 'user-1', name: 'Paired materializer fixture',
    overlays: [{
      id: 42, type: OverlayType.VIDEO, content: 'video', assetId: 'asset-1',
      from: 0, durationInFrames: 2, sourceStartFrame: 0, sourceEndFrame: 2,
      width: 1920, height: 1080, left: 0, top: 0, row: 0, rotation: 0,
      isDragging: false, styles: {},
    }],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 }, fps: 30,
    durationInFrames: 2, createdAt: new Date(0), updatedAt: new Date(0),
    projectRevision: 9, visibility: 'private',
  };
}

function asset(): MediaSourceAudioArtifactAssetStateInputV1 {
  return {
    assetId: 'asset-1',
    type: 'video',
    sourcePtsCadenceMapV3: {},
    sourceQualificationV1: {
      observation: { audioStreams: [{ streamIndex: 1 }] },
    },
  } as unknown as MediaSourceAudioArtifactAssetStateInputV1;
}

function binding() {
  return {
    assetId: 'asset-1',
    totalSourceFrameCount: '2',
    bindingSha256: BINDING_SHA256,
    sourcePtsCadenceMapStateSha256V3: MAP_STATE_SHA256,
  };
}

function audioState() {
  return {
    sourceAudioArtifactsV1: { records: [audioRecord()] },
    sourceAudioArtifactsStateSha256V1: AUDIO_STATE_SHA256,
  };
}

function audioRecord() {
  return {
    audioStreamIndex: 1,
    streamId: 'audio-1',
    sampleRate: '48000',
    channelCount: 2,
    audioSampleEpochMapSha256: AUDIO_MAP_SHA256,
    decodedPcmSha256: PCM_SHA256,
    decodedSampleFrameCount: '3200',
    manifestSha256: MANIFEST_SHA256,
    manifestReference: manifestReference(),
  };
}

function manifestReference() {
  return {
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    artifactKind: 'MANIFEST' as const,
    objectKey: 'private/editron/media-source-audio/v1/manifests/test.json',
    byteLength: 100,
    contentSha256: hex('1'),
  };
}

function manifest() {
  return {
    manifestSha256: MANIFEST_SHA256,
    audioSampleEpochMapSha256: AUDIO_MAP_SHA256,
    decodedPcmSha256: PCM_SHA256,
    decodedSampleFrameCount: '3200',
  };
}

function audioEvidence() {
  return {
    audioSampleEpochMapSha256: AUDIO_MAP_SHA256,
    pcm: { decodedPcmSha256: PCM_SHA256, decodedSampleFrameCount: '3200' },
    binding: {
      audioStreamIndex: 1, streamId: 'audio-1', sampleRate: '48000', channelCount: 2,
    },
  };
}

function transform() {
  return {
    transformSha256: TRANSFORM_SHA256,
    projectRate: { numerator: '30', denominator: '1' },
    audioMapping: { audioMappingSha256: AUDIO_MAPPING_SHA256 },
  };
}

function consumptionReceipt() {
  return {
    decoderRequestSha256: DECODER_REQUEST_SHA256,
    receiptSha256: RECEIPT_SHA256,
    decodedPictures: [{}, {}],
  };
}

function pictureWindow(lease: ReturnType<typeof previewLease>) {
  return {
    schemaVersion: 2 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2' as const,
    receiptSha256: RECEIPT_SHA256,
    decoderRequestSha256: DECODER_REQUEST_SHA256,
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    projectRevision: revision(),
    overlayFromFrame: 0, overlayDurationInFrames: 2,
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
    lease,
    audioOwnership: {
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND' as const,
      audioMappingSha256: AUDIO_MAPPING_SHA256,
      decoderMaySupplyOrReplaceAudio: false as const,
    },
    frames: [0, 1].map((localFrame) => ({
      localFrame, projectFrame: localFrame,
      pictureHandle: `nmpv1_${hex(String(localFrame + 2))}`,
      decoderPictureRequestSha256: hex(String(localFrame + 4)),
      decodedPictureContentSha256: hex(String(localFrame + 6)),
    })),
  };
}

function audioWindow(lease: ReturnType<typeof previewLease>) {
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1' as const,
    windowSha256: hex('8'),
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    projectRevision: revision(),
    audioMappingSha256: AUDIO_MAPPING_SHA256,
    audioSampleEpochMapSha256: AUDIO_MAP_SHA256,
    decodedPcmSha256: PCM_SHA256,
    sampleRate: 48_000, channelCount: 2,
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
    windowProjectStartFrame: 0, windowProjectEndExclusiveFrame: 2,
    canonicalWindowStartSamplePosition: position('0'),
    canonicalWindowEndExclusiveSamplePosition: position('3200'),
    lease,
    segments: [{
      kind: 'PCM' as const,
      audioEpochId: 'audio-epoch-1',
      audioHandle: AUDIO_HANDLE,
      segmentIdentitySha256: SEGMENT_SHA256,
      sourceStartSampleFrame: '0', sourceEndExclusiveSampleFrame: '3200',
      decodedStartSamplePosition: position('0'),
      decodedEndExclusiveSamplePosition: position('3200'),
      timelineStartSamplePosition: position('0'),
      timelineEndExclusiveSamplePosition: position('3200'),
    }],
  };
}

function previewLease() {
  return {
    leaseId: `nmpwl2_${hex('9')}`,
    issuedAtEpochMs: 1_000,
    renewAfterEpochMs: 3_301_000,
    expiresAtEpochMs: 3_601_000,
  };
}

function position(numerator: string) {
  return { numerator, denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME' as const };
}

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 9,
    compatibilityUpdatedAt: '2026-08-29T15:00:00.000Z',
  };
}

function hex(character: string): string {
  return character.repeat(64);
}

const BINDING_SHA256 = hex('a');
const MAP_STATE_SHA256 = hex('b');
const AUDIO_STATE_SHA256 = hex('c');
const AUDIO_MAP_SHA256 = hex('d');
const PCM_SHA256 = hex('e');
const MANIFEST_SHA256 = hex('f');
const AUDIO_MAPPING_SHA256 = hex('1');
const TRANSFORM_SHA256 = hex('2');
const DECODER_REQUEST_SHA256 = hex('3');
const RECEIPT_SHA256 = hex('4');
const SEGMENT_SHA256 = hex('5');
const AUDIO_HANDLE = `nmpa1_${hex('6')}`;
