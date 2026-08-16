import { describe, expect, it } from 'vitest';
import {
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
} from '@/lib/thinkforge/signals';
import {
  deriveBrandSignalProfile,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

function brand(): UnifiedBrand {
  return {
    brandId: 'brand_creative',
    userId: 'user_creative',
    name: 'Northstar Analytics',
    voice: {
      voiceLock: 'Confident, warm, technical B2B voice with direct CTAs.',
      nicheMap: 'Revenue teams at data-forward SaaS companies',
      killList: ['cheap'],
      hookArchetypes: ['metric-led proof'],
      structuralHabits: ['lead with one hard number'],
    },
    visual: {
      industry: 'B2B analytics',
      colors: ['#102033', '#ff6a00', '#f7f7f7'],
      visualStyle: 'minimal data dashboard with expressive sharp transitions',
      typography: 'Geometric sans',
    },
    learning: {
      banditProjectCount: 0,
    },
  };
}

function acceptedProfile(): BrandSignalProfile {
  const draft = deriveBrandSignalProfile(brand(), {
    generatedAt: '2026-06-20T00:00:00.000Z',
  });

  setSignal(draft.voice.humor, 0.7, 0.88);
  setSignal(draft.motion.motionEnergy, 0.83, 0.86);
  setSignal(draft.identity.proofStyle, 'metrics', 0.8);

  return draft;
}

function setSignal<T>(signal: BrandSignal<T>, value: T, confidence: number): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = 'brand_preference';
  delete signal.fallbackReason;
}

