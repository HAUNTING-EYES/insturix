import { OverlayType, type Overlay } from '../types';
import {
  assertNativeMediaTimestampPreviewClassificationLeaseV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  type NativeMediaTimestampPreviewMaterializeCommandV2,
  type NativeMediaTimestampPreviewClassificationLeaseV1,
  type NativeMediaTimestampPreviewReleaseCommandV1,
} from './native-media-timestamp-preview-session-contract-v1';
import {
  assertNativeMediaTimestampPreviewWindowV2,
  planNativeMediaTimestampPreviewWindowsV2,
  type NativeMediaTimestampPreviewWindowV2,
} from './native-media-timestamp-preview-window-v2';

const SESSION_ENDPOINT = '/api/services/editron/media/timestamp-preview/session';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type NativeMediaTimestampPreviewClientDispositionV1 =
  | 'PROBING'
  | 'ORDINARY'
  | 'EXACT'
  | 'BLOCKED';

type NativeMediaTimestampPreviewClientOverlayStateV1 = Readonly<{
  overlayId: string;
  disposition: NativeMediaTimestampPreviewClientDispositionV1;
  reason: string | null;
}>;

type NativeMediaTimestampPreviewClientSnapshotV1 = Readonly<{
  version: number;
  globalReason: string | null;
  cleanupFailureCount: number;
  overlays: readonly NativeMediaTimestampPreviewClientOverlayStateV1[];
  windows: readonly NativeMediaTimestampPreviewWindowV2[];
}>;

type NativeMediaTimestampPreviewClientGateV1 = Readonly<
  | { disposition: 'READY'; overlayId: null; reason: null }
  | { disposition: 'PROBING' | 'BLOCKED'; overlayId: string | null; reason: string }
>;

export type NativeMediaTimestampPreviewSessionClientPortV1 = Readonly<{
  materialize(command: NativeMediaTimestampPreviewMaterializeCommandV2): Promise<unknown>;
  release(command: NativeMediaTimestampPreviewReleaseCommandV1): Promise<unknown>;
}>;

export type NativeMediaTimestampPreviewSessionCoordinatorV1 = Readonly<{
  update(input: Readonly<{
    projectId: string;
    sequenceId: string;
    projectRevision: NativeMediaTimestampPreviewWindowV2['projectRevision'] | null;
    currentFrame: number;
    overlays: readonly Overlay[];
  }>): void;
  retry(overlayId: string | number): void;
  snapshot(): NativeMediaTimestampPreviewClientSnapshotV1;
  subscribe(listener: (snapshot: NativeMediaTimestampPreviewClientSnapshotV1) => void): () => void;
  observedServerNowEpochMs(): number;
  whenIdle(): Promise<void>;
  dispose(): Promise<void>;
}>;

type NormalizedVideo = Readonly<{
  overlayId: string;
  assetId: string | null;
  from: number;
  durationInFrames: number;
  signature: string;
}>;

type WindowRecord = Readonly<{
  window: NativeMediaTimestampPreviewWindowV2;
  requestStartedMonotonicMs: number;
}>;

type ClassificationRecord = Readonly<{
  lease: NativeMediaTimestampPreviewClassificationLeaseV1;
  requestStartedMonotonicMs: number;
}>;

type OverlayState = {
  video: NormalizedVideo;
  generation: number;
  disposition: NativeMediaTimestampPreviewClientDispositionV1;
  reason: string | null;
  classification: ClassificationRecord | null;
  windows: Map<number, WindowRecord>;
  inflight: Map<string, Promise<'WINDOW' | 'ORDINARY' | 'BLOCKED'>>;
  reconciling: boolean;
  reconcileRequested: boolean;
};

type MaterializeResult = Readonly<
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED';
      classificationLease: NativeMediaTimestampPreviewClassificationLeaseV1;
    }
  | { disposition: 'WINDOW_MATERIALIZED'; window: NativeMediaTimestampPreviewWindowV2 }
  | { disposition: 'UNVERIFIABLE'; reason: string }
>;

export function createNativeMediaTimestampPreviewSessionHttpPortV1(
  fetchImplementation: typeof fetch = fetch,
): NativeMediaTimestampPreviewSessionClientPortV1 {
  return Object.freeze({
    async materialize(command) {
      return requestJson(fetchImplementation, 'POST', command, false);
    },
    async release(command) {
      const result = await requestJson(fetchImplementation, 'DELETE', command, true);
      const record = objectRecord(result, 'NATIVE_MEDIA_PREVIEW_RELEASE_RESPONSE_INVALID');
      if (record.disposition !== 'RELEASED') {
        throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_RESPONSE_INVALID');
      }
      return result;
    },
  });
}

