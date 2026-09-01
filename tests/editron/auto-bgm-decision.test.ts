import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertAutoBgmDecisionEvidenceV1,
  autoBgmDecisionEvidenceHashV1,
  buildAutoBgmDecisionEvidence,
} from '@/lib/editron/services/auto-bgm-decision';
import { resolveEditorialDecisionPolicy } from '@/lib/editron/services/editorial-decision-policy';
import { resolveMusicGenerationPolicy } from '@/lib/pipeline/bgm-conditioning-contract';

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

  it('treats explicit music off as the effective decision while preserving signal evidence', () => {
    const editorialPolicy = resolveEditorialDecisionPolicy({
      families: { music: { mode: 'off' } },
    }, 'music');
    const evidence = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'signals license a music bed' },
      editorialPolicy,
      durationSec: 90,
      evaluatedAt,
    });

    expect(evidence).toMatchObject({
      status: 'user-disabled',
      shouldAddBgm: false,
      signalShouldAddBgm: true,
      reason: 'user-policy-off:music',
      editorialPolicy: {
        decisionFamily: 'music',
        editorialFamily: 'music',
        executionAllowed: false,
      },
    });
  });

  it('treats legacy music none as user-disabled with its original provenance', () => {
    const musicGenerationPolicy = resolveMusicGenerationPolicy({
      musicPreferences: [{ value: 'none', source: 'director-brief.musicPreference' }],
      editorialPreferences: [],
    });
    const evidence = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'signals license a music bed' },
      musicGenerationPolicy,
      durationSec: 90,
      evaluatedAt,
    });

    expect(evidence).toMatchObject({
      status: 'user-disabled',
      shouldAddBgm: false,
      signalShouldAddBgm: true,
      reason: 'music-preference-none',
      musicGenerationPolicy: {
        allowed: false,
        musicPreference: 'none',
        musicPreferenceSource: 'director-brief.musicPreference',
      },
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

  it('issues a canonical hash and rejects contradictory dispatch evidence', () => {
    const evidence = buildAutoBgmDecisionEvidence({
      recommendation: { shouldAddBgm: true, reason: 'speech-heavy casual edit' },
      providerAvailable: true,
      durationSec: 75,
      evaluatedAt,
    });

    expect(() => assertAutoBgmDecisionEvidenceV1(evidence)).not.toThrow();
    expect(autoBgmDecisionEvidenceHashV1(evidence)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertAutoBgmDecisionEvidenceV1({
      ...evidence,
      status: 'dispatched',
      dispatch: {
        version: 'audio-dispatch-result-v1',
        label: 'BGM(auto-edit)',
        url: 'https://example.com/api/internal/workers/pipeline/audio',
        dispatched: false,
        method: 'none',
      },
    })).toThrow('AUTO_BGM_DECISION_EVIDENCE_INVALID');
  });

  it('wires Director auto-edit BGM through persisted evidence, not console logs only', () => {
    const directorSource = readFileSync(join(process.cwd(), 'lib/editron/agent/director-agent.ts'), 'utf8');
    const dispatchSource = readFileSync(join(process.cwd(), 'lib/editron/services/audio-worker-dispatch.ts'), 'utf8');
    const decisionSource = readFileSync(join(process.cwd(), 'lib/editron/services/auto-bgm-decision.ts'), 'utf8');
    const videoAnalysisSource = readFileSync(join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'), 'utf8');
    const tribeSource = readFileSync(join(process.cwd(), 'app/api/internal/workers/tribe-analysis/route.ts'), 'utf8');

    expect(directorSource).toContain("@/lib/editron/services/auto-bgm-decision");
    expect(directorSource).toContain('const bgmGenreParams = pathDGenreParams ?? pathEGenreParams');
    expect(directorSource).toContain('const bgmRec = (bgmGenreParams as any)?.bgmRecommendation');
    expect(directorSource).toContain('const musicGenerationPolicy = resolveMusicGenerationPolicy({');
    expect(directorSource).toContain('!musicGenerationPolicy.allowed');
    expect(directorSource).toContain('musicGenerationPolicy,');
    expect(directorSource).toContain('editorialPolicy: musicEditorialPolicy');
    expect(directorSource).toContain('projectService.recordDirectorAutoBgmDecisionV1(');
    expect(directorSource).toContain('directorCurrentRevision = advanceDirectorRevisionFromReceiptsV1({');
    expect(directorSource).toContain('const dispatchResult = await dispatchAudioJob');
    expect(directorSource.indexOf('await persistAutoBgmEvidence({\n                  providerAvailable,')).toBeLessThan(
      directorSource.indexOf('const dispatchResult = await dispatchAudioJob'),
    );
    expect(decisionSource).not.toContain("collection('projects').updateOne");
    expect(decisionSource).not.toContain('persistAutoBgmDecisionEvidence');
    expect(directorSource).toContain('musicPreference: musicGenerationPolicy.musicPreference');
    expect(directorSource).toContain('editorialPreferences: musicGenerationPolicy.editorialPreferences');
    expect(videoAnalysisSource).toContain('editorialPreferences?: EditorialPreferences');
    expect(videoAnalysisSource).toContain('musicPreference: normalizedMusicPreference');
    expect(videoAnalysisSource).toContain('editorialPreferences: normalizedEditorialPreferences');
    expect(tribeSource).toContain('body: JSON.stringify(directorPayload)');
    expect(dispatchSource).toContain('Promise<AudioDispatchResult>');
    expect(dispatchSource).toContain("method: 'none'");
  });
});
