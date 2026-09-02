import {
  projectService,
  type Project,
  type ProjectService,
} from './project-service';

const RECOVERABLE_ANALYSIS_STATES = new Set([
  'queued',
  'analyzing',
  'transcribing',
  'analyzing_visual_cuts',
  'cleaning',
  'computing_params',
  'analyzing_deep',
  'analysis_complete',
  'directing_queued',
]);

export type StaleAutoEditRecoveryDispositionV1 =
  | 'RECOVERED'
  | 'ALREADY_RECOVERED'
  | 'NOT_STALE'
  | 'NOT_ACTIVE'
  | 'NOT_ELIGIBLE'
  | 'UNVERIFIABLE_OWNER'
  | 'OWNERSHIP_LOST'
  | 'PROJECT_NOT_FOUND';

export interface StaleAutoEditRecoveryResultV1 {
  disposition: StaleAutoEditRecoveryDispositionV1;
  priorStatus: string | null;
  ownerKind: 'ANALYSIS_RUN' | 'DIRECTOR_RUN' | 'DIRECTOR_DELIVERY' | null;
}

type StaleAutoEditRecoveryProjectStoreV1 = Pick<
  ProjectService,
  | 'loadProjectForMutation'
  | 'failProjectAnalysisRunV1'
  | 'failDirectorRunV1'
  | 'recordDirectorDeliveryFailureV1'
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function projectField(project: Project, field: string): unknown {
  return (project as unknown as Record<string, unknown>)[field];
}

function staleErrorMessage(status: string, staleBefore: Date, now: Date): string {
  const windowMinutes = Math.max(
    1,
    Math.round((now.getTime() - staleBefore.getTime()) / 60_000),
  );
  return `Stale '${status}' auto-edit exceeded its ${windowMinutes}-minute ownership window (recovered by cron).`;
}

export async function recoverStaleAutoEditProjectV1(input: {
  userId: string;
  projectId: string;
  staleBefore: Date;
  now?: Date;
  projectStore?: StaleAutoEditRecoveryProjectStoreV1;
}): Promise<StaleAutoEditRecoveryResultV1> {
  const projectStore = input.projectStore ?? projectService;
  let snapshot: Awaited<ReturnType<StaleAutoEditRecoveryProjectStoreV1['loadProjectForMutation']>>;
  try {
    snapshot = await projectStore.loadProjectForMutation(input.userId, input.projectId);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'PROJECT_NOT_FOUND_OR_FORBIDDEN') {
      return { disposition: 'PROJECT_NOT_FOUND', priorStatus: null, ownerKind: null };
    }
    throw error;
  }

  const project = snapshot.project;
  const status = nonEmptyString(projectField(project, 'autoEditStatus'));
  if (projectField(project, 'editMode') === 'assist') {
    return { disposition: 'NOT_ELIGIBLE', priorStatus: status, ownerKind: null };
  }
  if (status !== 'directing' && (!status || !RECOVERABLE_ANALYSIS_STATES.has(status))) {
    return { disposition: 'NOT_ACTIVE', priorStatus: status, ownerKind: null };
  }
  const updatedAt = project.updatedAt instanceof Date
    ? project.updatedAt
    : new Date(project.updatedAt);
  if (Number.isNaN(updatedAt.getTime()) || updatedAt >= input.staleBefore) {
    return { disposition: 'NOT_STALE', priorStatus: status, ownerKind: null };
  }

  const now = input.now ?? new Date();
  const errorMessage = staleErrorMessage(status, input.staleBefore, now);
  if (status === 'directing') {
    const directorRunToken = nonEmptyString(project.directorRunToken);
    if (!directorRunToken) {
      return { disposition: 'UNVERIFIABLE_OWNER', priorStatus: status, ownerKind: null };
    }
    const result = await projectStore.failDirectorRunV1(input.userId, input.projectId, {
      directorRunToken,
      errorMessage,
    });
    return {
      disposition: result.disposition === 'RECORDED'
        ? 'RECOVERED'
        : result.disposition === 'PROJECT_NOT_FOUND'
          ? 'PROJECT_NOT_FOUND'
          : 'OWNERSHIP_LOST',
      priorStatus: status,
      ownerKind: 'DIRECTOR_RUN',
    };
  }

  const pipelineDispatch = asRecord(project.pipelineDirectorDispatch);
  const directorMessageId = nonEmptyString(projectField(project, 'directorMessageId'));
  const pipelineDispatchToken = nonEmptyString(pipelineDispatch?.dispatchToken);
  if (
    (status === 'analysis_complete' || status === 'directing_queued')
    && directorMessageId
    && pipelineDispatchToken
  ) {
    const result = await projectStore.recordDirectorDeliveryFailureV1(
      input.userId,
      input.projectId,
      {
        sourceMessageId: directorMessageId,
        pipelineDirectorDispatchToken: pipelineDispatchToken,
        errorMessage,
        audit: {
          schemaVersion: 1,
          source: 'cron:stale-auto-edit-recovery',
          staleBefore: input.staleBefore.toISOString(),
          observedRevision: snapshot.revision,
        },
      },
    );
    return {
      disposition: result.disposition === 'RECORDED'
        ? 'RECOVERED'
        : result.disposition === 'PROJECT_NOT_FOUND'
          ? 'PROJECT_NOT_FOUND'
          : result.disposition === 'PROJECT_ALREADY_TERMINAL'
            ? 'ALREADY_RECOVERED'
            : 'OWNERSHIP_LOST',
      priorStatus: status,
      ownerKind: 'DIRECTOR_DELIVERY',
    };
  }

  const analysisRun = asRecord(project.autoEditAnalysisRunV1);
  const runId = nonEmptyString(analysisRun?.runId);
  const sourceAssetId = nonEmptyString(analysisRun?.sourceAssetId);
  const runState = nonEmptyString(analysisRun?.state);
  if (
    analysisRun?.schemaVersion !== 1
    || analysisRun.lane !== 'auto'
    || !runId
    || !sourceAssetId
    || runState !== status
  ) {
    return { disposition: 'UNVERIFIABLE_OWNER', priorStatus: status, ownerKind: null };
  }

  const result = await projectStore.failProjectAnalysisRunV1(
    input.userId,
    input.projectId,
    {
      expectedRevision: snapshot.revision,
      runId,
      sourceAssetId,
      errorMessage,
    },
  );
  return {
    disposition: result.disposition === 'RECORDED'
      ? 'RECOVERED'
      : result.disposition === 'ALREADY_RECORDED'
        ? 'ALREADY_RECOVERED'
        : result.disposition === 'PROJECT_NOT_FOUND'
          ? 'PROJECT_NOT_FOUND'
          : 'OWNERSHIP_LOST',
    priorStatus: status,
    ownerKind: 'ANALYSIS_RUN',
  };
}
