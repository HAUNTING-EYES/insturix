import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const collection = vi.fn(() => ({ updateOne }));
  return { collection, updateOne };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: mocks.collection })),
}));

import {
  buildAutoBgmDecisionEvidence,
  persistAutoBgmDecisionEvidence,
} from '@/lib/editron/services/auto-bgm-decision';

describe('Auto-BGM decision evidence', () => {
  const evaluatedAt = '2026-06-30T00:00:00.000Z';

  it('records why BGM is not recommended instead of leaving missing-BGM ambiguous', () => {
    const evidence = buildAutoBgmDecisionEvidence({
      recommendation: {
        shouldAddBgm: false,
        reason: 'Skipping BGM: formal content, sourceMusicConfidence=0.00',
      },
      durationSec: 90,
      evaluatedAt,
    });

    expect(evidence).toMatchObject({
      version: 'auto-bgm-decision-v1',
      status: 'not-recommended',
      shouldAddBgm: false,
      reason: 'Skipping BGM: formal content, sourceMusicConfidence=0.00',
      storyboardOwned: false,
      durationSec: 90,
      evaluatedAt,
    });
  });

  it('records environment and timeline blockers separately from recommendation', () => {
    expect(buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: false,
      durationSec: 90,
      evaluatedAt,
    })).toMatchObject({
      status: 'provider-unavailable',
      shouldAddBgm: true,
      providerAvailable: false,
    });

    expect(buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: true,
      durationSec: 8,
      evaluatedAt,
    })).toMatchObject({
      status: 'too-short',
      providerAvailable: true,
      durationSec: 8,
    });
  });

  it('records async dispatch success and failure without changing BGM generation behavior', () => {
    const success = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: true,
      durationSec: 75,
      mood: 'inspirational',
      pacing: 'medium',
      musicPrompt: 'clean instrumental background music for video',
      dispatchResult: {
        version: 'audio-dispatch-result-v1',
        label: 'BGM(auto-edit)',
        url: 'https://example.com/api/internal/workers/pipeline/audio',
        dispatched: true,
        method: 'qstash',
        messageId: 'msg_123',
      },
      evaluatedAt,
    });

    expect(success).toMatchObject({
      status: 'dispatched',
      shouldAddBgm: true,
      mood: 'inspirational',
      pacing: 'medium',
      dispatch: expect.objectContaining({ method: 'qstash', messageId: 'msg_123' }),
    });

    const failed = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: true,
      durationSec: 75,
      dispatchResult: {
        version: 'audio-dispatch-result-v1',
        label: 'BGM(auto-edit)',
        url: 'https://example.com/api/internal/workers/pipeline/audio',
        dispatched: false,
        method: 'none',
        error: 'QStash unavailable',
      },
      evaluatedAt,
    });

    expect(failed).toMatchObject({
      status: 'dispatch-failed',
      error: 'QStash unavailable',
    });
  });

  it('persists BGM evidence in both current and audio-scoped intelligence paths', async () => {
    const evidence = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: true,
      durationSec: 75,
      evaluatedAt,
    });

    await persistAutoBgmDecisionEvidence('proj_auto_bgm', evidence);

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { projectId: 'proj_auto_bgm' },
      {
        $set: {
          'intelligence.autoBgmDecision': evidence,
          'intelligence.audio.autoBgmDecision': evidence,
        },
      },
    );
  });

  it('wires Director auto-edit BGM through persisted evidence, not console logs only', () => {
    const directorSource = readFileSync(join(process.cwd(), 'lib/editron/agent/director-agent.ts'), 'utf8');
    const dispatchSource = readFileSync(join(process.cwd(), 'lib/editron/services/audio-worker-dispatch.ts'), 'utf8');

    expect(directorSource).toContain("@/lib/editron/services/auto-bgm-decision");
    expect(directorSource).toContain('persistAutoBgmDecisionEvidence(projectId, evidence)');
    expect(directorSource).toContain('const dispatchResult = await dispatchAudioJob');
    expect(dispatchSource).toContain('Promise<AudioDispatchResult>');
    expect(dispatchSource).toContain("method: 'none'");
  });
});