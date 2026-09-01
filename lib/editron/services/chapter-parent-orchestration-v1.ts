import type { ClientSession, Collection, Filter } from 'mongodb';

import {
  RenderJobSchema,
  type RenderJob,
  type RenderJobChapterOrchestrationStateV1,
} from '../schemas/render-job';
import {
  PROJECT_RENDER_JOBS_COLLECTION_V1,
  ProjectRenderJobAuthorizationSchema,
  type ProjectRenderJobAuthorizationV1,
} from './render-job-service';
import {
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
  type ProjectArtifactProjectRevisionV1,
} from './project-artifact-invalidation-v1';
import { assertProjectRenderSnapshotBindingV1 } from './project-render-snapshot-binding-v1';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const CHAPTER_PARENT_ORCHESTRATION_COLLECTION_V1 =
  PROJECT_RENDER_JOBS_COLLECTION_V1;

const CHAPTER_PARENT_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;

type ParentCollection = Collection<RenderJob>;

export type ChapterParentOrchestrationNotCurrentReasonV1 =
  | 'AUTHORIZATION_INVALID'
  | 'PROJECT_REVISION_STALE'
  | 'INPUT_INVALID'
  | 'JOB_NOT_CURRENT'
  | 'ORCHESTRATION_NOT_READY'
  | 'CAS_CONFLICT';

export type ChapterParentOrchestrationMutationResultV1 =
  | {
      ok: true;
      status: 'CURRENT';
      state: RenderJobChapterOrchestrationStateV1;
      replayed?: true;
    }
  | {
      ok: false;
      status: 'NON_CURRENT';
      reason: ChapterParentOrchestrationNotCurrentReasonV1;
    };

type CommonInput = {
  authorization: unknown;
  currentProjectRevision: unknown;
  selectedRegion: string;
  now?: Date;
  collection?: ParentCollection;
  session?: ClientSession;
};

type PreparedInput = {
  authorization: ProjectRenderJobAuthorizationV1;
  projectRevision: ProjectArtifactProjectRevisionV1;
  selectedRegion: string;
  now: Date;
  collection: ParentCollection;
  session?: ClientSession;
};

function notCurrent(
  reason: ChapterParentOrchestrationNotCurrentReasonV1,
): ChapterParentOrchestrationMutationResultV1 {
  return { ok: false, status: 'NON_CURRENT', reason };
}

function current(
  state: RenderJobChapterOrchestrationStateV1,
  replayed = false,
): ChapterParentOrchestrationMutationResultV1 {
  return { ok: true, status: 'CURRENT', state, ...(replayed ? { replayed: true } : {}) };
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function boundedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Chapter parent orchestration became unknown.').slice(0, 10_000);
}

async function prepareInput(
  input: CommonInput,
): Promise<PreparedInput | ChapterParentOrchestrationMutationResultV1> {
  const authorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!authorization.success) return notCurrent('AUTHORIZATION_INVALID');
  const projectRevision = ProjectArtifactProjectRevisionSchema.safeParse(input.currentProjectRevision);
  if (!projectRevision.success) return notCurrent('PROJECT_REVISION_STALE');
  if (!sameProjectArtifactRevisionV1(authorization.data.projectRevision, projectRevision.data)) {
    return notCurrent('PROJECT_REVISION_STALE');
  }
  if (
    !CHAPTER_PARENT_ID.test(authorization.data.jobId)
    || !SHA256.test(authorization.data.bindingHash)
    || typeof input.selectedRegion !== 'string'
    || !AWS_REGION.test(input.selectedRegion.trim())
  ) {
    return notCurrent('INPUT_INVALID');
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) return notCurrent('INPUT_INVALID');
  const collection = input.collection ?? awaitCollection();
  return {
    authorization: authorization.data,
    projectRevision: projectRevision.data,
    selectedRegion: input.selectedRegion.trim(),
    now,
    collection: await collection,
    session: input.session,
  };
}

async function awaitCollection(): Promise<ParentCollection> {
  const database = await getDatabase();
  return database.collection<RenderJob>(CHAPTER_PARENT_ORCHESTRATION_COLLECTION_V1);
}

