import {
  planNativeMediaTimestampPreviewAudioScheduleV1,
  type NativeMediaTimestampPreviewAudioRuntimeV1,
  type NativeMediaTimestampPreviewAudioScheduleEntryV1,
  type NativeMediaTimestampPreviewDecodedAudioSegmentV1,
  type NativeMediaTimestampPreviewScheduledAudioV1,
} from './native-media-timestamp-preview-audio-scheduler-v1';
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  type NativeMediaTimestampPreviewSessionWindowV1,
} from './native-media-timestamp-preview-session-window-v1';

export type NativeMediaTimestampPreviewAudioSessionSnapshotV1 = Readonly<{
  version: number;
  disposition: 'READY' | 'PREPARING' | 'BLOCKED';
  reason: string | null;
  requiredSegmentCount: number;
  loadedSegmentCount: number;
  scheduledSegmentCount: number;
  prefetchFailureCount: number;
}>;

export type NativeMediaTimestampPreviewAudioSessionCoordinatorV1 = Readonly<{
  update(input: Readonly<{
    sessionWindows: readonly NativeMediaTimestampPreviewSessionWindowV1[];
    currentProjectFrame: number;
    playing: boolean;
    playbackRate: number;
    transportEpoch: number;
    gainsByOverlayId?: Readonly<Record<string, number>>;
  }>): void;
  retry(): void;
  snapshot(): NativeMediaTimestampPreviewAudioSessionSnapshotV1;
  subscribe(
    listener: (snapshot: NativeMediaTimestampPreviewAudioSessionSnapshotV1) => void,
  ): () => void;
  whenIdle(): Promise<void>;
  dispose(): Promise<void>;
}>;

type NormalizedInputV1 = Readonly<{
  sessionWindows: readonly NativeMediaTimestampPreviewSessionWindowV1[];
  currentProjectFrame: number;
  playing: boolean;
  playbackRate: number;
  transportEpoch: number;
  gainsByOverlayId: Readonly<Record<string, number>>;
  entries: readonly NativeMediaTimestampPreviewAudioScheduleEntryV1[];
  requiredIdentities: ReadonlySet<string>;
  scopeKey: string;
}>;

type TransportAnchorV1 = Readonly<{
  key: string;
  projectFrame: number;
  contextStartTimeSeconds: number;
  playbackRate: number;
}>;

type ScheduledRecordV1 = Readonly<{
  entry: NativeMediaTimestampPreviewAudioScheduleEntryV1;
  handle: NativeMediaTimestampPreviewScheduledAudioV1;
}>;

