import { describe, expect, it } from 'vitest';
import { createEditronUserOverrideLearningEvent } from '@/lib/editron/services/editron-brand-learning-events';
import { createInMemoryBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { deriveBrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { createBrandSignalProfileDraft } from '@/lib/shared/brand-signal-lifecycle';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import {
  parseBrandSignalLearningEvents,
  writeBrandSignalLearningEventsToBrandVault,
} from '@/lib/shared/brand-vault-learning-events';

describe('Brand Vault learning-event ingestion', () => {
  it('stages symbolic Editron corrections as reviewable signal-compatible candidates', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const event = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:00:00.000Z',
      kind: 'transition_style',
      beforeValue: 'fade',
      afterValue: 'hard-cut',
      overlayId: 'transition_1',
    });

    const result = await writeBrandSignalLearningEventsToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'brand_event_1',
      learningEvents: [event],
      now: '2026-06-22T12:05:00.000Z',
      store,
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ candidateCount: 1 });
    if (!result.ok || result.skipped) throw new Error('expected learning-event write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.job.status).toBe('needs_review');
    expect(snapshot?.job.brandId).toBe('brand_1');
    expect(snapshot?.normalizedUrl).toBe('brand-learning://brand_event_1');
    expect(snapshot?.candidates[0]).toMatchObject({
      sourceType: 'manual_user',
      sourceField: 'brandLearning.editron.generated_output_correction.motion.transitionSharpness',
      signalPath: 'motion.transitionSharpness',
      normalizedValue: 0.86,
      trustLevel: 'manual_user_entry',
      authorityClass: 'manual',
      learningWeight: {
        category: 'invented',
        service: 'editron',
        editType: 'generated_output_correction',
        signalClass: 'motion_dial',
      },
    });

    const record = await store.getRecord(result.recordId);
    expect(record?.status).toBe('draft');
    expect(record?.review.required).toBe(true);
    expect(record?.profile.motion.transitionSharpness.value).toBe(0.86);
    expect(record?.profile.motion.transitionSharpness.trustLevel).toBe('manual_user_entry');
    const evidence = record?.profile.evidence.find(
      (item) => item.extractor === 'brand-vault-learning-events.v1' && item.signalPath === 'motion.transitionSharpness',
    );
    expect(evidence?.learningWeight).toEqual(event.learningWeight);
  });

  it('reduces repeated matching corrections into one stronger review candidate', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const events = [
      createEditronUserOverrideLearningEvent({
        userId: 'user_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        observedAt: '2026-06-22T12:00:00.000Z',
        kind: 'transition_style',
        beforeValue: 'fade',
        afterValue: 'hard-cut',
        overlayId: 'transition_1',
      }),
      createEditronUserOverrideLearningEvent({
        userId: 'user_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        observedAt: '2026-06-22T12:01:00.000Z',
        kind: 'transition_style',
        beforeValue: 'fade',
        afterValue: 'hard-cut',
        overlayId: 'transition_2',
      }),
      createEditronUserOverrideLearningEvent({
        userId: 'user_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        observedAt: '2026-06-22T12:02:00.000Z',
        kind: 'transition_style',
        beforeValue: 'fade',
        afterValue: 'hard-cut',
        overlayId: 'transition_3',
      }),
    ];

    const result = await writeBrandSignalLearningEventsToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'brand_event_repeated',
      learningEvents: events,
      now: '2026-06-22T12:05:00.000Z',
      store,
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ candidateCount: 1 });
    if (!result.ok || result.skipped) throw new Error('expected learning-event write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.candidates).toHaveLength(1);
    expect(snapshot?.candidates[0]).toMatchObject({
      sourceField: 'brandLearning.aggregate.motion.transitionSharpness',
      normalizedValue: 0.86,
      rawValue: {
        repetitions: 3,
        services: ['editron'],
        editTypes: ['generated_output_correction'],
      },
    });
    expect(snapshot?.candidates[0]?.confidence).toBeGreaterThan(0.5);
    expect(snapshot?.candidates[0]?.learningWeight?.value).toBeGreaterThan(events[0].learningWeight.value);

    const record = await store.getRecord(result.recordId);
    const evidence = record?.profile.evidence.find(
      (item) => item.extractor === 'brand-vault-learning-events.v1' && item.signalPath === 'motion.transitionSharpness',
    );
    expect(evidence?.sourceField).toBe('brandLearning.aggregate.motion.transitionSharpness');
    expect(evidence?.learningWeight?.value).toBe(snapshot?.candidates[0]?.learningWeight?.value);
  });

  it('keeps conflicting corrections as separate review candidates', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const hardCut = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:00:00.000Z',
      kind: 'transition_style',
      beforeValue: 'fade',
      afterValue: 'hard-cut',
      overlayId: 'transition_1',
    });
    const softFade = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:01:00.000Z',
      kind: 'transition_style',
      beforeValue: 'hard-cut',
      afterValue: 'fade',
      overlayId: 'transition_2',
    });

    const result = await writeBrandSignalLearningEventsToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'brand_event_conflict',
      learningEvents: [hardCut, softFade],
      now: '2026-06-22T12:05:00.000Z',
      store,
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ candidateCount: 2 });
    if (!result.ok || result.skipped) throw new Error('expected learning-event write');

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.candidates.map((candidate) => candidate.normalizedValue).sort()).toEqual([0.24, 0.86]);
    expect(snapshot?.candidates.every((candidate) => candidate.sourceField !== 'brandLearning.aggregate.motion.transitionSharpness')).toBe(true);
  });

  it('seeds a learning draft from the existing accepted profile so accepting ENRICHES, not shadows, the brand', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    // Seed a rich ACCEPTED profile for brand_1 with a distinctive brand name.
    const richBrand = {
      brandId: 'brand_1',
      userId: 'user_1',
      name: 'Distinctive Brand Co',
      voice: { killList: [], hookArchetypes: ['bold question'], structuralHabits: ['signature phrase alpha'] },
      visual: { colors: ['#abcdef'] },
      learning: { banditProjectCount: 0 },
    } as UnifiedBrand;
    const richProfile = deriveBrandSignalProfile(richBrand, {
      generatedAt: '2026-06-22T11:00:00.000Z',
      extractor: 'test-seed',
    });
    richProfile.brandId = 'brand_1';
    const acceptedRecord = createBrandSignalProfileDraft(richProfile, {
      id: 'rec_accepted_1',
      now: '2026-06-22T11:00:00.000Z',
      actorId: 'user_1',
    });
    store.saveRecord(acceptedRecord, { now: '2026-06-22T11:00:00.000Z', actorId: 'user_1' });
    store.acceptDraft('rec_accepted_1', { now: '2026-06-22T11:00:00.000Z', actorId: 'user_1' });

    // A learning event that touches ONLY motion.transitionSharpness.
    const event = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:00:00.000Z',
      kind: 'transition_style',
      beforeValue: 'fade',
      afterValue: 'hard-cut',
      overlayId: 'transition_1',
    });

    const result = await writeBrandSignalLearningEventsToBrandVault({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'brand_event_enrich',
      learningEvents: [event],
      now: '2026-06-22T12:05:00.000Z',
      store,
    });
    if (!result.ok || result.skipped) throw new Error('expected learning-event write');

    const record = await store.getRecord(result.recordId);
    // ENRICH: the brand's existing identity is PRESERVED in the draft (before the fix it would have been
    // reset to the sparse "Brand learning events" base, shadowing the real brand on accept)...
    expect(record?.profile.identity.brandName.value).toBe('Distinctive Brand Co');
    // ...AND the learned signal is overlaid on top.
    expect(record?.profile.motion.transitionSharpness.value).toBe(0.86);
  });

  it('drops malformed envelopes instead of staging fake evidence', () => {
    expect(parseBrandSignalLearningEvents([{ version: 1, signalPath: 'motion.transitionSharpness' }])).toEqual([]);
    expect(parseBrandSignalLearningEvents('not-array')).toEqual([]);
  });
});