export function createNativeMediaTimestampPreviewSessionCoordinatorV1(
  port: NativeMediaTimestampPreviewSessionClientPortV1,
  options: Readonly<{
    framesPerWindow?: number;
    maxActiveVideoOverlays?: number;
    swapReleaseGraceMs?: number;
    monotonicNow?: () => number;
    wallNow?: () => number;
    defer?: (callback: () => void, delayMs: number) => unknown;
    scheduleWake?: (callback: () => void, delayMs: number) => unknown;
    cancelWake?: (handle: unknown) => void;
  }> = {},
): NativeMediaTimestampPreviewSessionCoordinatorV1 {
  const framesPerWindow = positiveIntegerInRange(options.framesPerWindow ?? 120, 1_024);
  const maxActiveVideoOverlays = positiveIntegerInRange(
    options.maxActiveVideoOverlays ?? 4,
    64,
  );
  const swapReleaseGraceMs = nonNegativeInteger(options.swapReleaseGraceMs ?? 2_000);
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const wallNow = options.wallNow ?? Date.now;
  const defer = options.defer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const scheduleWake = options.scheduleWake
    ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelWake = options.cancelWake
    ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  if (!port || typeof port.materialize !== 'function' || typeof port.release !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_PORT_INVALID');
  }

  const states = new Map<string, OverlayState>();
  const listeners = new Set<(snapshot: NativeMediaTimestampPreviewClientSnapshotV1) => void>();
  const tasks = new Set<Promise<unknown>>();
  const queuedReleaseRecords = new Map<string, WindowRecord>();
  let projectScope: string | null = null;
  let lastInput: Parameters<NativeMediaTimestampPreviewSessionCoordinatorV1['update']>[0] | null = null;
  let disposed = false;
  let version = 0;
  let globalReason: string | null = null;
  let cleanupFailureCount = 0;
  let leaseWakeHandle: unknown = null;
  let currentSnapshot = freezeSnapshot();

  function update(input: Parameters<NativeMediaTimestampPreviewSessionCoordinatorV1['update']>[0]) {
    if (disposed) return;
    lastInput = input;
    let normalized;
    try {
      normalized = normalizeUpdate(input, maxActiveVideoOverlays);
    } catch (error) {
      globalReason = knownCode(error) ?? 'SESSION_INPUT_INVALID';
      releaseAllStates();
      publish();
      return;
    }
    globalReason = null;
    const nextProjectScope = JSON.stringify([
      normalized.projectId,
      normalized.sequenceId,
      normalized.projectRevision.value,
      normalized.projectRevision.compatibilityUpdatedAt,
    ]);
    if (projectScope !== null && projectScope !== nextProjectScope) releaseAllStates();
    projectScope = nextProjectScope;

    const active = normalized.videos.filter((video) => (
      normalized.currentFrame >= video.from
      && normalized.currentFrame < video.from + video.durationInFrames
    ));
    const liveIds = new Set(active.map((video) => video.overlayId));
    for (const [overlayId, state] of states) {
      if (!liveIds.has(overlayId)) removeState(overlayId, state);
    }
    for (const video of active) {
      const previous = states.get(video.overlayId);
      if (previous && previous.video.signature !== video.signature) {
        removeState(video.overlayId, previous);
      }
    }

    if (active.length > maxActiveVideoOverlays) {
      globalReason = 'ACTIVE_VIDEO_OVERLAY_LIMIT_EXCEEDED';
      if (!releaseAllStates()) publish();
      return;
    }
    for (const video of active) {
      let state = states.get(video.overlayId);
      if (!state) {
        state = createState(video);
        states.set(video.overlayId, state);
        publish();
      }
      if (state.disposition === 'ORDINARY' && state.classification) {
        try {
          if (classificationDisposition(state.classification) === 'EXPIRED') {
            state.disposition = 'PROBING';
            state.reason = null;
            publish();
          }
        } catch (error) {
          blockState(state, knownCode(error) ?? 'SESSION_CLOCK_INVALID');
        }
      }
      reconcile(
        state,
        normalized.projectId,
        normalized.sequenceId,
        normalized.projectRevision,
        normalized.currentFrame,
      );
    }
  }

  function reconcile(
    state: OverlayState,
    projectId: string,
    sequenceId: string,
    projectRevision: NativeMediaTimestampPreviewWindowV2['projectRevision'],
    currentFrame: number,
  ): void {
    if (state.disposition === 'BLOCKED') return;
    if (state.disposition === 'ORDINARY' && state.classification) {
      try {
        if (classificationDisposition(state.classification) === 'CURRENT') return;
      } catch (error) {
        blockState(state, knownCode(error) ?? 'SESSION_CLOCK_INVALID');
        return;
      }
    }
    if (state.reconciling) {
      state.reconcileRequested = true;
      return;
    }
    state.reconciling = true;
    const task = (async () => {
      const localFrame = currentFrame - state.video.from;
      if (localFrame < 0 || localFrame >= state.video.durationInFrames) return;
      if (!state.video.assetId) {
        blockState(state, 'OVERLAY_ASSET_REQUIRED');
        return;
      }
      const plan = planNativeMediaTimestampPreviewWindowsV2({
        currentLocalFrame: localFrame,
        overlayDurationInFrames: state.video.durationInFrames,
        framesPerWindow,
      });
      pruneWindows(state, new Set([
        plan.active.localStartFrame,
        ...(plan.prefetch ? [plan.prefetch.localStartFrame] : []),
      ]));
      if (state.disposition === 'BLOCKED') return;

      const activeResult = await ensureRange(
        state, projectId, sequenceId, projectRevision, plan.active,
      );
      if (activeResult !== 'WINDOW' || !plan.prefetch) return;
      await ensureRange(state, projectId, sequenceId, projectRevision, plan.prefetch);
    })().catch((error) => {
      if (states.get(state.video.overlayId) === state) {
        blockState(state, knownCode(error) ?? 'SESSION_RECONCILE_FAILED');
      }
    }).finally(() => {
      state.reconciling = false;
      rescheduleLeaseWake();
      if (state.reconcileRequested && !disposed) {
        state.reconcileRequested = false;
        const input = lastInput;
        if (input) update(input);
      }
    });
    track(task);
  }

  async function ensureRange(
    state: OverlayState,
    projectId: string,
    sequenceId: string,
    projectRevision: NativeMediaTimestampPreviewWindowV2['projectRevision'],
    range: Readonly<{ localStartFrame: number; durationInFrames: number }>,
  ): Promise<'WINDOW' | 'ORDINARY' | 'BLOCKED'> {
    const current = state.windows.get(range.localStartFrame);
    if (current
      && current.window.windowDurationInFrames === range.durationInFrames
      && leaseDisposition(current) === 'CURRENT') return 'WINDOW';
    const key = `${state.generation}:${range.localStartFrame}:${range.durationInFrames}`;
    const existing = state.inflight.get(key);
    if (existing) return existing;
    if (!current && state.disposition !== 'ORDINARY') {
      state.disposition = 'PROBING';
      state.reason = null;
      publish();
    }
    const generation = state.generation;
    const signature = state.video.signature;
    const requestStartedMonotonicMs = safeMonotonicNow(monotonicNow);
    const command: NativeMediaTimestampPreviewMaterializeCommandV2 = Object.freeze({
      schemaVersion: 2,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
      projectId,
      sequenceId,
      overlayId: state.video.overlayId,
      expectedProjectRevision: projectRevision,
      windowLocalStartFrame: range.localStartFrame,
      windowDurationInFrames: range.durationInFrames,
    });
    const promise = (async () => {
      let result: MaterializeResult;
      try {
        result = parseMaterializeResult(await port.materialize(command));
      } catch (error) {
        if (isCurrentState(state, generation, signature)) {
          blockState(state, knownCode(error) ?? 'SESSION_REQUEST_FAILED');
        }
        return 'BLOCKED' as const;
      }
      if (result.disposition === 'NOT_APPLICABLE') {
        let classification: ClassificationRecord;
        try {
          classification = validateReturnedClassification({
            lease: result.classificationLease,
            command,
            video: state.video,
            requestStartedMonotonicMs,
            receivedMonotonicMs: safeMonotonicNow(monotonicNow),
          });
        } catch (error) {
          if (isCurrentState(state, generation, signature)) {
            blockState(state, knownCode(error) ?? 'SESSION_CLASSIFICATION_INVALID');
          }
          return 'BLOCKED' as const;
        }
        if (isCurrentState(state, generation, signature)) {
          const removed = [...state.windows.values()];
          state.windows.clear();
          state.classification = classification;
          state.disposition = 'ORDINARY';
          state.reason = null;
          publish();
          deferReleases(removed);
        }
        return 'ORDINARY' as const;
      }
      if (result.disposition === 'UNVERIFIABLE') {
        if (isCurrentState(state, generation, signature)) blockState(state, result.reason);
        return 'BLOCKED' as const;
      }
      let record: WindowRecord;
      try {
        record = validateReturnedWindow({
          window: result.window,
          command,
          video: state.video,
          requestStartedMonotonicMs,
          receivedMonotonicMs: safeMonotonicNow(monotonicNow),
        });
      } catch (error) {
        const rejectedRecord = {
          window: result.window,
          requestStartedMonotonicMs,
        };
        if (disposed) await releaseRecord(rejectedRecord); else deferReleases([rejectedRecord], 0);
        if (isCurrentState(state, generation, signature)) {
          blockState(state, knownCode(error) ?? 'SESSION_RESPONSE_INVALID');
        }
        return 'BLOCKED' as const;
      }
      if (!isCurrentState(state, generation, signature) || disposed) {
        if (disposed) await releaseRecord(record); else deferReleases([record], 0);
        return 'BLOCKED' as const;
      }
      const previous = state.windows.get(range.localStartFrame);
      state.windows.set(range.localStartFrame, record);
      state.classification = null;
      state.disposition = 'EXACT';
      state.reason = null;
      publish();
      if (previous && previous.window.lease.leaseId !== record.window.lease.leaseId) {
        deferReleases([previous]);
      }
      return 'WINDOW' as const;
    })().finally(() => {
      if (state.inflight.get(key) === promise) state.inflight.delete(key);
      rescheduleLeaseWake();
    });
    state.inflight.set(key, promise);
    return promise;
  }

  function retry(overlayId: string | number): void {
    const state = states.get(String(overlayId));
    if (!state || state.disposition !== 'BLOCKED' || disposed) return;
    state.generation += 1;
    state.disposition = 'PROBING';
    state.reason = null;
    publish();
    if (lastInput) update(lastInput);
  }

  function observedServerNowEpochMs(): number {
    let observed: number | null = null;
    for (const state of states.values()) {
      if (state.classification) {
        const candidate = observedFromIssued(
          state.classification.lease.issuedAtEpochMs,
          state.classification.requestStartedMonotonicMs,
        );
        observed = observed === null ? candidate : Math.max(observed, candidate);
      }
      for (const record of state.windows.values()) {
        const candidate = observedFor(record);
        observed = observed === null ? candidate : Math.max(observed, candidate);
      }
    }
    return observed ?? nonNegativeInteger(wallNow());
  }

  async function whenIdle(): Promise<void> {
    while (tasks.size > 0) await Promise.allSettled([...tasks]);
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    if (leaseWakeHandle !== null) cancelWake(leaseWakeHandle);
    leaseWakeHandle = null;
    const records = dedupeWindowRecords([
      ...allWindowRecords(),
      ...queuedReleaseRecords.values(),
    ]);
    states.clear();
    queuedReleaseRecords.clear();
    listeners.clear();
    await Promise.allSettled([
      ...records.map(releaseRecord),
      whenIdle(),
    ]);
  }

  function createState(video: NormalizedVideo): OverlayState {
    return {
      video,
      generation: 1,
      disposition: 'PROBING',
      reason: null,
      classification: null,
      windows: new Map(),
      inflight: new Map(),
      reconciling: false,
      reconcileRequested: false,
    };
  }

  function removeState(overlayId: string, state: OverlayState): void {
    states.delete(overlayId);
    state.generation += 1;
    const records = [...state.windows.values()];
    state.windows.clear();
    state.classification = null;
    publish();
    deferReleases(records);
  }

  function releaseAllStates(): boolean {
    const records = allWindowRecords();
    const changed = states.size > 0;
    for (const state of states.values()) state.generation += 1;
    states.clear();
    if (changed) publish();
    deferReleases(records);
    return changed;
  }

  function pruneWindows(state: OverlayState, wantedStarts: ReadonlySet<number>): void {
    const removed: WindowRecord[] = [];
    for (const [start, record] of state.windows) {
      if (!wantedStarts.has(start) || leaseDisposition(record) === 'EXPIRED') {
        state.windows.delete(start);
        removed.push(record);
      }
    }
    if (removed.length > 0) {
      if (![...state.windows.values()].some((record) => leaseDisposition(record) !== 'EXPIRED')) {
        state.disposition = 'PROBING';
      }
      publish();
      deferReleases(removed);
    }
  }

  function blockState(state: OverlayState, reason: string): void {
    const removed = [...state.windows.values()];
    state.windows.clear();
    state.classification = null;
    state.disposition = 'BLOCKED';
    state.reason = safeReason(reason);
    publish();
    deferReleases(removed);
  }

  function leaseDisposition(record: WindowRecord): 'CURRENT' | 'RENEW_DUE' | 'EXPIRED' {
    const observed = observedFor(record);
    if (observed >= record.window.lease.expiresAtEpochMs) return 'EXPIRED';
    return observed >= record.window.lease.renewAfterEpochMs ? 'RENEW_DUE' : 'CURRENT';
  }

  function observedFor(record: WindowRecord): number {
    return observedFromIssued(
      record.window.lease.issuedAtEpochMs,
      record.requestStartedMonotonicMs,
    );
  }

  function classificationDisposition(
    record: ClassificationRecord,
  ): 'CURRENT' | 'RENEW_DUE' | 'EXPIRED' {
    const observed = observedFromIssued(
      record.lease.issuedAtEpochMs,
      record.requestStartedMonotonicMs,
    );
    if (observed >= record.lease.expiresAtEpochMs) return 'EXPIRED';
    return observed >= record.lease.refreshAfterEpochMs ? 'RENEW_DUE' : 'CURRENT';
  }

  function observedFromIssued(issuedAtEpochMs: number, requestStartedMonotonicMs: number) {
    const elapsed = Math.max(0, safeMonotonicNow(monotonicNow) - requestStartedMonotonicMs);
    return Math.min(Number.MAX_SAFE_INTEGER, issuedAtEpochMs + Math.ceil(elapsed));
  }

  function rescheduleLeaseWake(): void {
    if (leaseWakeHandle !== null) cancelWake(leaseWakeHandle);
    leaseWakeHandle = null;
    if (disposed || !lastInput) return;
    let delayMs: number | null = null;
    for (const state of states.values()) {
      if (state.classification) {
        const observed = observedFromIssued(
          state.classification.lease.issuedAtEpochMs,
          state.classification.requestStartedMonotonicMs,
        );
        let target: number | null = null;
        if (observed < state.classification.lease.refreshAfterEpochMs) {
          target = state.classification.lease.refreshAfterEpochMs;
        } else if (observed < state.classification.lease.expiresAtEpochMs) {
          target = state.inflight.size > 0
            ? state.classification.lease.expiresAtEpochMs
            : observed + 1;
        } else if (state.inflight.size === 0) {
          target = observed + 1;
        }
        if (target !== null) {
          const candidate = Math.max(1, Math.ceil(target - observed));
          delayMs = delayMs === null ? candidate : Math.min(delayMs, candidate);
        }
      }
      for (const record of state.windows.values()) {
        const observed = observedFor(record);
        const target = observed < record.window.lease.renewAfterEpochMs
          ? record.window.lease.renewAfterEpochMs
          : state.inflight.size > 0
            ? record.window.lease.expiresAtEpochMs
            : observed + 1;
        const candidate = Math.max(1, Math.ceil(target - observed));
        delayMs = delayMs === null ? candidate : Math.min(delayMs, candidate);
      }
    }
    if (delayMs === null) return;
    leaseWakeHandle = scheduleWake(() => {
      leaseWakeHandle = null;
      const input = lastInput;
      if (!disposed && input) update(input);
      rescheduleLeaseWake();
    }, delayMs);
  }

  function deferReleases(records: readonly WindowRecord[], delayMs = swapReleaseGraceMs): void {
    for (const record of records) {
      const leaseId = record.window.lease.leaseId;
      if (queuedReleaseRecords.has(leaseId)) continue;
      queuedReleaseRecords.set(leaseId, record);
      defer(() => {
        const queued = queuedReleaseRecords.get(leaseId);
        if (!queued) return;
        queuedReleaseRecords.delete(leaseId);
        const task = releaseRecord(queued);
        track(task);
      }, delayMs);
    }
  }

  async function releaseRecord(record: WindowRecord): Promise<void> {
    try {
      await port.release({
        schemaVersion: 1,
        kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
        window: record.window,
      });
    } catch {
      cleanupFailureCount += 1;
      if (!disposed) publish();
    }
  }

  function allWindowRecords(): WindowRecord[] {
    return [...states.values()].flatMap((state) => [...state.windows.values()]);
  }

  function dedupeWindowRecords(records: readonly WindowRecord[]): WindowRecord[] {
    return [...new Map(records.map((record) => [
      record.window.lease.leaseId,
      record,
    ])).values()];
  }

  function publish(): void {
    if (disposed) return;
    version += 1;
    currentSnapshot = freezeSnapshot();
    for (const listener of listeners) listener(currentSnapshot);
    rescheduleLeaseWake();
  }

  function freezeSnapshot(): NativeMediaTimestampPreviewClientSnapshotV1 {
    return Object.freeze({
      version,
      globalReason,
      cleanupFailureCount,
      overlays: Object.freeze([...states.values()].map((state) => Object.freeze({
        overlayId: state.video.overlayId,
        disposition: state.disposition,
        reason: state.reason,
      }))),
      windows: Object.freeze([...states.values()].flatMap((state) => (
        [...state.windows.values()].map((record) => record.window)
      ))),
    });
  }

  function track<T>(task: Promise<T>): Promise<T> {
    tasks.add(task);
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    );
    return task;
  }

  return Object.freeze({
    update,
    retry,
    snapshot: () => currentSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('NATIVE_MEDIA_PREVIEW_LISTENER_INVALID');
      listeners.add(listener);
      listener(currentSnapshot);
      return () => listeners.delete(listener);
    },
    observedServerNowEpochMs,
    whenIdle,
    dispose,
  });
}

