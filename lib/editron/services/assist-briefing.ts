/**
 * Assist briefing (Director Mode) — the scan report rendered as chat's first message.
 *
 * Pure and dependency-free ON PURPOSE: this runs in the client bundle (ai-chat-panel)
 * and must never drag server chains (db, resolvers) with it. Every number is a
 * `.length` of persisted scan evidence — nothing is invented, nothing calls a model.
 *
 * CHIP → TOOL CONTRACT (CEO plan, C5: no new mutation owners — chips send ONE
 * prepared chat message; the agent routes it to the EXISTING tool):
 *   captions → add_captions (installCanonicalCaptionTrack)
 *   silences → evidence-attached confirm loop (cut_section / close_gaps)
 *   music    → regenerate_bgm
 *   scenes   → scan report panel navigation (Lane D) — info-only until the panel ships
 */

export interface AssistBriefingChip {
  id: 'captions' | 'silences' | 'music';
  label: string;
  /** The exact chat message the chip sends — one billed message, per pricing ruling. */
  prompt: string;
}

export interface AssistBriefing {
  summary: string;
  /** Secondary line: scene count, degraded-clip note. */
  detail: string | null;
  chips: AssistBriefingChip[];
}

function asArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Returns null unless this is an assist project sitting at ready_for_chat. */
export function buildAssistBriefing(project: unknown): AssistBriefing | null {
  if (get(project, 'editMode') !== 'assist') return null;
  if (get(project, 'autoEditStatus') !== 'ready_for_chat') return null;

  const overlays = get(project, 'overlays');
  const clipCount = Array.isArray(overlays)
    ? overlays.filter((o) => get(o, 'type') === 'video' || get(o, 'type') === 'image').length
    : 0;

  const fps = typeof get(project, 'fps') === 'number' && (get(project, 'fps') as number) > 0
    ? (get(project, 'fps') as number)
    : 30;
  const durationInFrames = typeof get(project, 'durationInFrames') === 'number'
    ? (get(project, 'durationInFrames') as number)
    : 0;
  const totalSec = Math.round(durationInFrames / fps);
  const durationLabel = totalSec >= 60
    ? `${Math.floor(totalSec / 60)}m ${String(totalSec % 60).padStart(2, '0')}s`
    : `${totalSec}s`;

  const raw = get(project, 'rawFootageAnalysis');
  const wordCount = asArrayLength(get(get(raw, 'transcription'), 'words'));
  const silenceCount = asArrayLength(get(raw, 'silenceGaps'));
  const sceneCount = asArrayLength(get(get(project, 'segmentAnalysis'), 'segments'));
  const hasMusicAnalysis = Boolean(get(project, 'musicAnalysis'));
  const degradedCount = asArrayLength(get(project, 'assistDegradedAssetIds'));

  const chips: AssistBriefingChip[] = [];
  if (wordCount > 0) {
    chips.push({
      id: 'captions',
      label: `Add captions (${wordCount.toLocaleString()} words ready)`,
      prompt: 'Add captions to the whole timeline using my transcription.',
    });
  }
  if (silenceCount > 0) {
    chips.push({
      id: 'silences',
      label: `Cut ${silenceCount} silence${silenceCount === 1 ? '' : 's'}`,
      prompt: 'Find the silences in my footage and propose a cut for each one, with the evidence — I will confirm them one by one.',
    });
  }
  chips.push({
    id: 'music',
    label: hasMusicAnalysis ? 'Replace the music' : 'Add a music bed',
    prompt: 'Add a background music bed that fits the mood and pacing of my footage.',
  });

  const detailParts: string[] = [];
  if (sceneCount > 0) detailParts.push(`${sceneCount} scene${sceneCount === 1 ? '' : 's'} detected`);
  if (degradedCount > 0) {
    detailParts.push(`${degradedCount} clip${degradedCount === 1 ? '' : 's'} couldn't be fully analyzed — on the timeline, flagged for retry`);
  }

  return {
    summary: `Scan complete — ${clipCount} clip${clipCount === 1 ? '' : 's'}, ${durationLabel} laid down in upload order. Nothing has been edited.`,
    detail: detailParts.length > 0 ? detailParts.join(' · ') : null,
    chips,
  };
}
