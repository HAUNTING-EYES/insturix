import { describe, expect, it } from 'vitest';

import { bindProviderNativeEpisodeDefinitionArtifactV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import {
  assertProviderNativePlanExecutionEnvelopeV2R,
  assertProviderNativePlanExecutionDefinitionV2R,
  createProviderNativePlanExecutionEnvelopeV2R,
  providerNativeEligibleOperationSetRefV2R,
  providerNativePlanExecutionEnvelopeSchemaRefV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { createEditorialPlanExecutionDefinitionV1 }
  from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import type { EditorialPlanArtifactRefV1 }
  from '@/lib/editron/services/editorial-plan-v1';

const HASH = 'a'.repeat(64);
const GUARD_HASH = 'b'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'plan-provider-episode-1',
  objective: 'Construct one isolated edit proposal and prove its bounded outcome.',
  activeTarget: { taskId: 'PLAN-PROVIDER-1' },
  revisionBinding: { projectId: 'project-a', expectedProjectRevision: 'revision-r7' },
  projectState: { projectId: 'project-a', projectRevision: 'revision-r7' },
  evidence: [{ evidenceId: 'evidence-a', kind: 'BOUND_TEST_EVIDENCE' }],
  preservationRules: ['Never mutate the canonical project from the research proxy.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};

describe('provider-native PlanService execution envelope V2R', () => {
  it('binds exact scope, route, tool set and spend authorization for a fresh start', () => {
    const setup = prepared();
    const result = assertProviderNativePlanExecutionDefinitionV2R(setup.definition);

    expect(result).toEqual(setup.envelope);
    expect(result).toMatchObject({
      authority: 'PLAN_SERVICE_BOUND_RESEARCH_PROXY_ONLY',
      effectPolicy: 'ISOLATED_PROPOSAL_NO_CANONICAL_MUTATION',
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      route: ROUTE,
      runtimeGuardBinding: { guardIdentitySha256: GUARD_HASH },
      resumeCheckpoint: null,
    });
  });

  it('rejects an envelope copied into another project definition', () => {
    const setup = prepared();
    const copied = definition(setup.envelope, { projectId: 'project-b' });
    expect(() => assertProviderNativePlanExecutionDefinitionV2R(copied))
      .toThrow('PROVIDER_NATIVE_PLAN_DEFINITION_SCOPE_MISMATCH');
  });

  it('rejects a different eligible operation set or budget authorization', () => {
    const setup = prepared();
    const wrongOperations = definition(setup.envelope, {
      eligibleOperationSetRef: { ...setup.operationSetRef, artifactSha256: HASH },
    });
    expect(() => assertProviderNativePlanExecutionDefinitionV2R(wrongOperations))
      .toThrow('PROVIDER_NATIVE_PLAN_DEFINITION_OPERATION_SET_MISMATCH');

    const wrongBudget = definition(setup.envelope, {
      budgetReservationRefs: [{ ...budgetRef(), artifactSha256: HASH }],
    });
    expect(() => assertProviderNativePlanExecutionDefinitionV2R(wrongBudget))
      .toThrow('PROVIDER_NATIVE_PLAN_DEFINITION_BUDGET_MISMATCH');
  });

  it('rejects a changed schema reference and a tampered route', () => {
    const setup = prepared();
    const wrongSchema = definition(setup.envelope, {
      plannerEnvelopeSchemaRef: {
        ...providerNativePlanExecutionEnvelopeSchemaRefV2R(),
        artifactSha256: HASH,
      },
    });
    expect(() => assertProviderNativePlanExecutionDefinitionV2R(wrongSchema))
      .toThrow('PROVIDER_NATIVE_PLAN_DEFINITION_SCHEMA_MISMATCH');

    const tampered = {
      ...setup.envelope,
      route: { ...setup.envelope.route, model: 'copied-model' },
    };
    expect(() => assertProviderNativePlanExecutionEnvelopeV2R(tampered))
      .toThrow('PROVIDER_NATIVE_PLAN_ENVELOPE_INVALID');
  });

  it('refuses an invalid runtime authorization', () => {
    const artifact = episodeArtifact();
    expect(() => createProviderNativePlanExecutionEnvelopeV2R({
      boundEpisodeDefinition: artifact, route: ROUTE,
      runtimeGuardBinding: { guardKind: '', guardIdentitySha256: GUARD_HASH },
    })).toThrow('PROVIDER_NATIVE_PLAN_GUARD_KIND_INVALID');
  });
});

function prepared() {
  const artifact = episodeArtifact();
  const envelope = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition: artifact, route: ROUTE,
    runtimeGuardBinding: {
      guardKind: 'SEALED_RUNTIME_BUDGET', guardIdentitySha256: GUARD_HASH,
    },
  });
  const operationSetRef = providerNativeEligibleOperationSetRefV2R(envelope);
  return { artifact, envelope, operationSetRef,
    definition: definition(envelope, { eligibleOperationSetRef: operationSetRef }) };
}

function episodeArtifact() {
  return bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    source: { ownerId: 'BENCHMARK_OWNER', ownerVersion: 'v1', ownerSha256: HASH },
    context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
  });
}

function definition(
  envelope: ReturnType<typeof createProviderNativePlanExecutionEnvelopeV2R>,
  overrides: Partial<Parameters<typeof createEditorialPlanExecutionDefinitionV1>[0]> = {},
) {
  return createEditorialPlanExecutionDefinitionV1({
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    definitionId: 'provider-definition-v1', episodeId: CONTEXT.episodeId,
    sourcePlanBinding: {
      planId: 'plan-a', planRevision: 1, planRevisionSha256: HASH,
      nodeId: 'root', nodeVersion: 1, nodeSha256: HASH,
    },
    plannerEnvelopeSchemaRef: providerNativePlanExecutionEnvelopeSchemaRefV2R(),
    plannerEnvelope: envelope,
    eligibleOperationSetRef: providerNativeEligibleOperationSetRefV2R(envelope),
    privacyPolicyRef: ref('POLICY_SERVICE', 'privacy-v1', HASH),
    proofPolicyRef: ref('PROOF_SERVICE', 'proof-v1', HASH),
    budgetReservationRefs: [budgetRef()],
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: '2026-08-23T16:00:00.000Z',
    ...overrides,
  });
}

function budgetRef(): EditorialPlanArtifactRefV1 {
  return ref('BUDGET_SERVICE', 'budget-v1', GUARD_HASH);
}
function ref(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256 };
}
