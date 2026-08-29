import { describe, expect, it, vi } from 'vitest';

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  createNativeMediaTimestampPreviewSessionCoordinatorV1,
  selectNativeMediaTimestampPreviewClientGateV1,
  selectNativeMediaTimestampPreviewPlayableOverlaysV1,
  type NativeMediaTimestampPreviewSessionClientPortV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-client-v1';
import type { NativeMediaTimestampPreviewMaterializeCommandV2 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';
import { assertNativeMediaTimestampPreviewWindowV2 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

describe('native media timestamp preview session client V1', () => {
  it('allows ordinary playback only after explicit server classification', async () => {
    const harness = coordinatorHarness(async () => ({
      disposition: 'NOT_APPLICABLE', reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
      projectRevision: revision(),
    }));
    harness.coordinator.update(updateInput(10));
    expect(gate(harness, 10).disposition).toBe('PROBING');
    expect(playable(harness, 10)).toEqual([]);

    await harness.coordinator.whenIdle();
    expect(gate(harness, 10)).toEqual({ disposition: 'READY', overlayId: null, reason: null });
    expect(playable(harness, 10)).toHaveLength(1);
    expect(harness.materialize).toHaveBeenCalledTimes(1);
    expect(harness.materialize).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      expectedProjectRevision: revision(),
    }));
  });

  it('blocks missing or mismatched project revision instead of using ordinary playback', async () => {
    const missing = coordinatorHarness(async () => ({
      disposition: 'NOT_APPLICABLE', reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
      projectRevision: revision(),
    }));
    missing.coordinator.update(updateInput(10, null));
    expect(gate(missing, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_PROJECT_REVISION_REQUIRED',
    });
    expect(missing.materialize).not.toHaveBeenCalled();

    const stale = coordinatorHarness(async () => ({
      disposition: 'NOT_APPLICABLE', reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
      projectRevision: { ...revision(), value: 0 },
    }));
    stale.coordinator.update(updateInput(10));
    await stale.coordinator.whenIdle();
    expect(gate(stale, 10)).toMatchObject({
      disposition: 'BLOCKED', reason: 'SESSION_CLASSIFICATION_REVISION_MISMATCH',
    });
    expect(playable(stale, 10)).toEqual([]);
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
      window: expect.objectContaining({ windowLocalStartFrame: 0 }),
    }));

    harness.coordinator.update(updateInput(300));
    expect(harness.coordinator.snapshot().windows).toEqual([]);
    expect(harness.deferred).toHaveLength(2);
    await harness.runDeferred();
    expect(harness.release).toHaveBeenCalledTimes(3);
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
      ? { disposition: 'WINDOW_MATERIALIZED', window: {} }
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
  responder: (command: NativeMediaTimestampPreviewMaterializeCommandV2) => Promise<unknown>,
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
    async runNextWake() {
      const next = [...wakeups.entries()].sort((left, right) => (
        left[1].delayMs - right[1].delayMs
      ))[0];
      if (!next) throw new Error('Expected a scheduled lease wake-up.');
      wakeups.delete(next[0]);
      next[1].callback();
      await coordinator.whenIdle();
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

function materialized(command: NativeMediaTimestampPreviewMaterializeCommandV2, sequence: number) {
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
    lease: {
      leaseId: `nmpwl2_${hex(30_000 + sequence)}`,
      issuedAtEpochMs: 10_000,
      renewAfterEpochMs: 20_000,
      expiresAtEpochMs: 30_000,
    },
    audioOwnership: {
      disposition: 'NO_AUDIO_MAPPING_REQUESTED',
      audioMappingSha256: null,
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
  return {
    disposition: 'WINDOW_MATERIALIZED',
    window,
    sourcePtsCadenceMapStateSha256V3: hex(70_000 + sequence),
    transformSha256: hex(80_000 + sequence),
    materializedPictureCount: command.windowDurationInFrames,
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
