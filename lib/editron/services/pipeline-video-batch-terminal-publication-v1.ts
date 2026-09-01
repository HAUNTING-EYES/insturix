import {
  ProjectMutationConflictError,
  projectService,
  type EditorState,
  type Project,
  type ProjectMutationReceiptV1,
} from './project-service';
import type { ProjectRevisionV1 } from './project-revision-v1';

const MAX_TERMINAL_PUBLICATIONS = 100;

export type PipelineVideoBatchTerminalStatusV1 = 'completed' | 'failed' | 'partial';

export interface PipelineVideoBatchTerminalPublicationV1 {
  schemaVersion: 1;
  batchId: string;
  terminalStatus: PipelineVideoBatchTerminalStatusV1;
  completed: number;
  failed: number;
  totalScenes: number;
  countIntegrity: 'EXACT' | 'OVERCOUNT';
  projectStatusDisposition: 'KEPT_CURRENT' | 'SET_NEEDS_ATTENTION';
  beforeRevision: ProjectRevisionV1;
  committedAt: string;
}

export interface PipelineVideoBatchTerminalPublicationPortV1 {
  loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: Project; revision: ProjectRevisionV1 }>;
  saveProjectWithReceipt(
    userId: string,
    projectId: string,
    state: EditorState,
    options: {
      expectedRevision: ProjectRevisionV1;
      projectUpdates: Record<string, unknown>;
    },
  ): Promise<ProjectMutationReceiptV1>;
}

export type PipelineVideoBatchTerminalBlockReasonV1 =
  | 'INVALID_TERMINAL_FACTS'
  | 'INVALID_PROJECT_HISTORY'
  | 'TERMINAL_FACT_MISMATCH'
  | 'STALE_PROJECT_REVISION';

export class PipelineVideoBatchTerminalBlockedErrorV1 extends Error {
  readonly code = 'PIPELINE_VIDEO_BATCH_TERMINAL_BLOCKED';

  constructor(
    readonly reason: PipelineVideoBatchTerminalBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = 'PipelineVideoBatchTerminalBlockedErrorV1';
  }
}

function nonEmptyString(value: unknown, maximumLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function isRevision(value: unknown): value is ProjectRevisionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1
    && typeof candidate.value === 'number'
    && Number.isSafeInteger(candidate.value)
    && candidate.value >= 0
    && nonEmptyString(candidate.compatibilityUpdatedAt, 100) !== null
    && !Number.isNaN(new Date(candidate.compatibilityUpdatedAt as string).getTime());
}

function readPublication(value: unknown): PipelineVideoBatchTerminalPublicationV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const batchId = nonEmptyString(candidate.batchId);
  const terminalStatus = candidate.terminalStatus;
  const countIntegrity = candidate.countIntegrity;
  const statusDisposition = candidate.projectStatusDisposition;
  const committedAt = nonEmptyString(candidate.committedAt, 100);
  if (
    candidate.schemaVersion !== 1
    || !batchId
    || (terminalStatus !== 'completed' && terminalStatus !== 'failed' && terminalStatus !== 'partial')
    || typeof candidate.completed !== 'number'
    || !Number.isSafeInteger(candidate.completed)
    || candidate.completed < 0
    || typeof candidate.failed !== 'number'
    || !Number.isSafeInteger(candidate.failed)
    || candidate.failed < 0
    || typeof candidate.totalScenes !== 'number'
    || !Number.isSafeInteger(candidate.totalScenes)
    || candidate.totalScenes <= 0
    || (countIntegrity !== 'EXACT' && countIntegrity !== 'OVERCOUNT')
    || (statusDisposition !== 'KEPT_CURRENT' && statusDisposition !== 'SET_NEEDS_ATTENTION')
    || !isRevision(candidate.beforeRevision)
    || !committedAt
    || Number.isNaN(new Date(committedAt).getTime())
  ) return null;
  let validatedFacts: ReturnType<typeof validateTerminalFacts>;
  try {
    validatedFacts = validateTerminalFacts({
      batchId,
      terminalStatus,
      completed: candidate.completed,
      failed: candidate.failed,
      totalScenes: candidate.totalScenes,
    });
  } catch {
    return null;
  }
  const needsAttention = terminalStatus !== 'completed'
    || validatedFacts.countIntegrity === 'OVERCOUNT';
  if (
    countIntegrity !== validatedFacts.countIntegrity
    || statusDisposition !== (needsAttention ? 'SET_NEEDS_ATTENTION' : 'KEPT_CURRENT')
  ) return null;
  return {
    schemaVersion: 1,
    batchId,
    terminalStatus,
    completed: candidate.completed,
    failed: candidate.failed,
    totalScenes: candidate.totalScenes,
    countIntegrity,
    projectStatusDisposition: statusDisposition,
    beforeRevision: candidate.beforeRevision,
    committedAt,
  };
}

function historyFor(project: Project): PipelineVideoBatchTerminalPublicationV1[] {
  const raw = (project as Project & {
    pipelineVideoBatchTerminalPublicationsV1?: unknown;
  }).pipelineVideoBatchTerminalPublicationsV1;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TERMINAL_PUBLICATIONS) {
    throw new PipelineVideoBatchTerminalBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'Pipeline-video terminal publication history is malformed or unbounded.',
    );
  }
  const history = raw.map(readPublication);
  if (history.some((record) => record === null)) {
    throw new PipelineVideoBatchTerminalBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'Pipeline-video terminal publication history contains an invalid record.',
    );
  }
  return history as PipelineVideoBatchTerminalPublicationV1[];
}

