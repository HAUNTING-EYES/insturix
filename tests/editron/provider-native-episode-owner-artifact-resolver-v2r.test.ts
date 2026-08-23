import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildProviderNativeEpisodeDurableJobInputV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import {
  createProviderNativeDurableOwnerArtifactResolverV2R,
  resolveProviderNativeDurableArtifactsFromOwnersV2R,
  type ProviderNativeDurableProjectCloneOwnerV2R,
  type ProviderNativeDurableTransportOwnerV2R,
}
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const ELIGIBLE = ['find_audio_moment', 'sync_cuts_to_beats'] as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'owner-resolved-episode-1',
  objective: 'Resolve one hash-bound durable episode.',
  activeTarget: { taskId: 'OWNER-RESOLVE-1' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-1' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-1' },
  evidence: [], preservationRules: ['Do not invent artifacts.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};
const TOOL_SET_SHA = buildOpaqueResultReferenceToolSetV2R(
  buildProviderNativeToolSetV2R(ELIGIBLE),
).toolSetSha256;

describe('provider-native owner-backed durable artifact resolver V2R', () => {
  it('coordinates exact owners without storing or inventing an artifact', async () => {
    const { job, checkpoint } = await fixture();
    const invoke = vi.fn();
    const executeIsolated = vi.fn();
    const definition = vi.fn(async () => ({ context: CONTEXT, eligibleOperatorIds: ELIGIBLE }));
    const resolver = createProviderNativeDurableOwnerArtifactResolverV2R({
      episodeDefinition: { resolve: definition },
      projectClone: { resolve: async () => ({
        currentRevision: {
          origin: 'PROJECTSERVICE_CURRENT_REVISION_READ', projectRevision: 'revision-2',
          readReceiptId: 'read-revision-2', readReceiptSha256: 'c'.repeat(64),
        },
        isolatedClone: {
          origin: 'PROJECTSERVICE_REVISION_CLONE', projectRevision: 'revision-2',
          stateSha256: 'd'.repeat(64), executeIsolated,
        },
      }) },
      transport: { resolve: async () => invoke },
    });

    await expect(resolver.resolve({ job, checkpoint })).resolves.toMatchObject({
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      currentRevision: { projectRevision: 'revision-2' },
      isolatedClone: { projectRevision: 'revision-2' },
      invoke,
    });
    expect(definition).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      episodeId: CONTEXT.episodeId,
      expectedContextSha256: hashCanonicalJsonV1(CONTEXT),
      expectedToolSetSha256: TOOL_SET_SHA,
    }));
  });

  it('reuses the same owners from an exact non-job lifecycle scope', async () => {
    const { checkpoint } = await fixture();
    const invoke = vi.fn();
    const definition = vi.fn(async () => ({
      context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
    }));
    const projectClone = vi.fn(async () => ({
      currentRevision: {
        origin: 'PROJECTSERVICE_CURRENT_REVISION_READ' as const,
        projectRevision: 'revision-2',
        readReceiptId: 'read-revision-2', readReceiptSha256: 'c'.repeat(64),
      },
      isolatedClone: {
        origin: 'PROJECTSERVICE_REVISION_CLONE' as const,
        projectRevision: 'revision-2', stateSha256: 'd'.repeat(64),
        executeIsolated: vi.fn(),
      },
    }));
    const owners = {
      episodeDefinition: { resolve: definition },
      projectClone: { resolve: projectClone },
      transport: { resolve: async () => invoke },
    };
    const scope = {
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      episodeId: CONTEXT.episodeId,
    };

    await expect(resolveProviderNativeDurableArtifactsFromOwnersV2R(
      owners, { scope, checkpoint },
    )).resolves.toMatchObject({ invoke, context: CONTEXT });
    await expect(resolveProviderNativeDurableArtifactsFromOwnersV2R(
      owners, { scope: { ...scope, episodeId: 'copied-episode' }, checkpoint },
    )).rejects.toThrow('PROVIDER_NATIVE_DURABLE_ARTIFACT_SCOPE_INVALID');
    expect(definition).toHaveBeenCalledOnce();
    expect(projectClone).toHaveBeenCalledOnce();
  });

  it('rejects owner-returned context and tool-set drift', async () => {
    const { job, checkpoint } = await fixture();
    const changed = { ...CONTEXT, objective: 'forged' };
    await expect(resolverFor({ context: changed }).resolve({ job, checkpoint }))
      .rejects.toThrow('PROVIDER_NATIVE_DURABLE_CONTEXT_OWNER_MISMATCH');
    await expect(resolverFor({ eligibleOperatorIds: ['find_audio_moment'] })
      .resolve({ job, checkpoint }))
      .rejects.toThrow('PROVIDER_NATIVE_DURABLE_TOOLSET_OWNER_MISMATCH');
  });

  it('rejects project-scope drift before project or provider resolution', async () => {
    const changed = {
      ...CONTEXT,
      projectState: { ...CONTEXT.projectState, projectId: 'project-2' },
    };
    const { job, checkpoint } = await fixture({ context: changed });
    const projectClone = vi.fn(async (): Promise<never> => {
      throw new Error('PROJECT_CLONE_MUST_NOT_RUN');
    });
    const transport = vi.fn(async (): Promise<never> => {
      throw new Error('TRANSPORT_MUST_NOT_RUN');
    });
    const resolver = resolverFor({ context: changed, projectClone, transport });
    await expect(resolver.resolve({ job, checkpoint }))
      .rejects.toThrow('PROVIDER_NATIVE_DURABLE_CONTEXT_PROJECT_MISMATCH');
    expect(projectClone).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('requires declared reference and runtime owners instead of falling back', async () => {
    const { job, checkpoint } = await fixture({
      referenceInputManifestSha256: 'e'.repeat(64),
      runtimeGuard: { guardKind: 'runtime-guard-v1', guardIdentitySha256: 'f'.repeat(64) },
    });
    const resolver = resolverFor({});
    await expect(resolver.resolve({ job, checkpoint }))
      .rejects.toThrow('PROVIDER_NATIVE_DURABLE_REFERENCE_OWNER_REQUIRED');

    const runtimeOnly = await fixture({
      runtimeGuard: { guardKind: 'runtime-guard-v1', guardIdentitySha256: 'f'.repeat(64) },
    });
    await expect(resolver.resolve(runtimeOnly))
      .rejects.toThrow('PROVIDER_NATIVE_DURABLE_RUNTIME_GUARD_OWNER_REQUIRED');
  });
});

