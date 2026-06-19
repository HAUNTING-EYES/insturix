import { describe, expect, it } from 'vitest';
import { deriveBrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import {
  composeBrandDNAWithBrandVault,
  mergeBrandDNA,
  type BrandDNA,
} from '@/lib/thinkforge/services/db';

describe('mergeBrandDNA', () => {
  it('preserves learned voice fingerprint and exemplars when project overrides exist', () => {
    const userDNA: BrandDNA = {
      voiceLock: 'warm expert',
      nicheMap: 'agency founders',
      killList: ['game-changing'],
      hookArchetypes: ['contrarian opener'],
      structuralHabits: ['short setup'],
      voiceFingerprint: {
        avgWordsPerSentence: 9,
        sentenceLengthVariance: 2.4,
        topBigrams: [['approval loop', 3]],
        punctuationProfile: { comma: 0.2 },
        passiveVoiceRatio: 0.1,
        questionFrequency: 0.05,
        sentenceRhythm: ['short', 'medium'],
        openingPattern: 'direct_claim',
        transitionStyle: 'implicit',
        closingPattern: 'reframe',
        listStyle: 'none',
        extractedFromCount: 4,
      },
      voiceExemplars: [
        {
          id: 'global_1',
          text: 'This is how the brand opens.',
          signalProfile: { warmth: 0.8 },
          contentType: 'linkedin',
          pinned: true,
          weight: 0.9,
        },
      ],
    };

    const projectDNA: BrandDNA = {
      voiceLock: 'sharp operator',
      killList: ['revolutionary'],
      voiceExemplars: [
        {
          id: 'project_1',
          text: 'This project prefers tighter proof-first copy.',
          signalProfile: { ethos_load: 0.9 },
          contentType: 'linkedin',
          pinned: false,
          weight: 0.7,
        },
      ],
    };

    const merged = mergeBrandDNA(userDNA, projectDNA);

    expect(merged.voiceLock).toBe('sharp operator');
    expect(merged.nicheMap).toBe('agency founders');
    expect(merged.killList).toEqual(['game-changing', 'revolutionary']);
    expect(merged.voiceFingerprint).toBe(userDNA.voiceFingerprint);
    expect(merged.voiceExemplars?.map((exemplar) => exemplar.id)).toEqual(['global_1', 'project_1']);
  });

  it('composes accepted Brand Vault signals without replacing learned voice layers', async () => {
    const baseDNA: BrandDNA = {
      voiceLock: 'Keep the learned lock sentence.',
      nicheMap: 'legacy agency operators',
      killList: ['cheap'],
      hookArchetypes: ['legacy hook'],
      structuralHabits: ['legacy opening'],
      voiceFingerprint: {
        avgWordsPerSentence: 8,
        sentenceLengthVariance: 1.8,
        topBigrams: [['approval loop', 2]],
        punctuationProfile: { comma: 0.1 },
        passiveVoiceRatio: 0.04,
        questionFrequency: 0.08,
        sentenceRhythm: ['short', 'medium'],
        openingPattern: 'direct_claim',
        transitionStyle: 'implicit',
        closingPattern: 'reframe',
        listStyle: 'none',
        extractedFromCount: 3,
      },
      voiceExemplars: [
        {
          id: 'learned_1',
          text: 'This learned exemplar should survive.',
          signalProfile: { warmth: 0.7 },
          contentType: 'linkedin',
          pinned: true,
          weight: 0.9,
        },
      ],
    };

    const vaultProfile = deriveBrandSignalProfile({
      brandId: 'brand_1',
      userId: 'user_1',
      name: 'Vault Brand',
      voice: {
        voiceLock: 'Do not overwrite the learned lock.',
        nicheMap: 'creative ops teams',
        killList: ['generic', 'cheap'],
        hookArchetypes: ['system-led'],
        structuralHabits: ['open with the broken process'],
      },
      visual: {
        industry: 'content production software',
        colors: ['#101010', '#ff5722'],
        visualStyle: 'sharp operator-grade interface',
        typography: 'Space Grotesk',
      },
      learning: { banditProjectCount: 0 },
    }, { generatedAt: '2026-06-18T00:00:00.000Z' });

    let receivedFilter: { brandId?: string; userId?: string } | undefined;
    const composed = await composeBrandDNAWithBrandVault(baseDNA, 'user_1', 'brand_1', {
      enabled: true,
      getAcceptedProfile: async (filter) => {
        receivedFilter = filter;
        return vaultProfile;
      },
    });

    expect(receivedFilter).toEqual({ brandId: 'brand_1', userId: 'user_1' });
    expect(composed.voiceLock).toBe('Keep the learned lock sentence.');
    expect(composed.nicheMap).toBe('creative ops teams');
    expect(composed.killList).toEqual(['generic', 'cheap']);
    expect(composed.hookArchetypes).toEqual(['system-led']);
    expect(composed.structuralHabits).toEqual(['open with the broken process']);
    expect(composed.voiceFingerprint).toBe(baseDNA.voiceFingerprint);
    expect(composed.voiceExemplars).toBe(baseDNA.voiceExemplars);
  });

  it('does not read Brand Vault without an explicit brand scope', async () => {
    const baseDNA: BrandDNA = { voiceLock: 'legacy voice' };
    let reads = 0;

    const composed = await composeBrandDNAWithBrandVault(baseDNA, 'user_1', undefined, {
      enabled: true,
      getAcceptedProfile: async () => {
        reads += 1;
        return null;
      },
    });

    expect(composed).toBe(baseDNA);
    expect(reads).toBe(0);
  });
});
