import { describe, expect, it } from 'vitest';

import {
  createCaptureAcquisitionDecisionSet,
  verifyCaptureAcquisitionDecisionSet,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import {
  mixedPresenterCutawayTreatment,
  productDemonstrationTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';

function sourceDocument() {
  return {
    version: 3,
    contentHash: 'a'.repeat(64),
    sidecarHash: 'b'.repeat(64),
  };
}

describe('capture acquisition decisions', () => {
  it('creates a hash-bound acquisition choice for an unresolved treatment requirement', () => {
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
      }],
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet,
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: true });
  });

  it('rejects replay against a different document before a decision can influence the plan', () => {
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
      }],
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet,
      treatment: productDemonstrationTreatment,
      sourceDocument: { ...sourceDocument(), sidecarHash: 'c'.repeat(64) },
    })).toMatchObject({ current: false, reason: 'sidecar_hash_mismatch' });
  });

  it('rejects a decision set whose acquisition choice changed after it was hashed', () => {
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
      }],
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    const tampered = {
      ...decisionSet,
      decisions: [{ ...decisionSet.decisions[0]!, acquisitionKind: 'source-asset' as const }],
    };

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet: tampered,
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: false, reason: 'decision_set_hash_mismatch' });
  });

  it('rejects reclassification of a treatment requirement that was already explicitly classified', () => {
    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
      decisions: [{
        requirementId: 'capture_host_opening',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
      }],
      decidedBy: 'user_1',
    })).toThrow(/capture_requirement_already_classified/);
  });

  it('requires the user to explicitly declare a camera before choosing physical capture', () => {
    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'physical-camera',
        requiredCapabilities: ['performer'],
      }],
      decidedBy: 'user_1',
    })).toThrow(/must explicitly require a camera/);
  });
});
