import {
  ProjectMutationConflictError,
  projectService,
  type EditorState,
  type Project,
  type ProjectMutationReceiptV1,
} from './project-service';
import type { ProjectRevisionV1 } from './project-revision-v1';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PUBLICATIONS = 100;

export interface UploaderXProjectVideoBindingV1 {
  schemaVersion: 1;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  videoUuid: string;
  objectKeySha256: string;
  contentSha256: string;
  sizeBytes: number;
  contentType: string;
  admittedAt: string;
}

export interface UploaderXProjectVideoPublicationV1 {
  schemaVersion: 1;
  videoUuid: string;
  objectKeySha256: string;
  contentSha256: string;
  sizeBytes: number;
  contentType: string;
  admittedProjectRevision: ProjectRevisionV1;
  stageDisposition: 'ADVANCED_TO_PUBLISH' | 'KEPT_COMPLETE';
  effectivePipelineStage: 'publish' | 'complete';
  committedAt: string;
}

export interface UploaderXProjectPublicationPortV1 {
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

export type UploaderXProjectPublicationBlockReasonV1 =
  | 'INVALID_BINDING'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'INVALID_PROJECT_HISTORY'
  | 'STALE_PROJECT_REVISION';

export class UploaderXProjectPublicationBlockedErrorV1 extends Error {
  readonly code = 'UPLOADERX_PROJECT_PUBLICATION_BLOCKED';

  constructor(
    readonly reason: UploaderXProjectPublicationBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = 'UploaderXProjectPublicationBlockedErrorV1';
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

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

export function readUploaderXProjectVideoBindingV1(
  value: unknown,
): UploaderXProjectVideoBindingV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const projectId = nonEmptyString(candidate.projectId);
  const videoUuid = nonEmptyString(candidate.videoUuid);
  const contentType = nonEmptyString(candidate.contentType, 300);
  const admittedAt = nonEmptyString(candidate.admittedAt, 100);
  if (
    candidate.schemaVersion !== 1
    || !projectId
    || !videoUuid
    || !isRevision(candidate.projectRevision)
    || typeof candidate.objectKeySha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.objectKeySha256)
    || typeof candidate.contentSha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.contentSha256)
    || typeof candidate.sizeBytes !== 'number'
    || !Number.isSafeInteger(candidate.sizeBytes)
    || candidate.sizeBytes < 0
    || !contentType
    || !admittedAt
    || Number.isNaN(new Date(admittedAt).getTime())
  ) return null;
  return {
    schemaVersion: 1,
    projectId,
    projectRevision: candidate.projectRevision,
    videoUuid,
    objectKeySha256: candidate.objectKeySha256,
    contentSha256: candidate.contentSha256,
    sizeBytes: candidate.sizeBytes,
    contentType,
    admittedAt,
  };
}

export async function bindUploaderXProjectVideoV1(input: {
  userId: string;
  projectId: string;
  videoUuid: string;
  objectKeySha256: string;
  contentSha256: string;
  sizeBytes: number;
  contentType: string;
  now?: Date;
  projectStore?: UploaderXProjectPublicationPortV1;
}): Promise<UploaderXProjectVideoBindingV1> {
  const userId = nonEmptyString(input.userId);
  const projectId = nonEmptyString(input.projectId);
  const videoUuid = nonEmptyString(input.videoUuid);
  const contentType = nonEmptyString(input.contentType, 300);
  if (
    !userId
    || !projectId
    || !videoUuid
    || !SHA256_PATTERN.test(input.objectKeySha256)
    || !SHA256_PATTERN.test(input.contentSha256)
    || !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes < 0
    || !contentType
  ) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'UploaderX project binding requires exact owner, video and content evidence.',
    );
  }
  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, projectId);
  return {
    schemaVersion: 1,
    projectId,
    projectRevision: snapshot.revision,
    videoUuid,
    objectKeySha256: input.objectKeySha256,
    contentSha256: input.contentSha256,
    sizeBytes: input.sizeBytes,
    contentType,
    admittedAt: (input.now ?? new Date()).toISOString(),
  };
}

function readPublication(value: unknown): UploaderXProjectVideoPublicationV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const videoUuid = nonEmptyString(candidate.videoUuid);
  const contentType = nonEmptyString(candidate.contentType, 300);
  const committedAt = nonEmptyString(candidate.committedAt, 100);
  const disposition = candidate.stageDisposition;
  const stage = candidate.effectivePipelineStage;
  if (
    candidate.schemaVersion !== 1
    || !videoUuid
    || typeof candidate.objectKeySha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.objectKeySha256)
    || typeof candidate.contentSha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.contentSha256)
    || typeof candidate.sizeBytes !== 'number'
    || !Number.isSafeInteger(candidate.sizeBytes)
    || candidate.sizeBytes < 0
    || !contentType
    || !isRevision(candidate.admittedProjectRevision)
    || (disposition !== 'ADVANCED_TO_PUBLISH' && disposition !== 'KEPT_COMPLETE')
    || (stage !== 'publish' && stage !== 'complete')
    || !committedAt
    || Number.isNaN(new Date(committedAt).getTime())
  ) return null;
  return {
    schemaVersion: 1,
    videoUuid,
    objectKeySha256: candidate.objectKeySha256,
    contentSha256: candidate.contentSha256,
    sizeBytes: candidate.sizeBytes,
    contentType,
    admittedProjectRevision: candidate.admittedProjectRevision,
    stageDisposition: disposition,
    effectivePipelineStage: stage,
    committedAt,
  };
}

