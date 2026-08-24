import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertStage25LongFormSentinelReceiptV3,
  recomputeStage25LongFormSentinelsV3,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-sentinel-runner-v3';

describe('Stage 2.5 independent long-form sentinels V3', () => {
  it('recomputes all five required compiler/evaluator outcomes with zero inference', async () => {
    const receipt = await recomputeStage25LongFormSentinelsV3();
    expect(receipt).toMatchObject({
      authority: 'INDEPENDENT_ZERO_INFERENCE_LONG_FORM_COMPILER_EVALUATOR_RECOMPUTATION',
      lane: 'STAGE25_LONG_FORM_PROVIDER_V3',
      scriptedProviderInvocations: 1,
      providerInferenceCalls: 0,
      networkCalls: 0,
      canonicalProjectReads: 0,
      canonicalProjectMutations: 0,
      stateEffects: [],
      assessment: 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED',
    });
    expect(receipt.sentinels.map(({ sentinelId }) => sentinelId)).toEqual([
      'LF_RANGE_SCOPE_OMITTED_DERIVED_ACCEPT',
      'LF_RANGE_SCOPE_EXPLICIT_EQUIVALENT_ACCEPT',
      'LF_RANGE_SCOPE_UNKNOWN_REJECT',
      'LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT',
      'LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF',
    ]);
    expect(assertStage25LongFormSentinelReceiptV3(receipt).receiptSha256)
      .toBe(receipt.receiptSha256);
  });

  it('proves omitted and explicit range scope compile to the same plan', async () => {
    const receipt = await recomputeStage25LongFormSentinelsV3();
    const omitted = receipt.sentinels[0];
    const explicit = receipt.sentinels[1];
    expect(omitted.observation).toMatchObject({
      semanticScopes: ['keynote'], suppliedExplicitly: false,
      effectiveSemanticScopeIds: ['keynote'],
      requiredEvidenceRequirementIds: ['ev-keynote-transcript'],
    });
    expect(explicit.observation).toMatchObject({
      semanticScopes: ['keynote'], suppliedExplicitly: true,
      effectiveSemanticScopeIds: ['keynote'],
      requiredEvidenceRequirementIds: ['ev-keynote-transcript'],
    });
    expect(omitted.observation.planRevisionSha256)
      .toBe(explicit.observation.planRevisionSha256);
    expect(omitted.transformationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unknown scope and false readiness with exact owner diagnostics', async () => {
    const receipt = await recomputeStage25LongFormSentinelsV3();
    expect(receipt.sentinels[2]).toMatchObject({
      axes: { modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL' },
      observation: {
        rejection: 'STAGE25_LONG_FORM_PLAN_RANGE_CANDIDATE_UNKNOWN:range-forged',
      },
    });
    expect(receipt.sentinels[3]).toMatchObject({
      axes: { modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL' },
      observation: {
        rejection: 'STAGE25_LONG_FORM_PLAN_LOCAL_READY_EVIDENCE_UNRESOLVED:'
          + 'seq-keynote-proof:ev-keynote-transcript',
        evidenceStatus: 'MISSING',
      },
    });
  });

  it('keeps a structurally valid provider episode below product proof', async () => {
    const receipt = await recomputeStage25LongFormSentinelsV3();
    expect(receipt.sentinels[4]).toMatchObject({
      axes: { proofClass: 'STRUCTURAL_ONLY' },
      observation: {
        structuralDisposition: 'PASS_STRUCTURAL_ONLY',
        assessmentScope: 'STRUCTURE_AND_PROVENANCE_ONLY',
        qualityJudgments: {
          editorialTaste: 'UNVERIFIABLE',
          rangeSemanticAccuracy: 'UNVERIFIABLE',
          renderedAudiovisualQuality: 'UNVERIFIABLE',
          blindEditorReviewRequired: true,
        },
        stateEffects: [],
      },
    });
  });

  it('is deterministic and rejects a rehashed expectation binding', async () => {
    const first = await recomputeStage25LongFormSentinelsV3();
    const second = await recomputeStage25LongFormSentinelsV3();
    expect(second.receiptSha256).toBe(first.receiptSha256);

    const forged = structuredClone(first) as unknown as Record<string, unknown>;
    forged.expectationValidationSha256 = '0'.repeat(64);
    const { receiptSha256: _old, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => assertStage25LongFormSentinelReceiptV3(forged))
      .toThrow('STAGE25_LONG_FORM_SENTINEL_RECEIPT_DRIFT');
  });
});
