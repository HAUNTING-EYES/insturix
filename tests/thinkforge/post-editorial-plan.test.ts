import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals/content-signal-resolver';

const flowLedgerPrompt = 'Write a LinkedIn post for FlowLedger about helping finance teams prepare SOC 2 evidence before Q4 audit season. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders. Do not sound hypey.';

function planFor(userPrompt: string, retrievedFactCount = 0) {
  return buildPostEditorialPlan({
    userPrompt,
    contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    retrievedFactCount,
  });
}

describe('buildPostEditorialPlan', () => {
  it('keeps thin measured evidence source-bounded without inventing a CTA or length floor', () => {
    const plan = planFor(flowLedgerPrompt);

    expect(plan).toMatchObject({
      editorialShape: 'evidence_led',
      sourceBoundary: 'source_only',
      ctaMode: 'none',
      evidenceDensity: 'thin',
      maximumBodyCharacters: 3000,
      requiredAudience: 'CFOs and RevOps leaders',
      requiredClaim: 'the beta cut evidence-chasing time by 37% across 12 pilot teams',
      hookProofMarkers: ['37%'],
      hookRequiresProof: true,
    });
    expect(plan.targetBodyCharacters).toBeUndefined();
    expect(plan.targetBodyWords).toBeUndefined();
    expect(plan.selectedCta).toBeUndefined();
    expect(plan.developmentSequence.at(-1)).toContain('do not append a perfunctory CTA');
  });

  it('preserves an explicit length and exact supplied destination as hard inputs', () => {
    const plan = planFor(`${flowLedgerPrompt} Write 1400 characters and register at https://example.com/q4.`);

    expect(plan).toMatchObject({
      ctaMode: 'supplied_action',
      explicitLengthRequested: true,
      targetBodyCharacters: 1400,
      maximumBodyCharacters: 3000,
      requiredDestination: 'https://example.com/q4',
    });
    expect(plan.selectedCta?.id).toBe('hard_cta');
  });

  it('uses resolved intent instead of an event or product keyword template', () => {
    const conversion = planFor('Write a Facebook post for a cleanup on April 22 at Pier 9. Check-in starts at 8:30am. Register at community.example/cleanup.');
    const announcement = planFor('Write an Instagram caption launching the PackLight Sling this Friday. It costs $89 and is made from recycled nylon.');

    expect(conversion).toMatchObject({
      editorialShape: 'conversion',
      ctaMode: 'supplied_action',
      requiredDestination: 'community.example/cleanup',
    });
    expect(announcement).toMatchObject({
      editorialShape: 'announcement',
      ctaMode: 'none',
    });
  });

  it('handles a non-English action brief through resolved intent and literal destination data', () => {
    const plan = planFor('Escribe un post de Instagram. Taller de plantas este sabado a las 11am. Hay 20 plazas. Inscripcion: community.example/taller.');

    expect(plan.ctaMode).toBe('supplied_action');
    expect(plan.requiredDestination).toBe('community.example/taller');
  });

  it('uses authoritative platform maxima without turning them into writing targets', () => {
    const linkedIn = planFor('Write a LinkedIn post about a calm operating update with no call to action.');
    const x = planFor('Write a short X post about a product update with no call to action.');

    expect(linkedIn.maximumBodyCharacters).toBe(3000);
    expect(x.maximumBodyCharacters).toBe(280);
    expect(linkedIn.targetBodyCharacters).toBeUndefined();
    expect(x.targetBodyCharacters).toBeUndefined();
  });

  it('selects executable hook and structure doctrine from the writing graph', () => {
    const plan = planFor(flowLedgerPrompt);

    expect(plan.selectedHook).toMatchObject({ id: expect.any(String), guidance: expect.any(String) });
    expect(plan.selectedStructure).toMatchObject({ id: expect.any(String), guidance: expect.any(String) });
    expect(plan.selectedHook?.avoid).toEqual(expect.any(Array));
    expect(plan.selectedStructure?.avoid).toEqual(expect.any(Array));
  });

  it('permits bounded implications only when additional authorised evidence exists', () => {
    const plan = planFor(flowLedgerPrompt, 3);

    expect(plan.sourceBoundary).toBe('bounded_implication');
    expect(plan.evidenceDensity).toBe('supported');
    expect(plan.sourceDetailDensity).toBe('rich');
  });

  it('contains no customer, evaluation-case, event-family, or fixed-length classifier', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/thinkforge/agents/post-editorial-plan.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/FlowLedger|RiverAid|Luna Verde|TrailNest/i);
    expect(source).not.toMatch(/EVENT_CONTEXT_PATTERN|SCHEDULE_PATTERN|EXPLICIT_OFFER_PATTERN|defaultLengthEnvelope/);
    expect(source).not.toMatch(/targetBodyCharacters:\s*(?:400|450|600|900|1200)/);
  });
});
