import { mapCutFrameToOriginalFrame } from './brief-executor';
import {
  buildAtomicMomentBundle,
  momentBundleToSignalMap,
  type AtomicMomentBundle,
  type MomentAtom,
  type MomentAtomChannel,
} from './moment-bundle';
import type { EventSignal, SignalSnapshot, SignalTimeline } from './signal-registry';

export interface UnifiedMomentSourceClip {
  from: number;
  durationInFrames: number;
  sourceStartFrame?: number;
}

export interface UnifiedMomentTranscriptContext {
  events: EventSignal[];
  text: string;
}

export interface UnifiedMomentContext {
  version: 'unified-moment-context-v1';
  frame: number;
  timestampMs: number;
  sourceFrame: number | null;
  sourceTimestampMs: number | null;
  sourceGridFrame: number | null;
  snapshot: SignalSnapshot | null;
  signals: Record<string, unknown>;
  transcript: UnifiedMomentTranscriptContext;
  eventAtoms: MomentAtom[];
  atomicMomentBundle: AtomicMomentBundle;
  evidence: {
    hasSnapshot: boolean;
    hasScreenPrimitives: boolean;
    hasTranscriptEvents: boolean;
    signalKeys: string[];
  };
}

export interface BuildUnifiedMomentContextOptions {
  timeline: SignalTimeline;
  frame: number;
  sourceClips?: UnifiedMomentSourceClip[];
  baseSignals?: Record<string, unknown>;
  eventWindowMs?: number;
}

export interface BuildUnifiedMomentContextsOptions extends Omit<BuildUnifiedMomentContextOptions, 'frame'> {
  frames: number[];
}

export function buildUnifiedMomentContext(options: BuildUnifiedMomentContextOptions): UnifiedMomentContext {
  const eventWindowMs = Math.max(0, options.eventWindowMs ?? 500);
  const sourceFrame = resolveSourceFrame(options.frame, options.sourceClips);
  const sourceTimestampMs = sourceFrame == null ? null : (sourceFrame / options.timeline.fps) * 1000;
  const sourceGridFrame = sourceFrame == null ? null : nearestGridFrame(options.timeline, sourceFrame);
  const snapshot = sourceGridFrame == null ? null : options.timeline.gridSignals.get(sourceGridFrame) ?? null;
  const transcript = buildTranscriptContext(options.timeline.eventSignals, sourceTimestampMs, eventWindowMs);
  const eventAtoms = transcript.events.map(eventSignalToMomentAtom);
  const atomicMomentBundle = buildAtomicMomentBundle({
    frame: options.frame,
    fps: options.timeline.fps,
    snapshot: snapshot ?? undefined,
    sourceFrame,
    sourceTimestampMs,
    eventAtoms,
  });
  const signals = {
    ...options.timeline.globalSignals,
    ...(options.baseSignals ?? {}),
    ...(snapshot ?? {}),
    ...momentBundleToSignalMap(atomicMomentBundle),
  };

  return {
    version: 'unified-moment-context-v1',
    frame: options.frame,
    timestampMs: (options.frame / options.timeline.fps) * 1000,
    sourceFrame,
    sourceTimestampMs,
    sourceGridFrame,
    snapshot,
    signals,
    transcript,
    eventAtoms,
    atomicMomentBundle,
    evidence: {
      hasSnapshot: snapshot != null,
      hasScreenPrimitives: hasScreenPrimitives(signals),
      hasTranscriptEvents: transcript.events.length > 0,
      signalKeys: Object.keys(signals).sort(),
    },
  };
}

export function buildUnifiedMomentContexts(options: BuildUnifiedMomentContextsOptions): UnifiedMomentContext[] {
  return options.frames.map((frame) => buildUnifiedMomentContext({ ...options, frame }));
}

function resolveSourceFrame(frame: number, sourceClips: UnifiedMomentSourceClip[] | undefined): number | null {
  if (!sourceClips || sourceClips.length === 0) return frame;
  return mapCutFrameToOriginalFrame(frame, sourceClips);
}

function nearestGridFrame(timeline: SignalTimeline, sourceFrame: number): number | null {
  let nearest: number | null = null;
  let bestDistance = Infinity;
  for (const frame of timeline.gridSignals.keys()) {
    const distance = Math.abs(frame - sourceFrame);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = frame;
    }
  }
  return nearest;
}

function buildTranscriptContext(
  events: EventSignal[],
  sourceTimestampMs: number | null,
  eventWindowMs: number,
): UnifiedMomentTranscriptContext {
  if (sourceTimestampMs == null) return { events: [], text: '' };
  const windowed = events
    .filter((event) => Math.abs(event.timestampMs - sourceTimestampMs) <= eventWindowMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  return {
    events: windowed,
    text: windowed.map((event) => event.context).filter(Boolean).join(' '),
  };
}

function eventSignalToMomentAtom(event: EventSignal): MomentAtom {
  return {
    channel: eventChannel(event.signal),
    key: event.signal,
    value: event.value,
    strength: eventStrength(event.value),
    source: 'event',
    level: 'primitive',
  };
}

function eventChannel(signal: string): MomentAtomChannel {
  if (signal.startsWith('speech.')) return 'speech';
  if (signal.startsWith('audio.')) return 'audio';
  if (signal.startsWith('visual.')) return 'visual';
  if (signal.startsWith('entity.topic') || signal.startsWith('entity.claim')) return 'structure';
  if (signal.startsWith('entity.')) return 'transcript';
  return 'transcript';
}

function eventStrength(value: EventSignal['value']): number {
  if (typeof value === 'number') return Math.max(0, Math.min(1, Math.abs(value)));
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value.trim().length > 0 ? 0.7 : 0;
}

function hasScreenPrimitives(signals: Record<string, unknown>): boolean {
  return [
    'visual.main_subject.x',
    'visual.main_subject.y',
    'visual.main_subject.width',
    'visual.main_subject.height',
    'visual.negative_space.top',
    'visual.negative_space.right',
    'visual.negative_space.bottom',
    'visual.negative_space.left',
    'visual.motion_vector.x',
    'visual.motion_vector.y',
  ].some((key) => typeof signals[key] === 'number' && Number.isFinite(signals[key]));
}
