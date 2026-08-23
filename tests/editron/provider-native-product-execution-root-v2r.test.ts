import { describe, expect, it, vi } from 'vitest';

import { bindProviderNativeEpisodeDefinitionArtifactV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import {
  createProviderNativePlanExecutionEnvelopeV2R,
  providerNativeEligibleOperationSetRefV2R,
  providerNativePlanExecutionEnvelopeSchemaRefV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { createEditorialPlanExecutionDefinitionV1 }
  from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import { PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R }
  from '@/lib/editron/services/provider-native-product-budget-v2r';
import type { ProviderNativeProductBudgetCreditsOwnerV2R }
  from '@/lib/editron/services/provider-native-product-budget-credits-owner-v2r';
import { createProviderNativeProductExecutionRootV2R }
  from '@/lib/editron/services/provider-native-product-execution-root-v2r';

const HASH = 'a'.repeat(64);
const GUARD_HASH = 'b'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;

describe('provider-native product execution root V2R', () => {
  it('preserves explicitly invalid timeout values for canonical owner validation', () => {
    expect(() => rootSetup({ transportTimeoutMs: 0 })).toThrow(
      'PROVIDER_NATIVE_LIVE_TIMEOUT_INVALID',
    );
    expect(() => rootSetup({ tokenCountTimeoutMilliseconds: 0 })).toThrow(
      'OPENAI_TOKEN_COUNTER_TIMEOUT_INVALID',
    );
  });

  it('accepts only the concrete isolated operators and rejects drift before resources', () => {
    const setup = rootSetup();
    expect(() => setup.root.executionOwner.assertDefinitionSupported({
      definition: definitionFor(['cut_section', 'set_keyframes']),
    } as never)).not.toThrow();
    expect(() => setup.root.executionOwner.assertDefinitionSupported({
      definition: definitionFor(['apply_audio_ducking']),
    } as never)).toThrow(
      'PROVIDER_NATIVE_PRODUCT_ROOT_OPERATOR_UNSUPPORTED:apply_audio_ducking',
    );
    expect(setup.loadProjectForMutation).not.toHaveBeenCalled();
    expect(setup.loadMediaRuntime).not.toHaveBeenCalled();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
  });

  it('routes a supported Plan to the CreditsService guard before project or transport', async () => {
    const setup = rootSetup();
    const definition = definitionFor(['cut_section']);
    await expect(setup.root.executionOwner.execute({
      definition,
      plan: { planId: 'plan-a', revisionSha256: HASH },
      node: { nodeId: 'episode-a', nodeVersion: 1 },
      job: {
        jobId: 'job-a', operationOwner: 'PLAN_SERVICE',
        operationKind: 'editorial_plan_node_episode', operationId: 'episode-a',
        tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
      },
      lifecycle: {
        heartbeat: vi.fn(async () => undefined),
        persistResumeState: vi.fn(async () => 1),
      },
    } as never)).rejects.toThrow('EXPECTED_BUDGET_LOCATOR');

    expect(setup.resolveBudget).toHaveBeenCalledWith({
      scope: {
        tenantId: 'tenant-a', userId: 'user-a',
        projectId: 'project-a', episodeId: 'episode-a',
      },
      guardKind: PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
      expectedGuardIdentitySha256: GUARD_HASH,
    });
    expect(setup.loadProjectForMutation).not.toHaveBeenCalled();
    expect(setup.loadMediaRuntime).not.toHaveBeenCalled();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
  });
});

function rootSetup(providerOptions: Readonly<{
  transportTimeoutMs?: number;
  tokenCountTimeoutMilliseconds?: number;
}> = {}) {
  const resolveBudget = vi.fn(async (): Promise<never> => {
    throw new Error('EXPECTED_BUDGET_LOCATOR');
  });
  const budgetOwner = {
    reserve: vi.fn(), settle: vi.fn(), resolve: resolveBudget,
    resolveTerminal: vi.fn(),
  } as unknown as ProviderNativeProductBudgetCreditsOwnerV2R;
  const loadProjectForMutation = vi.fn(async (): Promise<never> => {
    throw new Error('PROJECT_UNEXPECTED');
  });
  const loadMediaRuntime = vi.fn(async (): Promise<never> => {
    throw new Error('MEDIA_UNEXPECTED');
  });
  const fetchImpl = vi.fn(async (): Promise<Response> => {
    throw new Error('FETCH_UNEXPECTED');
  }) as unknown as typeof fetch;
  const root = createProviderNativeProductExecutionRootV2R({
    projectService: { loadProjectForMutation },
    budgetOwner,
    customerChargeOwner: { compute: vi.fn(async (): Promise<never> => {
      throw new Error('CUSTOMER_CHARGE_UNEXPECTED');
    }) },
    canonicalMedia: {
      storageReadTimeoutMs: 10_000,
      loadRuntime: loadMediaRuntime,
    },
    provider: {
      environment: {
        OPENAI_API_KEY: 'test-openai-key',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
      },
      fetchImpl,
      ...providerOptions,
    },
  });
  return {
    root, resolveBudget, loadProjectForMutation, loadMediaRuntime, fetchImpl,
  };
}

function definitionFor(eligibleOperatorIds: readonly string[]) {
  const context: ProviderNativeEpisodeContextV2R = {
    episodeId: 'episode-a',
    objective: 'Construct one bounded isolated proposal.',
    activeTarget: { taskId: 'PRODUCT-ROOT' },
    revisionBinding: {
      projectId: 'project-a', expectedProjectRevision: 'revision-r7',
    },
    projectState: { projectId: 'project-a', projectRevision: 'revision-r7' },
    evidence: [{ evidenceId: 'evidence-a' }],
    preservationRules: ['Never mutate the canonical project.'],
    authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
    budget: { maxTurns: 2, maxOutputTokensPerTurn: 128, maxIdenticalCalls: 1 },
  };
  const boundEpisodeDefinition = bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    source: { ownerId: 'PLAN_SERVICE', ownerVersion: 'v1', ownerSha256: HASH },
    context, eligibleOperatorIds,
  });
  const envelope = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition, route: ROUTE,
    runtimeGuardBinding: {
      guardKind: PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
      guardIdentitySha256: GUARD_HASH,
    },
  });
  return createEditorialPlanExecutionDefinitionV1({
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    definitionId: 'definition-a', episodeId: 'episode-a',
    sourcePlanBinding: {
      planId: 'plan-a', planRevision: 1, planRevisionSha256: HASH,
      nodeId: 'episode-a', nodeVersion: 1, nodeSha256: HASH,
    },
    plannerEnvelopeSchemaRef: providerNativePlanExecutionEnvelopeSchemaRefV2R(),
    plannerEnvelope: envelope,
    eligibleOperationSetRef: providerNativeEligibleOperationSetRefV2R(envelope),
    privacyPolicyRef: artifactRef('POLICY_SERVICE', 'privacy-v1'),
    proofPolicyRef: artifactRef('PROOF_SERVICE', 'proof-v1'),
    budgetReservationRefs: [artifactRef('CREDITS_SERVICE', 'budget-v1', GUARD_HASH)],
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: '2026-08-23T16:00:00.000Z',
  });
}

function artifactRef(ownerId: string, artifactId: string, artifactSha256 = HASH) {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256 };
}
