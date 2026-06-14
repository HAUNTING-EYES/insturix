import { describe, expect, it } from 'vitest';
import { mergeBrandDNA, type BrandDNA } from '@/lib/thinkforge/services/db';

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
});
