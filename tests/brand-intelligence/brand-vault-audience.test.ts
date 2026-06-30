import { describe, expect, it } from 'vitest';
import {
  applyAudiencePsychographics,
  parseAudiencePsychographics,
} from '../../lib/shared/brand-vault-audience';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { buildRichBrandContextBlock } from '../../lib/shared/brand-context-block';
import {
  acceptBrandSignalProfileDraft,
  createBrandSignalProfileDraft,
  validateBrandSignalProfile,
} from '../../lib/shared/brand-signal-lifecycle';

describe('parseAudiencePsychographics', () => {
  it('parses the three lists from clean JSON', () => {
    const s = parseAudiencePsychographics(
      '{"valueDrivers":["save time","look credible"],"painPoints":["wasted spend"],"jobsToBeDone":["look like a big brand"]}',
    );
    expect(s).not.toBeNull();
    expect(s!.valueDrivers).toEqual(['save time', 'look credible']);
    expect(s!.painPoints).toEqual(['wasted spend']);
    expect(s!.jobsToBeDone).toEqual(['look like a big brand']);
  });

  it('strips ```json fences', () => {
    const s = parseAudiencePsychographics('```json\n{"valueDrivers":["grow faster"]}\n```');
    expect(s?.valueDrivers).toEqual(['grow faster']);
  });

  it('trims, dedupes, drops over-long, caps each list at 5', () => {
    const long = 'x'.repeat(200);
    const s = parseAudiencePsychographics(
      `{"valueDrivers":["  a  ","a","b","${long}","c","d","e","f"]}`,
    );
    expect(s?.valueDrivers).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns null when all lists are empty / garbage / missing', () => {
    expect(parseAudiencePsychographics('{"valueDrivers":[],"painPoints":[],"jobsToBeDone":[]}')).toBeNull();
    expect(parseAudiencePsychographics('not json')).toBeNull();
    expect(parseAudiencePsychographics('[1,2]')).toBeNull();
    expect(parseAudiencePsychographics(undefined)).toBeNull();
  });
});

describe('audience psychographics -> generation context', () => {
  function createAudienceProfile() {
    return deriveBrandSignalProfile(
      {
        brandId: 'brand_aud',
        userId: 'user_aud',
        name: 'Acme',
        voice: { voiceLock: 'x', nicheMap: 'ops', killList: [], hookArchetypes: [], structuralHabits: [] },
        visual: { industry: 'software', colors: ['#111111'], visualStyle: 'minimal', typography: 'Inter' },
        learning: { banditProjectCount: 0 },
      },
      { generatedAt: '2026-06-26T00:00:00.000Z' },
    );
  }

  it('applyAudiencePsychographics links motivation evidence and surfaces it in buildRichBrandContextBlock', () => {
    const profile = createAudienceProfile();

    // before: no psychographics -> no motivation lines
    expect(buildRichBrandContextBlock(profile)).not.toContain('Audience values:');

    applyAudiencePsychographics(
      profile,
      {
        valueDrivers: ['save time'],
        painPoints: ['wasted spend'],
        jobsToBeDone: ['look like a big brand'],
      },
      {
        observedAt: '2026-06-26T00:00:00.000Z',
        sourceExcerpt: 'Teams want to save time, avoid wasted spend, and look credible.',
        sourceUrl: 'https://example.com',
      },
    );

    const block = buildRichBrandContextBlock(profile);
    expect(block).toContain('Audience values: save time');
    expect(block).toContain('Audience pain points: wasted spend');
    expect(block).toContain('Audience is trying to: look like a big brand');

    const evidenceId = profile.identity.audiencePsychographics?.valueDrivers.evidenceIds[0];
    expect(evidenceId).toBeTruthy();
    expect(profile.evidence.find((item) => item.id === evidenceId)).toMatchObject({
      signalPath: 'identity.audiencePsychographics.valueDrivers',
      sourceType: 'llm_inference',
      trustLevel: 'llm_inference',
      sourceUrl: 'https://example.com',
    });
    expect(validateBrandSignalProfile(profile).valid).toBe(true);
    expect(
      acceptBrandSignalProfileDraft(
        createBrandSignalProfileDraft(profile, { id: 'draft_psycho', now: '2026-06-26T00:00:00.000Z' }),
      ).ok,
    ).toBe(true);
  });

  it('allows legacy evidence-free LLM psychographics to accept but keeps them out of prompt context', () => {
    const profile = createAudienceProfile();

    profile.identity.audiencePsychographics = {
      valueDrivers: {
        value: ['save time'],
        confidence: 0.6,
        trustLevel: 'llm_inference',
        authorityClass: 'inferred_hint',
        evidenceIds: [],
      },
      painPoints: {
        value: ['wasted spend'],
        confidence: 0.6,
        trustLevel: 'llm_inference',
        authorityClass: 'inferred_hint',
        evidenceIds: [],
      },
      jobsToBeDone: {
        value: ['look like a big brand'],
        confidence: 0.6,
        trustLevel: 'llm_inference',
        authorityClass: 'inferred_hint',
        evidenceIds: [],
      },
    };

    expect(validateBrandSignalProfile(profile).valid).toBe(true);
    expect(
      acceptBrandSignalProfileDraft(
        createBrandSignalProfileDraft(profile, { id: 'draft_legacy_psycho', now: '2026-06-26T00:00:00.000Z' }),
      ).ok,
    ).toBe(true);

    const block = buildRichBrandContextBlock(profile);
    expect(block).not.toContain('Audience values: save time');
    expect(block).not.toContain('Audience pain points: wasted spend');
    expect(block).not.toContain('Audience is trying to: look like a big brand');
  });
});