export function selectNativeMediaTimestampPreviewPlayableOverlaysV1(input: Readonly<{
  overlays: readonly Overlay[];
  currentFrame: number;
  snapshot: NativeMediaTimestampPreviewClientSnapshotV1;
}>): Overlay[] {
  const frame = nonNegativeInteger(input.currentFrame);
  const states = new Map(input.snapshot.overlays.map((state) => [state.overlayId, state]));
  const selected: Overlay[] = [];
  let withheld = false;
  for (const overlay of input.overlays) {
    if (overlay.type !== OverlayType.VIDEO
      || frame < overlay.from
      || frame >= overlay.from + overlay.durationInFrames) {
      selected.push(overlay);
      continue;
    }
    if (input.snapshot.globalReason) {
      withheld = true;
      continue;
    }
    const state = states.get(String(overlay.id));
    if (state?.disposition === 'ORDINARY') {
      selected.push(overlay);
      continue;
    }
    if (state?.disposition !== 'EXACT') {
      withheld = true;
      continue;
    }
    const localFrame = frame - overlay.from;
    const covered = input.snapshot.windows.some((window) => (
      window.overlayId === String(overlay.id)
      && localFrame >= window.windowLocalStartFrame
      && localFrame < window.windowLocalStartFrame + window.windowDurationInFrames
    ));
    if (covered) selected.push(overlay); else withheld = true;
  }
  return withheld ? selected : input.overlays as Overlay[];
}

