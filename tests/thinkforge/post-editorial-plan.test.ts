import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals/content-signal-resolver';

const flowLedgerPrompt = 'Write a LinkedIn post for FlowLedger about helping finance teams prepare SOC 2 evidence before Q4 audit season. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders. Do not sound hypey.';

describe('buildPostEditorialPlan', () => {
  it('keeps a thin-evidence post concise, source-bounded, and proof-led', () => {
    const plan = buildPostEditorialPlan({
      userPrompt: flowLedgerPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt: flowLedgerPrompt, documentType: 'post' }),
    });

    expect(plan).toMatchObject({
      editorialShape: 'evidence_led',
      sourceBoundary: 'bounded_implication',
      ctaMode: 'source_question',
      evidenceDensity: 'thin',
      targetBodyCharacters: 600,
      maximumBodyCharacters: 1100,
      requiredAudience: 'CFOs and RevOps leaders',
      requiredClaim: 'the beta cut evidence-chasing time by 37% across 12 pilot teams',
      hookProofAttribution: 'the beta',
      hookProofMarkers: ['37%'],
      hookRequiresProof: true,
    });
    expect(plan.developmentSequence).toContain(
      'Use a direct source-backed product or workflow definition for context, or state an explicit scope limitation; do not infer an operational outcome.',
    );
    expect(plan.developmentSequence.join(' ')).not.toContain('workflow friction plus supplied proof');
    expect(plan.visualProofDirection).toContain('before/after evidence queue');
    expect(plan.forbiddenNarrativeExpansions).toContain('unsupplied product capabilities or mechanisms');
  });

  it('keeps an explicit requested length and supplied action authoritative', () => {
    const userPrompt = `${flowLedgerPrompt} Write 1400 characters and register at https://example.com/q4.`;
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
      retrievedFactCount: 3,
    });

    expect(plan.ctaMode).toBe('supplied_action');
    expect(plan.explicitLengthRequested).toBe(true);
    expect(plan.evidenceDensity).toBe('supported');
    expect(plan.targetBodyCharacters).toBeUndefined();
    expect(plan.maximumBodyCharacters).toBeUndefined();
  });

  it('keeps a scheduled participation post inside its supplied event evidence', () => {
    const userPrompt = 'Write a Facebook post recruiting volunteers for a cleanup on April 22 at Pier 9. We have 500 cleanup kits, check-in starts at 8:30am, families are welcome, and registration is at community.example/cleanup.';
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan).toMatchObject({
      editorialShape: 'event_action',
      sourceBoundary: 'source_only',
      ctaMode: 'supplied_action',
      sourceDetailDensity: 'rich',
      targetBodyCharacters: 450,
      maximumBodyCharacters: 700,
      requiredDestination: 'community.example/cleanup',
      hookRequiresProof: false,
    });
    expect(plan.developmentSequence).toHaveLength(3);
    expect(plan.visualProofDirection).toContain('source-supplied event evidence');
    expect(plan.forbiddenNarrativeExpansions).toContain(
      'unsupplied causes, conditions, or community problems',
    );
  });

  it('recognizes a non-English scheduled event with a naked action URL', () => {
    const userPrompt = 'Escribe un post de Instagram. Evento: taller de plantas este sabado a las 11am. Hay 20 plazas. Inscripcion: community.example/taller.';
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan.editorialShape).toBe('event_action');
    expect(plan.ctaMode).toBe('supplied_action');
  });

  it('does not confuse a dated product launch with an attended event', () => {
    const userPrompt = 'Write an Instagram caption launching the PackLight Sling this Friday. It costs $89 and is made from recycled nylon.';
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan.editorialShape).toBe('offer_announcement');
    expect(plan.sourceBoundary).toBe('source_only');
    expect(plan.targetBodyCharacters).toBe(400);
    expect(plan.maximumBodyCharacters).toBe(650);
    expect(plan.hookProofMarkers).toEqual([]);
    expect(plan.hookRequiresProof).toBe(false);
  });

  it('keeps quantitative evidence as the spine when a long brief also promotes a webinar', () => {
    const userPrompt = [
      'Write a LinkedIn post aimed at city managers and 311 directors.',
      'A routing dashboard groups duplicate service questions before they reach staff.',
      'Mention that Maple County reduced duplicate ticket handling by 18% over six weeks.',
      'Also mention the webinar on July 8 and register at civic.example/webinar.',
    ].join(' ');
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan).toMatchObject({
      editorialShape: 'evidence_led',
      sourceBoundary: 'bounded_implication',
      ctaMode: 'supplied_action',
      hookProofMarkers: ['18%'],
      hookProofAttribution: 'Maple County',
      requiredDestination: 'civic.example/webinar',
      hookRequiresProof: true,
    });
  });

  it('does not treat a supplied price or date as performance proof for a product launch', () => {
    const userPrompt = 'Launch the recycled-nylon PackLight Sling for $89 this Friday.';
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan.editorialShape).toBe('offer_announcement');
    expect(plan.hookProofMarkers).toEqual([]);
    expect(plan.hookRequiresProof).toBe(false);
  });

  it('uses a concrete brief-supplied offer as the CTA action without requiring a URL', () => {
    const userPrompt = 'Write a dry LinkedIn post. Offer: free teardown of one dashboard this Thursday.';
    const plan = buildPostEditorialPlan({
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({ userPrompt, documentType: 'post' }),
    });

    expect(plan.ctaMode).toBe('supplied_action');
  });

  it('contains no customer or evaluation-case names in production classification code', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/thinkforge/agents/post-editorial-plan.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/FlowLedger|RiverAid|Luna Verde|TrailNest/i);
  });
});
