import { describe, expect, it } from 'vitest';
import {
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
} from '@/lib/thinkforge/signals';

describe('resolveContentSignalProfile', () => {
  it('resolves brand, platform, proof, and forbidden terms for social posts', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Write a warm LinkedIn post for agency founders about reducing content approval time by 37%.',
      brandId: 'brand_1',
      sessionId: 'session_1',
      project: {
        projectName: 'Ops Content Sprint',
        platform: 'LinkedIn',
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
    expect(resolved.intent.proofPoints[1]).toContain('Approval cycle benchmark');
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
      preferredAspectRatio: '4:5',
    });
  });

  it('clamps explicit signal overrides and formats a prompt block', () => {
    const resolved = resolveContentSignalProfile({
      userPrompt: 'Create a 45 second YouTube Short script with bold data-backed narration.',
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