export function selectNativeMediaTimestampPreviewClientGateV1(input: Readonly<{
  overlays: readonly Overlay[];
  currentFrame: number;
  snapshot: NativeMediaTimestampPreviewClientSnapshotV1;
}>): NativeMediaTimestampPreviewClientGateV1 {
  const frame = nonNegativeInteger(input.currentFrame);
  if (input.snapshot.globalReason) {
    return Object.freeze({
      disposition: 'BLOCKED' as const,
      overlayId: null,
      reason: input.snapshot.globalReason,
    });
  }
  const states = new Map(input.snapshot.overlays.map((state) => [state.overlayId, state]));
  for (const overlay of input.overlays) {
    if (overlay.type !== OverlayType.VIDEO
      || frame < overlay.from
      || frame >= overlay.from + overlay.durationInFrames) continue;
    const overlayId = String(overlay.id);
    const state = states.get(overlayId);
    if (!state || state.disposition === 'PROBING') {
      return Object.freeze({ disposition: 'PROBING' as const, overlayId, reason: 'PREPARING' });
    }
    if (state.disposition === 'BLOCKED') {
      return Object.freeze({
        disposition: 'BLOCKED' as const,
        overlayId,
        reason: state.reason ?? 'TIMESTAMP_PREVIEW_BLOCKED',
      });
    }
    if (state.disposition === 'EXACT') {
      const localFrame = frame - overlay.from;
      const covered = input.snapshot.windows.some((window) => (
        window.overlayId === overlayId
        && localFrame >= window.windowLocalStartFrame
        && localFrame < window.windowLocalStartFrame + window.windowDurationInFrames
      ));
      if (!covered) {
        return Object.freeze({ disposition: 'PROBING' as const, overlayId, reason: 'PREPARING' });
      }
    }
  }
  return Object.freeze({ disposition: 'READY' as const, overlayId: null, reason: null });
}

