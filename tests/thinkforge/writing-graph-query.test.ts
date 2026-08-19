import { describe, expect, it } from 'vitest';
import { selectTechniques } from '@/lib/thinkforge/data/writing-graph-query';

describe('ThinkForge writing graph technique selection', () => {
  it('computes derived persuasion inputs before selecting AIDA', () => {
    const structures = selectTechniques({
      logos_load: 0.9,
      pathos_load: 0.2,
      ethos_load: 0.6,
      audience_awareness: 'solution_aware',
      pacing_velocity: 0.5,
    }, 'structure', 10);

    expect(structures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'attention_interest_desire_action',
        score: 1,
      }),
    ]));
  });

  it('enforces source-declared whole-piece duration boundaries', () => {
    const pasSignals = {
      behavioral_utility: 0.8,
      kairos_pressure: 0.7,
      pathos_load: 0.6,
      audience_awareness: 'problem_aware',
      education_intent: 0.2,
    } as const;
    const aidaSignals = {
      logos_load: 0.9,
      pathos_load: 0.2,
      ethos_load: 0.6,
      audience_awareness: 'solution_aware',
      pacing_velocity: 0.5,
    } as const;
    const selectIds = (
      signals: typeof pasSignals | typeof aidaSignals,
      durationSeconds: number,
    ) => selectTechniques(signals, 'structure', 10, {
      wholePieceDurationSeconds: durationSeconds,
    }).map((technique) => technique.id);

    expect(selectIds(pasSignals, 59)).toContain('problem_agitate_solve');
    expect(selectIds(pasSignals, 60)).not.toContain('problem_agitate_solve');
    expect(selectIds(aidaSignals, 59)).not.toContain('attention_interest_desire_action');
    expect(selectIds(aidaSignals, 60)).toContain('attention_interest_desire_action');
    expect(selectIds(aidaSignals, 180)).toContain('attention_interest_desire_action');
    expect(selectIds(aidaSignals, 181)).not.toContain('attention_interest_desire_action');
  });

  it('treats a matching negative bipolar range as positive activation evidence', () => {
    const techniques = selectTechniques({
      humor: 0.7,
      formality: -0.8,
      intensity_performance: 0.6,
      entertainment_intent: 0.8,
      ethos_load: 0.4,
    }, 'informational_surprise', 10);

    expect(techniques).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'meta_break', score: 1 }),
    ]));
  });

  it('interprets a negative bipolar inhibitor as a lower-bound rejection', () => {
    const base = {
      logos_load: 0.8,
      novelty: 0.8,
      assumed_expertise: 0.6,
      visceral_impact: 0.6,
    } as const;
    const veryCasual = selectTechniques({ ...base, formality: -0.8 }, 'hook', 10);
    const neutral = selectTechniques({ ...base, formality: 0 }, 'hook', 10);

    expect(veryCasual.map((technique) => technique.id)).not.toContain('statistic_hook');
    expect(neutral.map((technique) => technique.id)).toContain('statistic_hook');
  });
});
