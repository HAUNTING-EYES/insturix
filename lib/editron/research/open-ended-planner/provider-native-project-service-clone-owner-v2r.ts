import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  changedProjectProposalPathsV2R,
  isoProjectProposalDateV2R,
  projectProposalStateV2R,
} from './project-service-proposal-state-v2r';
import type {
  ProviderNativeDurableProjectCloneOwnerV2R,
} from './provider-native-episode-owner-artifact-resolver-v2r';
import type {
  ProviderNativeDurableProposalReceiptV2R,
  ProviderNativeDurableIsolatedCloneV2R,
} from './provider-native-episode-durable-worker-v2r';
import type {
  ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import type {
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';

type IsolatedCallV2R = Parameters<
  ProviderNativeDurableIsolatedCloneV2R['executeIsolated']
>[0];

export interface ProjectServiceProposalSnapshotOwnerV2R {
  loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<Readonly<{ project: Project; revision: ProjectRevisionV1 }>>;
}

export interface ProjectServiceIsolatedOperatorOwnerV2R {
  execute(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    project: Project;
    baseRevision: Readonly<ProjectRevisionV1>;
    call: Readonly<IsolatedCallV2R>;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>>;
}

interface OperationAuditV2R {
  operatorId: string;
  turn: number;
  callSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
  changedPaths: readonly string[];
  executionSha256: string;
  operationReceiptSha256: string;
}

/**
 * Adapts the existing ProjectService paired snapshot/revision read to the
 * durable research episode. The supplied operator owner can mutate only the
 * in-memory clone; this adapter has no ProjectService write method.
 */
export function createProviderNativeProjectServiceCloneOwnerV2R(input: Readonly<{
  projectService: Readonly<ProjectServiceProposalSnapshotOwnerV2R>;
  isolatedOperatorOwner: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>;
}>): Readonly<ProviderNativeDurableProjectCloneOwnerV2R> {
  return {
    resolve: async (scope) => {
      const initial = await input.projectService.loadProjectForMutation(
        scope.userId,
        scope.projectId,
      );
      assertSnapshot(scope.userId, scope.projectId, initial);

      const baseRevision = structuredClone(initial.revision);
      const baseRevisionIdentity = revisionIdentity(baseRevision);
      const canonicalBaseState = projectProposalStateV2R(initial.project);
      const baseStateSha256 = hashCanonicalJsonV1(canonicalBaseState);
      let workingProject = structuredClone(initial.project);
      let stale = false;
      let finalized: Readonly<ProviderNativeDurableProposalReceiptV2R> | null = null;
      const operations: OperationAuditV2R[] = [];

      const readMaterial = {
        schemaVersion: 1,
        origin: 'PROJECTSERVICE_CURRENT_REVISION_READ',
        tenantId: scope.tenantId,
        userId: scope.userId,
        projectId: scope.projectId,
        episodeId: scope.checkpoint.episodeId,
        projectRevision: baseRevisionIdentity,
        stateSha256: baseStateSha256,
      } as const;
      const readReceiptSha256 = hashCanonicalJsonV1(readMaterial);

      return {
        currentRevision: {
          origin: 'PROJECTSERVICE_CURRENT_REVISION_READ' as const,
          projectRevision: baseRevisionIdentity,
          readReceiptId: `psread_${readReceiptSha256.slice(0, 24)}`,
          readReceiptSha256,
        },
        isolatedClone: {
          origin: 'PROJECTSERVICE_REVISION_CLONE' as const,
          projectRevision: baseRevisionIdentity,
          stateSha256: baseStateSha256,
          executeIsolated: async (call) => {
            if (finalized) {
              return conflict('PROJECTSERVICE_PROPOSAL_ALREADY_FINALIZED', {
                receiptSha256: finalized.receiptSha256,
              });
            }
            const beforeGuard = await readCanonicalGuard(input.projectService, scope);
            if (stale || !guardMatches(beforeGuard, baseRevision, baseStateSha256)) {
              stale = true;
              return staleConflict(baseRevisionIdentity, baseStateSha256, beforeGuard);
            }

            const beforeProject = structuredClone(workingProject);
            const beforeState = projectProposalStateV2R(beforeProject);
            const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
            let execution: Readonly<ProviderNativeToolExecutionV2R>;
            try {
              execution = await input.isolatedOperatorOwner.execute({
                tenantId: scope.tenantId,
                userId: scope.userId,
                projectId: scope.projectId,
                checkpoint: scope.checkpoint,
                project: workingProject,
                baseRevision,
                call,
              });
              assertExecutionEnvelope(execution);
              assertCloneIdentity(initial.project, workingProject);
            } catch (error) {
              workingProject = beforeProject;
              throw error;
            }

            const afterGuard = await readCanonicalGuard(input.projectService, scope);
            if (!guardMatches(afterGuard, baseRevision, baseStateSha256)) {
              workingProject = beforeProject;
              stale = true;
              return staleConflict(baseRevisionIdentity, baseStateSha256, afterGuard);
            }
            if (execution.disposition !== 'OK') {
              workingProject = beforeProject;
              return execution;
            }

            const afterState = projectProposalStateV2R(workingProject);
            const afterStateSha256 = hashCanonicalJsonV1(afterState);
            const material = {
              operatorId: call.operatorId,
              turn: call.turn,
              callSha256: hashCanonicalJsonV1(call),
              beforeStateSha256,
              afterStateSha256,
              changedPaths: changedProjectProposalPathsV2R(beforeState, afterState),
              executionSha256: hashCanonicalJsonV1(execution),
            };
            operations.push(deepFreezeV1({
              ...material,
              operationReceiptSha256: hashCanonicalJsonV1(material),
            }) as OperationAuditV2R);
            return execution;
          },
          finalizeProposalReceipt: async () => {
            if (finalized) return finalized;
            if (stale) throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
            const finalGuard = await readCanonicalGuard(input.projectService, scope);
            if (!guardMatches(finalGuard, baseRevision, baseStateSha256)) {
              stale = true;
              throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
            }
            assertCloneIdentity(initial.project, workingProject);
            const finalState = projectProposalStateV2R(workingProject);
            const material = {
              schemaVersion: 1 as const,
              authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION' as const,
              episodeId: scope.checkpoint.episodeId,
              projectId: scope.projectId,
              baseProjectRevision: baseRevisionIdentity,
              baseStateSha256,
              finalStateSha256: hashCanonicalJsonV1(finalState),
              changedPaths: changedProjectProposalPathsV2R(canonicalBaseState, finalState),
              operationReceipts: operations.map((entry) => ({ ...entry })),
              canonicalProjectRevisionAfter: finalGuard.revisionIdentity,
              canonicalStateSha256After: finalGuard.stateSha256,
              canonicalUnchanged: true as const,
            };
            finalized = deepFreezeV1({
              ...material,
              receiptSha256: hashCanonicalJsonV1(material),
            });
            return finalized;
          },
        },
      };
    },
  };
}

async function readCanonicalGuard(
  owner: Readonly<ProjectServiceProposalSnapshotOwnerV2R>,
  scope: Readonly<{
    userId: string;
    projectId: string;
  }>,
): Promise<Readonly<{
  revision: ProjectRevisionV1;
  revisionIdentity: string;
  stateSha256: string;
}>> {
  const current = await owner.loadProjectForMutation(scope.userId, scope.projectId);
  assertSnapshot(scope.userId, scope.projectId, current);
  return {
    revision: current.revision,
    revisionIdentity: revisionIdentity(current.revision),
    stateSha256: hashCanonicalJsonV1(projectProposalStateV2R(current.project)),
  };
}

function guardMatches(
  current: Readonly<{ revision: ProjectRevisionV1; stateSha256: string }>,
  expectedRevision: Readonly<ProjectRevisionV1>,
  expectedStateSha256: string,
): boolean {
  return sameRevision(current.revision, expectedRevision)
    && current.stateSha256 === expectedStateSha256;
}

function staleConflict(
  expectedRevision: string,
  expectedStateSha256: string,
  current: Readonly<{ revisionIdentity: string; stateSha256: string }>,
): Readonly<ProviderNativeToolExecutionV2R> {
  return conflict('PROJECTSERVICE_PROPOSAL_BASE_STALE', {
    expectedProjectRevision: expectedRevision,
    currentProjectRevision: current.revisionIdentity,
    expectedStateSha256,
    currentStateSha256: current.stateSha256,
  });
}

function conflict(code: string, details: Readonly<Record<string, unknown>>): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'CONFLICT' as const,
    output: { code, message: 'The canonical project no longer matches this isolated proposal.', details },
    evidenceIds: [] as const,
  });
}