function normalizeUpdate(
  input: Parameters<NativeMediaTimestampPreviewSessionCoordinatorV1['update']>[0],
  maximumActive: number,
) {
  if (!input || !Array.isArray(input.overlays) || input.overlays.length > 100_000) {
    throw new Error('SESSION_INPUT_INVALID');
  }
  const projectId = identifier(input.projectId);
  const sequenceId = identifier(input.sequenceId);
  const projectRevision = normalizeProjectRevision(input.projectRevision);
  const currentFrame = nonNegativeInteger(input.currentFrame);
  const videos = input.overlays
    .filter((overlay) => overlay.type === OverlayType.VIDEO)
    .map(normalizeVideo);
  if (videos.length > maximumActive * 10_000) throw new Error('SESSION_VIDEO_LIMIT_EXCEEDED');
  const ids = new Set<string>();
  for (const video of videos) {
    if (ids.has(video.overlayId)) throw new Error('SESSION_OVERLAY_ID_DUPLICATE');
    ids.add(video.overlayId);
  }
  return Object.freeze({ projectId, sequenceId, projectRevision, currentFrame, videos });
}

function normalizeVideo(overlay: Extract<Overlay, { type: OverlayType.VIDEO }>): NormalizedVideo {
  const overlayId = identifier(String(overlay.id));
  const from = nonNegativeInteger(overlay.from);
  const durationInFrames = positiveIntegerInRange(overlay.durationInFrames, 100_000_000);
  const assetId = typeof overlay.assetId === 'string' && overlay.assetId.trim()
    ? identifier(overlay.assetId)
    : null;
  const signature = JSON.stringify([
    overlayId,
    assetId,
    from,
    durationInFrames,
    overlay.sourceStartFrame ?? null,
    overlay.sourceEndFrame ?? null,
    overlay.videoStartTime ?? null,
    overlay.speed ?? null,
    overlay.speedCurve ?? null,
    overlay.keyframeTracks?.filter((track) => track.property === 'speed') ?? null,
  ]);
  return Object.freeze({ overlayId, assetId, from, durationInFrames, signature });
}

