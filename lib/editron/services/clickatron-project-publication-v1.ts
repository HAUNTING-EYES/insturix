import { createHash } from 'node:crypto';
import {
  ProjectMutationConflictError,
  projectService,
  type EditorState,
  type Project,
  type ProjectMutationReceiptV1,
} from './project-service';
import type { ProjectRevisionV1 } from './project-revision-v1';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PUBLICATION_RECORDS = 100;

type PipelineStage = NonNullable<Project['pipelineStage']>;

export interface ClickatronThumbnailProjectBindingV1 {
  schemaVersion: 1;
  thumbnailId: string;
  sessionId: string;
  variationId: string;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  thumbnailSourceSha256: string;
  admittedAt: string;
}

export interface ClickatronThumbnailProjectPublicationV1 {
  schemaVersion: 1;
  thumbnailId: string;
  sessionId: string;
  variationId: string;
  thumbnailSourceSha256: string;
  admittedProjectRevision: ProjectRevisionV1;
  stageDisposition: 'ADVANCED_TO_THUMBNAILS' | 'KEPT_CURRENT_STAGE';
  effectivePipelineStage: PipelineStage;
  committedAt: string;
}

export interface ClickatronProjectPublicationPortV1 {
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

export type ClickatronProjectPublicationBlockReasonV1 =
  | 'INVALID_BINDING'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'INVALID_PROJECT_HISTORY'
  | 'STALE_PROJECT_REVISION';

export class ClickatronProjectPublicationBlockedErrorV1 extends Error {
  readonly code = 'CLICKATRON_PROJECT_PUBLICATION_BLOCKED';

  constructor(
    readonly reason: ClickatronProjectPublicationBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = 'ClickatronProjectPublicationBlockedErrorV1';
  }
}

function nonEmptyString(value: unknown, maximumLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function sourceSha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
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

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

export function readClickatronThumbnailProjectBindingV1(
  value: unknown,
): ClickatronThumbnailProjectBindingV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const thumbnailId = nonEmptyString(candidate.thumbnailId);
  const sessionId = nonEmptyString(candidate.sessionId);
  const variationId = nonEmptyString(candidate.variationId);
  const projectId = nonEmptyString(candidate.projectId);
  const admittedAt = nonEmptyString(candidate.admittedAt, 100);
  if (
    candidate.schemaVersion !== 1
    || !thumbnailId
    || !sessionId
    || !variationId
    || !projectId
    || !isRevision(candidate.projectRevision)
    || typeof candidate.thumbnailSourceSha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.thumbnailSourceSha256)
    || !admittedAt
    || Number.isNaN(new Date(admittedAt).getTime())
  ) return null;
  return {
    schemaVersion: 1,
    thumbnailId,
    sessionId,
    variationId,
    projectId,
    projectRevision: candidate.projectRevision,
    thumbnailSourceSha256: candidate.thumbnailSourceSha256,
    admittedAt,
  };
}

export async function resolveClickatronThumbnailProjectBindingV1(input: {
  userId: string;
  projectId: string;
  thumbnailId: string;
  sessionId: string;
  variationId: string;
  thumbnailSource: string;
  existingBinding?: unknown;
  now?: Date;
  projectStore?: ClickatronProjectPublicationPortV1;
}): Promise<ClickatronThumbnailProjectBindingV1> {
  const userId = nonEmptyString(input.userId);
  const projectId = nonEmptyString(input.projectId);
  const thumbnailId = nonEmptyString(input.thumbnailId);
  const sessionId = nonEmptyString(input.sessionId);
  const variationId = nonEmptyString(input.variationId);
  const thumbnailSource = nonEmptyString(input.thumbnailSource, 10_000);
  if (!userId || !projectId || !thumbnailId || !sessionId || !variationId || !thumbnailSource) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'Clickatron project publication requires exact owner, project, thumbnail and source inputs.',
    );
  }

  if (input.existingBinding !== undefined) {
    const existing = readClickatronThumbnailProjectBindingV1(input.existingBinding);
    if (!existing) {
      throw new ClickatronProjectPublicationBlockedErrorV1(
        'INVALID_BINDING',
        'The stored Clickatron project binding is malformed.',
      );
    }
    if (
      existing.projectId !== projectId
      || existing.thumbnailId !== thumbnailId
      || existing.sessionId !== sessionId
      || existing.variationId !== variationId
    ) {
      throw new ClickatronProjectPublicationBlockedErrorV1(
        'INVALID_BINDING',
        'The stored Clickatron project binding belongs to a different commit.',
      );
    }
    if (existing.thumbnailSourceSha256 !== sourceSha256(thumbnailSource)) {
      throw new ClickatronProjectPublicationBlockedErrorV1(
        'SOURCE_IDENTITY_MISMATCH',
        'The selected thumbnail source changed after project admission.',
      );
    }
    return existing;
  }

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, projectId);
  return {
    schemaVersion: 1,
    thumbnailId,
    sessionId,
    variationId,
    projectId,
    projectRevision: snapshot.revision,
    thumbnailSourceSha256: sourceSha256(thumbnailSource),
    admittedAt: (input.now ?? new Date()).toISOString(),
  };
}