export function createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(
  runtime: NativeMediaTimestampPreviewAudioRuntimeV1,
  options: Readonly<{ schedulingLeadSeconds?: number }> = {},
): NativeMediaTimestampPreviewAudioSessionCoordinatorV1 {
  if (!runtime
    || typeof runtime.contextTimeSeconds !== 'function'
    || typeof runtime.resume !== 'function'
    || typeof runtime.loadSegment !== 'function'
    || typeof runtime.schedule !== 'function'
    || typeof runtime.close !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RUNTIME_INVALID');
  }
  const schedulingLeadSeconds = finiteInRange(
    options.schedulingLeadSeconds ?? 0,
    0,
    0.25,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULING_LEAD_INVALID',
  );
  const listeners = new Set<(
    snapshot: NativeMediaTimestampPreviewAudioSessionSnapshotV1,
  ) => void>();
  const tasks = new Set<Promise<unknown>>();
  const descriptors = new Map<string, NativeMediaTimestampPreviewAudioScheduleEntryV1>();
  const decoded = new Map<string, NativeMediaTimestampPreviewDecodedAudioSegmentV1>();
  const failures = new Map<string, Readonly<{ audioHandle: string; reason: string }>>();
  const loads = new Map<string, Promise<void>>();
  const scheduled = new Map<string, ScheduledRecordV1>();
  let input: NormalizedInputV1 | null = null;
  let anchor: TransportAnchorV1 | null = null;
  let startingTransportKey: string | null = null;
  let generation = 0;
  let disposed = false;
  let version = 0;
  let currentSnapshot = freezeSnapshot('READY', null, new Set());

  function update(value: Parameters<NativeMediaTimestampPreviewAudioSessionCoordinatorV1['update']>[0]) {
    if (disposed) return;
    let normalized: NormalizedInputV1;
    try {
      normalized = normalizeInput(value);
    } catch (error) {
      generation += 1;
      input = null;
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
      descriptors.clear();
      decoded.clear();
      failures.clear();
      publish('BLOCKED', knownCode(error) ?? 'NATIVE_MEDIA_PREVIEW_AUDIO_INPUT_INVALID', new Set());
      return;
    }
    const scopeChanged = input !== null && input.scopeKey !== normalized.scopeKey;
    input = normalized;
    if (scopeChanged) {
      generation += 1;
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
      descriptors.clear();
      decoded.clear();
      failures.clear();
    }
    refreshDescriptors(normalized);
    startMissingLoads();
    if (!normalized.playing) {
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
    }
    reconcile();
  }

  function refreshDescriptors(current: NormalizedInputV1): void {
    const desired = new Set(current.entries.map((entry) => entry.segmentIdentitySha256));
    descriptors.clear();
    for (const entry of current.entries) descriptors.set(entry.segmentIdentitySha256, entry);
    for (const identity of decoded.keys()) {
      if (!desired.has(identity)) decoded.delete(identity);
    }
    for (const identity of failures.keys()) {
      if (!desired.has(identity)) failures.delete(identity);
    }
  }

  function startMissingLoads(): void {
    for (const [identity, entry] of descriptors) {
      if (decoded.has(identity)) continue;
      const failure = failures.get(identity);
      if (failure?.audioHandle === entry.audioHandle) continue;
      if (failure) failures.delete(identity);
      const requestedScopeKey = input?.scopeKey;
      if (!requestedScopeKey) continue;
      const loadKey = requestedScopeKey + ':' + identity + ':' + entry.audioHandle;
      if (loads.has(loadKey)) continue;
      const task = runtime.loadSegment(entry).then((value) => {
        if (disposed || input?.scopeKey !== requestedScopeKey) return;
        const latest = descriptors.get(identity);
        if (!latest) return;
        decoded.set(identity, value);
        failures.delete(identity);
      }).catch((error) => {
        if (disposed || input?.scopeKey !== requestedScopeKey || decoded.has(identity)) return;
        const latest = descriptors.get(identity);
        if (latest?.audioHandle === entry.audioHandle) {
          failures.set(identity, Object.freeze({
            audioHandle: entry.audioHandle,
            reason: knownCode(error) ?? 'NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_LOAD_FAILED',
          }));
        }
      }).finally(() => {
        loads.delete(loadKey);
        if (!disposed) reconcile();
      });
      loads.set(loadKey, task);
      track(task);
    }
  }

  function reconcile(): void {
    if (disposed || !input) return;
    startMissingLoads();
    const required = input.requiredIdentities;
    const failure = [...required].map((identity) => failures.get(identity)).find(Boolean);
    if (failure) {
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
      publish('BLOCKED', failure.reason, required);
      return;
    }
    if ([...required].some((identity) => !decoded.has(identity))) {
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
      publish('PREPARING', 'NATIVE_MEDIA_PREVIEW_AUDIO_PREPARING', required);
      return;
    }
    if (!input.playing) {
      publish('READY', null, required);
      return;
    }
    if (input.entries.length === 0) {
      stopScheduled();
      anchor = null;
      startingTransportKey = null;
      publish('READY', null, required);
      return;
    }
    ensureTransport(input, required);
  }

  function ensureTransport(current: NormalizedInputV1, required: ReadonlySet<string>): void {
    const key = transportKey(current);
    if (anchor?.key === key) {
      scheduleFromAnchor(current, required);
      return;
    }
    if (startingTransportKey === key) return;
    generation += 1;
    const expectedGeneration = generation;
    stopScheduled();
    anchor = null;
    startingTransportKey = key;
    const task = (async () => {
      await runtime.resume();
      if (disposed || generation !== expectedGeneration || !input
        || transportKey(input) !== key || !input.playing) return;
      anchor = Object.freeze({
        key,
        projectFrame: input.currentProjectFrame,
        contextStartTimeSeconds: runtime.contextTimeSeconds() + schedulingLeadSeconds,
        playbackRate: input.playbackRate,
      });
      scheduleFromAnchor(input, input.requiredIdentities);
    })().catch((error) => {
      if (!disposed && generation === expectedGeneration) {
        stopScheduled();
        anchor = null;
        publish(
          'BLOCKED',
          knownCode(error) ?? 'NATIVE_MEDIA_PREVIEW_AUDIO_TRANSPORT_START_FAILED',
          input?.requiredIdentities ?? new Set(),
        );
      }
    }).finally(() => {
      if (startingTransportKey === key) startingTransportKey = null;
    });
    track(task);
  }

  function scheduleFromAnchor(
    current: NormalizedInputV1,
    required: ReadonlySet<string>,
  ): void {
    if (!anchor || anchor.key !== transportKey(current)) return;
    let entries: readonly NativeMediaTimestampPreviewAudioScheduleEntryV1[];
    try {
      entries = planNativeMediaTimestampPreviewAudioScheduleV1({
        sessionWindows: current.sessionWindows,
        currentProjectFrame: anchor.projectFrame,
        contextStartTimeSeconds: anchor.contextStartTimeSeconds,
        playbackRate: anchor.playbackRate,
        gainsByOverlayId: current.gainsByOverlayId,
      });
      const wanted = new Set(entries.map((entry) => entry.scheduleId));
      for (const [scheduleId, record] of scheduled) {
        if (!wanted.has(scheduleId)) {
          record.handle.stop();
          scheduled.delete(scheduleId);
        }
      }
      for (const entry of entries) {
        const existing = scheduled.get(entry.scheduleId);
        if (existing) {
          existing.handle.setGain(entry.gain, runtime.contextTimeSeconds());
          continue;
        }
        const media = decoded.get(entry.segmentIdentitySha256);
        if (!media) continue;
        scheduled.set(entry.scheduleId, Object.freeze({
          entry,
          handle: runtime.schedule(entry, media),
        }));
      }
    } catch (error) {
      stopScheduled();
      anchor = null;
      publish(
        'BLOCKED',
        knownCode(error) ?? 'NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_FAILED',
        required,
      );
      return;
    }
    publish('READY', null, required);
  }

  function retry(): void {
    if (disposed || !input) return;
    failures.clear();
    generation += 1;
    stopScheduled();
    anchor = null;
    startingTransportKey = null;
    startMissingLoads();
    reconcile();
  }

  async function whenIdle(): Promise<void> {
    while (tasks.size > 0) await Promise.allSettled([...tasks]);
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    generation += 1;
    stopScheduled();
    descriptors.clear();
    decoded.clear();
    failures.clear();
    listeners.clear();
    await whenIdle();
    await runtime.close();
  }

  function stopScheduled(): void {
    for (const record of scheduled.values()) record.handle.stop();
    scheduled.clear();
  }

  function publish(
    disposition: NativeMediaTimestampPreviewAudioSessionSnapshotV1['disposition'],
    reason: string | null,
    required: ReadonlySet<string>,
  ): void {
    const next = freezeSnapshot(disposition, reason, required);
    if (sameSnapshot(currentSnapshot, next)) return;
    version += 1;
    currentSnapshot = Object.freeze({ ...next, version });
    for (const listener of listeners) listener(currentSnapshot);
  }

  function freezeSnapshot(
    disposition: NativeMediaTimestampPreviewAudioSessionSnapshotV1['disposition'],
    reason: string | null,
    required: ReadonlySet<string>,
  ): NativeMediaTimestampPreviewAudioSessionSnapshotV1 {
    const desired = new Set(descriptors.keys());
    return Object.freeze({
      version,
      disposition,
      reason,
      requiredSegmentCount: required.size,
      loadedSegmentCount: [...desired].filter((identity) => decoded.has(identity)).length,
      scheduledSegmentCount: scheduled.size,
      prefetchFailureCount: [...failures.keys()].filter(
        (identity) => desired.has(identity) && !required.has(identity),
      ).length,
    });
  }

  return Object.freeze({
    update,
    retry,
    snapshot: () => currentSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_LISTENER_INVALID');
      }
      listeners.add(listener);
      listener(currentSnapshot);
      return () => listeners.delete(listener);
    },
    whenIdle,
    dispose,
  });

  function track<T>(task: Promise<T>): Promise<T> {
    tasks.add(task);
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    );
    return task;
  }
}

