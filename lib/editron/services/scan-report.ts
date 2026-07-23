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

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
}
function len(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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
  const fps = typeof get(project, 'fps') === 'number' && (get(project, 'fps') as number) > 0 ? (get(project, 'fps') as number) : 30;
  const durationInFrames = typeof get(project, 'durationInFrames') === 'number' ? (get(project, 'durationInFrames') as number) : 0;

  const raw = get(project, 'rawFootageAnalysis');
  const wordCount = len(get(get(raw, 'transcription'), 'words'));
  const silenceCount = len(get(raw, 'silenceGaps'));
  const contentType = typeof get(get(raw, 'contentTypeDetection'), 'contentType') === 'string'
    ? (get(get(raw, 'contentTypeDetection'), 'contentType') as string)
    : undefined;

  const segments = get(get(project, 'segmentAnalysis'), 'segments');
  const scenes: ScanReportScene[] = (Array.isArray(segments) ? segments : []).map((seg, index) => ({
    index,
    startMs: typeof get(seg, 'startMs') === 'number' ? (get(seg, 'startMs') as number) : 0,
    endMs: typeof get(seg, 'endMs') === 'number' ? (get(seg, 'endMs') as number) : 0,
  }));

  const music = get(project, 'musicAnalysis');
  const bpm = typeof get(music, 'bpm') === 'number' ? (get(music, 'bpm') as number) : null;

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