function parentScopeFilter(input: PreparedInput): Filter<RenderJob> {
  const { authorization, projectRevision, selectedRegion } = input;
  return {
    $and: [
      {
        _id: authorization.jobId,
        userId: authorization.ownerId,
        requestedByUserId: authorization.requestedByUserId,
        projectId: authorization.projectId,
        region: selectedRegion,
        status: { $in: ['pending', 'queued', 'rendering', 'finalizing'] },
        artifactState: 'ACTIVE',
        artifactInvalidation: { $exists: false },
        artifactBinding: { $exists: false },
        providerRenderId: { $exists: false },
        bucketName: { $exists: false },
        'projectRenderSnapshotBinding.scope': 'PROJECT_SNAPSHOT',
        'projectRenderSnapshotBinding.artifactId': authorization.jobId,
        'projectRenderSnapshotBinding.ownerId': authorization.ownerId,
        'projectRenderSnapshotBinding.projectId': authorization.projectId,
        'projectRenderSnapshotBinding.projectRevision.schemaVersion': 1,
        'projectRenderSnapshotBinding.projectRevision.value': projectRevision.value,
        'projectRenderSnapshotBinding.projectRevision.compatibilityUpdatedAt':
          projectRevision.compatibilityUpdatedAt,
        'projectRenderSnapshotBinding.bindingHash': authorization.bindingHash,
        'deliveryManifest.version': 'editron-render-delivery-manifest-v1',
        'deliveryManifest.primaryArtifact.renderId': authorization.jobId,
        'chapterOrchestration.version': 1,
        'chapterOrchestration.scope': 'CHAPTER_ORCHESTRATION',
        'chapterOrchestration.aggregateJobId': authorization.jobId,
        'chapterOrchestration.bindingHash': authorization.bindingHash,
        'chapterOrchestration.selectedRegion': selectedRegion,
        'dispatch.providerRenderId': { $exists: false },
        'dispatch.providerBucketName': { $exists: false },
        'dispatch.providerRegion': { $exists: false },
        'dispatch.providerBoundAt': { $exists: false },
      },
      {
        $or: [
          { dispatch: { $exists: false } },
          { 'dispatch.phase': 'NOT_ATTEMPTED' },
        ],
      },
    ],
  } as Filter<RenderJob>;
}

function stateFilter(
  input: PreparedInput,
  state: RenderJobChapterOrchestrationStateV1,
): Filter<RenderJob> {
  const parent = parentScopeFilter(input);
  const parentConditions = (parent.$and ?? [parent]) as Filter<RenderJob>[];
  const priorTimestampField = state === 'NOT_STARTED'
    ? 'chapterOrchestration.reservedAt'
    : state === 'STARTING'
      ? 'chapterOrchestration.startingAt'
      : undefined;
  return {
    $and: [
      ...parentConditions,
      { 'chapterOrchestration.state': state },
      ...(priorTimestampField
        ? [{ [priorTimestampField]: { $lte: input.now } } as Filter<RenderJob>]
        : []),
    ],
  } as Filter<RenderJob>;
}

function providerFreeParent(job: RenderJob): boolean {
  const dispatch = job.dispatch;
  return job.providerRenderId === undefined
    && job.bucketName === undefined
    && (dispatch === undefined || (
      dispatch.phase === 'NOT_ATTEMPTED'
      && dispatch.providerRenderId === undefined
      && dispatch.providerBucketName === undefined
      && dispatch.providerRegion === undefined
      && dispatch.providerBoundAt === undefined
    ));
}

function currentParentRow(
  row: unknown,
  input: PreparedInput,
): RenderJob | null {
  const parsed = RenderJobSchema.safeParse(row);
  if (!parsed.success || !providerFreeParent(parsed.data)) return null;
  const job = parsed.data;
  const binding = job.projectRenderSnapshotBinding;
  const orchestration = job.chapterOrchestration;
  if (!binding || !orchestration) return null;
  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    return null;
  }
  if (
    job._id !== input.authorization.jobId
    || job.userId !== input.authorization.ownerId
    || job.requestedByUserId !== input.authorization.requestedByUserId
    || job.projectId !== input.authorization.projectId
    || job.region !== input.selectedRegion
    || !sameProjectArtifactRevisionV1(binding.projectRevision, input.projectRevision)
    || binding.bindingHash !== input.authorization.bindingHash
    || orchestration.aggregateJobId !== input.authorization.jobId
    || orchestration.bindingHash !== input.authorization.bindingHash
    || orchestration.selectedRegion !== input.selectedRegion
    || job.artifactState !== 'ACTIVE'
    || job.artifactInvalidation !== undefined
    || job.artifactBinding !== undefined
    || !['pending', 'queued', 'rendering', 'finalizing'].includes(job.status)
    || job.deliveryManifest?.primaryArtifact.renderId !== input.authorization.jobId
  ) {
    return null;
  }
  return job;
}

