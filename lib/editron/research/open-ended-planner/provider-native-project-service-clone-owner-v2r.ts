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
import {
  createProviderNativeProposalRecoveryStateV2R,
  proposalRecoveryWriterTurnsV2R,
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryWriterTurnV2R,
} from './provider-native-proposal-recovery-v2r';
import type {
  ProviderNativeDurableOutcomeProofReceiptV2R,
  ProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  ProviderNativeExecutionTraceKindV2R,
} from './provider-native-durable-outcome-proof-v2r';
import type {
  ProviderNativeEpisodeReceiptV2R,
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';

type IsolatedCallV2R = Parameters<
  ProviderNativeDurableIsolatedCloneV2R['executeIsolated']
>[0];

interface ProjectServiceProposalSnapshotOwnerV2R {
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
    episodeId?: string;
    checkpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    project: Project;
    baseRevision: Readonly<ProjectRevisionV1>;
    currentProjectRevision: string;
    call: Readonly<IsolatedCallV2R>;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>>;
  replayCommitted?(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId?: string;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    project: Project;
    baseRevision: Readonly<ProjectRevisionV1>;
    currentProjectRevision: string;
    call: Readonly<IsolatedCallV2R>;
    recordedExecution: Readonly<ProviderNativeToolExecutionV2R>;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>>;
}

export interface ProjectServiceIsolatedOutcomeProofOwnerV2R {
  prove(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    checkpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    project: Readonly<Project>;
    baselineProject: Readonly<Project>;
    baseRevision: Readonly<ProjectRevisionV1>;
    episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
    resumedReceiptSha256: string;
    proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
  }>): Promise<Readonly<ProviderNativeDurableOutcomeProofReceiptV2R>>;
  proveExecutionBound?(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    checkpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    project: Readonly<Project>;
    baselineProject: Readonly<Project>;
    baseRevision: Readonly<ProjectRevisionV1>;
    episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
    executionTrace: Readonly<{
      kind: ProviderNativeExecutionTraceKindV2R;
      receiptSha256: string;
    }>;
    proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
  }>): Promise<Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R>>;
}

interface OperationAuditV2R {
  operatorId: string;
  turn: number;
  callSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
  changedPaths: readonly string[];
  executionSha256: string;
  writerProjectRevision: string;
  operationReceiptSha256: string;
}

type ResolvedProjectServiceCloneV2R = Awaited<ReturnType<
  ProviderNativeDurableProjectCloneOwnerV2R['resolve']
>>;

/**
 * Adapts the existing ProjectService paired snapshot/revision read to the
 * durable research episode. The supplied operator owner can mutate only the
 * in-memory clone; this adapter has no ProjectService write method.
 */