function validateReturnedWindow(input: Readonly<{
  window: NativeMediaTimestampPreviewWindowV2;
  command: NativeMediaTimestampPreviewMaterializeCommandV2;
  video: NormalizedVideo;
  requestStartedMonotonicMs: number;
  receivedMonotonicMs: number;
}>): WindowRecord {
  const window = assertNativeMediaTimestampPreviewWindowV2(input.window);
  if (window.projectId !== input.command.projectId
    || window.sequenceId !== input.command.sequenceId
    || window.overlayId !== input.command.overlayId
    || !sameRevision(window.projectRevision, input.command.expectedProjectRevision)
    || window.overlayFromFrame !== input.video.from
    || window.overlayDurationInFrames !== input.video.durationInFrames
    || window.windowLocalStartFrame !== input.command.windowLocalStartFrame
    || window.windowDurationInFrames !== input.command.windowDurationInFrames) {
    throw new Error('SESSION_WINDOW_SCOPE_MISMATCH');
  }
  const record = Object.freeze({ window, requestStartedMonotonicMs: input.requestStartedMonotonicMs });
  const elapsed = Math.max(0, input.receivedMonotonicMs - input.requestStartedMonotonicMs);
  if (window.lease.issuedAtEpochMs + Math.ceil(elapsed) >= window.lease.expiresAtEpochMs) {
    throw new Error('SESSION_WINDOW_EXPIRED_ON_ARRIVAL');
  }
  return record;
}

