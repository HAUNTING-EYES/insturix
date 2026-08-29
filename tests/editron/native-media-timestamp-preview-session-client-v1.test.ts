import { describe, expect, it, vi } from 'vitest';

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  createNativeMediaTimestampPreviewSessionCoordinatorV1,
  selectNativeMediaTimestampPreviewClientGateV1,
  selectNativeMediaTimestampPreviewPlayableOverlaysV1,
  type NativeMediaTimestampPreviewSessionClientPortV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-client-v1';
import type { NativeMediaTimestampPreviewMaterializeSessionCommandV3 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';
import { assertNativeMediaTimestampPreviewSessionWindowV1 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';
import { assertNativeMediaTimestampPreviewWindowV2 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

describe('native media timestamp preview session client V1', () => {
  it('allows ordinary playback only after explicit server classification', async () => {
    const harness = coordinatorHarness(async (command) => ordinary(command, 1));
    harness.coordinator.update(updateInput(10));
    expect(gate(harness, 10).disposition).toBe('PROBING');
    expect(playable(harness, 10)).toEqual([]);

    await harness.coordinator.whenIdle();
    expect(gate(harness, 10)).toEqual({ disposition: 'READY', overlayId: null, reason: null });
    expect(playable(harness, 10)).toHaveLength(1);
    expect(harness.materialize).toHaveBeenCalledTimes(1);
    expect(harness.materialize).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 3,
      expectedProjectRevision: revision(),
    }));
  });

  it('blocks missing or mismatched project revision instead of using ordinary playback', async () => {
    const missing = coordinatorHarness(async (command) => ordinary(command, 1));
    missing.coordinator.update(updateInput(10, null));
    expect(gate(missing, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_PROJECT_REVISION_REQUIRED',
    });
    expect(missing.materialize).not.toHaveBeenCalled();

    const stale = coordinatorHarness(async (command) => {
      const result = ordinary(command, 1);
      return {
        ...result,
        classificationLease: {
          ...result.classificationLease,
          projectRevision: { ...revision(), value: 0 },
        },
      };
    });
    stale.coordinator.update(updateInput(10));
    await stale.coordinator.whenIdle();
    expect(gate(stale, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_CLASSIFICATION_SCOPE_MISMATCH',
    });
    expect(playable(stale, 10)).toEqual([]);
  });

  it('rejects wrong-asset and expired-on-arrival ordinary classifications', async () => {
    const wrongAsset = coordinatorHarness(async (command) => {
      const result = ordinary(command, 1);
      return {
        ...result,
        classificationLease: { ...result.classificationLease, assetId: 'asset-other' },
      };
    });
    wrongAsset.coordinator.update(updateInput(10));
    await wrongAsset.coordinator.whenIdle();
    expect(gate(wrongAsset, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_CLASSIFICATION_SCOPE_MISMATCH',
    });
    expect(playable(wrongAsset, 10)).toEqual([]);

    let finishRequest!: () => void;
    const expired = coordinatorHarness((command) => new Promise((resolve) => {
      finishRequest = () => resolve(ordinary(command, 1));
    }));
    expired.coordinator.update(updateInput(10));
    expired.setMonotonic(20_101);
    finishRequest();
    await expired.coordinator.whenIdle();
    expect(gate(expired, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_CLASSIFICATION_EXPIRED_ON_ARRIVAL',
    });
    expect(playable(expired, 10)).toEqual([]);
  });

  it('renews ordinary classification while paused and blocks at hard expiry', async () => {
    let request = 0;
    let finishRenewal!: () => void;
    const harness = coordinatorHarness((command) => {
      request += 1;
      if (request === 1) return Promise.resolve(ordinary(command, 1));
      return new Promise((resolve) => {
        finishRenewal = () => {
          const renewed = ordinary(command, 2);
          resolve({
            ...renewed,
            classificationLease: {
              ...renewed.classificationLease,
              refreshAfterEpochMs: renewed.classificationLease.issuedAtEpochMs + 15_000,
              expiresAtEpochMs: renewed.classificationLease.issuedAtEpochMs + 25_000,
            },
          });
        };
      });
    });
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();
    expect(gate(harness, 10).disposition).toBe('READY');

    harness.setMonotonic(10_101);
    await harness.runNextWake(false);
    expect(harness.materialize).toHaveBeenCalledTimes(2);
    expect(gate(harness, 10).disposition).toBe('READY');

    harness.setMonotonic(20_101);
    await harness.runNextWake(false);
    expect(gate(harness, 10).disposition).toBe('PROBING');
    finishRenewal();
    await harness.coordinator.whenIdle();
    expect(gate(harness, 10).disposition).toBe('READY');
  });

  it('materializes active and prefetch windows, then swaps and releases after a seek', async () => {
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => (
      materialized(command, responseSequence++)
    ));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();

    expect(harness.coordinator.snapshot().windows.map((window) => window.windowLocalStartFrame))
      .toEqual([0, 120]);
    expect(harness.coordinator.snapshot().sessionWindows.every((window) => (
      window.audioWindow?.segments.some((segment) => segment.kind === 'PCM') === true
    ))).toBe(true);
    expect(harness.materialize).toHaveBeenCalledTimes(2);
    expect(gate(harness, 10).disposition).toBe('READY');
    expect(playable(harness, 10)).toHaveLength(1);
    expect(harness.coordinator.observedServerNowEpochMs()).toBe(10_000);

    harness.coordinator.update(updateInput(130));
    await harness.coordinator.whenIdle();
    expect(harness.coordinator.snapshot().windows.map((window) => window.windowLocalStartFrame))
      .toEqual([120, 240]);
    expect(harness.deferred).toHaveLength(1);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      sessionWindow: expect.objectContaining({
        pictureWindow: expect.objectContaining({ windowLocalStartFrame: 0 }),
        audioWindow: expect.objectContaining({ windowLocalStartFrame: 0 }),
      }),
    }));

    harness.coordinator.update(updateInput(300));
    expect(harness.coordinator.snapshot().windows).toEqual([]);
    expect(harness.deferred).toHaveLength(2);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledTimes(3);
  });

  it('retains valid paired video-only windows without inventing audio', async () => {
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => (
      materialized(command, responseSequence++, false)
    ));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();

    expect(gate(harness, 10).disposition).toBe('READY');
    expect(harness.coordinator.snapshot().sessionWindows).toHaveLength(2);
    expect(harness.coordinator.snapshot().sessionWindows.every((window) => (
      window.audioWindow === null
      && window.pictureWindow.audioOwnership.disposition === 'NO_AUDIO_MAPPING_REQUESTED'
    ))).toBe(true);

    await harness.coordinator.dispose();
    expect(harness.release).toHaveBeenCalledWith(expect.objectContaining({
      sessionWindow: expect.objectContaining({ audioWindow: null }),
    }));
  });

  it('discards prior windows and rematerializes when the project revision advances', async () => {
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => (
      materialized(command, responseSequence++)
    ));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();

    const nextRevision = {
      ...revision(),
      value: 2,
      compatibilityUpdatedAt: '2026-08-29T00:00:01.000Z',
    };
    harness.coordinator.update(updateInput(10, nextRevision));
    await harness.coordinator.whenIdle();

    expect(harness.materialize).toHaveBeenCalledTimes(4);
    expect(harness.coordinator.snapshot().windows).toHaveLength(2);
    expect(harness.coordinator.snapshot().windows.every((window) => (
      window.projectRevision.value === nextRevision.value
      && window.projectRevision.compatibilityUpdatedAt
        === nextRevision.compatibilityUpdatedAt
    ))).toBe(true);
    expect(harness.deferred).toHaveLength(2);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledTimes(2);
  });

  it('blocks an unsafe result, never falls through, and supports explicit retry', async () => {
    let unsafe = true;
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => unsafe
      ? {
          disposition: 'UNVERIFIABLE',
          reason: 'EXACT_AUDIO_MAPPING_REQUIRED',
          diagnostic: null,
        }
      : materialized(command, responseSequence++));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();
    expect(gate(harness, 10)).toEqual({
      disposition: 'BLOCKED', overlayId: '42', reason: 'EXACT_AUDIO_MAPPING_REQUIRED',
    });
    expect(playable(harness, 10)).toEqual([]);

    unsafe = false;
    harness.coordinator.retry('42');
    await harness.coordinator.whenIdle();
    expect(gate(harness, 10).disposition).toBe('READY');
    expect(harness.coordinator.snapshot().windows).toHaveLength(2);
  });

  it('renews from a conservative monotonic clock and releases superseded leases', async () => {
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => (
      materialized(command, responseSequence++)
    ));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();
    const originalLeases = harness.coordinator.snapshot().windows.map((window) => window.lease.leaseId);

    expect(harness.wakeups.size).toBe(1);
    harness.setMonotonic(10_101);
    await harness.runNextWake();
    const renewedLeases = harness.coordinator.snapshot().windows.map((window) => window.lease.leaseId);
    expect(renewedLeases).not.toEqual(originalLeases);
    expect(harness.materialize).toHaveBeenCalledTimes(4);
    expect(harness.deferred).toHaveLength(2);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledTimes(2);
  });

  it('blocks malformed responses and releases all retained windows on disposal', async () => {
    let malformed = true;
    let responseSequence = 1;
    const harness = coordinatorHarness(async (command) => malformed
      ? { disposition: 'SESSION_WINDOW_MATERIALIZED', sessionWindow: {} }
      : materialized(command, responseSequence++));
    harness.coordinator.update(updateInput(10));
    await harness.coordinator.whenIdle();
    expect(gate(harness, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_RESPONSE_INVALID',
    });

    malformed = false;
    harness.coordinator.retry('42');
    await harness.coordinator.whenIdle();
    expect(harness.coordinator.snapshot().windows).toHaveLength(2);
    harness.coordinator.update(updateInput(130));
    await harness.coordinator.whenIdle();
    expect(harness.deferred).toHaveLength(1);
    await harness.coordinator.dispose();
    expect(harness.release).toHaveBeenCalledTimes(3);
    expect(harness.wakeups.size).toBe(0);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledTimes(3);
  });

  it('waits for in-flight materialization and releases a late window on disposal', async () => {
    let finishMaterialization!: () => void;
    const harness = coordinatorHarness((command) => new Promise((resolve) => {
      finishMaterialization = () => resolve(materialized(command, 1));
    }));
    harness.coordinator.update(updateInput(10));

    const disposal = harness.coordinator.dispose();
    finishMaterialization();
    await disposal;
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.wakeups.size).toBe(0);
  });
});