export function createProviderNativeProjectServiceCloneOwnerV2R(input: Readonly<{
  projectService: Readonly<ProjectServiceProposalSnapshotOwnerV2R>;
  isolatedOperatorOwner: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>;
  isolatedOutcomeProofOwner?: Readonly<ProjectServiceIsolatedOutcomeProofOwnerV2R>;
}>): Readonly<ProviderNativeDurableProjectCloneOwnerV2R> {
  const resolveClone = async (scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    checkpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>): Promise<Readonly<ResolvedProjectServiceCloneV2R>> => {
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
      let workingProjectRevision = baseRevisionIdentity;
      let stale = false;
      let finalized: Readonly<ProviderNativeDurableProposalReceiptV2R> | null = null;
      let finalizedProof: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R> | null = null;
      let finalizedProofInputSha256: string | null = null;
      let finalizedExecutionBoundProof:
        Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R> | null = null;
      let finalizedExecutionBoundProofInputSha256: string | null = null;
      const operations: OperationAuditV2R[] = [];
      const recovery = scope.proposalRecoveryState;
      const checkpoint = scope.checkpoint;
      const writerTurns = checkpoint
        ? proposalRecoveryWriterTurnsV2R(checkpoint) : [];
      if (recovery && !checkpoint) {
        throw new Error('PROJECTSERVICE_PROPOSAL_RECOVERY_CHECKPOINT_REQUIRED');
      }
      if (writerTurns.length && !recovery) {
        throw new Error('PROJECTSERVICE_PROPOSAL_RECOVERY_REQUIRED');
      }
      if (recovery) {
        verifyProviderNativeProposalRecoveryStateV2R({
          checkpoint: checkpoint!,
          projectId: scope.projectId,
          state: recovery,
        });
        if (recovery.canonicalBaseProjectRevision !== baseRevisionIdentity
          || recovery.canonicalBaseStateSha256 !== baseStateSha256) {
          throw new Error('PROJECTSERVICE_PROPOSAL_RECOVERY_BASE_MISMATCH');
        }
        if (!input.isolatedOperatorOwner.replayCommitted) {
          throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_OWNER_REQUIRED');
        }
        const replayed = await replayCommittedProposal({
          scope: { ...scope, checkpoint: checkpoint! },
          projectService: input.projectService,
          isolatedOperatorOwner: input.isolatedOperatorOwner,
          baseProject: initial.project,
          workingProject,
          baseRevision,
          baseRevisionIdentity,
          baseStateSha256,
          recovery,
          writerTurns,
        });
        operations.push(...replayed.operations);
        workingProjectRevision = replayed.workingProjectRevision;
      }

      const readMaterial = {
        schemaVersion: 1,
        origin: 'PROJECTSERVICE_CURRENT_REVISION_READ',
        tenantId: scope.tenantId,
        userId: scope.userId,
        projectId: scope.projectId,
        episodeId: scope.episodeId,
        projectRevision: baseRevisionIdentity,
        stateSha256: baseStateSha256,
      } as const;
      const readReceiptSha256 = hashCanonicalJsonV1(readMaterial);
      const proposalRevisionMaterial = {
        schemaVersion: 1 as const,
        authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING' as const,
        canonicalBaseProjectRevision: baseRevisionIdentity,
        canonicalBaseStateSha256: baseStateSha256,
        isolatedWorkingProjectRevision: workingProjectRevision,
        isolatedWorkingStateSha256: hashCanonicalJsonV1(
          projectProposalStateV2R(workingProject),
        ),
      };

      const finalizeProposalReceipt = async () => {
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
          episodeId: scope.episodeId,
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
      };

      const finalizeOutcomeProof = async (proofInput: Readonly<{
        episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
        resumedReceiptSha256: string;
        proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
      }>) => {
        const proposalReceipt = await finalizeProposalReceipt();
        if (proofInput.proposalReceipt.receiptSha256 !== proposalReceipt.receiptSha256) {
          throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_RECEIPT_MISMATCH');
        }
        const proofInputSha256 = hashCanonicalJsonV1({
          episodeReceiptSha256: proofInput.episodeReceipt.receiptSha256,
          resumedReceiptSha256: proofInput.resumedReceiptSha256,
          proposalReceiptSha256: proposalReceipt.receiptSha256,
        });
        if (finalizedProof) {
          if (finalizedProofInputSha256 !== proofInputSha256) {
            throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_REPLAY_MISMATCH');
          }
          return finalizedProof;
        }
        const beforeGuard = await readCanonicalGuard(input.projectService, scope);
        if (!guardMatches(beforeGuard, baseRevision, baseStateSha256)) {
          stale = true;
          throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
        }
        const proof = await input.isolatedOutcomeProofOwner!.prove({
          tenantId: scope.tenantId,
          userId: scope.userId,
          projectId: scope.projectId,
          episodeId: scope.episodeId,
          ...(checkpoint ? { checkpoint } : {}),
          project: structuredClone(workingProject),
          baselineProject: structuredClone(initial.project),
          baseRevision: structuredClone(baseRevision),
          episodeReceipt: structuredClone(proofInput.episodeReceipt),
          resumedReceiptSha256: proofInput.resumedReceiptSha256,
          proposalReceipt: structuredClone(proposalReceipt),
        });
        const afterGuard = await readCanonicalGuard(input.projectService, scope);
        if (!guardMatches(afterGuard, baseRevision, baseStateSha256)) {
          stale = true;
          throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
        }
        assertCloneIdentity(initial.project, workingProject);
        if (hashCanonicalJsonV1(projectProposalStateV2R(workingProject))
          !== proposalReceipt.finalStateSha256) {
          throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_STATE_DRIFT');
        }
        finalizedProof = deepFreezeV1(structuredClone(proof));
        finalizedProofInputSha256 = proofInputSha256;
        return finalizedProof;
      };

      const finalizeExecutionBoundOutcomeProof = async (proofInput: Readonly<{
        episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
        executionTrace: Readonly<{
          kind: ProviderNativeExecutionTraceKindV2R;
          receiptSha256: string;
        }>;
        proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
      }>) => {
        const proposalReceipt = await finalizeProposalReceipt();
        if (proofInput.proposalReceipt.receiptSha256 !== proposalReceipt.receiptSha256) {
          throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_RECEIPT_MISMATCH');
        }
        const proofInputSha256 = hashCanonicalJsonV1({
          episodeReceiptSha256: proofInput.episodeReceipt.receiptSha256,
          executionTrace: proofInput.executionTrace,
          proposalReceiptSha256: proposalReceipt.receiptSha256,
        });
        if (finalizedExecutionBoundProof) {
          if (finalizedExecutionBoundProofInputSha256 !== proofInputSha256) {
            throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_REPLAY_MISMATCH');
          }
          return finalizedExecutionBoundProof;
        }
        const beforeGuard = await readCanonicalGuard(input.projectService, scope);
        if (!guardMatches(beforeGuard, baseRevision, baseStateSha256)) {
          stale = true;
          throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
        }
        const proof = await input.isolatedOutcomeProofOwner!.proveExecutionBound!({
          tenantId: scope.tenantId,
          userId: scope.userId,
          projectId: scope.projectId,
          episodeId: scope.episodeId,
          ...(checkpoint ? { checkpoint } : {}),
          project: structuredClone(workingProject),
          baselineProject: structuredClone(initial.project),
          baseRevision: structuredClone(baseRevision),
          episodeReceipt: structuredClone(proofInput.episodeReceipt),
          executionTrace: structuredClone(proofInput.executionTrace),
          proposalReceipt: structuredClone(proposalReceipt),
        });
        const afterGuard = await readCanonicalGuard(input.projectService, scope);
        if (!guardMatches(afterGuard, baseRevision, baseStateSha256)) {
          stale = true;
          throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
        }
        assertCloneIdentity(initial.project, workingProject);
        if (hashCanonicalJsonV1(projectProposalStateV2R(workingProject))
          !== proposalReceipt.finalStateSha256) {
          throw new Error('PROJECTSERVICE_PROPOSAL_PROOF_STATE_DRIFT');
        }
        finalizedExecutionBoundProof = deepFreezeV1(structuredClone(proof));
        finalizedExecutionBoundProofInputSha256 = proofInputSha256;
        return finalizedExecutionBoundProof;
      };

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
          proposalRevisionBinding: {
            ...proposalRevisionMaterial,
            bindingSha256: hashCanonicalJsonV1(proposalRevisionMaterial),
          },
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
                episodeId: scope.episodeId,
                ...(checkpoint ? { checkpoint } : {}),
                project: workingProject,
                baseRevision,
                currentProjectRevision: workingProjectRevision,
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
            const writerProjectRevision = executionWriterProjectRevision(execution);
            if (beforeStateSha256 !== afterStateSha256 && !writerProjectRevision) {
              workingProject = beforeProject;
              throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_REVISION_REQUIRED');
            }
            if (writerProjectRevision) {
              try {
                assertWriterRevisionOriginV2R({
                  execution,
                  writerProjectRevision,
                  tenantId: scope.tenantId,
                  userId: scope.userId,
                  projectId: scope.projectId,
                  canonicalBaseRevision: baseRevision,
                  previousProjectRevision: workingProjectRevision,
                  call,
                  beforeStateSha256,
                  afterStateSha256,
                });
              } catch (error) {
                workingProject = beforeProject;
                throw error;
              }
              assertOperationOrder(operations, call.turn);
              operations.push(operationAudit({
                call,
                beforeState,
                afterState,
                execution,
                writerProjectRevision,
              }));
              workingProjectRevision = writerProjectRevision;
            }
            return execution;
          },
          captureProposalRecoveryState: async (checkpoint) => {
            if (!operations.length) return undefined;
            const state = createProviderNativeProposalRecoveryStateV2R({
              checkpoint,
              projectId: scope.projectId,
              canonicalBaseProjectRevision: baseRevisionIdentity,
              canonicalBaseStateSha256: baseStateSha256,
              operations: operations.map((operation) => ({
                turn: operation.turn,
                beforeStateSha256: operation.beforeStateSha256,
                afterStateSha256: operation.afterStateSha256,
              })),
            });
            const currentStateSha256 = hashCanonicalJsonV1(
              projectProposalStateV2R(workingProject),
            );
            if (state.isolatedWorkingProjectRevision !== workingProjectRevision
              || state.isolatedWorkingStateSha256 !== currentStateSha256) {
              throw new Error('PROJECTSERVICE_PROPOSAL_RECOVERY_CAPTURE_MISMATCH');
            }
            return state;
          },
          finalizeProposalReceipt,
          ...(checkpoint && input.isolatedOutcomeProofOwner
            ? { finalizeOutcomeProof } : {}),
          ...(input.isolatedOutcomeProofOwner?.proveExecutionBound
            ? { finalizeExecutionBoundOutcomeProof } : {}),
        },
      };
  };
  return {
    resolve: async (scope) => resolveClone({
      ...scope,
      episodeId: scope.checkpoint.episodeId,
    }),
    // A fresh clone has no checkpoint-shaped history. Its first checkpoint is
    // created only after a real dispatch intent, attempt, or writer commits.
    resolveFresh: async (scope) => resolveClone(scope),
  };
}