async function afterConflict(
  input: PreparedInput,
  sourceState: RenderJobChapterOrchestrationStateV1,
  targetState: RenderJobChapterOrchestrationStateV1,
  replay: (orchestration: NonNullable<RenderJob['chapterOrchestration']>) => boolean,
): Promise<ChapterParentOrchestrationMutationResultV1> {
  const row = await input.collection.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  const job = currentParentRow(row, input);
  if (!job || !job.chapterOrchestration) return notCurrent('JOB_NOT_CURRENT');
  if (job.chapterOrchestration.state === targetState && replay(job.chapterOrchestration)) {
    return current(targetState, true);
  }
  if (job.chapterOrchestration.state !== sourceState) {
    return notCurrent('ORCHESTRATION_NOT_READY');
  }
  return notCurrent('CAS_CONFLICT');
}

function writeProved(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as { acknowledged?: unknown; modifiedCount?: unknown };
  return value.acknowledged !== false && value.modifiedCount === 1;
}

async function transition(
  input: PreparedInput,
  sourceState: RenderJobChapterOrchestrationStateV1,
  targetState: RenderJobChapterOrchestrationStateV1,
  update: Record<string, unknown>,
  replay: (orchestration: NonNullable<RenderJob['chapterOrchestration']>) => boolean,
): Promise<ChapterParentOrchestrationMutationResultV1> {
  const result = await input.collection.updateOne(
    stateFilter(input, sourceState),
    { $set: update },
    { session: input.session },
  );
  if ((result as { acknowledged?: unknown }).acknowledged === false) {
    throw new Error('CHAPTER_PARENT_ORCHESTRATION_WRITE_UNPROVED');
  }
  const modifiedCount = (result as { modifiedCount?: unknown }).modifiedCount;
  if (typeof modifiedCount !== 'number' || !Number.isInteger(modifiedCount) || modifiedCount < 0 || modifiedCount > 1) {
    throw new Error('CHAPTER_PARENT_ORCHESTRATION_WRITE_CARDINALITY_UNPROVED');
  }
  if (writeProved(result)) return current(targetState);
  return afterConflict(input, sourceState, targetState, replay);
}

export async function startChapterParentOrchestrationV1(
  input: CommonInput,
): Promise<ChapterParentOrchestrationMutationResultV1> {
  const prepared = await prepareInput(input);
  if ('ok' in prepared) return prepared;
  return transition(
    prepared,
    'NOT_STARTED',
    'STARTING',
    {
      'chapterOrchestration.state': 'STARTING',
      'chapterOrchestration.startingAt': prepared.now,
    },
    (orchestration) => orchestration.startingAt !== undefined,
  );
}

export async function beginChapterParentOrchestrationRunningV1(input: CommonInput & {
  chapterCount: number;
  manifestHash: string;
}): Promise<ChapterParentOrchestrationMutationResultV1> {
  if (!Number.isSafeInteger(input.chapterCount) || input.chapterCount <= 0 || input.chapterCount > 100_000) {
    return notCurrent('INPUT_INVALID');
  }
  if (typeof input.manifestHash !== 'string' || !SHA256.test(input.manifestHash.trim())) {
    return notCurrent('INPUT_INVALID');
  }
  const prepared = await prepareInput(input);
  if ('ok' in prepared) return prepared;
  const manifestHash = input.manifestHash.trim();
  return transition(
    prepared,
    'STARTING',
    'RUNNING',
    {
      'chapterOrchestration.state': 'RUNNING',
      'chapterOrchestration.runningAt': prepared.now,
      'chapterOrchestration.chapterCount': input.chapterCount,
      'chapterOrchestration.progress': 0,
      'chapterOrchestration.manifestHash': manifestHash,
    },
    (orchestration) => orchestration.chapterCount === input.chapterCount
      && orchestration.manifestHash === manifestHash,
  );
}

export async function quarantineChapterParentOrchestrationV1(input: CommonInput & {
  error: unknown;
}): Promise<ChapterParentOrchestrationMutationResultV1> {
  const prepared = await prepareInput(input);
  if ('ok' in prepared) return prepared;
  const message = boundedMessage(input.error);
  return transition(
    prepared,
    'STARTING',
    'UNKNOWN',
    {
      'chapterOrchestration.state': 'UNKNOWN',
      'chapterOrchestration.unknownAt': prepared.now,
      'chapterOrchestration.failure': {
        code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
        message,
      },
    },
    (orchestration) => orchestration.failure?.code === 'CHAPTER_ORCHESTRATION_UNKNOWN'
      && orchestration.failure.message === message,
  );
}