function coordinatorHarness(
  responder: (command: NativeMediaTimestampPreviewMaterializeSessionCommandV3) => Promise<unknown>,
) {
  let monotonic = 100;
  const deferred: Array<() => void> = [];
  let nextWakeHandle = 1;
  const wakeups = new Map<number, { callback: () => void; delayMs: number }>();
  const materialize = vi.fn(responder);
  const release = vi.fn(async () => ({ disposition: 'RELEASED' }));
  const port: NativeMediaTimestampPreviewSessionClientPortV1 = { materialize, release };
  const coordinator = createNativeMediaTimestampPreviewSessionCoordinatorV1(port, {
    framesPerWindow: 120,
    swapReleaseGraceMs: 2_000,
    monotonicNow: () => monotonic,
    wallNow: () => 1_000,
    defer: (callback) => deferred.push(callback),
    scheduleWake: (callback, delayMs) => {
      const handle = nextWakeHandle++;
      wakeups.set(handle, { callback, delayMs });
      return handle;
    },
    cancelWake: (handle) => {
      wakeups.delete(Number(handle));
    },
  });
  return {
    coordinator,
    materialize,
    release,
    deferred,
    wakeups,
    setMonotonic(value: number) { monotonic = value; },
    async runNextWake(waitForIdle = true) {
      const next = [...wakeups.entries()].sort((left, right) => (
        left[1].delayMs - right[1].delayMs
      ))[0];
      if (!next) throw new Error('Expected a scheduled lease wake-up.');
      wakeups.delete(next[0]);
      next[1].callback();
      if (waitForIdle) await coordinator.whenIdle();
    },
    async runDeferred() {
      while (deferred.length > 0) deferred.shift()!();
      await coordinator.whenIdle();
    },
  };
}