async function replayCommittedProposal(input: Readonly<{
  scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>;
  projectService: Readonly<ProjectServiceProposalSnapshotOwnerV2R>;
  isolatedOperatorOwner: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>;
  baseProject: Readonly<Project>;
  workingProject: Project;
  baseRevision: Readonly<ProjectRevisionV1>;
  baseRevisionIdentity: string;
  baseStateSha256: string;
  recovery: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  writerTurns: readonly Readonly<ProviderNativeProposalRecoveryWriterTurnV2R>[];
}>): Promise<Readonly<{
  operations: readonly Readonly<OperationAuditV2R>[];
  workingProjectRevision: string;
}>> {
  const replay = input.isolatedOperatorOwner.replayCommitted;
  if (!replay) throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_OWNER_REQUIRED');
  const operations: OperationAuditV2R[] = [];
  let workingProjectRevision = input.baseRevisionIdentity;
  for (const [index, writer] of input.writerTurns.entries()) {
    const expected = input.recovery.operations[index];
    const beforeState = projectProposalStateV2R(input.workingProject);
    if (hashCanonicalJsonV1(beforeState) !== expected.beforeStateSha256) {
      throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_BEFORE_STATE_MISMATCH');
    }
    const call: IsolatedCallV2R = {
      operatorId: writer.operatorId,
      arguments: writer.arguments,
      turn: writer.turn,
    };
    const execution = await replay({
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      projectId: input.scope.projectId,
      episodeId: input.scope.episodeId,
      checkpoint: input.scope.checkpoint,
      project: input.workingProject,
      baseRevision: input.baseRevision,
      currentProjectRevision: workingProjectRevision,
      call,
      recordedExecution: writer.recordedExecution as unknown as ProviderNativeToolExecutionV2R,
    });
    assertExecutionEnvelope(execution);
    assertCloneIdentity(input.baseProject, input.workingProject);
    const afterState = projectProposalStateV2R(input.workingProject);
    const writerProjectRevision = executionWriterProjectRevision(execution);
    if (execution.disposition === 'OK' && writerProjectRevision) {
      assertWriterRevisionOriginV2R({
        execution,
        writerProjectRevision,
        tenantId: input.scope.tenantId,
        userId: input.scope.userId,
        projectId: input.scope.projectId,
        canonicalBaseRevision: input.baseRevision,
        previousProjectRevision: workingProjectRevision,
        call,
        beforeStateSha256: hashCanonicalJsonV1(beforeState),
        afterStateSha256: hashCanonicalJsonV1(afterState),
      });
    }
    if (execution.disposition !== 'OK'
      || hashCanonicalJsonV1(execution) !== expected.recordedExecutionSha256
      || hashCanonicalJsonV1(afterState) !== expected.afterStateSha256
      || writerProjectRevision !== expected.writerProjectRevision) {
      throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_RESULT_MISMATCH');
    }
    const audit = operationAudit({
      call,
      beforeState,
      afterState,
      execution,
      writerProjectRevision,
    });
    if (audit.callSha256 !== expected.callSha256
      || audit.executionSha256 !== expected.recordedExecutionSha256
      || audit.beforeStateSha256 !== expected.beforeStateSha256
      || audit.afterStateSha256 !== expected.afterStateSha256) {
      throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_AUDIT_MISMATCH');
    }
    operations.push(audit);
    workingProjectRevision = writerProjectRevision;
    const current = await readCanonicalGuard(input.projectService, input.scope);
    if (!guardMatches(current, input.baseRevision, input.baseStateSha256)) {
      throw new Error('PROJECTSERVICE_PROPOSAL_BASE_STALE');
    }
  }
  if (workingProjectRevision !== input.recovery.isolatedWorkingProjectRevision
    || hashCanonicalJsonV1(projectProposalStateV2R(input.workingProject))
      !== input.recovery.isolatedWorkingStateSha256) {
    throw new Error('PROJECTSERVICE_PROPOSAL_REPLAY_FINAL_STATE_MISMATCH');
  }
  return { operations, workingProjectRevision };
}