function validateTerminalFacts(input: {
  batchId: string;
  terminalStatus: PipelineVideoBatchTerminalStatusV1;
  completed: number;
  failed: number;
  totalScenes: number;
}): {
  batchId: string;
  countIntegrity: PipelineVideoBatchTerminalPublicationV1['countIntegrity'];
} {
  const batchId = nonEmptyString(input.batchId);
  const countsValid = Number.isSafeInteger(input.completed)
    && input.completed >= 0
    && Number.isSafeInteger(input.failed)
    && input.failed >= 0
    && Number.isSafeInteger(input.totalScenes)
    && input.totalScenes > 0;
  const done = input.completed + input.failed;
  const statusMatches = input.terminalStatus === 'completed'
    ? input.failed === 0 && done === input.totalScenes
    : input.terminalStatus === 'failed'
      ? input.completed === 0 && input.failed === input.totalScenes
      : done > input.totalScenes
        || (input.completed > 0 && input.failed > 0 && done === input.totalScenes);
  if (!batchId || !countsValid || done < input.totalScenes || !statusMatches) {
    throw new PipelineVideoBatchTerminalBlockedErrorV1(
      'INVALID_TERMINAL_FACTS',
      'Pipeline-video terminal status does not match its exact batch counters.',
    );
  }
  return {
    batchId,
    countIntegrity: done === input.totalScenes ? 'EXACT' : 'OVERCOUNT',
  };
}

function sameFacts(
  publication: PipelineVideoBatchTerminalPublicationV1,
  input: {
    terminalStatus: PipelineVideoBatchTerminalStatusV1;
    completed: number;
    failed: number;
    totalScenes: number;
  },
): boolean {
  return publication.terminalStatus === input.terminalStatus
    && publication.completed === input.completed
    && publication.failed === input.failed
    && publication.totalScenes === input.totalScenes;
}

export async function recordPipelineVideoBatchTerminalV1(input: {
  userId: string;
  projectId: string;
  batchId: string;
  terminalStatus: PipelineVideoBatchTerminalStatusV1;
  completed: number;
  failed: number;
  totalScenes: number;
  now?: Date;
  projectStore?: PipelineVideoBatchTerminalPublicationPortV1;
}): Promise<{
  receipt: ProjectMutationReceiptV1 | null;
  publication: PipelineVideoBatchTerminalPublicationV1;
  replayed: boolean;
  observedProjectRevision: ProjectRevisionV1;
}> {
  const userId = nonEmptyString(input.userId);
  const projectId = nonEmptyString(input.projectId);
  const facts = validateTerminalFacts(input);
  if (!userId || !projectId) {
    throw new PipelineVideoBatchTerminalBlockedErrorV1(
      'INVALID_TERMINAL_FACTS',
      'Pipeline-video terminal publication requires exact owner and project identities.',
    );
  }

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, projectId);
  const history = historyFor(snapshot.project);
  const existing = history.find((record) => record.batchId === facts.batchId);
  if (existing) {
    if (!sameFacts(existing, input)) {
      throw new PipelineVideoBatchTerminalBlockedErrorV1(
        'TERMINAL_FACT_MISMATCH',
        'The project already records different terminal facts for this batch.',
      );
    }
    return {
      receipt: null,
      publication: existing,
      replayed: true,
      observedProjectRevision: snapshot.revision,
    };
  }

  const needsAttention = input.terminalStatus !== 'completed' || facts.countIntegrity === 'OVERCOUNT';
  const publication: PipelineVideoBatchTerminalPublicationV1 = {
    schemaVersion: 1,
    batchId: facts.batchId,
    terminalStatus: input.terminalStatus,
    completed: input.completed,
    failed: input.failed,
    totalScenes: input.totalScenes,
    countIntegrity: facts.countIntegrity,
    projectStatusDisposition: needsAttention ? 'SET_NEEDS_ATTENTION' : 'KEPT_CURRENT',
    beforeRevision: snapshot.revision,
    committedAt: (input.now ?? new Date()).toISOString(),
  };
  const projectUpdates: Record<string, unknown> = {
    pipelineVideoBatchTerminalPublicationsV1: [
      ...history,
      publication,
    ].slice(-MAX_TERMINAL_PUBLICATIONS),
  };
  if (needsAttention) projectUpdates.projectStatus = 'needs-attention';

  try {
    const receipt = await projectStore.saveProjectWithReceipt(
      userId,
      projectId,
      snapshot.project,
      { expectedRevision: snapshot.revision, projectUpdates },
    );
    return {
      receipt,
      publication,
      replayed: false,
      observedProjectRevision: receipt.revision,
    };
  } catch (error) {
    if (error instanceof ProjectMutationConflictError) {
      throw new PipelineVideoBatchTerminalBlockedErrorV1(
        'STALE_PROJECT_REVISION',
        'The project changed while terminal batch facts were being recorded.',
      );
    }
    throw error;
  }
}