function validateReturnedClassification(input: Readonly<{
  lease: NativeMediaTimestampPreviewClassificationLeaseV1;
  command: NativeMediaTimestampPreviewMaterializeCommandV2;
  video: NormalizedVideo;
  requestStartedMonotonicMs: number;
  receivedMonotonicMs: number;
}>): ClassificationRecord {
  const lease = assertNativeMediaTimestampPreviewClassificationLeaseV1(input.lease);
  if (lease.projectId !== input.command.projectId
    || lease.sequenceId !== input.command.sequenceId
    || lease.overlayId !== input.command.overlayId
    || lease.assetId !== input.video.assetId
    || !sameRevision(lease.projectRevision, input.command.expectedProjectRevision)) {
    throw new Error('SESSION_CLASSIFICATION_SCOPE_MISMATCH');
  }
  const elapsed = Math.max(0, input.receivedMonotonicMs - input.requestStartedMonotonicMs);
  const observedOnArrival = Math.min(
    Number.MAX_SAFE_INTEGER,
    lease.issuedAtEpochMs + Math.ceil(elapsed),
  );
  if (observedOnArrival >= lease.expiresAtEpochMs) {
    throw new Error('SESSION_CLASSIFICATION_EXPIRED_ON_ARRIVAL');
  }
  return Object.freeze({
    lease,
    requestStartedMonotonicMs: input.requestStartedMonotonicMs,
  });
}

