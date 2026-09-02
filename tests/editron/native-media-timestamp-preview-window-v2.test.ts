import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaTimestampPreviewWindowV2,
  createNativeMediaTimestampPreviewWindowIndexV2,
  createNativeMediaTimestampPreviewWindowV2,
  planNativeMediaTimestampPreviewWindowsV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';
import type { NativeMediaTimestampConsumptionReceiptV1 } from '@/lib/editron/services/native-media-timestamp-consumer-v1';

const HASH = (character: string) => character.repeat(64);
const HANDLE_A = `nmpv1_${HASH('1')}`;
const HANDLE_B = `nmpv1_${HASH('2')}`;
const LEASE_A = `nmpwl2_${HASH('3')}`;
const LEASE_B = `nmpwl2_${HASH('4')}`;

function receipt(
  timelineFrames: readonly number[],
  options: Readonly<{ revision?: number; crossPicture?: boolean }> = {},
): NativeMediaTimestampConsumptionReceiptV1 {
  const requests = [HASH('5'), HASH('6')];
  const contents = [HASH('7'), HASH('8')];
  const handles = [HANDLE_A, HANDLE_B];
  const decodedPictures = requests.map((request, index) => ({
    decoderPictureRequestSha256: request,
    sourceVersionSha256: HASH('9'),
    storageVersionSha256: HASH('a'),
    streamId: 'video-0',
    sourceFrameOrdinal: String(index),
    epochId: 'epoch-a',
    presentationTimestampTicks: String(10_000 + index * 1_000),
    pictureHandle: handles[index]!,
    decodedPictureContentSha256: contents[index]!,
    decodedByteLength: 4,
    codedWidth: 1,
    codedHeight: 1,
    displayWidth: 1,
    displayHeight: 1,
    rotationDegrees: 0 as const,
    pixelFormat: 'RGBA' as const,
    colorSpace: { primaries: null, transfer: null, matrix: null, fullRange: null },
  }));
  return {
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1',
    consumerVersion: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_V1',
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: '42',
    projectRevision: {
      schemaVersion: 1,
      value: options.revision ?? 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    assetId: 'asset-1',
    sourceVersionSha256: HASH('9'),
    storageVersionSha256: HASH('a'),
    sourceBindingSha256: HASH('b'),
    transformSha256: HASH('c'),
    decoderRequestSha256: HASH('d'),
    audioOwnership: {
      kind: 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1',
      disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
      audioMappingSha256: HASH('e'),
      decoderMaySupplyOrReplaceAudio: false,
    },
    decodedPictures,
    timelinePictures: timelineFrames.map((timelineFrame, index) => {
      const pictureIndex = index % 2;
      return {
        timelineFrame: String(timelineFrame),
        decoderPictureRequestSha256: requests[pictureIndex]!,
        sourceFrameOrdinal: String(pictureIndex),
        epochId: 'epoch-a',
        presentationTimestampTicks: String(10_000 + pictureIndex * 1_000),
        selection: 'COVERING_PRESENTATION' as const,
        pictureHandle: options.crossPicture && index === 0
          ? handles[1 - pictureIndex]!
          : handles[pictureIndex]!,
        decodedPictureContentSha256: contents[pictureIndex]!,
      };
    }),
    totalDecodedBytes: 8,
    receiptSha256: HASH('f'),
  };
}

function lease(leaseId = LEASE_A) {
  return {
    leaseId,
    issuedAtEpochMs: 1_000,
    renewAfterEpochMs: 2_000,
    expiresAtEpochMs: 3_000,
  };
}

function window(
  localStart: number,
  duration: number,
  options: Readonly<{ leaseId?: string; revision?: number }> = {},
) {
  const overlayFromFrame = 100;
  return createNativeMediaTimestampPreviewWindowV2({
    receipt: receipt(
      Array.from({ length: duration }, (_, index) => overlayFromFrame + localStart + index),
      { revision: options.revision },
    ),
    overlayFromFrame,
    overlayDurationInFrames: 8,
    windowLocalStartFrame: localStart,
    windowDurationInFrames: duration,
    lease: lease(options.leaseId),
  });
}

describe('native media timestamp preview window V2', () => {
  it('indexes adjacent lease-bound windows without requiring whole-overlay hydration', () => {
    const first = window(0, 4);
    const second = window(4, 4, { leaseId: LEASE_B });
    const index = createNativeMediaTimestampPreviewWindowIndexV2(
      [second, first],
      { now: () => 1_500 },
    );

    expect(first).toMatchObject({
      schemaVersion: 2,
      windowLocalStartFrame: 0,
      windowDurationInFrames: 4,
      decoderRequestSha256: HASH('d'),
    });
    expect(first.frames.map((frame) => frame.localFrame)).toEqual([0, 1, 2, 3]);
    expect(index.hasOverlay(42)).toBe(true);
    expect(index.frameFor(42, 3)).toMatchObject({ projectFrame: 103, pictureHandle: HANDLE_B });
    expect(index.frameFor('42', 4)).toMatchObject({ projectFrame: 104, pictureHandle: HANDLE_A });
    expect(index.leaseDispositionFor(42, 4)).toBe('CURRENT');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.frames)).toBe(true);
  });

  it('reports renewal and rejects an expired active window deterministically', () => {
    const hydration = window(0, 4);
    const renewIndex = createNativeMediaTimestampPreviewWindowIndexV2(
      [hydration],
      { now: () => 2_500 },
    );
    expect(renewIndex.leaseDispositionFor(42, 1)).toBe('RENEW_DUE');
    expect(renewIndex.frameFor(42, 1)).toMatchObject({ localFrame: 1 });

    const expiredIndex = createNativeMediaTimestampPreviewWindowIndexV2(
      [hydration],
      { now: () => 3_000 },
    );
    expect(expiredIndex.leaseDispositionFor(42, 1)).toBe('EXPIRED');
    expect(() => expiredIndex.frameFor(42, 1))
      .toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_EXPIRED');
  });

  it('keeps unloaded coverage explicit and rejects overlap or mixed overlay scope', () => {
    const first = window(0, 2);
    const gapIndex = createNativeMediaTimestampPreviewWindowIndexV2(
      [first],
      { now: () => 1_500 },
    );
    expect(gapIndex.hasOverlay(42)).toBe(true);
    expect(gapIndex.frameFor(42, 3)).toBeNull();

    expect(() => createNativeMediaTimestampPreviewWindowIndexV2([
      window(0, 4),
      window(3, 3, { leaseId: LEASE_B }),
    ])).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAP');

    expect(() => createNativeMediaTimestampPreviewWindowIndexV2([
      window(0, 4),
      window(4, 4, { leaseId: LEASE_B, revision: 8 }),
    ])).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_SCOPE_MISMATCH');
  });

  it('rejects incomplete coverage, cross-picture substitution, malformed leases, and extra fields', () => {
    expect(() => createNativeMediaTimestampPreviewWindowV2({
      receipt: receipt([100, 101, 102]),
      overlayFromFrame: 100,
      overlayDurationInFrames: 8,
      windowLocalStartFrame: 0,
      windowDurationInFrames: 4,
      lease: lease(),
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_COVERAGE_INVALID');

    expect(() => createNativeMediaTimestampPreviewWindowV2({
      receipt: receipt([100, 101], { crossPicture: true }),
      overlayFromFrame: 100,
      overlayDurationInFrames: 8,
      windowLocalStartFrame: 0,
      windowDurationInFrames: 2,
      lease: lease(),
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_PICTURE_SCOPE_MISMATCH');

    expect(() => createNativeMediaTimestampPreviewWindowV2({
      receipt: receipt([100, 101]),
      overlayFromFrame: 100,
      overlayDurationInFrames: 8,
      windowLocalStartFrame: 0,
      windowDurationInFrames: 2,
      lease: { ...lease(), renewAfterEpochMs: 3_000 },
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID');

    expect(() => assertNativeMediaTimestampPreviewWindowV2({
      ...window(0, 2),
      persistedOverlayForm: true,
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_FIELDS_INVALID');
  });

  it('plans aligned active and next windows within the decoder ceiling', () => {
    expect(planNativeMediaTimestampPreviewWindowsV2({
      currentLocalFrame: 4,
      overlayDurationInFrames: 8,
      framesPerWindow: 3,
    })).toEqual({
      active: { localStartFrame: 3, durationInFrames: 3 },
      prefetch: { localStartFrame: 6, durationInFrames: 2 },
    });
    expect(planNativeMediaTimestampPreviewWindowsV2({
      currentLocalFrame: 7,
      overlayDurationInFrames: 8,
      framesPerWindow: 3,
    }).prefetch).toBeNull();
    expect(() => planNativeMediaTimestampPreviewWindowsV2({
      currentLocalFrame: 8,
      overlayDurationInFrames: 8,
      framesPerWindow: 3,
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_CURRENT_FRAME_OUT_OF_RANGE');
    expect(() => planNativeMediaTimestampPreviewWindowsV2({
      currentLocalFrame: 0,
      overlayDurationInFrames: 8,
      framesPerWindow: 1_025,
    })).toThrow('NATIVE_MEDIA_PREVIEW_WINDOW_SIZE_INVALID');
  });
});
