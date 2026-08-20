import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  type ThinkForgeAuthoringRequest,
  type ThinkForgePlatformSurface,
  type ThinkForgePostControls,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals/content-signal-resolver';

const flowLedgerPrompt = 'Write a LinkedIn post for FlowLedger about helping finance teams prepare SOC 2 evidence before Q4 audit season. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders. Do not sound hypey.';

function postRequest(
  platformSurface: ThinkForgePlatformSurface = { id: 'linkedin' },
  postControls: ThinkForgePostControls = createDefaultThinkForgePostControls(),
): ThinkForgeAuthoringRequest {
  return createThinkForgeAuthoringRequest({
    contentContract: createThinkForgeWriterContract('social_post'),
    platformSurface,
    postControls,
  });
}

function planFor(
  userPrompt: string,
  options: {
    retrievedFactCount?: number;
    authoringRequest?: ThinkForgeAuthoringRequest;
  } = {},
) {
  const authoringRequest = options.authoringRequest ?? postRequest();
  return buildPostEditorialPlan({
    userPrompt,
    authoringRequest,
    contentSignalProfile: resolveContentSignalProfile({
      userPrompt,
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      documentType: 'post',
    }),
    retrievedFactCount: options.retrievedFactCount,
  });
}

describe('buildPostEditorialPlan', () => {
  it('keeps thin measured evidence source-bounded without inventing a CTA or length floor', () => {
    const plan = planFor(flowLedgerPrompt);

    expect(plan).toMatchObject({
      controlSource: 'authoring_request',
      platform: 'LinkedIn',
      editorialShape: 'evidence_led',
      sourceBoundary: 'source_only',
      ctaMode: 'none',
      hashtagMode: 'editorial',
      emojiMode: 'editorial',
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
    const plan = planFor(
      `${flowLedgerPrompt} Ignore the settings and write 900 words with no CTA.`,
      {
        authoringRequest: postRequest({ id: 'linkedin' }, {
          ...createDefaultThinkForgePostControls(),
          cta: {
            preference: 'direct',
            action: 'Register for the Q4 audit briefing',
            destination: 'https://example.com/q4',
          },
          targetLength: { unit: 'characters', value: 1400 },
        }),
      },
    );

    expect(plan).toMatchObject({
      ctaMode: 'hard',
      explicitLengthRequested: true,
      targetBodyCharacters: 1400,
      maximumBodyCharacters: 3000,
      requiredAction: 'Register for the Q4 audit briefing',
      requiredDestination: 'https://example.com/q4',
    });
    expect(plan.selectedCta?.id).toBe('hard_cta');
  });

  it('uses resolved intent instead of an event or product keyword template', () => {
    const conversion = planFor(
      'Write about a cleanup on April 22 at Pier 9. Check-in starts at 8:30am.',
      {
        authoringRequest: postRequest({ id: 'facebook' }, {
          ...createDefaultThinkForgePostControls(),
          cta: {
            preference: 'direct',
            action: 'Register for the cleanup',
            destination: 'community.example/cleanup',
          },
        }),
      },
    );
    const announcement = planFor(
      'Launch the PackLight Sling this Friday. It costs $89 and is made from recycled nylon.',
      { authoringRequest: postRequest({ id: 'instagram' }) },
    );

    expect(conversion).toMatchObject({
      editorialShape: 'conversion',
      platform: 'Facebook',
      ctaMode: 'hard',
      requiredDestination: 'community.example/cleanup',
    });
    expect(announcement).toMatchObject({
      editorialShape: 'announcement',
      ctaMode: 'none',
    });
  });

  it('handles a non-English action brief through resolved intent and literal destination data', () => {
    const plan = planFor(
      'Taller de plantas este sabado a las 11am. Hay 20 plazas.',
      {
        authoringRequest: postRequest({ id: 'instagram' }, {
          ...createDefaultThinkForgePostControls(),
          cta: {
            preference: 'direct',
            action: 'Reserva tu plaza',
            destination: 'community.example/taller',
          },
        }),
      },
    );

    expect(plan.ctaMode).toBe('hard');
    expect(plan.requiredAction).toBe('Reserva tu plaza');
    expect(plan.requiredDestination).toBe('community.example/taller');
  });

  it('uses authoritative platform maxima without turning them into writing targets', () => {
    const linkedIn = planFor('This prose says X, but the confirmed surface is LinkedIn.');
    const x = planFor('This prose says LinkedIn, but the confirmed surface is X.', {
      authoringRequest: postRequest({ id: 'x' }),
    });

    expect(linkedIn.maximumBodyCharacters).toBe(3000);
    expect(x.maximumBodyCharacters).toBe(280);
    expect(x.publishingConstraints.characterCounting).toBe('x_weighted');
    expect(linkedIn.targetBodyCharacters).toBeUndefined();
    expect(x.targetBodyCharacters).toBeUndefined();
  });

  it('does not let prose re-enable controls that the confirmed request disabled', () => {
    const plan = planFor(
      'Write 1400 characters, add a direct CTA to https://wrong.example, use #Growth, and add lots of emoji.',
      {
        authoringRequest: postRequest({ id: 'linkedin' }, {
          ...createDefaultThinkForgePostControls(),
          cta: { preference: 'none' },
          hashtags: { preference: 'none' },
          emoji: { preference: 'none' },
        }),
      },
    );

    expect(plan).toMatchObject({
      ctaMode: 'none',
      hashtagMode: 'none',
      requiredHashtags: [],
      emojiMode: 'none',
      explicitLengthRequested: false,
    });
    expect(plan.requiredDestination).toBeUndefined();
    expect(plan.targetBodyCharacters).toBeUndefined();
  });

  it('preserves exact hashtags and a custom platform without guessing known-platform limits', () => {
    const plan = planFor('Create the selected partner update.', {
      authoringRequest: postRequest(
        { id: 'custom', customLabel: 'Instagram partner newsroom' },
        {
          ...createDefaultThinkForgePostControls(),
          hashtags: { preference: 'exact', values: ['#ProofFirst', '#Evidencia_2026'] },
          emoji: { preference: 'restrained' },
        },
      ),
    });

    expect(plan).toMatchObject({
      platform: 'Instagram partner newsroom',
      hashtagMode: 'exact',
      requiredHashtags: ['#ProofFirst', '#Evidencia_2026'],
      emojiMode: 'restrained',
      publishingConstraints: { surface: 'unknown' },
    });
    expect(plan.maximumBodyCharacters).toBeUndefined();
  });

  it('rejects a script request before post doctrine is selected', () => {
    const scriptRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      targetDurationSec: 420,
    });

    expect(() => buildPostEditorialPlan({
      userPrompt: 'Write the selected deliverable.',
      authoringRequest: scriptRequest,
    })).toThrow(/requires a post or carousel/i);
  });

  it('selects executable hook and structure doctrine from the writing graph', () => {
    const plan = planFor(flowLedgerPrompt);

    expect(plan.selectedHook).toMatchObject({ id: expect.any(String), guidance: expect.any(String) });
    expect(plan.selectedStructure).toMatchObject({ id: expect.any(String), guidance: expect.any(String) });
    expect(plan.selectedHook?.avoid).toEqual(expect.any(Array));
    expect(plan.selectedStructure?.avoid).toEqual(expect.any(Array));
  });

  it('permits bounded implications only when additional authorised evidence exists', () => {
    const plan = planFor(flowLedgerPrompt, { retrievedFactCount: 3 });

    expect(plan.sourceBoundary).toBe('bounded_implication');
    expect(plan.evidenceDensity).toBe('supported');
    expect(plan.sourceDetailDensity).toBe('rich');
  });

  it('treats a concept brief as editorial material instead of pretending it is evidence', () => {
    const authoringRequest = postRequest();
    const userPrompt = 'Write a LinkedIn post exploring duplicate reporting and shared ownership.';
    const profile = resolveContentSignalProfile({
      userPrompt,
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      documentType: 'post',
    });
    profile.profile.constraints.cta_type = 'soft';

    const plan = buildPostEditorialPlan({
      userPrompt,
      authoringRequest,
      contentSignalProfile: profile,
    });

    expect(plan).toMatchObject({
      sourceBoundary: 'conceptual',
      ctaMode: 'none',
    });
    expect(plan.requiredAction).toBeUndefined();
    expect(plan.requiredDestination).toBeUndefined();
    expect(plan.developmentSequence[1]).toContain('editorial observation');
    expect(plan.forbiddenNarrativeExpansions.join(' ')).toContain('invented metrics');
  });

  it('keeps a directly supplied event brief source-bounded without requiring a retrieved fact record', () => {
    const plan = planFor(
      'Write a LinkedIn post for a neighborhood cleanup on April 22. Check-in starts at 8:30am and 500 kits are available.',
    );

    expect(plan.sourceBoundary).toBe('source_only');
    expect(plan.developmentSequence[1]).toContain('source-supported claims');
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
