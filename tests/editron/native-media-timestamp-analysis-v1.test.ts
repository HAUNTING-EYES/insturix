import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createNativeMediaTimestampAnalysisEngineOutputV1,
  createNativeMediaTimestampAnalysisRequestV1,
} from '@/lib/editron/services/native-media-timestamp-analysis-contract-v1';
import {
  analyzeNativeMediaTimestampReceiptV1,
} from '@/lib/editron/services/native-media-timestamp-analysis-consumer-v1';
import {
  createNativeMediaTimestampLegacyVideoAnalysisEngineV1,
} from '@/lib/editron/services/native-media-timestamp-analysis-video-engine-v1';
import type {
  NativeMediaTimestampConsumptionReceiptV1,
} from '@/lib/editron/services/native-media-timestamp-consumer-v1';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-service';

const PROJECT_REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
});
const DECODER_PICTURE_REQUEST = '1'.repeat(64);
const DECODED_CONTENT = '2'.repeat(64);
const PICTURE_HANDLE = `nmpv1_${'3'.repeat(64)}`;
const SOURCE_VERSION = '4'.repeat(64);
const STORAGE_VERSION = '5'.repeat(64);
const DECODER_REQUEST = '6'.repeat(64);

async function png(red: number, green: number, blue: number): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 6, channels: 3, background: { r: red, g: green, b: blue } },
  }).png().toBuffer();
}

function consumptionReceipt(): NativeMediaTimestampConsumptionReceiptV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1' as const,
    consumerVersion: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_V1' as const,
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 'overlay-1',
    projectRevision: PROJECT_REVISION,
    assetId: 'asset-1',
    sourceVersionSha256: SOURCE_VERSION,
    storageVersionSha256: STORAGE_VERSION,
    sourceBindingSha256: '7'.repeat(64),
    transformSha256: '8'.repeat(64),
    decoderRequestSha256: DECODER_REQUEST,
    audioOwnership: {
      kind: 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1' as const,
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND' as const,
      audioMappingSha256: '9'.repeat(64),
      decoderMaySupplyOrReplaceAudio: false as const,
    },
    decodedPictures: [{
      decoderPictureRequestSha256: DECODER_PICTURE_REQUEST,
      sourceVersionSha256: SOURCE_VERSION,
      storageVersionSha256: STORAGE_VERSION,
      streamId: 'video-0',
      sourceFrameOrdinal: '10',
      epochId: 'epoch-a',
      presentationTimestampTicks: '10000',
      pictureHandle: PICTURE_HANDLE,
      decodedPictureContentSha256: DECODED_CONTENT,
      decodedByteLength: 192,
      codedWidth: 8,
      codedHeight: 6,
      displayWidth: 8,
      displayHeight: 6,
      rotationDegrees: 0 as const,
      pixelFormat: 'RGBA' as const,
      colorSpace: { primaries: null, transfer: null, matrix: null, fullRange: null },
    }],
    timelinePictures: [
      {
        timelineFrame: '100',
        decoderPictureRequestSha256: DECODER_PICTURE_REQUEST,
        sourceFrameOrdinal: '10',
        epochId: 'epoch-a',
        presentationTimestampTicks: '10000',
        selection: 'COVERING_PRESENTATION' as const,
        pictureHandle: PICTURE_HANDLE,
        decodedPictureContentSha256: DECODED_CONTENT,
      },
      {
        timelineFrame: '130',
        decoderPictureRequestSha256: DECODER_PICTURE_REQUEST,
        sourceFrameOrdinal: '10',
        epochId: 'epoch-a',
        presentationTimestampTicks: '10000',
        selection: 'COVERING_PRESENTATION' as const,
        pictureHandle: PICTURE_HANDLE,
        decodedPictureContentSha256: DECODED_CONTENT,
      },
    ],
    totalDecodedBytes: 192,
  };
  return { ...material, receiptSha256: hashEditronCanonicalJsonV1(material) };
}

