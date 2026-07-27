/**
 * Assist briefing — the scan report rendered as chat's first message.
 * Every count must trace to persisted evidence (R31: no fabricated numbers),
 * chips must hide when their evidence is absent, and non-assist projects
 * must never see a briefing.
 */
import { describe, expect, it } from 'vitest';

import { buildAssistBriefing } from '@/lib/editron/services/assist-briefing';

const readyProject = (over: Record<string, unknown> = {}) => ({
  editMode: 'assist',
  autoEditStatus: 'ready_for_chat',
  fps: 30,
  durationInFrames: 30 * 154, // 2m 34s
  overlays: [
    { type: 'video', assetId: 'v1' },
    { type: 'video', assetId: 'v2' },
    { type: 'image', assetId: 'i1' },
    { type: 'caption', assetId: null },
  ],
  rawFootageAnalysis: {
    transcription: { words: Array.from({ length: 1204 }, (_, i) => ({ word: `w${i}` })) },
    silenceGaps: Array.from({ length: 14 }, (_, i) => ({ startMs: i * 1000, endMs: i * 1000 + 400 })),
  },
  segmentAnalysis: { segments: Array.from({ length: 9 }, (_, i) => ({ startMs: i })) },
  musicAnalysis: null,
  assistDegradedAssetIds: [],
  ...over,
});

describe('buildAssistBriefing', () => {
  it('returns null for auto projects, wrong statuses, and garbage input', () => {
    expect(buildAssistBriefing(readyProject({ editMode: 'auto' }))).toBeNull();
    expect(buildAssistBriefing(readyProject({ editMode: undefined }))).toBeNull();
    expect(buildAssistBriefing(readyProject({ autoEditStatus: 'directing' }))).toBeNull();
    expect(buildAssistBriefing(readyProject({ autoEditStatus: 'scan_failed' }))).toBeNull();
    expect(buildAssistBriefing(null)).toBeNull();
    expect(buildAssistBriefing('nonsense')).toBeNull();
  });

  it('grounds every number in the persisted evidence', () => {
    const briefing = buildAssistBriefing(readyProject());
    expect(briefing).not.toBeNull();
    expect(briefing!.summary).toBe('Scan complete — 3 clips, 2m 34s laid down in upload order. Nothing has been edited.');
    expect(briefing!.detail).toBe('9 scenes detected');
    expect(briefing!.chips.map((c) => c.id)).toEqual(['captions', 'silences', 'music']);
    expect(briefing!.chips[0].label).toBe('Add captions (1,204 words ready)');
    expect(briefing!.chips[1].label).toBe('Cut 14 silences');
    expect(briefing!.chips[2].label).toBe('Add a music bed');
  });

  it('hides speech chips for image-only scans and offers replace when music exists', () => {
    const briefing = buildAssistBriefing(readyProject({
      rawFootageAnalysis: { transcription: { words: [] }, silenceGaps: [] },
      musicAnalysis: { bpm: 120 },
    }));
    expect(briefing!.chips.map((c) => c.id)).toEqual(['music']);
    expect(briefing!.chips[0].label).toBe('Replace the music');
  });

  it('surfaces degraded clips honestly instead of hiding them', () => {
    const briefing = buildAssistBriefing(readyProject({ assistDegradedAssetIds: ['v2'] }));
    expect(briefing!.detail).toContain("1 clip couldn't be fully analyzed");
  });

  it('short lay-downs format in seconds and singulars stay grammatical', () => {
    const briefing = buildAssistBriefing(readyProject({
      durationInFrames: 30 * 42,
      overlays: [{ type: 'video', assetId: 'v1' }],
      rawFootageAnalysis: {
        transcription: { words: [{ word: 'hi' }] },
        silenceGaps: [{ startMs: 0, endMs: 500 }],
      },
      segmentAnalysis: { segments: [{ startMs: 0 }] },
    }));
    expect(briefing!.summary).toBe('Scan complete — 1 clip, 42s laid down in upload order. Nothing has been edited.');
    expect(briefing!.detail).toBe('1 scene detected');
    expect(briefing!.chips[1].label).toBe('Cut 1 silence');
  });
});