function parseMaterializeResult(value: unknown): MaterializeResult {
  const record = objectRecord(value, 'SESSION_RESPONSE_INVALID');
  if (record.disposition === 'NOT_APPLICABLE') {
    exactKeys(record, ['classificationLease', 'disposition', 'reason']);
    if (record.reason !== 'ASSET_NOT_TIMESTAMP_MANAGED') throw new Error('SESSION_RESPONSE_INVALID');
    return Object.freeze({
      disposition: 'NOT_APPLICABLE' as const,
      reason: record.reason,
      classificationLease: assertNativeMediaTimestampPreviewClassificationLeaseV1(
        record.classificationLease,
      ),
    });
  }
  if (record.disposition === 'WINDOW_MATERIALIZED') {
    exactKeys(record, [
      'disposition', 'materializedPictureCount', 'sourcePtsCadenceMapStateSha256V3',
      'transformSha256', 'window',
    ]);
    const window = assertNativeMediaTimestampPreviewWindowV2(record.window);
    sha256(record.sourcePtsCadenceMapStateSha256V3);
    sha256(record.transformSha256);
    const pictureCount = positiveIntegerInRange(
      record.materializedPictureCount,
      window.windowDurationInFrames,
    );
    if (pictureCount > window.frames.length) throw new Error('SESSION_RESPONSE_INVALID');
    return Object.freeze({
      disposition: 'WINDOW_MATERIALIZED' as const,
      window,
    });
  }
  if (record.disposition === 'UNVERIFIABLE') {
    exactKeys(record, ['diagnostic', 'disposition', 'reason']);
    if (record.diagnostic !== null) safeReason(record.diagnostic);
    return Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      reason: safeReason(record.reason),
    });
  }
  throw new Error('SESSION_RESPONSE_INVALID');
}

function isCurrentState(state: OverlayState, generation: number, signature: string): boolean {
  return state.generation === generation && state.video.signature === signature;
}

async function requestJson(
  fetchImplementation: typeof fetch,
  method: 'POST' | 'DELETE',
  body: unknown,
  keepalive: boolean,
): Promise<unknown> {
  const response = await fetchImplementation(SESSION_ENDPOINT, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    keepalive,
  });
  const result = await readBoundedJson(response);
  if (!response.ok && !objectRecord(result, 'SESSION_HTTP_RESPONSE_INVALID').disposition) {
    throw new Error(`SESSION_HTTP_${response.status}`);
  }
  return result;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json') || !response.body) {
    throw new Error('SESSION_HTTP_RESPONSE_INVALID');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('SESSION_HTTP_RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  code = 'SESSION_RESPONSE_INVALID',
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(code);
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string') throw new Error('SESSION_IDENTIFIER_INVALID');
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error('SESSION_IDENTIFIER_INVALID');
  }
  return normalized;
}

function safeReason(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9_]{1,160}$/.test(value)) {
    throw new Error('SESSION_REASON_INVALID');
  }
  return value;
}

function normalizeProjectRevision(
  value: unknown,
): NativeMediaTimestampPreviewWindowV2['projectRevision'] {
  if (value === null || value === undefined) {
    throw new Error('SESSION_PROJECT_REVISION_REQUIRED');
  }
  const record = objectRecord(value, 'SESSION_PROJECT_REVISION_INVALID');
  exactKeys(
    record,
    ['compatibilityUpdatedAt', 'schemaVersion', 'value'],
    'SESSION_PROJECT_REVISION_INVALID',
  );
  if (record.schemaVersion !== 1
    || !Number.isSafeInteger(record.value) || Number(record.value) < 0
    || typeof record.compatibilityUpdatedAt !== 'string'
    || record.compatibilityUpdatedAt.length > 128
    || /[\u0000-\u001F\u007F]/.test(record.compatibilityUpdatedAt)
    || Number.isNaN(Date.parse(record.compatibilityUpdatedAt))) {
    throw new Error('SESSION_PROJECT_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: Number(record.value),
    compatibilityUpdatedAt: record.compatibilityUpdatedAt,
  });
}

function sameRevision(
  left: NativeMediaTimestampPreviewWindowV2['projectRevision'],
  right: NativeMediaTimestampPreviewWindowV2['projectRevision'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('SESSION_RESPONSE_INVALID');
  }
  return value;
}

function knownCode(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,160}$/.test(error.message)
    ? error.message
    : null;
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('SESSION_INTEGER_INVALID');
  return Number(value);
}

function positiveIntegerInRange(value: unknown, maximum: number): number {
  const parsed = nonNegativeInteger(value);
  if (parsed < 1 || parsed > maximum) throw new Error('SESSION_INTEGER_INVALID');
  return parsed;
}

function safeMonotonicNow(now: () => number): number {
  const value = now();
  if (!Number.isFinite(value) || value < 0) throw new Error('SESSION_CLOCK_INVALID');
  return value;
}