async function harness(overrides: Readonly<{
  revisionValues?: readonly ProjectRevisionV1[];
  receipt?: NativeMediaTimestampConsumptionReceiptV1;
  surface?: 'AVAILABLE' | 'EXPIRED' | 'WRONG_SCOPE';
  cleanupFailure?: boolean;
  malformedOutput?: boolean;
}> = {}) {
  const bytes = await png(180, 40, 20);
  const receipt = overrides.receipt ?? consumptionReceipt();
  const revisions = [...(overrides.revisionValues ?? [PROJECT_REVISION, PROJECT_REVISION])];
  const readPicture = vi.fn(async () => {
    const binding = {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      pictureHandle: PICTURE_HANDLE,
      userId: 'user-1',
      projectId: overrides.surface === 'WRONG_SCOPE' ? 'project-other' : receipt.projectId,
      projectRevision: PROJECT_REVISION,
      sequenceIdSha256: hashText(receipt.sequenceId),
      overlayIdSha256: hashText(receipt.overlayId),
      decoderRequestSha256: DECODER_REQUEST,
      decoderPictureRequestSha256: DECODER_PICTURE_REQUEST,
      sourceVersionSha256: SOURCE_VERSION,
      storageVersionSha256: STORAGE_VERSION,
      decodedPictureContentSha256: DECODED_CONTENT,
      pngContentSha256: hashBytes(bytes),
      pngByteLength: bytes.byteLength,
      width: 8,
      height: 6,
      expiresAtEpochMs: 4_000_000_000_000,
    };
    return overrides.surface === 'EXPIRED'
      ? { disposition: 'EXPIRED' as const, binding }
      : { disposition: 'AVAILABLE' as const, binding, pngBytes: bytes };
  });
  const analyze = vi.fn(async (request) => {
    const output = createNativeMediaTimestampAnalysisEngineOutputV1({
      engineVersion: 'TEST_ENGINE_V1',
      analysisRequestSha256: request.analysisRequestSha256,
      frameCount: request.frames.length,
      observations: [
        { kind: 'POINT', sampleIndex: 1, signal: 'SCENE_CHANGE', detail: 'Cut' },
        {
          kind: 'RANGE', startSampleIndex: 0, endExclusiveSampleIndex: 2,
          signal: 'DEAD_VISUAL_RANGE', detail: 'Static',
        },
        { kind: 'GLOBAL', signal: 'SUMMARY', detail: 'Unlocated summary' },
      ],
    });
    return overrides.malformedOutput ? { ...output, outputSha256: '0'.repeat(64) } : output;
  });
  const releaseDecodedBatch = overrides.cleanupFailure
    ? vi.fn(async () => { throw new Error('simulated cleanup failure'); })
    : vi.fn(async () => undefined);
  const result = await analyzeNativeMediaTimestampReceiptV1({
    userId: 'user-1',
    receipt,
    timelineEndExclusiveFrame: '160',
    policy: {
      policyVersion: 'TEST_POLICY_V1',
      maxSampleFrames: 10,
      maxSinglePngBytes: 1_000_000,
      maxTotalPngBytes: 2_000_000,
    },
    pictureReader: { readPicture },
    engine: { analyze },
    decoderRelease: { releaseDecodedBatch },
    projectRevisionReader: {
      getProjectRevision: vi.fn(async () => revisions.shift() ?? PROJECT_REVISION),
    },
  });
  return { analyze, readPicture, releaseDecodedBatch, receipt, result };
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function conflictingHandleReceipt(): NativeMediaTimestampConsumptionReceiptV1 {
  const receipt = consumptionReceipt();
  const { receiptSha256: _receiptSha256, ...material } = receipt;
  const conflictingRequest = 'a'.repeat(64);
  const conflictingContent = 'b'.repeat(64);
  const conflictingMaterial = {
    ...material,
    decodedPictures: [
      material.decodedPictures[0]!,
      {
        ...material.decodedPictures[0]!,
        decoderPictureRequestSha256: conflictingRequest,
        sourceFrameOrdinal: '11',
        presentationTimestampTicks: '11000',
        decodedPictureContentSha256: conflictingContent,
      },
    ],
    timelinePictures: [
      material.timelinePictures[0]!,
      {
        ...material.timelinePictures[1]!,
        decoderPictureRequestSha256: conflictingRequest,
        sourceFrameOrdinal: '11',
        presentationTimestampTicks: '11000',
        decodedPictureContentSha256: conflictingContent,
      },
    ],
    totalDecodedBytes: 384,
  };
  return {
    ...conflictingMaterial,
    receiptSha256: hashEditronCanonicalJsonV1(conflictingMaterial),
  };
}

describe('native media timestamp analysis V1', () => {
  it('maps engine observations onto exact timeline frames and reuses identical pictures', async () => {
    const run = await harness();

    expect(run.result.disposition).toBe('ANALYZED');
    if (run.result.disposition !== 'ANALYZED') throw new Error('expected analyzed result');
    expect(run.readPicture).toHaveBeenCalledTimes(1);
    expect(run.releaseDecodedBatch).toHaveBeenCalledWith(DECODER_REQUEST);
    expect(run.result.receipt.observations).toEqual([
      expect.objectContaining({ kind: 'POINT', timelineFrame: '130' }),
      expect.objectContaining({
        kind: 'RANGE', timelineStartFrame: '100', timelineEndExclusiveFrame: '160',
      }),
      expect.objectContaining({ kind: 'GLOBAL', coordinateDisposition: 'NO_RANGE_COORDINATE' }),
    ]);
    const { receiptSha256, ...material } = run.result.receipt;
    expect(receiptSha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(Object.isFrozen(run.result.receipt)).toBe(true);
  });

  it.each([
    ['PROJECT_REVISION_STALE', { revisionValues: [PROJECT_REVISION, { ...PROJECT_REVISION, value: 8 }] }],
    ['SURFACE_EXPIRED', { surface: 'EXPIRED' as const }],
    ['SURFACE_SCOPE_MISMATCH', { surface: 'WRONG_SCOPE' as const }],
    ['ENGINE_OUTPUT_INVALID', { malformedOutput: true }],
    ['CLEANUP_FAILED', { cleanupFailure: true }],
  ] as const)('fails closed as %s and still attempts cleanup', async (reason, options) => {
    const run = await harness(options);

    expect(run.result).toMatchObject({ disposition: 'UNVERIFIABLE', reason });
    expect(run.releaseDecodedBatch).toHaveBeenCalledTimes(1);
  });

  it('revalidates a cached handle against every decoded identity', async () => {
    const run = await harness({ receipt: conflictingHandleReceipt() });

    expect(run.result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SURFACE_SCOPE_MISMATCH',
    });
    expect(run.readPicture).toHaveBeenCalledTimes(1);
    expect(run.analyze).not.toHaveBeenCalled();
    expect(run.releaseDecodedBatch).toHaveBeenCalledTimes(1);
  });

  it('reports an absent cleanup capability as invalid input', async () => {
    const result = await analyzeNativeMediaTimestampReceiptV1({
      userId: 'user-1',
      receipt: consumptionReceipt(),
      timelineEndExclusiveFrame: '160',
      policy: {
        policyVersion: 'TEST_POLICY_V1', maxSampleFrames: 10,
        maxSinglePngBytes: 1_000_000, maxTotalPngBytes: 2_000_000,
      },
      pictureReader: { readPicture: vi.fn() },
      engine: { analyze: vi.fn() },
      decoderRelease: {} as never,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'INPUT_INVALID',
      diagnostic: 'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_PORT_INVALID',
    });
  });

  it('encodes exact PNG samples for the legacy analyzer and removes its owned temp directory', async () => {
    const first = await png(255, 0, 0);
    const second = await png(0, 0, 255);
    let sampledVideoPath = '';
    const request = createNativeMediaTimestampAnalysisRequestV1({
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'overlay-1',
      projectRevision: PROJECT_REVISION,
      consumptionReceiptSha256: 'a'.repeat(64),
      timelineEndExclusiveFrame: '160',
      frames: [first, second].map((bytes, sampleIndex) => ({
        sampleIndex,
        timelineFrame: String(100 + sampleIndex * 30),
        decoderPictureRequestSha256: String(sampleIndex + 1).repeat(64),
        sourceFrameOrdinal: String(10 + sampleIndex),
        epochId: 'epoch-a',
        presentationTimestampTicks: String(10_000 + sampleIndex * 1_000),
        selection: 'COVERING_PRESENTATION' as const,
        pictureHandle: `nmpv1_${String(sampleIndex + 3).repeat(64)}`,
        decodedPictureContentSha256: String(sampleIndex + 5).repeat(64),
        pngContentSha256: hashBytes(bytes),
        pngByteLength: bytes.byteLength,
        width: 8,
        height: 6,
        pngBase64: bytes.toString('base64'),
      })),
    });
    const engine = createNativeMediaTimestampLegacyVideoAnalysisEngineV1({
      analyzeVideo: async ({ filePath }) => {
        sampledVideoPath = filePath;
        const encoded = await readFile(filePath);
        expect(encoded.subarray(4, 8).toString('ascii')).toBe('ftyp');
        return {
          sceneChanges: [1],
          deadVisualRanges: [[0, 2]],
          gestures: ['hand raises'],
          onScreenText: ['10%'],
          summary: 'Two sampled frames',
          theme: 'Demo',
        };
      },
    });

    const output = await engine.analyze(request);

    expect(output).toMatchObject({
      analysisRequestSha256: request.analysisRequestSha256,
      observations: expect.arrayContaining([
        expect.objectContaining({ kind: 'POINT', sampleIndex: 1, signal: 'SCENE_CHANGE' }),
        expect.objectContaining({ kind: 'RANGE', startSampleIndex: 0, endExclusiveSampleIndex: 2 }),
        expect.objectContaining({ kind: 'GLOBAL', signal: 'ON_SCREEN_TEXT_UNLOCATED' }),
      ]),
    });
    await expect(access(sampledVideoPath)).rejects.toThrow();
  });
});