function operationAudit(input: Readonly<{
  call: Readonly<IsolatedCallV2R>;
  beforeState: ReturnType<typeof projectProposalStateV2R>;
  afterState: ReturnType<typeof projectProposalStateV2R>;
  execution: Readonly<ProviderNativeToolExecutionV2R>;
  writerProjectRevision: string;
}>): Readonly<OperationAuditV2R> {
  const material = {
    operatorId: input.call.operatorId,
    turn: input.call.turn,
    callSha256: hashCanonicalJsonV1(input.call),
    beforeStateSha256: hashCanonicalJsonV1(input.beforeState),
    afterStateSha256: hashCanonicalJsonV1(input.afterState),
    changedPaths: changedProjectProposalPathsV2R(input.beforeState, input.afterState),
    executionSha256: hashCanonicalJsonV1(input.execution),
    writerProjectRevision: input.writerProjectRevision,
  };
  return deepFreezeV1({
    ...material,
    operationReceiptSha256: hashCanonicalJsonV1(material),
  }) as Readonly<OperationAuditV2R>;
}

function executionWriterProjectRevision(
  execution: Readonly<ProviderNativeToolExecutionV2R>,
): string | null {
  const receipt = execution.output.receipt;
  if (receipt === undefined) return null;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_RECEIPT_INVALID');
  }
  const value = (receipt as Record<string, unknown>).projectRevision;
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_REVISION_INVALID');
  }
  return value;
}

