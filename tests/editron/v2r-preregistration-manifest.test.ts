import { describe, expect, it } from 'vitest';

import { buildEvaluatorPolicyFreezeV2R } from '@/lib/editron/research/open-ended-planner/evaluator-freeze-v2r';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertV2RPreregistrationComplete,
  buildV2RPreregistrationManifest,
  V2R_EXPERIMENT_VERSION,
} from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';

describe('V2-1R capstone pre-registration manifest', () => {
  it('binds the complete V2R contract-reset surface into one immutable hashable artifact', () => {
    const manifest = buildV2RPreregistrationManifest();
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(manifest.experimentVersion).toBe(V2R_EXPERIMENT_VERSION);
    expect(manifest.nodeContract.semantics).toBe('SELECTED_OPERATOR_VS_ALTERNATIVES');
    expect(manifest.nodeContract.retiredSemantics).toBe('CANDIDATE_CAPABILITY_IDS_AMBIGUOUS');
    expect(manifest.lowerer.invariant).toBe('ZERO_CATALOG_OPERATOR_ADD_ZERO_SELECTED_OPERATOR_DROP');
    expect(manifest.perAttemptBudget.rule).toBe('EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET');
    expect(manifest.manifestSha256).toHaveLength(64);
  });

  it('binds the real component hashes, not placeholders', () => {
    const manifest = buildV2RPreregistrationManifest();
    expect(manifest.lowerer.dev01PolicySha256).toBe(hashCanonicalJsonV1(DEV01_LOWERING_POLICY_V2R));
    expect(manifest.evaluatorFreeze.policySha256).toBe(buildEvaluatorPolicyFreezeV2R().policySha256);
  });

  it('is reproducible across builds', () => {
    expect(buildV2RPreregistrationManifest().manifestSha256).toBe(buildV2RPreregistrationManifest().manifestSha256);
  });

  it('refuses incomplete, drifted, or mutable manifests', () => {
    const manifest = buildV2RPreregistrationManifest();
    expect(assertV2RPreregistrationComplete(manifest)).toBe(manifest);

    expect(() => assertV2RPreregistrationComplete(undefined)).toThrow('V2R_PREREGISTRATION_MISSING');
    expect(() => assertV2RPreregistrationComplete({ ...manifest, experimentVersion: 'WRONG' })).toThrow('V2R_PREREGISTRATION_VERSION_DRIFT');
    expect(() => assertV2RPreregistrationComplete({ ...manifest, manifestSha256: '0'.repeat(64) })).toThrow('V2R_PREREGISTRATION_HASH_DRIFT');

    const drifted = structuredClone(manifest) as { lowerer: { invariant: string }; [key: string]: unknown };
    drifted.lowerer.invariant = 'SOMETHING_ELSE';
    expect(() => assertV2RPreregistrationComplete(drifted)).toThrow('V2R_PREREGISTRATION_HASH_DRIFT');

    const mutable = structuredClone(manifest);
    expect(() => assertV2RPreregistrationComplete(mutable)).toThrow('V2R_PREREGISTRATION_NOT_IMMUTABLE');
  });
});