function readPublicationRecord(value: unknown): ClickatronThumbnailProjectPublicationV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const thumbnailId = nonEmptyString(candidate.thumbnailId);
  const sessionId = nonEmptyString(candidate.sessionId);
  const variationId = nonEmptyString(candidate.variationId);
  const committedAt = nonEmptyString(candidate.committedAt, 100);
  const stageDisposition = candidate.stageDisposition;
  const effectivePipelineStage = candidate.effectivePipelineStage;
  if (
    candidate.schemaVersion !== 1
    || !thumbnailId
    || !sessionId
    || !variationId
    || typeof candidate.thumbnailSourceSha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.thumbnailSourceSha256)
    || !isRevision(candidate.admittedProjectRevision)
    || (stageDisposition !== 'ADVANCED_TO_THUMBNAILS'
      && stageDisposition !== 'KEPT_CURRENT_STAGE')
    || (effectivePipelineStage !== 'script'
      && effectivePipelineStage !== 'edit'
      && effectivePipelineStage !== 'analyze'
      && effectivePipelineStage !== 'thumbnails'
      && effectivePipelineStage !== 'publish'
      && effectivePipelineStage !== 'complete')
    || !committedAt
    || Number.isNaN(new Date(committedAt).getTime())
  ) return null;
  return {
    schemaVersion: 1,
    thumbnailId,
    sessionId,
    variationId,
    thumbnailSourceSha256: candidate.thumbnailSourceSha256,
    admittedProjectRevision: candidate.admittedProjectRevision,
    stageDisposition,
    effectivePipelineStage,
    committedAt,
  };
}

function readPublicationHistory(project: Project): ClickatronThumbnailProjectPublicationV1[] {
  const raw = (project as Project & {
    clickatronThumbnailPublicationsV1?: unknown;
  }).clickatronThumbnailPublicationsV1;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PUBLICATION_RECORDS) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'The Clickatron project publication history is malformed or unbounded.',
    );
  }
  const records = raw.map(readPublicationRecord);
  if (records.some((record) => record === null)) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'The Clickatron project publication history contains an invalid record.',
    );
  }
  return records as ClickatronThumbnailProjectPublicationV1[];
}

function stageForPublication(current: Project['pipelineStage']): {
  disposition: ClickatronThumbnailProjectPublicationV1['stageDisposition'];
  effective: PipelineStage;
} {
  if (current === 'publish' || current === 'complete') {
    return { disposition: 'KEPT_CURRENT_STAGE', effective: current };
  }
  return { disposition: 'ADVANCED_TO_THUMBNAILS', effective: 'thumbnails' };
}

export async function commitClickatronThumbnailProjectV1(input: {
  userId: string;
  thumbnailSource: string;
  binding: unknown;
  now?: Date;
  projectStore?: ClickatronProjectPublicationPortV1;
}): Promise<{
  receipt: ProjectMutationReceiptV1 | null;
  publication: ClickatronThumbnailProjectPublicationV1;
  replayed: boolean;
  observedProjectRevision: ProjectRevisionV1;
}> {
  const binding = readClickatronThumbnailProjectBindingV1(input.binding);
  const userId = nonEmptyString(input.userId);
  const thumbnailSource = nonEmptyString(input.thumbnailSource, 10_000);
  if (!binding || !userId || !thumbnailSource) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'Clickatron project publication requires the exact admitted binding.',
    );
  }
  if (sourceSha256(thumbnailSource) !== binding.thumbnailSourceSha256) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'SOURCE_IDENTITY_MISMATCH',
      'The selected thumbnail source no longer matches its project binding.',
    );
  }

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, binding.projectId);
  const history = readPublicationHistory(snapshot.project);
  const existing = history.find((record) => record.thumbnailId === binding.thumbnailId);
  if (existing) {
    if (
      existing.sessionId !== binding.sessionId
      || existing.variationId !== binding.variationId
      || existing.thumbnailSourceSha256 !== binding.thumbnailSourceSha256
    ) {
      throw new ClickatronProjectPublicationBlockedErrorV1(
        'SOURCE_IDENTITY_MISMATCH',
        'The project already contains this thumbnail identity with different source evidence.',
      );
    }
    return {
      receipt: null,
      publication: existing,
      replayed: true,
      observedProjectRevision: snapshot.revision,
    };
  }
  if (!sameRevision(snapshot.revision, binding.projectRevision)) {
    throw new ClickatronProjectPublicationBlockedErrorV1(
      'STALE_PROJECT_REVISION',
      'The project changed after the Clickatron thumbnail was admitted.',
    );
  }

  const stage = stageForPublication(snapshot.project.pipelineStage);
  const publication: ClickatronThumbnailProjectPublicationV1 = {
    schemaVersion: 1,
    thumbnailId: binding.thumbnailId,
    sessionId: binding.sessionId,
    variationId: binding.variationId,
    thumbnailSourceSha256: binding.thumbnailSourceSha256,
    admittedProjectRevision: binding.projectRevision,
    stageDisposition: stage.disposition,
    effectivePipelineStage: stage.effective,
    committedAt: (input.now ?? new Date()).toISOString(),
  };
  const projectUpdates: Record<string, unknown> = {
    clickatronThumbnailPublicationsV1: [...history, publication].slice(-MAX_PUBLICATION_RECORDS),
  };
  if (stage.disposition === 'ADVANCED_TO_THUMBNAILS') {
    projectUpdates.pipelineStage = 'thumbnails';
  }

  try {
    const receipt = await projectStore.saveProjectWithReceipt(
      userId,
      binding.projectId,
      snapshot.project,
      {
        expectedRevision: binding.projectRevision,
        projectUpdates,
      },
    );
    return {
      receipt,
      publication,
      replayed: false,
      observedProjectRevision: receipt.revision,
    };
  } catch (error) {
    if (error instanceof ProjectMutationConflictError) {
      throw new ClickatronProjectPublicationBlockedErrorV1(
        'STALE_PROJECT_REVISION',
        'The project changed while the Clickatron thumbnail was being published.',
      );
    }
    throw error;
  }
}
