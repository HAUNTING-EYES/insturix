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
const MAX_FINDINGS = 100;
const MAX_FINDING_LENGTH = 2_000;

export type AlyzitronSourceBackendV1 = 'gcs' | 'r2' | 'youtube' | 'external';
export type AlyzitronSourceAccessBasisV1 =
  | 'REGISTERED_USER_UPLOAD'
  | 'VALIDATED_YOUTUBE_URL'
  | 'ALLOWLISTED_EXTERNAL_HTTPS_URL';

export interface AlyzitronProjectAnalysisBindingV1 {
  schemaVersion: 1;
  taskId: string;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  sourceIdentitySha256: string;
  sourceBackend: AlyzitronSourceBackendV1;
  sourceAccessBasis: AlyzitronSourceAccessBasisV1;
  mediaKind: 'image' | 'video';
  wholeSourceRangeMs: {
    startInclusive: 0;
    endExclusive: number;
  };
  admittedAt: string;
}

export interface AlyzitronProjectAnalysisResultV1 {
  overallScore: unknown;
  category: unknown;
  strengths: unknown;
  weaknesses: unknown;
  contentIntent: unknown;
}

export interface AlyzitronProjectPublicationPortV1 {
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

export type AlyzitronProjectPublicationBlockReasonV1 =
  | 'INVALID_BINDING'
  | 'INVALID_ANALYSIS_RESULT'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'STALE_PROJECT_REVISION';

export class AlyzitronProjectPublicationBlockedErrorV1 extends Error {
  readonly code = 'ALYZITRON_PROJECT_PUBLICATION_BLOCKED';

  constructor(
    readonly reason: AlyzitronProjectPublicationBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = 'AlyzitronProjectPublicationBlockedErrorV1';
  }
}

function nonEmptyString(value: unknown, maximumLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function sourceIdentitySha256(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl, 'utf8').digest('hex');
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function accessBasisForBackend(
  backend: AlyzitronSourceBackendV1,
): AlyzitronSourceAccessBasisV1 {
  if (backend === 'gcs' || backend === 'r2') return 'REGISTERED_USER_UPLOAD';
  if (backend === 'youtube') return 'VALIDATED_YOUTUBE_URL';
  return 'ALLOWLISTED_EXTERNAL_HTTPS_URL';
}

function assertSourceBackend(value: unknown): asserts value is AlyzitronSourceBackendV1 {
  if (value !== 'gcs' && value !== 'r2' && value !== 'youtube' && value !== 'external') {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'Alyzitron project binding requires one supported source backend.',
    );
  }
}

export function readAlyzitronProjectAnalysisBindingV1(
  value: unknown,
): AlyzitronProjectAnalysisBindingV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const taskId = nonEmptyString(candidate.taskId);
  const projectId = nonEmptyString(candidate.projectId);
  const admittedAt = nonEmptyString(candidate.admittedAt, 100);
  const range = candidate.wholeSourceRangeMs;
  if (!range || typeof range !== 'object' || Array.isArray(range)) return null;
  const endExclusive = (range as Record<string, unknown>).endExclusive;
  if (
    candidate.schemaVersion !== 1
    || !taskId
    || !projectId
    || !isRevision(candidate.projectRevision)
    || typeof candidate.sourceIdentitySha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.sourceIdentitySha256)
    || (candidate.sourceBackend !== 'gcs'
      && candidate.sourceBackend !== 'r2'
      && candidate.sourceBackend !== 'youtube'
      && candidate.sourceBackend !== 'external')
    || (candidate.sourceAccessBasis !== 'REGISTERED_USER_UPLOAD'
      && candidate.sourceAccessBasis !== 'VALIDATED_YOUTUBE_URL'
      && candidate.sourceAccessBasis !== 'ALLOWLISTED_EXTERNAL_HTTPS_URL')
    || (candidate.mediaKind !== 'image' && candidate.mediaKind !== 'video')
    || (range as Record<string, unknown>).startInclusive !== 0
    || typeof endExclusive !== 'number'
    || !Number.isSafeInteger(endExclusive)
    || endExclusive < 0
    || !admittedAt
    || Number.isNaN(new Date(admittedAt).getTime())
  ) return null;

  return {
    schemaVersion: 1,
    taskId,
    projectId,
    projectRevision: candidate.projectRevision,
    sourceIdentitySha256: candidate.sourceIdentitySha256,
    sourceBackend: candidate.sourceBackend,
    sourceAccessBasis: candidate.sourceAccessBasis,
    mediaKind: candidate.mediaKind,
    wholeSourceRangeMs: { startInclusive: 0, endExclusive },
    admittedAt,
  };
}

export async function bindAlyzitronProjectAnalysisV1(input: {
  userId: string;
  projectId: string;
  taskId: string;
  sourceUrl: string;
  sourceBackend: AlyzitronSourceBackendV1;
  mediaKind: 'image' | 'video';
  durationMs: number;
  now?: Date;
  projectStore?: AlyzitronProjectPublicationPortV1;
}): Promise<AlyzitronProjectAnalysisBindingV1> {
  const userId = nonEmptyString(input.userId);
  const projectId = nonEmptyString(input.projectId);
  const taskId = nonEmptyString(input.taskId);
  const sourceUrl = nonEmptyString(input.sourceUrl, 10_000);
  assertSourceBackend(input.sourceBackend);
  if (
    !userId
    || !projectId
    || !taskId
    || !sourceUrl
    || !Number.isSafeInteger(input.durationMs)
    || input.durationMs < 0
  ) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'Alyzitron project binding requires exact owner, project, task, source and duration inputs.',
    );
  }

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(userId, projectId);
  return {
    schemaVersion: 1,
    taskId,
    projectId,
    projectRevision: snapshot.revision,
    sourceIdentitySha256: sourceIdentitySha256(sourceUrl),
    sourceBackend: input.sourceBackend,
    sourceAccessBasis: accessBasisForBackend(input.sourceBackend),
    mediaKind: input.mediaKind,
    wholeSourceRangeMs: {
      startInclusive: 0,
      endExclusive: input.durationMs,
    },
    admittedAt: (input.now ?? new Date()).toISOString(),
  };
}