/**
 * A concrete owner cannot advance the proposal with an arbitrary receipt
 * string. The clone independently derives the sole deterministic issuer value
 * from the observed call and state transition, so copied or forged revisions
 * are rejected before the working revision advances.
 */
function assertWriterRevisionOriginV2R(input: Readonly<{
  execution: Readonly<ProviderNativeToolExecutionV2R>;
  writerProjectRevision: string;
  tenantId: string;
  userId: string;
  projectId: string;
  canonicalBaseRevision: Readonly<ProjectRevisionV1>;
  previousProjectRevision: string;
  call: Readonly<IsolatedCallV2R>;
  beforeStateSha256: string;
  afterStateSha256: string;
}>): void {
  const receipt = input.execution.output.receipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_RECEIPT_INVALID');
  }
  const proof = (receipt as Record<string, unknown>).proof;
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_PROOF_INVALID');
  }
  const material = proof as Record<string, unknown>;
  const writerAuthority = material.authority;
  if (typeof writerAuthority !== 'string' || !writerAuthority.trim()) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_PROOF_INVALID');
  }
  if (material.beforeStateSha256 !== input.beforeStateSha256
    || material.afterStateSha256 !== input.afterStateSha256) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_PROOF_STATE_MISMATCH');
  }
  const expectedRevision = issueProjectServiceIsolatedWriterRevisionV2R({
    writerAuthority,
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    canonicalBaseRevision: input.canonicalBaseRevision,
    previousProjectRevision: input.previousProjectRevision,
    operatorId: input.call.operatorId,
    turn: input.call.turn,
    argumentSha256: hashCanonicalJsonV1(input.call.arguments),
    beforeStateSha256: input.beforeStateSha256,
    afterStateSha256: input.afterStateSha256,
  });
  if (input.writerProjectRevision !== expectedRevision) {
    throw new Error('PROJECTSERVICE_PROPOSAL_WRITER_REVISION_ORIGIN_MISMATCH');
  }
}