function normalizeInput(
  value: Parameters<NativeMediaTimestampPreviewAudioSessionCoordinatorV1['update']>[0],
): NormalizedInputV1 {
  if (!value || !Array.isArray(value.sessionWindows) || typeof value.playing !== 'boolean') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_INPUT_INVALID');
  }
  const currentProjectFrame = nonNegativeSafeInteger(
    value.currentProjectFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CURRENT_FRAME_INVALID',
  );
  const transportEpoch = nonNegativeSafeInteger(
    value.transportEpoch,
    'NATIVE_MEDIA_PREVIEW_AUDIO_TRANSPORT_EPOCH_INVALID',
  );
  const gainsByOverlayId = normalizeGains(value.gainsByOverlayId);
  const sessionWindows = Object.freeze(
    value.sessionWindows.map(assertNativeMediaTimestampPreviewSessionWindowV1),
  );
  const entries = planNativeMediaTimestampPreviewAudioScheduleV1({
    sessionWindows,
    currentProjectFrame,
    contextStartTimeSeconds: 0,
    playbackRate: value.playbackRate,
    gainsByOverlayId,
  });
  const activeWindows = sessionWindows.filter(({ pictureWindow }) => {
    const start = pictureWindow.overlayFromFrame + pictureWindow.windowLocalStartFrame;
    return currentProjectFrame >= start
      && currentProjectFrame < start + pictureWindow.windowDurationInFrames;
  });
  const requiredIdentities = new Set(
    planNativeMediaTimestampPreviewAudioScheduleV1({
      sessionWindows: activeWindows,
      currentProjectFrame,
      contextStartTimeSeconds: 0,
      playbackRate: value.playbackRate,
      gainsByOverlayId,
    }).map((entry) => entry.segmentIdentitySha256),
  );
  return Object.freeze({
    sessionWindows,
    currentProjectFrame,
    playing: value.playing,
    playbackRate: value.playbackRate,
    transportEpoch,
    gainsByOverlayId,
    entries,
    requiredIdentities,
    scopeKey: scopeKey(sessionWindows),
  });
}

