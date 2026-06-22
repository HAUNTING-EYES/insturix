import { describe, expect, it } from 'vitest';
import { createInMemoryBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { writeThinkForgeBrandDNAToBrandVault } from '@/lib/thinkforge/services/brand-vault-voice-evidence';

describe('writeThinkForgeBrandDNAToBrandVault', () => {
  it('stages manual BrandDNA updates as reviewable Brand Vault evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      sessionId: 'session_1',
      actorId: 'user_1',
      source: 'manual_brand_dna_edit',
      now: '2026-06-22T10:00:00.000Z',
      store,
      updates: {
        voiceLock: 'warm expert plainspoken',
        nicheMap: 'agency founders and in-house content teams',
        killList: ['game-changing'],
        hookArchetypes: ['contrarian opener'],
        structuralHabits: ['open with the broken process'],
      },
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ candidateCount: 4 });
    if (!result.ok || result.skipped) throw new Error('expected Brand Vault write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.job.status).toBe('needs_review');
    expect(snapshot?.job.brandId).toBe('brand_1');
    expect(snapshot?.recordId).toBe(result.recordId);
    expect(snapshot?.candidates.map((candidate) => candidate.signalPath).sort()).toEqual([
      'identity.audience',
      'voice.hookArchetypes',
      'voice.killList',
      'voice.recurringPhrases',
    ]);
    const record = await store.getRecord(result.recordId);
    expect(record?.review.required).toBe(true);
    expect(record?.status).toBe('draft');
    expect(record?.profile.identity.audience.value).toContain('agency founders and in-house content teams');
    expect(record?.profile.voice.killList.value).toContain('game-changing');
    expect(record?.profile.voice.killList.trustLevel).toBe('manual_user_entry');
    expect(record?.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['warm expert plainspoken', 'open with the broken process']),
    );
    expect(record?.profile.evidence.some((item) => item.extractor === 'thinkforge-brand-dna-dual-write.v1')).toBe(true);
  });

  it('stores fingerprint and exemplar summaries without accepting them as truth', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      source: 'voice_fingerprint_extract',
      now: '2026-06-22T11:00:00.000Z',
      store,
      updates: {
        voiceFingerprint: {
          avgWordsPerSentence: 9,
          sentenceLengthVariance: 1.5,
          topBigrams: [['brand system', 2]],
          punctuationProfile: { comma: 0.2 },
          passiveVoiceRatio: 0.05,
          questionFrequency: 0.12,
          sentenceRhythm: ['short', 'medium'],
          openingPattern: 'direct_claim',
          transitionStyle: 'implicit',
          closingPattern: 'reframe',
          listStyle: 'none',
          extractedFromCount: 5,
        },
        voiceExemplars: [
          {
            id: 'exemplar_1',
            text: 'Content production is broken. One platform. Not ten.',
            signalProfile: { warmth: 0.4, directness: 0.9 },
            contentType: 'linkedin',
            pinned: true,
            weight: 0.9,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error('expected Brand Vault write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.candidates).toHaveLength(1);
    expect(snapshot?.candidates[0]).toMatchObject({
      signalPath: 'voice.recurringPhrases',
      sourceField: 'thinkforge.brandDNA.voiceFingerprint',
      trustLevel: 'manual_user_entry',
    });

    const record = await store.getRecord(result.recordId);
    expect(record?.status).toBe('draft');
    expect(record?.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining([
        'opening pattern: direct_claim',
        'transition style: implicit',
        'Content production is broken. One platform. Not ten.',
      ]),
    );
  });

  it('skips cleanly when no supported BrandDNA fields changed', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      source: 'manual_brand_dna_edit',
      now: '2026-06-22T12:00:00.000Z',
      store,
      updates: {},
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'no_supported_updates' });
  });
});