function boundedFindingList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_FINDINGS) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_ANALYSIS_RESULT',
      `Alyzitron ${field} must be a bounded string array.`,
    );
  }
  return value.map((item) => {
    const finding = nonEmptyString(item, MAX_FINDING_LENGTH);
    if (!finding) {
      throw new AlyzitronProjectPublicationBlockedErrorV1(
        'INVALID_ANALYSIS_RESULT',
        `Alyzitron ${field} contains an invalid finding.`,
      );
    }
    return finding;
  });
}

function normalizeAnalysisResult(input: AlyzitronProjectAnalysisResultV1) {
  const overallScore = input.overallScore === null || input.overallScore === undefined
    ? null
    : input.overallScore;
  if (
    overallScore !== null
    && (typeof overallScore !== 'number'
      || !Number.isFinite(overallScore)
      || overallScore < 0
      || overallScore > 100)
  ) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_ANALYSIS_RESULT',
      'Alyzitron overall score must be null or a finite value from 0 to 100.',
    );
  }
  const category = input.category === null || input.category === undefined
    ? null
    : nonEmptyString(input.category, 200);
  const contentIntent = nonEmptyString(input.contentIntent, 200);
  if ((input.category !== null && input.category !== undefined && !category) || !contentIntent) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_ANALYSIS_RESULT',
      'Alyzitron category and content intent must be bounded strings.',
    );
  }
  return {
    overallScore,
    category,
    strengths: boundedFindingList(input.strengths, 'strengths'),
    weaknesses: boundedFindingList(input.weaknesses, 'weaknesses'),
    contentIntent,
  };
}

export async function commitAlyzitronProjectAnalysisV1(input: {
  userId: string;
  taskId: string;
  taskSourceUrl: string;
  binding: unknown;
  result: AlyzitronProjectAnalysisResultV1;
  now?: Date;
  projectStore?: AlyzitronProjectPublicationPortV1;
}): Promise<{
  receipt: ProjectMutationReceiptV1 | null;
  projectRecord: Record<string, unknown>;
  replayed: boolean;
  observedProjectRevision: ProjectRevisionV1;
}> {
  const binding = readAlyzitronProjectAnalysisBindingV1(input.binding);
  const taskId = nonEmptyString(input.taskId);
  const taskSourceUrl = nonEmptyString(input.taskSourceUrl, 10_000);
  if (!binding || !taskId || taskId !== binding.taskId || !taskSourceUrl) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'INVALID_BINDING',
      'Alyzitron result publication requires the exact admitted project binding.',
    );
  }
  if (sourceIdentitySha256(taskSourceUrl) !== binding.sourceIdentitySha256) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'SOURCE_IDENTITY_MISMATCH',
      'The analyzed task source does not match the project-bound source.',
    );
  }

  const projectStore = input.projectStore ?? projectService;
  const snapshot = await projectStore.loadProjectForMutation(input.userId, binding.projectId);
  const existingRecord = asRecord(
    (snapshot.project as Project & { alyzitronAnalysis?: unknown }).alyzitronAnalysis,
  );
  const existingRevision = existingRecord?.analyzedProjectRevision;
  if (
    existingRecord?.taskId === taskId
    && existingRecord.sourceIdentitySha256 === binding.sourceIdentitySha256
    && isRevision(existingRevision)
    && sameRevision(existingRevision, binding.projectRevision)
  ) {
    return {
      receipt: null,
      projectRecord: existingRecord,
      replayed: true,
      observedProjectRevision: snapshot.revision,
    };
  }
  if (!sameRevision(snapshot.revision, binding.projectRevision)) {
    throw new AlyzitronProjectPublicationBlockedErrorV1(
      'STALE_PROJECT_REVISION',
      'The project changed after Alyzitron analysis was admitted.',
    );
  }

  const result = normalizeAnalysisResult(input.result);
  const completedAt = (input.now ?? new Date()).toISOString();
  const projectRecord = {
    schemaVersion: 1,
    taskId,
    sourceIdentitySha256: binding.sourceIdentitySha256,
    sourceBackend: binding.sourceBackend,
    sourceAccessBasis: binding.sourceAccessBasis,
    mediaKind: binding.mediaKind,
    wholeSourceRangeMs: binding.wholeSourceRangeMs,
    analyzedProjectRevision: binding.projectRevision,
    predecessor: { taskId, state: 'completed' },
    invalidatedBy: 'ANY_PROJECT_REVISION_CHANGE',
    ...result,
    completedAt,
  };

  try {
    const receipt = await projectStore.saveProjectWithReceipt(
      input.userId,
      binding.projectId,
      snapshot.project,
      {
        expectedRevision: binding.projectRevision,
        projectUpdates: {
          alyzitronAnalysis: projectRecord,
          qualityScore: result.overallScore,
        },
      },
    );
    return {
      receipt,
      projectRecord,
      replayed: false,
      observedProjectRevision: receipt.revision,
    };
  } catch (error) {
    if (error instanceof ProjectMutationConflictError) {
      throw new AlyzitronProjectPublicationBlockedErrorV1(
        'STALE_PROJECT_REVISION',
        'The project changed while Alyzitron analysis was being published.',
      );
    }
    throw error;
  }
}