function historyFor(project: Project): UploaderXProjectVideoPublicationV1[] {
  const raw = (project as Project & {
    uploaderXVideoPublicationsV1?: unknown;
  }).uploaderXVideoPublicationsV1;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PUBLICATIONS) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'The UploaderX project publication history is malformed or unbounded.',
    );
  }
  const history = raw.map(readPublication);
  if (history.some((record) => record === null)) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'INVALID_PROJECT_HISTORY',
      'The UploaderX project publication history contains an invalid record.',
    );
  }
  return history as UploaderXProjectVideoPublicationV1[];
}

function assertContentMatches(
  binding: UploaderXProjectVideoBindingV1,
  input: Pick<UploaderXProjectVideoBindingV1, 'objectKeySha256' | 'contentSha256' | 'sizeBytes' | 'contentType'>,
): void {
  if (
    binding.objectKeySha256 !== input.objectKeySha256
    || binding.contentSha256 !== input.contentSha256
    || binding.sizeBytes !== input.sizeBytes
    || binding.contentType !== input.contentType
  ) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'SOURCE_IDENTITY_MISMATCH',
      'The uploaded video no longer matches its project binding.',
    );
  }
}

export async function commitUploaderXProjectVideoV1(input: {
  userId: string;
  binding: unknown;
  objectKeySha256: string;
  contentSha256: string;
  sizeBytes: number;
  contentType: string;
  now?: Date;
  projectStore?: UploaderXProjectPublicationPortV1;
}): Promise<{
  receipt: ProjectMutationReceiptV1 | null;
  publication: UploaderXProjectVideoPublicationV1;
  replayed: boolean;
  observedProjectRevision: ProjectRevisionV1;
}> {
  const binding = readUploaderXProjectVideoBindingV1(input.binding);
  const userId = nonEmptyString(input.userId);
  const contentType = nonEmptyString(input.contentType, 300);
  if (!binding || !userId || !contentType) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'UploaderX publication requires the exact admitted project binding.',
    );
  }
  assertContentMatches(binding, { ...input, contentType });

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, binding.projectId);
  const history = historyFor(snapshot.project);
  const existing = history.find((record) => record.videoUuid === binding.videoUuid);
  if (existing) {
    assertContentMatches(binding, existing);
    return {
      receipt: null,
      publication: existing,
      replayed: true,
      observedProjectRevision: snapshot.revision,
    };
  }
  if (!sameRevision(snapshot.revision, binding.projectRevision)) {
    throw new UploaderXProjectPublicationBlockedErrorV1(
      'STALE_PROJECT_REVISION',
      'The project changed after the UploaderX video was admitted.',
    );
  }

  const keepComplete = snapshot.project.pipelineStage === 'complete';
  const publication: UploaderXProjectVideoPublicationV1 = {
    schemaVersion: 1,
    videoUuid: binding.videoUuid,
    objectKeySha256: binding.objectKeySha256,
    contentSha256: binding.contentSha256,
    sizeBytes: binding.sizeBytes,
    contentType: binding.contentType,
    admittedProjectRevision: binding.projectRevision,
    stageDisposition: keepComplete ? 'KEPT_COMPLETE' : 'ADVANCED_TO_PUBLISH',
    effectivePipelineStage: keepComplete ? 'complete' : 'publish',
    committedAt: (input.now ?? new Date()).toISOString(),
  };
  const projectUpdates: Record<string, unknown> = {
    uploaderXVideoPublicationsV1: [...history, publication].slice(-MAX_PUBLICATIONS),
  };
  if (!keepComplete) projectUpdates.pipelineStage = 'publish';

  try {
    const receipt = await projectStore.saveProjectWithReceipt(
      userId,
      binding.projectId,
      snapshot.project,
      { expectedRevision: binding.projectRevision, projectUpdates },
    );
    return {
      receipt,
      publication,
      replayed: false,
      observedProjectRevision: receipt.revision,
    };
  } catch (error) {
    if (error instanceof ProjectMutationConflictError) {
      throw new UploaderXProjectPublicationBlockedErrorV1(
        'STALE_PROJECT_REVISION',
        'The project changed while the UploaderX video was being published.',
      );
    }
    throw error;
  }
}
