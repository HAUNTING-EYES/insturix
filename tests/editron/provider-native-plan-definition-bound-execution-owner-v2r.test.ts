import { describe, expect, it, vi } from 'vitest';

import { bindProviderNativeEpisodeDefinitionArtifactV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import type { ProviderNativePlanSharedArtifactOwnersV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-plan-definition-bound-execution-owner-v2r';
import { createProviderNativePlanDefinitionBoundExecutionOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-plan-definition-bound-execution-owner-v2r';
import {
  createProviderNativePlanExecutionEnvelopeV2R,
  providerNativeEligibleOperationSetRefV2R,
  providerNativePlanExecutionEnvelopeSchemaRefV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { createEditorialPlanExecutionDefinitionV1 }
  from '@/lib/editron/services/editorial-plan-execution-definition-v1';

const HASH = 'a'.repeat(64);
const GUARD_HASH = 'b'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;

describe('provider-native Plan-bound execution owner V2R', () => {
  it('derives each episode definition from the accepted Plan without a registry', async () => {
    const guardInputs: string[] = [];
    const owner = createProviderNativePlanDefinitionBoundExecutionOwnerV2R({
      artifactOwners: sharedOwners((episodeId) => {
        guardInputs.push(episodeId);
        throw new Error(`GUARD_SENTINEL_${episodeId}`);
      }),
    });

    for (const episodeId of ['episode-a', 'episode-b']) {
      const definition = definitionFor(episodeId);
      expect(() => owner.assertDefinitionSupported({ definition } as never))
        .not.toThrow();
      await expect(owner.execute(executionInput(definition)))
        .rejects.toThrow(`GUARD_SENTINEL_${episodeId}`);
    }

    expect(guardInputs).toEqual(['episode-a', 'episode-b']);
  });

  it('rejects a forged Plan definition before any downstream owner runs', () => {
    const resolveGuard = vi.fn((_episodeId: string): never => {
      throw new Error('GUARD_UNEXPECTED');
    });
    const owner = createProviderNativePlanDefinitionBoundExecutionOwnerV2R({
      artifactOwners: sharedOwners(resolveGuard),
    });
    const definition = structuredClone(definitionFor('episode-a'));
    const envelope = definition.plannerEnvelope as Record<string, unknown>;
    const bound = envelope.boundEpisodeDefinition as Record<string, unknown>;
    const artifactDefinition = bound.definition as Record<string, unknown>;
    const context = artifactDefinition.context as Record<string, unknown>;
    context.objective = 'forged objective';

    expect(() => owner.assertDefinitionSupported({ definition } as never))
      .toThrow('PLAN_DEFINITION_ENVELOPE_HASH_MISMATCH');
    expect(resolveGuard).not.toHaveBeenCalled();
  });
});

function sharedOwners(
  resolveGuard: (episodeId: string) => never,
): ProviderNativePlanSharedArtifactOwnersV2R {
  return {
    projectClone: {
      resolve: async () => { throw new Error('PROJECT_CLONE_UNEXPECTED'); },
      resolveFresh: async () => { throw new Error('PROJECT_CLONE_UNEXPECTED'); },
    },
    transport: {
      resolve: async () => { throw new Error('TRANSPORT_UNEXPECTED'); },
    },
    runtimeGuard: {
      resolve: async ({ episodeId }) => resolveGuard(episodeId),
    },
  };
}

function definitionFor(episodeId: string) {
  const context: ProviderNativeEpisodeContextV2R = {
    episodeId,
    objective: `Construct isolated proposal ${episodeId}.`,
    activeTarget: { taskId: episodeId },
    revisionBinding: { projectId: 'project-a', expectedProjectRevision: 'revision-r7' },
    projectState: { projectId: 'project-a', projectRevision: 'revision-r7' },
    evidence: [{ evidenceId: `evidence-${episodeId}` }],
    preservationRules: ['Never mutate the canonical project.'],
    authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
    budget: { maxTurns: 2, maxOutputTokensPerTurn: 128, maxIdenticalCalls: 1 },
  };
  const boundEpisodeDefinition = bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    source: { ownerId: 'PLAN_SERVICE', ownerVersion: 'v1', ownerSha256: HASH },
    context,
    eligibleOperatorIds: ['find_audio_moment'],
  });
  const envelope = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition,
    route: ROUTE,
    runtimeGuardBinding: {
      guardKind: 'PRODUCT_RUNTIME_BUDGET',
      guardIdentitySha256: GUARD_HASH,
    },
  });
  return createEditorialPlanExecutionDefinitionV1({
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    definitionId: `definition-${episodeId}`, episodeId,
    sourcePlanBinding: {
      planId: 'plan-a', planRevision: 1, planRevisionSha256: HASH,
      nodeId: episodeId, nodeVersion: 1, nodeSha256: HASH,
    },
    plannerEnvelopeSchemaRef: providerNativePlanExecutionEnvelopeSchemaRefV2R(),
    plannerEnvelope: envelope,
    eligibleOperationSetRef: providerNativeEligibleOperationSetRefV2R(envelope),
    privacyPolicyRef: artifactRef('POLICY_SERVICE', 'privacy-v1', HASH),
    proofPolicyRef: artifactRef('PROOF_SERVICE', 'proof-v1', HASH),
    budgetReservationRefs: [artifactRef('BUDGET_SERVICE', 'budget-v1', GUARD_HASH)],
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: '2026-08-23T16:00:00.000Z',
  });
}

function executionInput(definition: ReturnType<typeof definitionFor>) {
  const episodeId = definition.episodeId;
  return {
    definition,
    plan: { planId: 'plan-a', revisionSha256: HASH },
    node: { nodeId: episodeId, nodeVersion: 1 },
    job: {
      operationOwner: 'PLAN_SERVICE',
      operationKind: 'editorial_plan_node_episode',
      operationId: episodeId,
      tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    },
    lifecycle: {
      heartbeat: vi.fn(async () => undefined),
      persistResumeState: vi.fn(async () => 1),
    },
  } as never;
}

function artifactRef(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256 };
}
