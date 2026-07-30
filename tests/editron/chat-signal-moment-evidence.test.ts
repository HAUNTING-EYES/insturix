import { describe, expect, it, vi } from 'vitest';

import { selectStrongestSpeechEmphasis } from '@/lib/editron/services/chat-signal-moment-evidence';

function fixture() {
  return {
    project: {
      projectId: 'project-speech',
      fps: 30,
      durationInFrames: 600,
      overlays: [{
        id: 'video-1',
        type: 'video',
        assetId: 'asset-1',
        from: 60,
        durationInFrames: 360,
        sourceStartFrame: 60,
      }],
    },
    analyses: [{
      assetId: 'asset-1',
      segmentAnalysis: {
        segments: [
          {
            startMs: 2_000,
            endMs: 4_000,
            transcript: { text: 'A calm opening phrase' },
            vocal: {
              energy: 0.42,
              emotionIntensity: 0.35,
              pitchVariability: 0.28,
              stressDetected: false,
            },
            weight: { finalWeight: 0.5 },
          },
          {
            startMs: 4_000,
            endMs: 6_000,
            transcript: { text: 'This point matters most' },
            vocal: {
              energy: 0.91,
              emotionIntensity: 0.88,
              pitchVariability: 0.84,
              stressDetected: true,
            },
            weight: { finalWeight: 0.92 },
          },
        ],
      },
    }],
  };
}

describe('chat signal moment evidence', () => {
  it('selects the strongest mapped prosody independent of query wording', async () => {
    const { project, analyses } = fixture();
    const audits: unknown[] = [];
    const result = await selectStrongestSpeechEmphasis({
      projectId: project.projectId,
      userId: 'user-1',
      project,
      limit: 5,
    }, {
      loadAnalyses: vi.fn(async () => analyses),
      saveAudit: vi.fn(async (audit) => { audits.push(audit); }),
      now: () => new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(result.candidates[0]).toMatchObject({
      transcriptText: 'This point matters most',
      startFrame: 120,
      endFrame: 180,
      frame: 150,
      accepted: true,
      safeForAutomaticMutation: true,
      score: 1,
    });
    expect(result.candidates[0].sourcePaths).toContain(
      'editron_asset_analyses.asset-1.segmentAnalysis.segments.1',
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      selection: { mode: 'strongest-signal', signal: 'speech-emphasis' },
      analyzedDocumentCount: 2,
    });
  });

  it('fails closed when the strongest moments tie', async () => {
    const { project, analyses } = fixture();
    const tied = analyses[0].segmentAnalysis.segments[0].vocal;
    analyses[0].segmentAnalysis.segments[1].vocal = { ...tied };
    analyses[0].segmentAnalysis.segments[1].weight = { finalWeight: 0.5 };

    const result = await selectStrongestSpeechEmphasis({
      projectId: project.projectId,
      userId: 'user-1',
      project,
    }, {
      loadAnalyses: vi.fn(async () => analyses),
      saveAudit: vi.fn(async () => undefined),
      now: () => new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(result.candidates[0].safeForAutomaticMutation).toBe(false);
    expect(result.candidates[0].rejectionReasons).toContain('ambiguous-top-signal');
  });

  it('rejects signals that cannot be mapped onto the edited timeline', async () => {
    const { project, analyses } = fixture();
    project.overlays[0].sourceStartFrame = 900;

    const result = await selectStrongestSpeechEmphasis({
      projectId: project.projectId,
      userId: 'user-1',
      project,
    }, {
      loadAnalyses: vi.fn(async () => analyses),
      saveAudit: vi.fn(async () => undefined),
      now: () => new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(result.candidates.every((candidate) => !candidate.safeForAutomaticMutation)).toBe(true);
    expect(result.candidates[0].rejectionReasons).toContain('missing-source-to-cut-mapping');
  });
});
