import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeDurableResolvedArtifactsV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import { createProviderNativeProposalRecoveryStateV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import { executeProviderNativeFreshEpisodeCoreV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-fresh-execution-core-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';

const BASE_STATE = 'a'.repeat(64);
const AFTER_STATE = 'b'.repeat(64);
const READ_RECEIPT = 'c'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'fresh-core-episode-1',
  objective: 'Create one isolated focal-scale proposal from turn one.',
  activeTarget: { taskId: 'FRESH-CORE' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-r7' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-r7' },
  evidence: [],
  preservationRules: ['Never mutate the canonical project.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};
const ELIGIBLE = ['set_keyframes'] as const;
const TOOL_SET_SHA = buildOpaqueResultReferenceToolSetV2R(
  buildProviderNativeToolSetV2R(ELIGIBLE),
).toolSetSha256;

describe('provider-native fresh execution core V2R', () => {
  it('starts at turn one and persists only a real writer checkpoint', async () => {
    const persisted: Array<Record<string, unknown>> = [];
    let providerTurn = 0;
    const executeIsolated = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { receipt: { status: 'PASS', projectRevision: 'revision-r8' } },
      evidenceIds: [] as const,
    }));
    const artifacts = resolvedArtifacts({
      executeIsolated,
      invoke: async () => {
        providerTurn += 1;
        return providerTurn === 1
          ? call('writer-1', 'set_keyframes', {
              projectId: 'project-1', expectedProjectRevision: 'revision-r7',
              overlayId: 1, keyframes: [{ frame: 10, value: 1.05 }],
            })
          : finish();
      },
    });

    const result = await executeProviderNativeFreshEpisodeCoreV2R({
      scope: {
        tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
        episodeId: CONTEXT.episodeId,
      },
      route: ROUTE,
      expectedContextSha256: hashCanonicalJsonV1(CONTEXT),
      expectedToolSetSha256: TOOL_SET_SHA,
      artifacts,
      heartbeat: async () => undefined,
      persistCheckpoint: async ({ checkpoint, proposalRecoveryState }) => {
        persisted.push({ checkpoint, proposalRecoveryState });
      },
    });

    expect(executeIsolated).toHaveBeenCalledOnce();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].checkpoint).toMatchObject({
      episodeId: CONTEXT.episodeId,
      completedTurns: [{ turn: 1 }],
    });
    expect(result.latestCheckpoint).toBe(persisted[0].checkpoint);
    expect(result.proposalRecoveryState).toMatchObject({
      canonicalBaseProjectRevision: 'revision-r7',
      isolatedWorkingProjectRevision: 'revision-r8',
      operations: [{ operatorId: 'set_keyframes', turn: 1 }],
    });
    expect(result.episodeReceipt.terminal.disposition).toBe('READY_FOR_PROOF');
  });

  it('rejects durable attempt persistence without a compatible guard before invoke', async () => {
    const invoke = vi.fn(async () => finish());
    await expect(executeProviderNativeFreshEpisodeCoreV2R({
      scope: {
        tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
        episodeId: CONTEXT.episodeId,
      },
      route: ROUTE,
      expectedContextSha256: hashCanonicalJsonV1(CONTEXT),
      expectedToolSetSha256: TOOL_SET_SHA,
      artifacts: resolvedArtifacts({ executeIsolated: vi.fn(), invoke }),
      requireDurableProviderAttemptPersistence: true,
      heartbeat: async () => undefined,
      persistCheckpoint: vi.fn(),
    })).rejects.toThrow('PROVIDER_NATIVE_ATTEMPT_COMMIT_RUNTIME_GUARD_UNSUPPORTED');
    expect(invoke).not.toHaveBeenCalled();
  });
});

function resolvedArtifacts(input: Readonly<{
  executeIsolated: ProviderNativeDurableResolvedArtifactsV2R[
    'isolatedClone'
  ]['executeIsolated'];
  invoke: ProviderNativeDurableResolvedArtifactsV2R['invoke'];
}>): Readonly<ProviderNativeDurableResolvedArtifactsV2R> {
  const bindingMaterial = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING' as const,
    canonicalBaseProjectRevision: 'revision-r7',
    canonicalBaseStateSha256: BASE_STATE,
    isolatedWorkingProjectRevision: 'revision-r7',
    isolatedWorkingStateSha256: BASE_STATE,
  };
  return {
    context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE,
    currentRevision: {
      origin: 'PROJECTSERVICE_CURRENT_REVISION_READ',
      projectRevision: 'revision-r7',
      readReceiptId: 'read-receipt-1',
      readReceiptSha256: READ_RECEIPT,
    },
    isolatedClone: {
      origin: 'PROJECTSERVICE_REVISION_CLONE',
      projectRevision: 'revision-r7',
      stateSha256: BASE_STATE,
      proposalRevisionBinding: {
        ...bindingMaterial,
        bindingSha256: hashCanonicalJsonV1(bindingMaterial),
      },
      executeIsolated: input.executeIsolated,
      captureProposalRecoveryState: async (checkpoint) => (
        createProviderNativeProposalRecoveryStateV2R({
          checkpoint,
          projectId: 'project-1',
          canonicalBaseProjectRevision: 'revision-r7',
          canonicalBaseStateSha256: BASE_STATE,
          operations: [{
            turn: 1,
            beforeStateSha256: BASE_STATE,
            afterStateSha256: AFTER_STATE,
          }],
        })
      ),
    },
    invoke: input.invoke,
  };
}

function call(callId: string, name: string, args: Record<string, unknown>) {
  return { status: 200, body: {
    id: `response-${callId}`, model: ROUTE.model, status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}

function finish() {
  return call('finish-1', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF',
    reasonCodes: ['MODEL_READY_FOR_PROOF'], evidenceIds: [],
    summary: 'The isolated proposal is ready for bounded proof.',
  });
}
