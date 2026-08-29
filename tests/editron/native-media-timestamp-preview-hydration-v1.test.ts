import { describe, expect, it } from 'vitest';

import type { NativeMediaTimestampConsumptionReceiptV1 } from '@/lib/editron/services/native-media-timestamp-consumer-v1';
import {
  assertNativeMediaTimestampPreviewHydrationV1,
  createNativeMediaTimestampPreviewHydrationIndexV1,
  createNativeMediaTimestampPreviewHydrationV1,
  nativeMediaTimestampPreviewRoutePathV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-hydration-v1';

const HANDLE_A = `nmpv1_${'1'.repeat(64)}`;
const HANDLE_B = `nmpv1_${'2'.repeat(64)}`;
const REQUEST_A = '3'.repeat(64);
const REQUEST_B = '4'.repeat(64);
const CONTENT_A = '5'.repeat(64);
const CONTENT_B = '6'.repeat(64);

function receipt(): NativeMediaTimestampConsumptionReceiptV1 {
  const picture = (
    decoderPictureRequestSha256: string,
    pictureHandle: string,
    decodedPictureContentSha256: string,
    sourceFrameOrdinal: string,
  ) => ({
    decoderPictureRequestSha256,
    sourceVersionSha256: '7'.repeat(64),
    storageVersionSha256: '8'.repeat(64),
    streamId: 'video-0',
    sourceFrameOrdinal,
    epochId: 'epoch-a',
    presentationTimestampTicks: String(10_000 + Number(sourceFrameOrdinal) * 1_000),
    pictureHandle,
    decodedPictureContentSha256,
    decodedByteLength: 4,
    codedWidth: 1,
    codedHeight: 1,
    displayWidth: 1,
    displayHeight: 1,
    rotationDegrees: 0 as const,
    pixelFormat: 'RGBA' as const,
    colorSpace: { primaries: null, transfer: null, matrix: null, fullRange: null },
  });
  return {
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1',
    consumerVersion: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_V1',
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: '42',
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    assetId: 'asset-1',
    sourceVersionSha256: '7'.repeat(64),
    storageVersionSha256: '8'.repeat(64),
    sourceBindingSha256: '9'.repeat(64),
    transformSha256: 'a'.repeat(64),
    decoderRequestSha256: 'b'.repeat(64),
    audioOwnership: {
      kind: 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1',
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
      audioMappingSha256: 'c'.repeat(64),
      decoderMaySupplyOrReplaceAudio: false,
    },
    decodedPictures: [
      picture(REQUEST_A, HANDLE_A, CONTENT_A, '0'),
      picture(REQUEST_B, HANDLE_B, CONTENT_B, '1'),
    ],
    timelinePictures: [
      {
        timelineFrame: '102',
        decoderPictureRequestSha256: REQUEST_B,
        sourceFrameOrdinal: '1',
        epochId: 'epoch-a',
        presentationTimestampTicks: '11000',
        selection: 'COVERING_PRESENTATION',
        pictureHandle: HANDLE_B,
        decodedPictureContentSha256: CONTENT_B,
      },
      {
        timelineFrame: '100',
        decoderPictureRequestSha256: REQUEST_A,
        sourceFrameOrdinal: '0',
        epochId: 'epoch-a',
        presentationTimestampTicks: '10000',
        selection: 'COVERING_PRESENTATION',
        pictureHandle: HANDLE_A,
        decodedPictureContentSha256: CONTENT_A,
      },
      {
        timelineFrame: '101',
        decoderPictureRequestSha256: REQUEST_A,
        sourceFrameOrdinal: '0',
        epochId: 'epoch-a',
        presentationTimestampTicks: '10000',
        selection: 'COVERING_PRESENTATION',
        pictureHandle: HANDLE_A,
        decodedPictureContentSha256: CONTENT_A,
      },
    ],
    totalDecodedBytes: 8,
    receiptSha256: 'd'.repeat(64),
  };
}

describe('native media timestamp preview hydration V1', () => {
  it('converts complete absolute receipt frames into an ordered local-frame index', () => {
    const hydration = createNativeMediaTimestampPreviewHydrationV1({
      receipt: receipt(),
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    });

    expect(hydration).toMatchObject({
      overlayId: '42',
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
      audioOwnership: {
        disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
        audioMappingSha256: 'c'.repeat(64),
        decoderMaySupplyOrReplaceAudio: false,
      },
    });
    expect(hydration.frames).toEqual([
      expect.objectContaining({ localFrame: 0, projectFrame: 100, pictureHandle: HANDLE_A }),
      expect.objectContaining({ localFrame: 1, projectFrame: 101, pictureHandle: HANDLE_A }),
      expect.objectContaining({ localFrame: 2, projectFrame: 102, pictureHandle: HANDLE_B }),
    ]);
    expect(Object.isFrozen(hydration)).toBe(true);
    expect(Object.isFrozen(hydration.frames)).toBe(true);

    const index = createNativeMediaTimestampPreviewHydrationIndexV1([hydration]);
    expect(index.hasOverlay(42)).toBe(true);
    expect(index.frameFor('42', 1)).toMatchObject({ pictureHandle: HANDLE_A });
    expect(index.frameFor(42, 3)).toBeNull();
    expect(nativeMediaTimestampPreviewRoutePathV1(HANDLE_B)).toBe(
      `/api/services/editron/media/timestamp-preview/${HANDLE_B}`,
    );
  });

  it('rejects missing, duplicate, out-of-range, and unsafe project-frame coverage', () => {
    const missingBase = receipt();
    const missing = {
      ...missingBase,
      timelinePictures: missingBase.timelinePictures.slice(0, 2),
    };
    expect(() => createNativeMediaTimestampPreviewHydrationV1({
      receipt: missing,
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_COVERAGE_INVALID');

    const duplicateBase = receipt();
    const duplicate = {
      ...duplicateBase,
      timelinePictures: [
        duplicateBase.timelinePictures[1]!,
        duplicateBase.timelinePictures[1]!,
        duplicateBase.timelinePictures[0]!,
      ],
    };
    expect(() => createNativeMediaTimestampPreviewHydrationV1({
      receipt: duplicate,
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_COVERAGE_INVALID');

    const unsafeBase = receipt();
    const unsafe = {
      ...unsafeBase,
      timelinePictures: [
        { ...unsafeBase.timelinePictures[0]!, timelineFrame: '9007199254740992' },
        ...unsafeBase.timelinePictures.slice(1),
      ],
    };
    expect(() => createNativeMediaTimestampPreviewHydrationV1({
      receipt: unsafe,
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_PROJECT_FRAME_INVALID');
  });

  it('rejects cross-picture mappings, decoder-owned audio, extra fields, and duplicate overlays', () => {
    const crossPictureBase = receipt();
    const crossPicture = {
      ...crossPictureBase,
      timelinePictures: [
        { ...crossPictureBase.timelinePictures[0]!, pictureHandle: HANDLE_A },
        ...crossPictureBase.timelinePictures.slice(1),
      ],
    };
    expect(() => createNativeMediaTimestampPreviewHydrationV1({
      receipt: crossPicture,
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_PICTURE_SCOPE_MISMATCH');

    const unsafeAudio = receipt() as unknown as Record<string, unknown>;
    unsafeAudio.audioOwnership = {
      ...(unsafeAudio.audioOwnership as Record<string, unknown>),
      decoderMaySupplyOrReplaceAudio: true,
    };
    expect(() => createNativeMediaTimestampPreviewHydrationV1({
      receipt: unsafeAudio as unknown as NativeMediaTimestampConsumptionReceiptV1,
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_RECEIPT_INVALID');

    const hydration = createNativeMediaTimestampPreviewHydrationV1({
      receipt: receipt(),
      overlayFromFrame: 100,
      overlayDurationInFrames: 3,
    });
    expect(() => assertNativeMediaTimestampPreviewHydrationV1({
      ...hydration,
      persistedOverlayForm: true,
    })).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_FIELDS_INVALID');
    expect(() => createNativeMediaTimestampPreviewHydrationIndexV1([
      hydration,
      hydration,
    ])).toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_DUPLICATE');
    expect(() => nativeMediaTimestampPreviewRoutePathV1('bad-handle'))
      .toThrow('NATIVE_MEDIA_PREVIEW_HYDRATION_HANDLE_INVALID');
  });
});
