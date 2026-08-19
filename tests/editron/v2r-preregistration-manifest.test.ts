import { describe, expect, it } from 'vitest';

import { buildEvaluatorPolicyFreezeV2R } from '@/lib/editron/research/open-ended-planner/evaluator-freeze-v2r';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { DEV02_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev02-lowering-policy-v2r';
import { DEV03_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev03-lowering-policy-v2r';
import { DEV04_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev04-lowering-policy-v2r';
import { buildV2RBenchmarkRouteRosterV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R } from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';
import { v2rOperatorCatalogIdentity } from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';
import { cap2aPlannerDossierIdentityV2R } from '@/lib/editron/research/open-ended-planner/cap2a-planner-dossier-v2r';
import { buildV2RSemanticOperatorPolicyV2R } from '@/lib/editron/research/open-ended-planner/v2r-semantic-operator-policy';
import { v2rProviderStageBudgetScheduleIdentity } from '@/lib/editron/research/open-ended-planner/per-attempt-budget-v2r';
import { PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R } from '@/lib/editron/research/open-ended-planner/planner-ownership-stage2-packet-v2r';
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
    expect(manifest.nodeContract.stage2PacketVersion).toBe(PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R);
    expect(manifest.nodeContract.retiredSemantics).toBe('CANDIDATE_CAPABILITY_IDS_AMBIGUOUS');
    expect(manifest.lowerer.implementationVersion).toBe(GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R);
    expect(manifest.lowerer.invariant).toBe('ZERO_CATALOG_OPERATOR_ADD_ZERO_SELECTED_OPERATOR_DROP');
    expect(manifest.perAttemptBudget.rule).toBe('EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET');
    expect(manifest.perAttemptBudget.providerStageSchedule).toEqual(v2rProviderStageBudgetScheduleIdentity());
    expect(manifest.manifestSha256).toHaveLength(64);
  });

  it('binds the real component hashes, not placeholders', () => {
    const manifest = buildV2RPreregistrationManifest();
    expect(manifest.lowerer.taskPolicySha256).toEqual({
      'DEV-01': hashCanonicalJsonV1(DEV01_LOWERING_POLICY_V2R),
      'DEV-02': hashCanonicalJsonV1(DEV02_LOWERING_POLICY_V2R),
      'DEV-03': hashCanonicalJsonV1(DEV03_LOWERING_POLICY_V2R),
      'DEV-04': hashCanonicalJsonV1(DEV04_LOWERING_POLICY_V2R),
    });
    expect(manifest.operatorCatalog).toEqual(v2rOperatorCatalogIdentity());
    expect(manifest.plannerDossier).toEqual(cap2aPlannerDossierIdentityV2R());
    expect(manifest.routeRoster.routes).toEqual(buildV2RBenchmarkRouteRosterV2());
    expect(manifest.routeRoster.routes.map(({ routeId }) => routeId))
      .toEqual(['OPENAI_LUNA', 'OPENAI_TERRA', 'QWEN_3_8_MAX']);
    expect(manifest.causalExecution.taskContracts.map(({ taskId }) => taskId)).toEqual(['DEV-01', 'DEV-03']);
    expect(manifest.evaluatorFreeze.policySha256).toBe(buildEvaluatorPolicyFreezeV2R().policySha256);
    expect(manifest.semanticOperatorFreeze).toEqual({
      policyVersion: buildV2RSemanticOperatorPolicyV2R().version,
      policySha256: buildV2RSemanticOperatorPolicyV2R().policySha256,
      exposure: 'EVALUATOR_ONLY_NOT_MODEL_INPUT',
    });
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
    expect(() => assertV2RPreregistrationComplete(drifted)).toThrow('V2R_PREREGISTRATION_TASK_POLICY_DRIFT');

    const lowererImplementationForgery = structuredClone(manifest) as unknown as {
      lowerer: { implementationVersion: string };
      manifestSha256: string;
      [key: string]: unknown;
    };
    lowererImplementationForgery.lowerer.implementationVersion = 'WRONG';
    const { manifestSha256: _lowererHash, ...lowererMaterial } = lowererImplementationForgery;
    lowererImplementationForgery.manifestSha256 = hashCanonicalJsonV1(lowererMaterial);
    Object.freeze(lowererImplementationForgery);
    expect(() => assertV2RPreregistrationComplete(lowererImplementationForgery))
      .toThrow('V2R_PREREGISTRATION_LOWERER_IMPLEMENTATION_DRIFT');

    const mutable = structuredClone(manifest);
    expect(() => assertV2RPreregistrationComplete(mutable)).toThrow('V2R_PREREGISTRATION_NOT_IMMUTABLE');

    const forged = structuredClone(manifest) as unknown as {
      operatorCatalog: { catalogSha256: string };
      manifestSha256: string;
      [key: string]: unknown;
    };
    forged.operatorCatalog.catalogSha256 = 'f'.repeat(64);
    const { manifestSha256: _discarded, ...forgedMaterial } = forged;
    forged.manifestSha256 = hashCanonicalJsonV1(forgedMaterial);
    Object.freeze(forged);
    expect(() => assertV2RPreregistrationComplete(forged))
      .toThrow('V2R_PREREGISTRATION_OPERATOR_CATALOG_DRIFT');

    const dossierForgery = structuredClone(manifest) as unknown as {
      plannerDossier: { censusIdRole: string };
      manifestSha256: string;
      [key: string]: unknown;
    };
    dossierForgery.plannerDossier.censusIdRole = 'SELECTABLE';
    const { manifestSha256: _dossierHash, ...dossierMaterial } = dossierForgery;
    dossierForgery.manifestSha256 = hashCanonicalJsonV1(dossierMaterial);
    Object.freeze(dossierForgery);
    expect(() => assertV2RPreregistrationComplete(dossierForgery))
      .toThrow('V2R_PREREGISTRATION_PLANNER_DOSSIER_DRIFT');

    const semanticForgery = structuredClone(manifest) as unknown as {
      semanticOperatorFreeze: { exposure: string };
      manifestSha256: string;
      [key: string]: unknown;
    };
    semanticForgery.semanticOperatorFreeze.exposure = 'MODEL_INPUT';
    const { manifestSha256: _semanticHash, ...semanticMaterial } = semanticForgery;
    semanticForgery.manifestSha256 = hashCanonicalJsonV1(semanticMaterial);
    Object.freeze(semanticForgery);
    expect(() => assertV2RPreregistrationComplete(semanticForgery))
      .toThrow('V2R_PREREGISTRATION_SEMANTIC_POLICY_HASH_DRIFT');

    const budgetForgery = structuredClone(manifest) as unknown as {
      perAttemptBudget: { providerStageSchedule: { stageBudgets: Record<number, { maxInputTokens: number }> } };
      manifestSha256: string;
      [key: string]: unknown;
    };
    budgetForgery.perAttemptBudget.providerStageSchedule.stageBudgets[2].maxInputTokens = 60000;
    const { manifestSha256: _budgetHash, ...budgetMaterial } = budgetForgery;
    budgetForgery.manifestSha256 = hashCanonicalJsonV1(budgetMaterial);
    Object.freeze(budgetForgery);
    expect(() => assertV2RPreregistrationComplete(budgetForgery))
      .toThrow('V2R_PREREGISTRATION_BUDGET_SCHEDULE_DRIFT');

    const packetForgery = structuredClone(manifest) as unknown as {
      nodeContract: { stage2PacketVersion: string };
      manifestSha256: string;
      [key: string]: unknown;
    };
    packetForgery.nodeContract.stage2PacketVersion = 'WRONG';
    const { manifestSha256: _packetHash, ...packetMaterial } = packetForgery;
    packetForgery.manifestSha256 = hashCanonicalJsonV1(packetMaterial);
    Object.freeze(packetForgery);
    expect(() => assertV2RPreregistrationComplete(packetForgery))
      .toThrow('V2R_PREREGISTRATION_STAGE2_PACKET_DRIFT');
  });
});