function resolverFor(overrides: Readonly<{
  context?: ProviderNativeEpisodeContextV2R;
  eligibleOperatorIds?: readonly string[];
  projectClone?: ProviderNativeDurableProjectCloneOwnerV2R['resolve'];
  transport?: ProviderNativeDurableTransportOwnerV2R['resolve'];
}>) {
  const defaultProjectClone: ProviderNativeDurableProjectCloneOwnerV2R['resolve'] =
    async () => ({
      currentRevision: {
        origin: 'PROJECTSERVICE_CURRENT_REVISION_READ', projectRevision: 'revision-2',
        readReceiptId: 'read-revision-2', readReceiptSha256: 'c'.repeat(64),
      },
      isolatedClone: {
        origin: 'PROJECTSERVICE_REVISION_CLONE', projectRevision: 'revision-2',
        stateSha256: 'd'.repeat(64), executeIsolated: async () => ({
          authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
          output: {}, evidenceIds: [],
        }),
      },
    });
  const defaultTransport: ProviderNativeDurableTransportOwnerV2R['resolve'] =
    async () => async () => ({ status: 200, body: {} });
  return createProviderNativeDurableOwnerArtifactResolverV2R({
    episodeDefinition: { resolve: async () => ({
      context: overrides.context ?? CONTEXT,
      eligibleOperatorIds: overrides.eligibleOperatorIds ?? ELIGIBLE,
    }) },
    projectClone: { resolve: overrides.projectClone ?? defaultProjectClone },
    transport: { resolve: overrides.transport ?? defaultTransport },
  });
}

async function fixture(options: Readonly<{
  context?: ProviderNativeEpisodeContextV2R;
  referenceInputManifestSha256?: string;
  runtimeGuard?: Readonly<{ guardKind: string; guardIdentitySha256: string }>;
}> = {}) {
  const context = options.context ?? CONTEXT;
  const completedTurns = [{ turn: 1, marker: 'committed-prefix' }] as const;
  const completedTurnsSha256 = hashCanonicalJsonV1(completedTurns);
  const checkpoint = createProviderNativeEpisodeResumeCheckpointV2R({
    route: ROUTE, episodeId: context.episodeId,
    contextSha256: hashCanonicalJsonV1(context), toolSetSha256: TOOL_SET_SHA,
    completedTurns,
    ...(options.referenceInputManifestSha256
      ? { referenceInputManifestSha256: options.referenceInputManifestSha256 } : {}),
    ...(options.runtimeGuard ? { runtimeGuardResumeState: {
      version: 'EDITRON_PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_V2R_1',
      authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION',
      guardKind: options.runtimeGuard.guardKind,
      guardIdentitySha256: options.runtimeGuard.guardIdentitySha256,
      completedTurnsSha256, nextTurn: 2,
      state: { usage: { providerTurns: 1 } },
      resumeStateSha256: hashCanonicalJsonV1({
        version: 'EDITRON_PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_V2R_1',
        authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION',
        guardKind: options.runtimeGuard.guardKind,
        guardIdentitySha256: options.runtimeGuard.guardIdentitySha256,
        completedTurnsSha256, nextTurn: 2,
        state: { usage: { providerTurns: 1 } },
      }),
    } } : {}),
  });
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const created = await store.createOrGet(buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-1', userId: 'user-1', orgId: 'org-1', projectId: 'project-1',
    parentCommandId: null, parentReceiptId: null, idempotencyKey: context.episodeId,
    identity: {
      route: ROUTE, episodeId: context.episodeId,
      contextSha256: hashCanonicalJsonV1(context), toolSetSha256: TOOL_SET_SHA,
      ...(options.referenceInputManifestSha256
        ? { referenceInputManifestSha256: options.referenceInputManifestSha256 } : {}),
      ...(options.runtimeGuard ? { runtimeGuard: options.runtimeGuard } : {}),
    },
    ...(options.runtimeGuard ? { budgetReservationId: 'budget-1' } : {}),
    maxAttempts: 2,
  }), new Date('2026-08-23T17:00:00.000Z'));
  return { job: created.job, checkpoint };
}