function assertSnapshot(
  userId: string,
  projectId: string,
  snapshot: Readonly<{ project: Project; revision: ProjectRevisionV1 }>,
): void {
  if (snapshot.project.projectId !== projectId || snapshot.project.userId !== userId) {
    throw new Error('PROJECTSERVICE_PROPOSAL_SCOPE_MISMATCH');
  }
  const updatedAt = isoProjectProposalDateV2R(snapshot.project.updatedAt);
  const value = Number.isSafeInteger(snapshot.project.projectRevision)
    && Number(snapshot.project.projectRevision) >= 0
    ? Number(snapshot.project.projectRevision) : 0;
  if (snapshot.revision.schemaVersion !== 1 || snapshot.revision.value !== value
    || snapshot.revision.compatibilityUpdatedAt !== updatedAt) {
    throw new Error('PROJECTSERVICE_PROPOSAL_REVISION_SNAPSHOT_MISMATCH');
  }
}

function assertCloneIdentity(base: Readonly<Project>, current: Readonly<Project>): void {
  if (current.projectId !== base.projectId || current.userId !== base.userId
    || current.projectRevision !== base.projectRevision
    || isoProjectProposalDateV2R(current.createdAt) !== isoProjectProposalDateV2R(base.createdAt)
    || isoProjectProposalDateV2R(current.updatedAt) !== isoProjectProposalDateV2R(base.updatedAt)) {
    throw new Error('PROJECTSERVICE_PROPOSAL_CLONE_IDENTITY_MUTATED');
  }
}

function assertExecutionEnvelope(value: Readonly<ProviderNativeToolExecutionV2R>): void {
  if (value.authority !== 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION'
    || !['OK', 'FAIL', 'UNVERIFIABLE', 'CONFLICT'].includes(value.disposition)
    || !value.output || typeof value.output !== 'object' || Array.isArray(value.output)
    || !Array.isArray(value.evidenceIds)
    || value.evidenceIds.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('PROJECTSERVICE_PROPOSAL_EXECUTION_ENVELOPE_INVALID');
  }
}

function revisionIdentity(revision: Readonly<ProjectRevisionV1>): string {
  return `project-revision-v1:${hashCanonicalJsonV1(revision)}`;
}

function sameRevision(left: Readonly<ProjectRevisionV1>, right: Readonly<ProjectRevisionV1>): boolean {
  return left.schemaVersion === right.schemaVersion && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}