function assertOperationOrder(
  operations: readonly Readonly<OperationAuditV2R>[],
  turn: number,
): void {
  if (!Number.isSafeInteger(turn) || turn < 1 || (operations.at(-1)?.turn ?? 0) >= turn) {
    throw new Error('PROJECTSERVICE_PROPOSAL_OPERATION_ORDER_INVALID');
  }
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

/**
 * Sole deterministic issuer for concrete isolated ProjectService proposal
 * writers. Operator adapters supply their owner authority and exact state
 * transition; they must not maintain private revision counters or maps.
 */
export function issueProjectServiceIsolatedWriterRevisionV2R(input: Readonly<{
  writerAuthority: string;
  tenantId: string;
  userId: string;
  projectId: string;
  canonicalBaseRevision: Readonly<ProjectRevisionV1>;
  previousProjectRevision: string;
  operatorId: string;
  turn: number;
  argumentSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
}>): string {
  const hashes = [input.argumentSha256, input.beforeStateSha256, input.afterStateSha256];
  if (!input.writerAuthority.trim() || !input.previousProjectRevision.trim()
    || !input.operatorId.trim() || !Number.isSafeInteger(input.turn) || input.turn < 1
    || hashes.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error('PROJECTSERVICE_PROPOSAL_REVISION_MATERIAL_INVALID');
  }
  return `project-proposal-v2r:${hashCanonicalJsonV1({
    schemaVersion: 1,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_ISSUER_V2R_1',
    writerAuthority: input.writerAuthority,
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    canonicalBaseProjectRevision: revisionIdentity(input.canonicalBaseRevision),
    previousProjectRevision: input.previousProjectRevision,
    operatorId: input.operatorId,
    turn: input.turn,
    argumentSha256: input.argumentSha256,
    beforeStateSha256: input.beforeStateSha256,
    afterStateSha256: input.afterStateSha256,
  })}`;
}

function sameRevision(left: Readonly<ProjectRevisionV1>, right: Readonly<ProjectRevisionV1>): boolean {
  return left.schemaVersion === right.schemaVersion && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}
