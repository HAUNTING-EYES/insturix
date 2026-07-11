import { describe, expect, it } from 'vitest';

import type { ReferenceVideoSource } from '@/lib/editron/reference-video/reference-video-source';
import { analyzeSelectedTrendSource } from '@/lib/thinkforge/trends/trend-source-analysis';
import {
  buildAnalyzedSelectedTrend,
  buildSelectedTrend,
} from '@/lib/thinkforge/trends/selected-trend';

function selectedTrend() {
  return buildSelectedTrend({
    sessionId: 'session_1',
    target: 'script',
    candidate: {
      candidateId: 'candidate_hook_reveal',
      candidateVersion: 1,
      title: 'Fast hook to reveal',
      platform: 'instagram',
      evidence: [{
        evidenceId: 'evidence_1',
        evidenceVersion: 1,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: 'instagram',
        title: 'Fast hook to reveal',
        provenance: { purpose: 'public_trend_discovery', queryFingerprint: 'query_1' },
      }],
      evidenceCompleteness: 0.8,
      freshness: 'fresh',
      trendSpecEligible: false,
      nextAction: 'add_reference_video',
    },
  }, new Date('2026-07-11T00:00:00.000Z'));
}

function source(): ReferenceVideoSource {
  return {
    kind: 'asset',
    referenceId: 'asset_reference_1',
    videoUrl: 'https://cdn.example.com/assets/reference.mp4?signature=private',
    durationSec: 8,
    sourceLabel: 'reference.mp4',
    sourceFingerprint: 'asset|asset_reference_1|updated:1720000000000',
    asset: null,
  };
}

function generated(overrides: Record<string, unknown> = {}) {
  return {
    alignmentFrame: 'beat-space' as const,
    beatGrid: {
      bpm: 120,
      beatsMs: [0, 500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_500, 5_000, 5_500, 6_000, 6_500, 7_000, 7_500],
      dropsMs: [2_000],
      totalMs: 8_000,
      sections: [
        { id: 'hook', role: 'hook', start: 0, end: 2_000, beats: [0, 1, 2, 3] },
        { id: 'reveal', role: 'reveal', start: 2_000, end: 8_000, beats: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      ],
    },
    invariants: [{ layer: 'pacing', feature: 'reveal_on_drop', support: 0.9, anchor: { beat: 4, sectionId: 'reveal' } }],
    variables: [{ layer: 'subject', feature: 'reveal_object', freedomRange: ['product', 'person', 'screen'] }],
    copyFormula: { slots: [{ id: 'hook', role: 'hook', template: 'POV: {audience_problem}', maxChars: 42 }] },
    performanceScript: 'Open on the tension. Reveal the outcome at the first drop, then show the proof beat.',
    ...overrides,
  };
}

describe('ThinkForge trend source analysis', () => {
  it('server-owns TrendSpec identity/version and never persists the playable video URL', async () => {
    const analysis = await analyzeSelectedTrendSource({
      selectedTrend: selectedTrend(),
      source: source(),
      userId: 'user_1',
      sessionId: 'session_1',
    }, {
      now: new Date('2026-07-11T00:05:00.000Z'),
      generate: async () => generated(),
    });

    expect(analysis).toMatchObject({
      status: 'completed',
      source: {
        referenceId: 'asset_reference_1',
        sourceKind: 'asset',
      },
      trendSpec: {
        trendId: 'candidate_hook_reveal',
        version: 1,
        exemplarRefs: ['asset_reference_1'],
      },
    });
    expect(JSON.stringify(analysis)).not.toContain('signature=private');

    const selected = buildAnalyzedSelectedTrend(selectedTrend(), analysis);
    expect(selected.candidate).toMatchObject({
      trendSpecEligible: true,
      nextAction: 'use_as_timed_angle',
    });
  });

  it('rejects a generated timeline that reaches beyond the authorized video', async () => {
    await expect(analyzeSelectedTrendSource({
      selectedTrend: selectedTrend(),
      source: source(),
      userId: 'user_1',
      sessionId: 'session_1',
    }, {
      generate: async () => generated({
        beatGrid: {
          ...generated().beatGrid,
          totalMs: 12_000,
          sections: [
            { id: 'hook', role: 'hook', start: 0, end: 12_000, beats: [0] },
          ],
        },
        invariants: [],
      }),
    })).rejects.toMatchObject({
      code: 'invalid_timeline',
    });
  });

  it('rejects an authorized reference that exceeds the bounded analysis window', async () => {
    await expect(analyzeSelectedTrendSource({
      selectedTrend: selectedTrend(),
      source: { ...source(), durationSec: 181 },
      userId: 'user_1',
      sessionId: 'session_1',
    }, {
      generate: async () => generated(),
    })).rejects.toMatchObject({
      code: 'source_too_long',
    });
  });
});