function updateInput(
  currentFrame: number,
  projectRevision: ReturnType<typeof revision> | null = revision(),
) {
  return {
    projectId: 'project-1', sequenceId: 'main', projectRevision,
    currentFrame, overlays: [videoOverlay()],
  } as const;
}

function videoOverlay(): Overlay {
  return {
    id: 42, type: OverlayType.VIDEO, content: 'video', assetId: 'asset-1',
    from: 0, durationInFrames: 300, sourceStartFrame: 0, sourceEndFrame: 300,
    width: 1920, height: 1080, left: 0, top: 0, row: 0, rotation: 0,
    isDragging: false, styles: {},
  };
}

function materialized(
  command: NativeMediaTimestampPreviewMaterializeSessionCommandV3,
  sequence: number,
  withAudio = true,
) {
  const lease = {
    leaseId: `nmpwl2_${hex(30_000 + sequence)}`,
    issuedAtEpochMs: 10_000,
    renewAfterEpochMs: 20_000,
    expiresAtEpochMs: 30_000,
  };
  const audioMappingSha256 = withAudio ? hex(90_000 + sequence) : null;
  const window = assertNativeMediaTimestampPreviewWindowV2({
    schemaVersion: 2,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
    receiptSha256: hex(10_000 + sequence),
    decoderRequestSha256: hex(20_000 + sequence),
    projectId: command.projectId,
    sequenceId: command.sequenceId,
    overlayId: command.overlayId,
    projectRevision: command.expectedProjectRevision,
    overlayFromFrame: 0,
    overlayDurationInFrames: 300,
    windowLocalStartFrame: command.windowLocalStartFrame,
    windowDurationInFrames: command.windowDurationInFrames,
    lease,
    audioOwnership: {
      disposition: withAudio ? 'EXACT_SAMPLE_MAPPING_BOUND' : 'NO_AUDIO_MAPPING_REQUESTED',
      audioMappingSha256,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: Array.from({ length: command.windowDurationInFrames }, (_, offset) => {
      const localFrame = command.windowLocalStartFrame + offset;
      return {
        localFrame,
        projectFrame: localFrame,
        pictureHandle: `nmpv1_${hex(40_000 + sequence * 2_000 + offset)}`,
        decoderPictureRequestSha256: hex(50_000 + sequence * 2_000 + offset),
        decodedPictureContentSha256: hex(60_000 + sequence * 2_000 + offset),
      };
    }),
  });
  const sampleStart = BigInt(command.windowLocalStartFrame) * BigInt(1_600);
  const sampleEnd = BigInt(
    command.windowLocalStartFrame + command.windowDurationInFrames,
  ) * BigInt(1_600);
  const sessionWindow = assertNativeMediaTimestampPreviewSessionWindowV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_V1',
    pictureWindow: window,
    audioWindow: withAudio ? {
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_V1',
      windowSha256: hex(100_000 + sequence),
      projectId: command.projectId,
      sequenceId: command.sequenceId,
      overlayId: command.overlayId,
      projectRevision: command.expectedProjectRevision,
      audioMappingSha256: audioMappingSha256!,
      audioSampleEpochMapSha256: hex(110_000 + sequence),
      decodedPcmSha256: hex(120_000 + sequence),
      sampleRate: 48_000,
      channelCount: 2,
      windowLocalStartFrame: command.windowLocalStartFrame,
      windowDurationInFrames: command.windowDurationInFrames,
      windowProjectStartFrame: command.windowLocalStartFrame,
      windowProjectEndExclusiveFrame:
        command.windowLocalStartFrame + command.windowDurationInFrames,
      canonicalWindowStartSamplePosition: samplePosition(sampleStart),
      canonicalWindowEndExclusiveSamplePosition: samplePosition(sampleEnd),
      lease,
      segments: [{
        kind: 'PCM',
        audioEpochId: 'audio-epoch-1',
        audioHandle: `nmpa1_${hex(130_000 + sequence)}`,
        segmentIdentitySha256: hex(140_000 + sequence),
        sourceStartSampleFrame: sampleStart.toString(),
        sourceEndExclusiveSampleFrame: sampleEnd.toString(),
        decodedStartSamplePosition: samplePosition(sampleStart),
        decodedEndExclusiveSamplePosition: samplePosition(sampleEnd),
        timelineStartSamplePosition: samplePosition(sampleStart),
        timelineEndExclusiveSamplePosition: samplePosition(sampleEnd),
      }],
    } : null,
  });
  return {
    disposition: 'SESSION_WINDOW_MATERIALIZED',
    sessionWindow,
    sourcePtsCadenceMapStateSha256V3: hex(70_000 + sequence),
    transformSha256: hex(80_000 + sequence),
    materializedPictureCount: command.windowDurationInFrames,
    materializedAudioSegmentCount: withAudio ? 1 : 0,
  };
}

