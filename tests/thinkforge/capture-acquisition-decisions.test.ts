import { describe, expect, it } from 'vitest';

import {
  createCaptureAcquisitionDecisionSet,
  createCaptureAcquisitionSourceDocument,
  mergeCaptureAcquisitionDecisionInputs,
  verifyCaptureAcquisitionDecisionSet,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import {
  mixedPresenterCutawayTreatment,
  productDemonstrationTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';

function sourceLedger(kind: 'upload' | 'user_brief' = 'upload') {
  return {
    ledgerVersion: 1 as const,
    entries: [{
      referenceId: 'src_brief',
      kind,
      title: kind === 'upload' ? 'Approved workflow recording' : 'User brief',
      summary: 'Approved evidence for the workflow claim.',
      sourceId: kind === 'upload' ? 'asset_workflow_1' : 'brief_user',
      sourceUrl: kind === 'upload' ? 'https://assets.example.com/workflow.mp4' : undefined,
      confidence: 1,
      provenance: { origin: kind === 'upload' ? 'user_upload' : 'user_prompt', sessionId: 'session_1' },
    }],
  };
}

function sourceDocument(ledger: ReturnType<typeof sourceLedger> = sourceLedger()) {
  return createCaptureAcquisitionSourceDocument({
    version: 3,
    contentHash: 'a'.repeat(64),
    sidecarHash: 'b'.repeat(64),
    sourceLedger: ledger,
  });
}

function twoRequirementTreatment() {
  const treatment = structuredClone(productDemonstrationTreatment);
  treatment.captureRequirements.push({
    ...treatment.captureRequirements[0]!,
    id: 'capture_secondary_workflow',
    objective: 'Capture the approved secondary workflow.',
  });
  treatment.visualEvents.push({
    ...treatment.visualEvents[0]!,
    id: 'event_secondary_workflow',
    momentId: 'moment_secondary_workflow',
    captureRequirementIds: ['capture_secondary_workflow'],
  });
  return treatment;
}

describe('capture acquisition decisions', () => {
  it('creates a hash-bound acquisition choice for an unresolved treatment requirement', () => {
    const ledger = sourceLedger();
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved Insturix workspace',
          captureScope: 'Record the approved import-to-publish workflow only.',
          authorizationConfirmed: true,
        },
      }],
      sourceLedger: ledger,
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
    const ledger = sourceLedger();
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet,
      treatment: productDemonstrationTreatment,
      sourceDocument: { ...sourceDocument(), sidecarHash: 'c'.repeat(64) },
    })).toMatchObject({ current: false, reason: 'sidecar_hash_mismatch' });
  });

  it('rejects creation and replay when the source ledger no longer matches the reviewed evidence', () => {
    const reviewedLedger = sourceLedger();
    const changedLedger = structuredClone(reviewedLedger);
    changedLedger.entries[0]!.title = 'Replacement workflow recording';

    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(reviewedLedger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger: changedLedger,
      decidedBy: 'user_1',
    })).toThrow(expect.objectContaining({ code: 'source_ledger_hash_mismatch' }));

    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(reviewedLedger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger: reviewedLedger,
      decidedBy: 'user_1',
    });

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet,
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(changedLedger),
    })).toMatchObject({ current: false, reason: 'source_ledger_hash_mismatch' });
  });

  it('rejects a decision set whose acquisition choice changed after it was hashed', () => {
    const ledger = sourceLedger();
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved Insturix workspace',
          captureScope: 'Record the approved import-to-publish workflow only.',
          authorizationConfirmed: true,
        },
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    const tampered = {
      ...decisionSet,
      decisions: [{
        ...decisionSet.decisions[0]!,
        screenTarget: {
          label: 'Different workspace',
          captureScope: 'Capture an unapproved flow.',
          authorizationConfirmed: true as const,
        },
      }],
    };

    expect(verifyCaptureAcquisitionDecisionSet({
      decisionSet: tampered,
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: false, reason: 'decision_set_hash_mismatch' });
  });

  it('rejects reclassification of a treatment requirement that was already explicitly classified', () => {
    const ledger = sourceLedger();
    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_host_opening',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved workspace',
          captureScope: 'Record the approved workflow.',
          authorizationConfirmed: true,
        },
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
    })).toThrow(/capture_requirement_reclassification/);
  });

  it('requires the user to explicitly declare a camera before choosing physical capture', () => {
    const ledger = sourceLedger();
    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'physical-camera',
        requiredCapabilities: ['performer'],
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
    })).toThrow(/must explicitly require a camera/);
  });

  it('rejects brief text as source material when no usable asset is bound', () => {
    const ledger = sourceLedger('user_brief');
    expect(() => createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
    })).toThrow(/factual context, not selectable production material/);
  });

  it('preserves a verified source-asset answer while merging a later requirement', () => {
    const ledger = sourceLedger();
    const treatment = twoRequirementTreatment();
    const previousDecisionSet = createCaptureAcquisitionDecisionSet({
      treatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'project-approved' }],
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
    });

    const merged = mergeCaptureAcquisitionDecisionInputs({
      treatment,
      sourceDocument: sourceDocument(ledger),
      previousDecisionSet,
      decisions: [{
        requirementId: 'capture_secondary_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved secondary workspace',
          captureScope: 'Record only the approved secondary workflow.',
          authorizationConfirmed: true,
        },
      }],
    });

    expect(merged.previousDecisionSetHash).toBe(previousDecisionSet.decisionSetHash);
    expect(merged.decisions).toMatchObject([{
      requirementId: 'capture_real_workflow',
      acquisitionKind: 'source-asset',
      sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'project-approved' }],
    }, {
      requirementId: 'capture_secondary_workflow',
      acquisitionKind: 'screen-recording',
    }]);
  });

  it('refuses to merge against a tampered prior decision set', () => {
    const ledger = sourceLedger();
    const previousDecisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger: ledger,
      decidedBy: 'user_1',
    });

    expect(() => mergeCaptureAcquisitionDecisionInputs({
      treatment: productDemonstrationTreatment,
      sourceDocument: sourceDocument(ledger),
      previousDecisionSet: {
        ...previousDecisionSet,
        decidedBy: 'attacker',
      },
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved workspace',
          captureScope: 'Record the approved workflow only.',
          authorizationConfirmed: true,
        },
      }],
    })).toThrow(/changed outside ThinkForge/);
  });
});