function normalizeGains(
  value: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_GAINS_INVALID');
  }
  const result: Record<string, number> = {};
  for (const [overlayId, gain] of Object.entries(value)) {
    if (!overlayId || overlayId.length > 256 || /[\u0000-\u001F\u007F]/.test(overlayId)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_GAINS_INVALID');
    }
    result[overlayId] = finiteInRange(
      gain,
      0,
      4,
      'NATIVE_MEDIA_PREVIEW_AUDIO_GAINS_INVALID',
    );
  }
  return Object.freeze(result);
}

function scopeKey(windows: readonly NativeMediaTimestampPreviewSessionWindowV1[]): string {
  const first = windows[0]?.pictureWindow;
  return first
    ? JSON.stringify([
        first.projectId,
        first.sequenceId,
        first.projectRevision.value,
        first.projectRevision.compatibilityUpdatedAt,
      ])
    : 'EMPTY';
}

function transportKey(input: NormalizedInputV1): string {
  return JSON.stringify([
    input.scopeKey,
    input.transportEpoch,
    input.playbackRate,
  ]);
}

function sameSnapshot(
  left: NativeMediaTimestampPreviewAudioSessionSnapshotV1,
  right: NativeMediaTimestampPreviewAudioSessionSnapshotV1,
): boolean {
  return left.disposition === right.disposition
    && left.reason === right.reason
    && left.requiredSegmentCount === right.requiredSegmentCount
    && left.loadedSegmentCount === right.loadedSegmentCount
    && left.scheduledSegmentCount === right.scheduledSegmentCount
    && left.prefetchFailureCount === right.prefetchFailureCount;
}

function knownCode(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,160}$/.test(error.message)
    ? error.message
    : null;
}

function finiteInRange(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}
