/**
 * Scan report (Director Mode) — the "here's everything I saw" trust surface,
 * rendered in a sidebar panel. Pure and dependency-free (client-bundle-safe):
 * every value is read from the already-hydrated project doc — no model calls,
 * no extra analysis. This is the fuller companion to the chat briefing.
 *
 * All numbers are `.length` of persisted evidence (R31: no fabricated numbers).
 */

export interface ScanReportScene {
  index: number;
  startMs: number;
  endMs: number;
}

export interface ScanReportSection {
  id: 'speech' | 'scenes' | 'silences' | 'music';
  label: string;
  value: string;
  detail?: string;
}

export interface ScanReport {
  overview: { clipCount: number; durationLabel: string; contentType?: string };
  sections: ScanReportSection[];
  scenes: ScanReportScene[];
  degradedAssetIds: string[];
}

export type ScanMarkerKind = 'silence' | 'scene';
export interface ScanMarker {
  kind: ScanMarkerKind;
  /** Left edge as a percentage [0,100] of the total timeline duration. */
  leftPct: number;
  /** Width as a percentage of duration (silences span a range; scenes are hairlines). */
  widthPct: number;
  startMs: number;
}
export interface ScanMarkers {
  markers: ScanMarker[];
  clustered: boolean;
}

/** Above this, we downsample so the strip doesn't paint thousands of overlapping ticks. */
const MAX_MARKERS_PER_KIND = 200;

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
}
function len(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
/** A finite number or the fallback — rejects NaN and Infinity (typeof both is 'number'). */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function msToLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}
function durationLabel(frames: number, fps: number): string {
  const s = Math.round(frames / (fps > 0 ? fps : 30));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

/** Returns null unless this is an assist project at ready_for_chat. */
export function buildScanReport(project: unknown): ScanReport | null {
  if (get(project, 'editMode') !== 'assist') return null;
  if (get(project, 'autoEditStatus') !== 'ready_for_chat') return null;

  const overlays = get(project, 'overlays');
  const clipCount = Array.isArray(overlays)
    ? overlays.filter((o) => get(o, 'type') === 'video' || get(o, 'type') === 'image').length
    : 0;
  const fpsRaw = num(get(project, 'fps'), 30);
  const fps = fpsRaw > 0 ? fpsRaw : 30;
  const durationInFrames = Math.max(0, num(get(project, 'durationInFrames'), 0));

  const raw = get(project, 'rawFootageAnalysis');
  const wordCount = len(get(get(raw, 'transcription'), 'words'));
  const silenceCount = len(get(raw, 'silenceGaps'));
  const contentType = typeof get(get(raw, 'contentTypeDetection'), 'contentType') === 'string'
    ? (get(get(raw, 'contentTypeDetection'), 'contentType') as string)
    : undefined;

  const segments = get(get(project, 'segmentAnalysis'), 'segments');
  const scenes: ScanReportScene[] = (Array.isArray(segments) ? segments : []).map((seg, index) => ({
    index,
    startMs: num(get(seg, 'startMs'), 0),
    endMs: num(get(seg, 'endMs'), 0),
  }));

  const music = get(project, 'musicAnalysis');
  const bpm = Number.isFinite(num(get(music, 'bpm'), NaN)) ? num(get(music, 'bpm'), 0) : null;

  const degradedAssetIds = (Array.isArray(get(project, 'assistDegradedAssetIds')) ? get(project, 'assistDegradedAssetIds') : []) as string[];

  const sections: ScanReportSection[] = [
    {
      id: 'speech',
      label: 'Speech',
      value: wordCount > 0 ? `${wordCount.toLocaleString()} words transcribed` : 'No speech detected',
    },
    {
      id: 'scenes',
      label: 'Scenes',
      value: `${scenes.length} detected`,
      ...(scenes.length > 0 ? { detail: `${msToLabel(scenes[0].startMs)}–${msToLabel(scenes[scenes.length - 1].endMs)}` } : {}),
    },
    {
      id: 'silences',
      label: 'Silences',
      value: silenceCount > 0 ? `${silenceCount} found` : 'None',
    },
    {
      id: 'music',
      label: 'Music',
      value: music ? (bpm ? `Detected · ${Math.round(bpm)} BPM` : 'Detected') : 'None detected',
    },
  ];

  return {
    overview: { clipCount, durationLabel: durationLabel(durationInFrames, fps), ...(contentType ? { contentType } : {}) },
    sections,
    scenes,
    degradedAssetIds,
  };
}

/** Evenly downsample to at most `cap` items, preserving order and endpoints. */
function downsample<T>(items: T[], cap: number): { kept: T[]; clustered: boolean } {
  if (items.length <= cap) return { kept: items, clustered: false };
  const step = items.length / cap;
  const kept: T[] = [];
  for (let i = 0; i < cap; i += 1) kept.push(items[Math.floor(i * step)]);
  return { kept, clustered: true };
}

/**
 * Timeline scan markers (Director Mode) — silences (spans) + scene bounds
 * (hairlines) positioned as a percentage of total duration, so they align to a
 * timeline track whose width scales with zoom. Pure; reads the hydrated project.
 * Downsamples each kind past MAX_MARKERS_PER_KIND so long footage stays cheap.
 */
export function buildScanMarkers(project: unknown, fpsInput = 30): ScanMarkers | null {
  if (get(project, 'editMode') !== 'assist') return null;
  if (get(project, 'autoEditStatus') !== 'ready_for_chat') return null;

  const fpsRaw = num(get(project, 'fps'), fpsInput);
  const fps = fpsRaw > 0 ? fpsRaw : (fpsInput > 0 ? fpsInput : 30);
  const durationInFrames = Math.max(0, num(get(project, 'durationInFrames'), 0));
  const totalMs = (durationInFrames / fps) * 1000;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return { markers: [], clustered: false };

  const pct = (ms: number) => Math.max(0, Math.min(100, (ms / totalMs) * 100));

  const raw = get(project, 'rawFootageAnalysis');
  const rawSilences = (Array.isArray(get(raw, 'silenceGaps')) ? get(raw, 'silenceGaps') : []) as unknown[];
  const rawSegments = (Array.isArray(get(get(project, 'segmentAnalysis'), 'segments')) ? get(get(project, 'segmentAnalysis'), 'segments') : []) as unknown[];

  const silenceSrc = downsample(rawSilences, MAX_MARKERS_PER_KIND);
  const sceneSrc = downsample(rawSegments, MAX_MARKERS_PER_KIND);

  const silences: ScanMarker[] = silenceSrc.kept.map((g) => {
    const startMs = num(get(g, 'startMs'), 0);
    const endMs = num(get(g, 'endMs'), startMs);
    const left = pct(startMs);
    // Clamp the span so a backwards/overlong silence can't push past 100% or go negative.
    const width = Math.min(100 - left, Math.max(0.15, pct(endMs) - left));
    return { kind: 'silence', startMs, leftPct: left, widthPct: width };
  });
  const scenes: ScanMarker[] = sceneSrc.kept.map((s) => {
    const startMs = num(get(s, 'startMs'), 0);
    return { kind: 'scene', startMs, leftPct: pct(startMs), widthPct: 0 };
  });

  return { markers: [...silences, ...scenes], clustered: silenceSrc.clustered || sceneSrc.clustered };
}
