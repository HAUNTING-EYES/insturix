import { describe, expect, it } from 'vitest';
import { createEditronUserOverrideLearningEvent } from '@/lib/editron/services/editron-brand-learning-events';
import { createInMemoryBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
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

  it('drops malformed envelopes instead of staging fake evidence', () => {
    expect(parseBrandSignalLearningEvents([{ version: 1, signalPath: 'motion.transitionSharpness' }])).toEqual([]);
    expect(parseBrandSignalLearningEvents('not-array')).toEqual([]);
  });
});