function ordinary(
  command: NativeMediaTimestampPreviewMaterializeSessionCommandV3,
  sequence: number,
) {
  const issuedAtEpochMs = 10_000 + (sequence - 1) * 30_000;
  return {
    disposition: 'NOT_APPLICABLE',
    reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
    classificationLease: {
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_V1',
      decision: 'ASSET_NOT_TIMESTAMP_MANAGED',
      projectId: command.projectId,
      sequenceId: command.sequenceId,
      overlayId: command.overlayId,
      assetId: 'asset-1',
      projectRevision: command.expectedProjectRevision,
      decisionStateSha256: hex(90_000 + sequence),
      issuedAtEpochMs,
      refreshAfterEpochMs: issuedAtEpochMs + 10_000,
      expiresAtEpochMs: issuedAtEpochMs + 20_000,
    },
  };
}

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 1,
    compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function gate(
  harness: ReturnType<typeof coordinatorHarness>,
  currentFrame: number,
) {
  return selectNativeMediaTimestampPreviewClientGateV1({
    overlays: [videoOverlay()], currentFrame, snapshot: harness.coordinator.snapshot(),
  });
}

function playable(
  harness: ReturnType<typeof coordinatorHarness>,
  currentFrame: number,
) {
  return selectNativeMediaTimestampPreviewPlayableOverlaysV1({
    overlays: [videoOverlay()], currentFrame, snapshot: harness.coordinator.snapshot(),
  });
}

function hex(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function samplePosition(value: bigint) {
  return {
    numerator: value.toString(),
    denominator: '1',
    disposition: 'INTEGER_SAMPLE_FRAME',
  } as const;
}