describe('resolveContentSignalProfile', () => {
  it('keeps typed output and platform authority above contradictory prose and legacy fields', () => {
    const authoringRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' as const },
      targetDurationSec: 420,
    };
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a short LinkedIn post about our seven-minute YouTube documentary.',
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      project: { format: 'Instagram post', platform: 'LinkedIn' },
    });

    expect(resolved.profile.constraints.output_format).toBe('video_script');
    expect(resolved.intent.platform).toBe('YouTube');
  });

  it('preserves an exact custom platform label and rejects a competing contract', () => {
    const authoringRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: {
        id: 'custom' as const,
        customLabel: 'Instagram-adjacent partner portal',
      },
      targetDurationSec: 420,
    };

    expect(resolveContentSignalProfile({
      userPrompt: 'Draft the selected deliverable.',
      authoringRequest,
    }).intent.platform).toBe('Instagram-adjacent partner portal');
    expect(() => resolveContentSignalProfile({
      userPrompt: 'Draft the selected deliverable.',
      authoringRequest,
      contentContract: createThinkForgeWriterContract('social_post'),
    })).toThrow(/conflicting authoring and document contracts/i);
  });

  it('resolves brand, platform, proof, and forbidden terms for social posts', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a warm LinkedIn post for agency founders about reducing content approval time by 37%.',
      brandId: 'brand_1',
      sessionId: 'session_1',
      project: {
        projectName: 'Ops Content Sprint',
        platform: 'LinkedIn',
        format: 'post',
        tone: 'warm expert',
        purpose: 'agency founders',
      },
      retrievedContext: {
        brandDNA: {
          voiceLock: 'warm, expert, plainspoken',
          nicheMap: 'B2B agencies and operators',
          killList: ['revolutionary', 'game-changing'],
          hookArchetypes: ['contrarian opener'],
          structuralHabits: ['short setup, concrete proof, soft CTA'],
        },
        projectFacts: [
          {
            id: 'fact_1',
            title: 'Approval cycle benchmark',
            summary: 'Teams lose momentum when review cycles exceed two days.',
            tags: ['approval'],
          },
        ],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    });

    expect(resolved.profile.constraints.output_format).toBe('social_post');
    expect(resolved.intent.platform).toBe('LinkedIn');
    expect(resolved.intent.audience).toBe('agency founders');
    expect(resolved.intent.forbiddenTerms).toContain('game-changing');
    expect(resolved.intent.proofPoints).toContain('Metric mentioned in brief: 37%');
    expect(resolved.intent.proofPoints.some((point) => point.includes('Approval cycle benchmark'))).toBe(true);
    expect(resolved.intent.structuralHints).toContain('short setup, concrete proof, soft CTA');
    expect(resolved.profile.signals.warmth).toBeGreaterThan(0.7);
    expect(resolved.profile.signals.ethos_load).toBeGreaterThan(0.7);
    expect(resolved.profile._inference_metadata?.warmth.source).toBe('user_explicit');
    expect(resolved.sources.brandContextPresent).toBe(true);
  });

  it('detects visual Clickatron needs for text plus image content', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Make an Instagram text + image post with a static graphic about a trending meme in our niche.',
      project: {
        platform: 'Instagram',
        format: 'post',
      },
    });

    expect(resolved.profile.constraints.output_format).toBe('social_post');
    expect(resolved.intent.platform).toBe('Instagram');
    expect(resolved.intent.clickatron.requested).toBe(true);
    expect(resolved.intent.clickatron.assetIntent).toBe('static_image');
    expect(resolved.intent.visualNeeds).toContain('static visual concept');
    expect(resolved.profile.signals.kairos_pressure).toBeGreaterThan(0.7);
  });

  it('prioritizes an explicit target and preserves an explicit numeric proof claim', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a LinkedIn post for FlowLedger about SOC 2 readiness. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders.',
      project: { platform: 'LinkedIn', format: 'post' },
    });

    expect(resolved.intent.audience).toBe('CFOs and RevOps leaders');
    expect(resolved.intent.proofPoints).toContain(
      'Required brief claim: the beta cut evidence-chasing time by 37% across 12 pilot teams',
    );
    expect(resolved.intent.proofPoints).toContain('Required audience anchor: CFOs and RevOps leaders');
  });

  it('keeps short Instagram captions as static social posts', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt:
        'Write an Instagram caption and Clickatron-ready text + image post for our new vitamin C serum launch photo.',
      documentType: 'post',
      platform: 'Instagram',
      brandId: 'brand_glow',
      project: {
        projectName: 'Vitamin C Serum Launch',
        platform: 'Instagram',
        format: 'post',
        purpose: 'product launch',
        tone: 'warm expert',
      },
      context: {
        projectSummary: 'GlowNaturals is a clean skincare brand launching a vitamin C serum.',
        systemBrief:
          'Brand DNA: warm, ingredient-aware, sensory, transparent. Audience: women 25-40. Structural habit: short caption, ingredient proof, soft CTA.',
      },
      retrievedContext: {
        brandDNA: {
          voiceLock: 'warm, ingredient-aware, sensory, transparent',
          nicheMap: 'clean skincare buyers',
          killList: ['miracle', 'chemical-free'],
          hookArchetypes: ['sensory product hook'],
          structuralHabits: ['short caption, ingredient proof, soft CTA'],
        },
        projectFacts: [
          {
            id: 'fact_serum_1',
            title: 'Formula proof',
            summary: 'The serum uses 10% stabilized vitamin C and refillable glass packaging.',
            tags: ['product', 'sustainability'],
          },
        ],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    });

    expect(resolved.profile.constraints.output_format).toBe('social_post');
    expect(resolved.intent.clickatron.assetIntent).toBe('static_image');
    expect(resolved.profile.constraints.platform_constraints).toMatchObject({
      platform: 'Instagram',
      surface: 'instagram_feed',
    });
    expect(resolved.profile.constraints.platform_constraints).not.toHaveProperty('maxDurationSeconds');
    expect(resolved.profile.constraints.platform_constraints).not.toHaveProperty('preferredAspectRatio');
  });

  it('turns an explicit concise social-post request into a smaller character target', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a short LinkedIn post about a new audit workflow.',
      documentType: 'post',
      project: { platform: 'LinkedIn', format: 'post' },
    });

    expect(resolved.profile.constraints.target_length).toEqual({ value: 600, unit: 'characters' });
  });

  it('keeps X length capability-dependent instead of treating standard access as universal', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a short, honest X post about reaching 1,000 paying users.',
      documentType: 'post',
      project: { platform: 'X', format: 'post' },
    });

    expect(resolved.profile.constraints.target_length).toEqual({ value: 220, unit: 'characters' });
    expect(resolved.profile.constraints.platform_constraints).toMatchObject({
      platform: 'X',
      surface: 'x_post',
      standardMaxCharacters: 280,
      extendedPostsRequireCapability: true,
    });
    expect(resolved.profile.constraints.platform_constraints).not.toHaveProperty('maxCharacters');
  });

  it('preserves an explicit seven-minute YouTube target without applying Shorts constraints', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a 7-minute YouTube documentary script about the history of urban forests.',
      documentType: 'video_script',
      platform: 'YouTube',
    });

    expect(resolved.profile.constraints.target_length).toEqual({ value: 420, unit: 'seconds' });
    expect(resolved.profile.constraints.platform_constraints).toMatchObject({
      platform: 'YouTube',
      surface: 'youtube_video',
    });
    expect(resolved.profile.constraints.platform_constraints).not.toHaveProperty('maxDurationSeconds');
    expect(resolved.profile.constraints.platform_constraints).not.toHaveProperty('aspectRatio');
  });

  it('applies the verified duration ceiling only to an explicit YouTube Shorts surface', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a 45-second YouTube Short about an audit workflow.',
      documentType: 'video_script',
      platform: 'youtube-shorts',
    });

    expect(resolved.profile.constraints.target_length).toEqual({ value: 45, unit: 'seconds' });
    expect(resolved.profile.constraints.platform_constraints).toMatchObject({
      surface: 'youtube_shorts',
      maxDurationSeconds: 180,
    });
  });

  it('fails closed when no document contract or supported document type is supplied', () => {
    expect(() => resolveContentSignalProfile({
      userPrompt: 'Make something about audit workflows.',
    })).toThrow(/requires an explicit document contract or supported document type/i);
  });

  it('keeps the exact metric-bearing sentence when a brief also mentions an event', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: [
        'Write a LinkedIn post for CivicDesk.',
        'Pilot detail: Maple County reduced duplicate ticket handling by 18% over six weeks, but we cannot promise every city will get the same result.',
        'Mention the webinar on July 8 with former 311 director Priya Menon.',
      ].join(' '),
      documentType: 'post',
      project: { platform: 'LinkedIn', format: 'post' },
    });

    expect(resolved.intent.proofPoints).toContain('Metric mentioned in brief: 18%');
    expect(resolved.intent.proofPoints).toContain(
      'Required brief claim: Maple County reduced duplicate ticket handling by 18% over six weeks, but we cannot promise every city will get the same result',
    );
    expect(resolved.intent.proofPoints).toContain(
      'Required brief claim: the webinar on July 8 with former 311 director Priya Menon',
    );
  });

  it('applies accepted Brand Vault signals as brand-level creative defaults without overriding explicit instructions', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a LinkedIn post about the launch.',
      documentType: 'post',
      brandId: 'brand_creative',
      retrievedContext: {
        brandDNA: {},
        brandSignalProfile: acceptedProfile(),
        projectFacts: [],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
      signalOverrides: {
        humor: 0.1,
      },
    });

    expect(resolved.sources.brandVaultProfilePresent).toBe(true);
    expect(resolved.profile.signals.enthusiasm).toBe(0.83);
    expect(resolved.profile._inference_metadata?.enthusiasm).toMatchObject({
      source: 'brand_dna',
      confidence: 0.86,
    });
    expect(resolved.profile._inference_metadata?.enthusiasm.resolvedFrom).toContain('brand_vault:');
    expect(resolved.profile.signals.humor).toBe(0.1);
    expect(resolved.profile._inference_metadata?.humor.source).toBe('user_explicit');
    expect(resolved.profile.signals.logos_load).toBe(0.78);
  });

  it('clamps explicit signal overrides and formats a prompt block', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Create a 45 second YouTube Short script with bold data-backed narration.',
      documentType: 'video_script',
      signalOverrides: {
        humor: 2,
        emotional_valence: -2,
      },
    });

    expect(resolved.profile.constraints.output_format).toBe('video_script');
    expect(resolved.profile.constraints.target_length).toEqual({ value: 45, unit: 'seconds' });
    expect(resolved.profile.signals.humor).toBe(1);
    expect(resolved.profile.signals.emotional_valence).toBe(-1);
    expect(resolved.warnings.some((warning) => warning.includes('humor'))).toBe(true);

    const promptBlock = formatContentSignalProfileForPrompt(resolved);
    expect(promptBlock).toContain('<content_signal_profile>');
    expect(promptBlock).toContain('"output_format": "video_script"');
    expect(promptBlock).toContain('"assetIntent": "none"');
  });
});
