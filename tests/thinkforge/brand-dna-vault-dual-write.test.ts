import { describe, expect, it } from 'vitest';
import {
  createInMemoryBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import { createBrandSignalProfileDraft, type BrandSignalProfileRecord } from '@/lib/shared/brand-signal-lifecycle';
import { deriveBrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import { writeThinkForgeBrandDNAToBrandVault } from '@/lib/thinkforge/services/brand-vault-voice-evidence';

async function seedAcceptedBrand(
  store: BrandVaultRefineryStore,
  overrides: Partial<UnifiedBrand> = {},
): Promise<BrandSignalProfileRecord> {
  const brand: UnifiedBrand = {
    brandId: 'brand_1',
    userId: 'user_1',
    name: 'Canonical Brand',
    voice: {
      voiceLock: 'precise and evidence-led',
      nicheMap: 'operations leaders',
      killList: ['cheap'],
      hookArchetypes: ['proof first'],
      structuralHabits: ['preserve this accepted cadence'],
    },
    visual: {
      colors: ['#102030', '#20c080', '#f7f8fa'],
      visualStyle: 'structured editorial photography',
      typography: 'Humanist sans',
    },
    learning: { banditProjectCount: 0 },
    ...overrides,
  };
  const draft = createBrandSignalProfileDraft(
    deriveBrandSignalProfile(brand, {
      generatedAt: '2026-06-22T09:00:00.000Z',
      extractor: 'test-canonical-brand.v1',
    }),
    { id: `accepted_${brand.brandId}`, now: '2026-06-22T09:00:00.000Z' },
  );
  await store.saveRecord(draft, { now: draft.createdAt, actorId: brand.userId });
  const accepted = await store.acceptDraft(draft.id, {
    now: '2026-06-22T09:01:00.000Z',
    actorId: brand.userId,
  });
  if (!accepted.ok) throw new Error('Expected canonical Brand Vault fixture to be accepted.');
  return accepted.record;
}

describe('writeThinkForgeBrandDNAToBrandVault', () => {
  it('stages manual BrandDNA updates as reviewable Brand Vault evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const accepted = await seedAcceptedBrand(store);

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
    const killListCandidate = snapshot?.candidates.find((candidate) => candidate.signalPath === 'voice.killList');
    expect(killListCandidate?.learningWeight).toMatchObject({
      category: 'invented',
      service: 'thinkforge',
      editType: 'manual_brand_dna_edit',
      scope: 'brand',
      polarity: 'replace',
      signalClass: 'hard_constraint',
    });
    expect(killListCandidate?.learningWeight?.value).toBeGreaterThan(0.85);

    const record = await store.getRecord(result.recordId);
    expect(record?.review.required).toBe(true);
    expect(record?.status).toBe('draft');
    expect(record?.baseAcceptedRevision).toEqual({ recordId: accepted.id, updatedAt: accepted.updatedAt });
    expect(record?.profile.identity.brandName.value).toBe('Canonical Brand');
    expect(record?.profile.palette).toEqual(accepted.profile.palette);
    expect(record?.profile.identity.audience.value).toEqual(['agency founders and in-house content teams']);
    expect(record?.profile.voice.killList.value).toEqual(['game-changing']);
    expect(record?.profile.voice.hookArchetypes.value).toEqual(['contrarian opener']);
    expect(record?.profile.voice.killList.trustLevel).toBe('manual_user_entry');
    expect(record?.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining([
        'preserve this accepted cadence',
        'warm expert plainspoken',
        'open with the broken process',
      ]),
    );
    const killListEvidence = record?.profile.evidence.find(
      (item) => item.signalPath === 'voice.killList' && item.sourceField === 'thinkforge.brandDNA.killList',
    );
    expect(killListEvidence?.learningWeight).toEqual(killListCandidate?.learningWeight);
    expect(record?.profile.evidence.some((item) => item.extractor === 'thinkforge-brand-dna-dual-write.v1')).toBe(true);
  });

  it('stores fingerprint and exemplar summaries without accepting them as truth', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const accepted = await seedAcceptedBrand(store);

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
    expect(snapshot?.candidates[0]?.learningWeight).toMatchObject({
      category: 'invented',
      service: 'thinkforge',
      editType: 'passive_voice_fingerprint',
      scope: 'user',
      polarity: 'affirm',
      signalClass: 'voice_rule',
    });
    expect(snapshot?.candidates[0]?.learningWeight?.value).toBeLessThan(0.35);

    const record = await store.getRecord(result.recordId);
    expect(record?.status).toBe('draft');
    expect(record?.baseAcceptedRevision).toEqual({ recordId: accepted.id, updatedAt: accepted.updatedAt });
    expect(record?.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining([
        'preserve this accepted cadence',
        'opening pattern: direct_claim',
        'transition style: implicit',
        'Content production is broken. One platform. Not ten.',
      ]),
    );
    const fingerprintEvidence = record?.profile.evidence.find(
      (item) => item.signalPath === 'voice.recurringPhrases' && item.sourceField === 'thinkforge.brandDNA.voiceFingerprint',
    );
    expect(fingerprintEvidence?.learningWeight).toEqual(snapshot?.candidates[0]?.learningWeight);
  });

  it('marks passive exemplars as softer user-scope affirmations', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    await seedAcceptedBrand(store);

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      source: 'passive_voice_exemplar',
      now: '2026-06-22T11:30:00.000Z',
      store,
      updates: {
        voiceExemplars: [
          {
            id: 'exemplar_2',
            text: 'Ship the sharper version, then let the system remember why it worked.',
            signalProfile: { warmth: 0.3, directness: 0.8 },
            contentType: 'linkedin',
            pinned: false,
            weight: 0.7,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error('expected Brand Vault write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.candidates[0]).toMatchObject({
      signalPath: 'voice.recurringPhrases',
      sourceField: 'thinkforge.brandDNA.voiceExemplars',
      learningWeight: {
        category: 'invented',
        service: 'thinkforge',
        editType: 'passive_voice_exemplar',
        scope: 'user',
        polarity: 'affirm',
        signalClass: 'voice_rule',
      },
    });
    expect(snapshot?.candidates[0]?.learningWeight?.value).toBeGreaterThan(0.15);
    expect(snapshot?.candidates[0]?.learningWeight?.value).toBeLessThan(0.3);

    const record = await store.getRecord(result.recordId);
    const recurringEvidence = record?.profile.evidence.find(
      (item) => item.signalPath === 'voice.recurringPhrases' && item.sourceField === 'thinkforge.brandDNA.voiceExemplars',
    );
    expect(recurringEvidence?.learningWeight).toEqual(snapshot?.candidates[0]?.learningWeight);
  });

  it('skips cleanly when no supported BrandDNA fields changed', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      source: 'manual_brand_dna_edit',
      now: '2026-06-22T12:00:00.000Z',
      store,
      updates: {},
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'no_supported_updates' });
  });

  it('fails closed when an explicit brand has no accepted profile', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'missing_brand',
      source: 'manual_brand_dna_edit',
      store,
      updates: { killList: ['unsupported claim'] },
    });

    expect(result).toMatchObject({ ok: false, code: 'brand_not_found' });
  });

  it('treats an explicit empty constraint list as a reviewed clear operation', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    await seedAcceptedBrand(store);

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      source: 'manual_brand_dna_edit',
      now: '2026-06-22T12:10:00.000Z',
      store,
      updates: { killList: [] },
    });

    expect(result).toMatchObject({ ok: true, candidateCount: 1 });
    if (!result.ok || result.skipped) throw new Error('expected Brand Vault clear draft');
    const record = await store.getRecord(result.recordId);
    expect(record?.profile.voice.killList.value).toEqual([]);
    expect(record?.profile.identity.brandName.value).toBe('Canonical Brand');
  });

  it('enforces organization brand grants before staging a draft', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    await seedAcceptedBrand(store, { orgId: 'org_1' });
    await store.setBrandAccess?.({ orgId: 'org_1', brandId: 'brand_1', userIds: ['user_allowed'] });

    const result = await writeThinkForgeBrandDNAToBrandVault({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      source: 'manual_brand_dna_edit',
      store,
      updates: { killList: [] },
    });

    expect(result).toMatchObject({ ok: false, code: 'brand_not_found' });
  });
});
