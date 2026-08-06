import { describe, expect, it, vi } from 'vitest';

import { comparePlans, pairPlanSelectionEnabled } from '@/lib/editron/motion-graphics/codegen/taste/pairwise-selector';
import { houseTasteBankEnabled, rankTasteExemplars, registerTasteExemplar, type TasteBankExemplar } from '@/lib/editron/motion-graphics/codegen/taste/taste-bank';
import {
  preferenceMemoryEnabled,
  rebuildUserTasteProfileFromEvents,
  recordTastePreferenceEvent,
  type TastePreferenceEvent,
} from '@/lib/editron/motion-graphics/codegen/taste/preference-memory';
import type { MgMomentDesignPlan } from '@/lib/editron/motion-graphics/codegen/design/design-plan';

const plan = (over: Partial<MgMomentDesignPlan> = {}): MgMomentDesignPlan => ({
  momentId: 'b0', lane: 'overlay-kit', concept: 'a kinetic line lands the claim', targetBar: 'energy',
  primaryCommunicativeJob: 'emphasize',
  structure: { placement: 'center', grouping: 'headline + rule', readingOrder: 'headline then rule' },
  elements: [
    { kind: 'headline', role: 'the spoken line', dataProps: ['line'] },
    { kind: 'rule', role: 'motif underline', dataProps: [] },
  ],
  motion: { enterOrder: [0, 1], build: 'headline enters, rule draws', hold: 'float', syncTo: 'word-onsets' },
  look: 'integrated',
  ...over,
});

describe('pairwise plan selection (brief §14.1)', () => {
  it('prefers the plan whose concept encodes the licensed payload', () => {
    const a = plan({ concept: 'quality outruns quantity via a resolving line' });
    const b = plan({ concept: 'a generic gold underline' });
    const r = comparePlans(a, b, { semanticPayload: 'quality outruns quantity' });
    expect(r.winner).toBe('A');
  });
  it('a tie is honest — never a forced winner', () => {
    const r = comparePlans(plan(), plan(), { semanticPayload: 'x' });
    expect(r.winner).toBe('tie');
    expect(r.reasons.join(' ')).toContain('never force');
  });
  it('a contract deviation (prohibited motif) is penalized', () => {
    const contract = { contractHash: 'h1', prohibitedMotifs: ['muddy gradients'] } as never;
    const bad = plan({ tasteContractHash: 'h1', concept: 'muddy gradients swirl under the claim' });
    const good = plan({ tasteContractHash: 'h1', concept: 'the claim lands on a clean gold rule' });
    const r = comparePlans(good, bad, { contract, semanticPayload: 'the claim' });
    expect(r.winner).toBe('A');
  });
  it('flag defaults OFF', () => {
    expect(pairPlanSelectionEnabled({})).toBe(false);
    expect(pairPlanSelectionEnabled({ MG_PAIRWISE_PLAN_SELECTION_ENABLED: '1' })).toBe(true);
  });
});

describe('house taste bank (brief §8)', () => {
  const exemplars: TasteBankExemplar[] = [
    { id: 'e1', registeredAt: '2026-08-05T00:00:00.000Z', provenance: 'asset:mgseq_abc', summary: 'gold rule stat', communicativeJob: 'quantify', textLoad: 0.3, motionEnergy: 0.6, contractTraits: ['gold-rule'], disposition: 'positive' },
    { id: 'e2', registeredAt: '2026-08-05T00:00:00.000Z', provenance: 'asset:mgseq_def', summary: 'kinetic word', communicativeJob: 'emphasize', textLoad: 0.2, motionEnergy: 0.9, contractTraits: ['gold-rule'], disposition: 'positive' },
    { id: 'e3', registeredAt: '2026-08-05T00:00:00.000Z', provenance: 'asset:mgseq_ghi', summary: 'rejected plate', communicativeJob: 'quantify', disposition: 'rejected', rejectionReason: 'plate card' },
  ];
  it('ranks by job + contract traits and excludes rejected exemplars', () => {
    const top = rankTasteExemplars(exemplars, { communicativeJob: 'quantify', contractTraits: ['gold-rule'] }, 2);
    expect(top.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(top.some((e) => e.disposition === 'rejected')).toBe(false);
  });
  it('register refuses fabricated provenance', async () => {
    const save = vi.fn(async () => undefined);
    await expect(registerTasteExemplar({ save }, { id: 'x', registeredAt: '', provenance: '', summary: '', disposition: 'positive' })).rejects.toThrow(/provenance/);
  });
  it('flag defaults OFF', () => {
    expect(houseTasteBankEnabled({})).toBe(false);
    expect(houseTasteBankEnabled({ MG_HOUSE_TASTE_BANK_ENABLED: '1' })).toBe(true);
  });
});

describe('preference memory (brief §15)', () => {
  const mk = (kind: TastePreferenceEvent['kind'], id: string): TastePreferenceEvent => ({
    id, kind, userId: 'u1', projectId: 'p1', momentId: 'm1', createdAt: '2026-08-05T00:00:00.000Z', provenance: 'test',
  });
  it('exported is WEAK evidence; strong events move confidence off unknown', () => {
    const onlyExported = rebuildUserTasteProfileFromEvents([mk('exported', 'e1')], { userId: 'u1' });
    expect(onlyExported.confidence).toBe('unknown');
    expect(onlyExported.evidence[0].kind).toBe('user_edit'); // exported mapped to weak user_edit
    expect(onlyExported.evidence[0].confidence).toBe('low');
    const withDeletion = rebuildUserTasteProfileFromEvents([mk('exported', 'e1'), mk('mg_deleted', 'e2')], { userId: 'u1' });
    expect(withDeletion.confidence).toBe('low'); // strong evidence present but scarce
    expect(withDeletion.evidence.find((e) => e.id === 'e2')?.kind).toBe('user_explicit_rejection');
  });
  it('records events through the persistence seam', async () => {
    const save = vi.fn(async () => undefined);
    await recordTastePreferenceEvent({ save }, mk('candidate_selected', 'e3'));
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('flag defaults OFF', () => {
    expect(preferenceMemoryEnabled({})).toBe(false);
    expect(preferenceMemoryEnabled({ MG_PREFERENCE_MEMORY_ENABLED: '1' })).toBe(true);
  });
});
