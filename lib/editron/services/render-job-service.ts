import { randomUUID } from 'node:crypto';

import { type ClientSession, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';
import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  RenderJob,
  RenderExpectedDurationMsSchema,
  RenderFinalizerResultSchema,
  RenderJobSchema,
  RenderJobRequesterUserIdSchema,
  createPendingRenderJob,
} from '../schemas/render-job';
import type { RenderFinalizerResult } from './render-finalizer-client';
import {
  completeRenderDeliveryManifest,
  RenderDeliveryManifestSchema,
  type RenderDeliveryManifest,
} from './render-delivery-manifest';
import {
  assertProjectArtifactBindingV1,
  assertProjectArtifactInvalidationReceiptV1,
  ProjectArtifactProjectRevisionSchema,
  projectArtifactBindingMatchesCurrentV1,
  projectArtifactBindingMatchesInvalidationV1,
  sameProjectArtifactRevisionV1,
  type ProjectArtifactBindingV1,
  type ProjectArtifactInvalidationDerivativeClassV1,
  type ProjectArtifactInvalidationFenceV1,
  type ProjectArtifactInvalidationReceiptV1,
  type ProjectArtifactProjectRevisionV1,
} from './project-artifact-invalidation-v1';
import {
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from './project-render-snapshot-binding-v1';
import {
  createProjectRenderSourceCleanupOutboxV1,
  enqueueProjectRenderSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from './project-render-source-cleanup-v1';

export const PROJECT_RENDER_JOBS_COLLECTION_V1 = 'editron_render_jobs' as const;
const DEFAULT_FINALIZATION_LEASE_MS = 20 * 60 * 1000;
const MAX_FINALIZATION_LEASE_MS = 60 * 60 * 1000;
export const MAX_RENDER_FINALIZATION_ATTEMPTS = 3;
const DEFAULT_COMPLETION_EFFECTS_LEASE_MS = 5 * 60 * 1000;
const PROJECT_RENDER_JOB_ID = /^[A-Za-z0-9_.:-]{1,500}$/;
const PROJECT_RENDER_JOB_OWNER_OR_PROJECT_ID_MAX_LENGTH = 200;
const PROJECT_RENDER_JOB_BINDING_HASH = /^[a-f0-9]{64}$/;

export const ProjectRenderJobAuthorizationSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().regex(PROJECT_RENDER_JOB_ID),
  ownerId: z.string().min(1).max(PROJECT_RENDER_JOB_OWNER_OR_PROJECT_ID_MAX_LENGTH),
  requestedByUserId: RenderJobRequesterUserIdSchema,
  projectId: z.string().min(1).max(PROJECT_RENDER_JOB_OWNER_OR_PROJECT_ID_MAX_LENGTH),
  projectRevision: ProjectArtifactProjectRevisionSchema,
  bindingHash: z.string().regex(PROJECT_RENDER_JOB_BINDING_HASH),
}).strict();
export type ProjectRenderJobAuthorizationV1 = z.infer<
  typeof ProjectRenderJobAuthorizationSchema
>;

export const PROJECT_ARTIFACT_NOT_CURRENT = 'PROJECT_ARTIFACT_NOT_CURRENT' as const;

export type ProjectRenderJobNotCurrentReasonV1 =
  | 'AUTHORIZATION_INVALID'
  | 'PROJECT_REVISION_STALE'
  | 'JOB_NOT_CURRENT'
  | 'JOB_STATE_NOT_ACTIVE'
  | 'INPUT_INVALID';

export type ProjectRenderJobNotCurrentResultV1 = {
  ok: false;
  status: 'NON_CURRENT';
  code: typeof PROJECT_ARTIFACT_NOT_CURRENT;
  reason: ProjectRenderJobNotCurrentReasonV1;
};

export type ProjectRenderJobCurrentResultV1 = {
  ok: true;
  status: 'CURRENT';
  job: RenderJob;
};

export type ProjectRenderJobAuthorizationLookupResultV1 =
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: false;
      status: 'NOT_PROJECT_RENDER_JOB';
      job: RenderJob;
    }
  | {
      ok: true;
      status: 'BOUND';
      job: RenderJob;
      authorization: ProjectRenderJobAuthorizationV1;
    };

export type ProjectRenderJobMutationResultV1 =
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: true;
      status: 'CURRENT';
    };

export type ProjectRenderJobAuthorizationInputV1 = {
  jobId: string;
  ownerId: string;
  requestedByUserId: string;
  projectId: string;
  projectRevision: ProjectArtifactProjectRevisionV1;
  binding: ProjectRenderSnapshotBindingV1;
};

export function createProjectRenderJobAuthorizationV1(
  input: ProjectRenderJobAuthorizationInputV1,
): ProjectRenderJobAuthorizationV1 {
  if (!isBoundRenderInputString(input.requestedByUserId, PROJECT_RENDER_JOB_OWNER_OR_PROJECT_ID_MAX_LENGTH)) {
    throw new Error('PROJECT_RENDER_JOB_REQUESTER_INVALID');
  }
  assertProjectRenderSnapshotBindingV1(input.binding);
  const projectRevision = ProjectArtifactProjectRevisionSchema.parse(input.projectRevision);
  if (
    input.binding.artifactId !== input.jobId
    || input.binding.ownerId !== input.ownerId
    || input.binding.projectId !== input.projectId
    || !sameProjectArtifactRevisionV1(input.binding.projectRevision, projectRevision)
  ) {
    throw new Error('PROJECT_RENDER_JOB_AUTHORIZATION_SCOPE_MISMATCH');
  }
  return ProjectRenderJobAuthorizationSchema.parse({
    schemaVersion: 1,
    jobId: input.jobId,
    ownerId: input.ownerId,
    requestedByUserId: input.requestedByUserId.trim(),
    projectId: input.projectId,
    projectRevision,
    bindingHash: input.binding.bindingHash,
  });
}

const LEGACY_RENDER_JOB_MUTATION_EXCLUSION: Filter<RenderJob> = {
  projectRenderSnapshotBinding: { $exists: false },
};

function withLegacyRenderJobMutationExclusion(
  filter: Filter<RenderJob>,
): Filter<RenderJob> {
  return {
    ...filter,
    ...LEGACY_RENDER_JOB_MUTATION_EXCLUSION,
  };
}

function nonCurrentProjectRenderJobResult(
  reason: ProjectRenderJobNotCurrentReasonV1,
): ProjectRenderJobNotCurrentResultV1 {
  return {
    ok: false,
    status: 'NON_CURRENT',
    code: PROJECT_ARTIFACT_NOT_CURRENT,
    reason,
  };
}

function currentProjectRenderJobMutationResult(): ProjectRenderJobMutationResultV1 {
  return { ok: true, status: 'CURRENT' };
}

function validateProjectRenderJobAuthorization(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
}):
  | { authorization: ProjectRenderJobAuthorizationV1 }
  | { result: ProjectRenderJobNotCurrentResultV1 } {
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) {
    return { result: nonCurrentProjectRenderJobResult('AUTHORIZATION_INVALID') };
  }
  const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(input.currentProjectRevision);
  if (!parsedRevision.success) {
    return { result: nonCurrentProjectRenderJobResult('PROJECT_REVISION_STALE') };
  }
  if (!sameProjectArtifactRevisionV1(parsedAuthorization.data.projectRevision, parsedRevision.data)) {
    return { result: nonCurrentProjectRenderJobResult('PROJECT_REVISION_STALE') };
  }
  return { authorization: parsedAuthorization.data };
}

function currentProjectRenderJobFilter(
  authorization: ProjectRenderJobAuthorizationV1,
): Filter<RenderJob> {
  return {
    _id: authorization.jobId,
    userId: authorization.ownerId,
    requestedByUserId: authorization.requestedByUserId,
    projectId: authorization.projectId,
    artifactState: 'ACTIVE',
    artifactInvalidation: { $exists: false },
    artifactBinding: { $exists: false },
    'projectRenderSnapshotBinding.scope': 'PROJECT_SNAPSHOT',
    'projectRenderSnapshotBinding.artifactId': authorization.jobId,
    'projectRenderSnapshotBinding.ownerId': authorization.ownerId,
    'projectRenderSnapshotBinding.projectId': authorization.projectId,
    'projectRenderSnapshotBinding.projectRevision.schemaVersion': 1,
    'projectRenderSnapshotBinding.projectRevision.value': authorization.projectRevision.value,
    'projectRenderSnapshotBinding.projectRevision.compatibilityUpdatedAt':
      authorization.projectRevision.compatibilityUpdatedAt,
    'projectRenderSnapshotBinding.bindingHash': authorization.bindingHash,
    'deliveryManifest.version': 'editron-render-delivery-manifest-v1',
    'deliveryManifest.primaryArtifact.renderId': authorization.jobId,
  };
}

function currentProjectRenderJobMutationFilter(
  authorization: ProjectRenderJobAuthorizationV1,
  conditions: Filter<RenderJob>,
): Filter<RenderJob> {
  return {
    $and: [currentProjectRenderJobFilter(authorization), conditions],
  };
}

function parseProjectRenderDeliveryManifest(
  value: unknown,
): RenderDeliveryManifest | null {
  const parsed = RenderDeliveryManifestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sameProjectRenderDeliveryManifestV1(
  left: RenderDeliveryManifest,
  right: RenderDeliveryManifest,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifiedProjectRenderDeliveryManifest(
  job: RenderJob,
): RenderDeliveryManifest | null {
  const manifest = parseProjectRenderDeliveryManifest(job.deliveryManifest);
  if (
    !manifest
    || manifest.primaryArtifact.renderId !== job._id
    || manifest.primaryArtifact.status !== 'ready'
    || manifest.primaryArtifact.url === null
    || manifest.primaryArtifact.url !== job.outputUrl
    || manifest.completedAt === null
  ) {
    return null;
  }
  return manifest;
}

function validProjectRenderDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function resolveProjectRenderLease(input: {
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
}, prefix: 'rfl' | 'rce'): {
  claimToken: string;
  leaseMs: number;
  now: Date;
} | null {
  if (input.claimToken !== undefined && !isBoundRenderInputString(input.claimToken)) {
    return null;
  }
  const leaseMs = input.leaseMs ?? (
    prefix === 'rfl' ? DEFAULT_FINALIZATION_LEASE_MS : DEFAULT_COMPLETION_EFFECTS_LEASE_MS
  );
  if (!Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_FINALIZATION_LEASE_MS) {
    return null;
  }
  const now = input.now ?? new Date();
  if (!validProjectRenderDate(now)) return null;
  return {
    claimToken: input.claimToken?.trim() ?? `${prefix}_${randomUUID().replaceAll('-', '')}`,
    leaseMs,
    now,
  };
}

async function getCollection(): Promise<Collection<RenderJob>> {
  const db = await getDatabase();
  return db.collection<RenderJob>(PROJECT_RENDER_JOBS_COLLECTION_V1);
}

function renderJobSelector(renderId: string): Filter<RenderJob> {
  return {
    $or: [
      { _id: renderId },
      { providerRenderId: renderId },
    ],
  };
}

/**
 * Persist Editron ownership before billing or provider dispatch.
 */
export async function reserveJob(
  jobId: string,
  userId: string,
  projectId: string,
  region: string,
  expectedDurationMs: number,
  deliveryManifest: RenderDeliveryManifest,
  artifactBinding?: Parameters<typeof createPendingRenderJob>[5],
): Promise<RenderJob> {
  const collection = await getCollection();
  const job: RenderJob = {
    ...createPendingRenderJob(
      jobId,
      userId,
      projectId,
      region,
      expectedDurationMs,
      artifactBinding,
    ),
    deliveryManifest,
  };
  const result = await collection.insertOne(job as any);
  if (!result.acknowledged) {
    throw new Error('Failed to reserve render job');
  }
  return job;
}

/**
 * Reserve a whole-project render only after its immutable snapshot binding has
 * been issued for the current ProjectService revision.  This is intentionally
 * a separate owner path from reserveJob, whose artifact scope is legacy or
 * single-overlay ProjectArtifactBindingV1.
 */
export async function reserveProjectRenderJobV1(input: {
  jobId: string;
  ownerId: string;
  requestedByUserId: string;
  projectId: string;
  currentProjectRevision: ProjectArtifactProjectRevisionV1;
  region: string;
  expectedDurationMs: number;
  deliveryManifest: RenderDeliveryManifest;
  binding: ProjectRenderSnapshotBindingV1;
  collection?: Collection<RenderJob>;
}): Promise<RenderJob> {
  const authorization = createProjectRenderJobAuthorizationV1({
    jobId: input.jobId,
    ownerId: input.ownerId,
    requestedByUserId: input.requestedByUserId,
    projectId: input.projectId,
    projectRevision: input.currentProjectRevision,
    binding: input.binding,
  });
  const deliveryManifest = structuredClone(
    RenderDeliveryManifestSchema.parse(input.deliveryManifest),
  );
  if (deliveryManifest.primaryArtifact.renderId !== authorization.jobId) {
    throw new Error('PROJECT_RENDER_DELIVERY_MANIFEST_SCOPE_MISMATCH');
  }
  const jobs = input.collection ?? await getCollection();
  const job: RenderJob = {
    ...createPendingRenderJob(
      authorization.jobId,
      authorization.ownerId,
      authorization.projectId,
      input.region,
      input.expectedDurationMs,
      undefined,
      input.binding,
      authorization.requestedByUserId,
    ),
    deliveryManifest,
  };
  const result = await jobs.insertOne(job as any);
  if (!result.acknowledged) {
    throw new Error('Failed to reserve project render job');
  }
  return job;
}

function validateCurrentProjectRenderJob(
  job: RenderJob | null,
  authorization: ProjectRenderJobAuthorizationV1,
): ProjectRenderJobNotCurrentReasonV1 | null {
  if (!job) return 'JOB_NOT_CURRENT';
  if (
    job.artifactState !== 'ACTIVE'
    || job.artifactInvalidation !== undefined
    || job.artifactBinding !== undefined
    || !job.projectRenderSnapshotBinding
  ) {
    return 'JOB_NOT_CURRENT';
  }
  const deliveryManifest = parseProjectRenderDeliveryManifest(job.deliveryManifest);
  if (!deliveryManifest || deliveryManifest.primaryArtifact.renderId !== authorization.jobId) {
    return 'JOB_NOT_CURRENT';
  }
  try {
    assertProjectRenderSnapshotBindingV1(job.projectRenderSnapshotBinding);
  } catch {
    return 'JOB_NOT_CURRENT';
  }
  const binding = job.projectRenderSnapshotBinding;
  if (
    job._id !== authorization.jobId
    || job.userId !== authorization.ownerId
    || job.requestedByUserId !== authorization.requestedByUserId
    || job.projectId !== authorization.projectId
    || binding.artifactId !== authorization.jobId
    || binding.ownerId !== authorization.ownerId
    || binding.projectId !== authorization.projectId
    || binding.bindingHash !== authorization.bindingHash
    || !sameProjectArtifactRevisionV1(binding.projectRevision, authorization.projectRevision)
  ) {
    return 'JOB_NOT_CURRENT';
  }
  return null;
}

/** Read one current whole-project render through its exact authorization tuple. */
export async function getCurrentProjectRenderJobV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  collection?: Collection<RenderJob>;
}): Promise<ProjectRenderJobCurrentResultV1 | ProjectRenderJobNotCurrentResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  const jobs = input.collection ?? await getCollection();
  const job = await jobs.findOne(currentProjectRenderJobFilter(validation.authorization));
  const invalidReason = validateCurrentProjectRenderJob(job, validation.authorization);
  if (invalidReason) return nonCurrentProjectRenderJobResult(invalidReason);
  return {
    ok: true,
    status: 'CURRENT',
    job: job!,
  };
}

/**
 * Reconstruct the server-only authorization tuple for one durable admission.
 * This proves stored binding identity, not current ProjectService revision;
 * every mutating caller must still supply that live revision to a strict owner.
 */
export async function getProjectRenderJobAuthorizationByAdmissionV1(input: {
  jobId: string;
  expectedBindingHash?: string;
  collection?: Collection<RenderJob>;
}): Promise<ProjectRenderJobAuthorizationLookupResultV1> {
  if (
    !PROJECT_RENDER_JOB_ID.test(input.jobId)
    || input.expectedBindingHash !== undefined
      && !PROJECT_RENDER_JOB_BINDING_HASH.test(input.expectedBindingHash)
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const stored = await jobs.findOne({ _id: input.jobId });
  if (!stored) return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  const parsedJob = RenderJobSchema.safeParse(stored);
  if (!parsedJob.success) return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  const job = parsedJob.data;
  if (job.projectRenderSnapshotBinding === undefined) {
    if (job.artifactBinding !== undefined) {
      return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
    }
    return { ok: false, status: 'NOT_PROJECT_RENDER_JOB', job };
  }
  if (
    input.expectedBindingHash !== undefined
    && job.projectRenderSnapshotBinding.bindingHash !== input.expectedBindingHash
  ) {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  let authorization: ProjectRenderJobAuthorizationV1;
  try {
    authorization = createProjectRenderJobAuthorizationV1({
      jobId: job._id,
      ownerId: job.userId,
      requestedByUserId: job.requestedByUserId ?? '',
      projectId: job.projectId,
      projectRevision: job.projectRenderSnapshotBinding.projectRevision,
      binding: job.projectRenderSnapshotBinding,
    });
  } catch {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  const invalidReason = validateCurrentProjectRenderJob(job, authorization);
  if (invalidReason) return nonCurrentProjectRenderJobResult(invalidReason);
  return { ok: true, status: 'BOUND', job, authorization };
}

function isBoundRenderInputString(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001F\u007F]/.test(value);
}

/** Atomically bind a provider render to a current whole-project admission. */
export async function markProjectRenderJobStartedV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  providerRenderId: string;
  bucketName: string;
  region: string;
  deliveryManifest: RenderDeliveryManifest;
  collection?: Collection<RenderJob>;
}): Promise<ProjectRenderJobCurrentResultV1 | ProjectRenderJobNotCurrentResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (
    !isBoundRenderInputString(input.providerRenderId)
    || !isBoundRenderInputString(input.bucketName)
    || !isBoundRenderInputString(input.region, 100)
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const deliveryManifest = parseProjectRenderDeliveryManifest(input.deliveryManifest);
  if (!deliveryManifest || deliveryManifest.primaryArtifact.renderId !== validation.authorization.jobId) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const providerRenderId = input.providerRenderId.trim();
  const started = await jobs.findOneAndUpdate(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      deliveryManifest,
      $or: [
        { status: 'pending' },
        { status: 'queued' },
        { status: 'rendering', providerRenderId },
      ],
    }),
    {
      $set: {
        status: 'rendering',
        providerRenderId,
        bucketName: input.bucketName.trim(),
        region: input.region.trim(),
        deliveryManifest,
      },
    },
    { returnDocument: 'after' },
  );
  if (!started) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(started, validation.authorization);
  if (invalidReason) return nonCurrentProjectRenderJobResult(invalidReason);
  const startedManifest = parseProjectRenderDeliveryManifest(started.deliveryManifest);
  if (!startedManifest || !sameProjectRenderDeliveryManifestV1(startedManifest, deliveryManifest)) {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  return { ok: true, status: 'CURRENT', job: started };
}

/** Atomically update progress only for the exact current bound render. */
export async function updateProjectRenderJobProgressV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  progress: number;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 1) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const updated = await jobs.updateOne(
    {
      $and: [
        currentProjectRenderJobFilter(validation.authorization),
        { status: { $in: ['pending', 'queued', 'rendering', 'finalizing'] } },
      ],
    },
    { $set: { progress: input.progress } },
    { session: input.session },
  );
  return updated.matchedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/** Atomically fail a current bound render before finalization begins. */
export async function failProjectRenderJobV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const failed = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: { $in: ['pending', 'queued', 'rendering'] },
    }),
    {
      $set: {
        status: 'error',
        error: boundedError(input.error),
        completedAt,
      },
    },
  );
  return failed.matchedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/**
 * Reconcile a signed provider failure against one exact current admission.
 * Missing provider identity may be repaired after ambiguous startup, but an
 * existing different identity can never be overwritten.
 */
export async function failProjectRenderJobFromProviderV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  providerRenderId: string;
  bucketName: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (
    !isBoundRenderInputString(input.providerRenderId)
    || !isBoundRenderInputString(input.bucketName)
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const providerRenderId = input.providerRenderId.trim();
  const bucketName = input.bucketName.trim();
  const jobs = input.collection ?? await getCollection();
  const failed = await jobs.updateOne(
    {
      $and: [
        currentProjectRenderJobMutationFilter(validation.authorization, {
          status: { $in: ['pending', 'queued', 'rendering'] },
        }),
        {
          $or: [
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
            },
            { providerRenderId, bucketName },
          ],
        },
      ],
    },
    {
      $set: {
        status: 'error',
        providerRenderId,
        bucketName,
        error: boundedError(input.error),
        completedAt,
      },
    },
    { session: input.session },
  );
  return failed.modifiedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/**
 * Close an exact reserved admission that became stale before provider
 * dispatch. This is deliberately separate from the current-job failure owner:
 * a changed project revision is the admission to this transition, and a
 * provider identity makes the transition ineligible.
 */
export async function abandonStaleProjectRenderJobAdmissionV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<
  ProjectRenderJobNotCurrentResultV1 | { ok: true; status: 'STALE' }
> {
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) {
    return nonCurrentProjectRenderJobResult('AUTHORIZATION_INVALID');
  }
  const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(
    input.currentProjectRevision,
  );
  if (
    !parsedRevision.success
    || sameProjectArtifactRevisionV1(
      parsedAuthorization.data.projectRevision,
      parsedRevision.data,
    )
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const abandoned = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(parsedAuthorization.data, {
      status: 'pending',
      providerRenderId: { $exists: false },
      bucketName: { $exists: false },
      finalization: { $exists: false },
    }),
    {
      $set: {
        status: 'error',
        error: boundedError(input.error),
        completedAt,
        artifactState: 'STALE',
        artifactCleanup: {
          state: 'NOT_REQUIRED',
          pendingArtifactIds: [],
        },
        artifactInvalidatedAt: completedAt,
      },
    },
  );
  return abandoned.matchedCount === 1
    ? { ok: true, status: 'STALE' }
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/**
 * Fence one exact running strict finalization after ProjectService proves its
 * bound revision is stale or the project no longer exists. This is recovery,
 * never a success path; the preserved provider artifact remains cleanup work.
 */
export async function fenceStaleProjectRenderJobFinalizationV1(input: {
  authorization: unknown;
  observedProjectRevision: unknown | null;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: true;
      status: 'STALE' | 'ALREADY_STALE' | 'CLAIM_REPLACED' | 'ALREADY_TERMINAL';
    }
> {
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) {
    return nonCurrentProjectRenderJobResult('AUTHORIZATION_INVALID');
  }
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  if (input.observedProjectRevision !== null) {
    const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(
      input.observedProjectRevision,
    );
    if (
      !parsedRevision.success
      || sameProjectArtifactRevisionV1(
        parsedAuthorization.data.projectRevision,
        parsedRevision.data,
      )
    ) {
      return nonCurrentProjectRenderJobResult('INPUT_INVALID');
    }
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const message = boundedError(input.error);
  const jobs = input.collection ?? await getCollection();
  const fenced = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(parsedAuthorization.data, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken.trim(),
      $or: [
        { artifactCleanup: { $exists: false } },
        {
          'artifactCleanup.state': 'NOT_REQUIRED',
          'artifactCleanup.pendingArtifactIds': { $size: 0 },
        },
      ],
    }),
    {
      $set: {
        status: 'error',
        progress: 0.99,
        error: message,
        completedAt,
        artifactState: 'STALE',
        artifactCleanup: {
          state: 'PENDING',
          pendingArtifactIds: [parsedAuthorization.data.jobId],
        },
        artifactInvalidatedAt: completedAt,
        'finalization.state': 'failed',
        'finalization.error': message,
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.claimedAt': '',
        'finalization.leaseExpiresAt': '',
      },
    },
    { session: input.session },
  );
  if (fenced.modifiedCount === 1) return { ok: true, status: 'STALE' };

  const latest = await jobs.findOne(
    { _id: parsedAuthorization.data.jobId },
    { session: input.session },
  );
  if (!latest?.projectRenderSnapshotBinding || latest.artifactBinding !== undefined) {
    return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  }
  try {
    assertProjectRenderSnapshotBindingV1(latest.projectRenderSnapshotBinding);
  } catch {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  const binding = latest.projectRenderSnapshotBinding;
  if (
    latest.userId !== parsedAuthorization.data.ownerId
    || latest.requestedByUserId !== parsedAuthorization.data.requestedByUserId
    || latest.projectId !== parsedAuthorization.data.projectId
    || binding.artifactId !== parsedAuthorization.data.jobId
    || binding.ownerId !== parsedAuthorization.data.ownerId
    || binding.projectId !== parsedAuthorization.data.projectId
    || binding.bindingHash !== parsedAuthorization.data.bindingHash
    || !sameProjectArtifactRevisionV1(
      binding.projectRevision,
      parsedAuthorization.data.projectRevision,
    )
  ) {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  if (
    latest.status === 'finalizing'
    && latest.finalization?.state === 'running'
    && latest.finalization.claimToken !== input.claimToken.trim()
  ) {
    return { ok: true, status: 'CLAIM_REPLACED' };
  }
  if (
    latest.artifactState === 'STALE'
    && latest.status === 'error'
    && latest.finalization?.state === 'failed'
    && latest.finalization.claimToken === undefined
  ) {
    return { ok: true, status: 'ALREADY_STALE' };
  }
  if (
    (latest.status === 'done' && latest.finalization?.state === 'done')
    || (
      latest.status === 'error'
      && latest.finalization?.state === 'failed'
      && latest.finalization.claimToken === undefined
    )
  ) {
    return { ok: true, status: 'ALREADY_TERMINAL' };
  }
  return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

function staleProjectRenderJobMatchesCleanupAuthorizationV1(
  job: RenderJob,
  authorization: ProjectRenderJobAuthorizationV1,
): boolean {
  const binding = job.projectRenderSnapshotBinding;
  if (
    job._id !== authorization.jobId
    || job.userId !== authorization.ownerId
    || job.requestedByUserId !== authorization.requestedByUserId
    || job.projectId !== authorization.projectId
    || job.artifactState !== 'STALE'
    || job.artifactBinding !== undefined
    || job.status !== 'error'
    || job.finalization?.state !== 'failed'
    || job.finalization.claimToken !== undefined
    || job.artifactCleanup?.state !== 'PENDING'
    || !job.artifactCleanup.pendingArtifactIds.includes(authorization.jobId)
    || !binding
  ) {
    return false;
  }
  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    return false;
  }
  return binding.artifactId === authorization.jobId
    && binding.ownerId === authorization.ownerId
    && binding.projectId === authorization.projectId
    && binding.bindingHash === authorization.bindingHash
    && sameProjectArtifactRevisionV1(
      binding.projectRevision,
      authorization.projectRevision,
    );
}

/**
 * Persist the exact provider cleanup descriptor and link it to one already
 * stale project render. Callers must keep this in the same transaction as the
 * stale transition so neither side can commit without the other.
 */
export async function materializeProjectRenderSourceCleanupHandoffV1(input: {
  authorization: unknown;
  collection: Collection<RenderJob>;
  cleanupCollection: Collection<ProjectRenderSourceCleanupOutboxV1>;
  session: ClientSession;
  expectedProviderOutput?: {
    providerRenderId: string;
    bucketName: string;
    sourceOutputUrl: string;
    sourceOutputSize: number;
  };
}): Promise<ProjectRenderSourceCleanupOutboxV1> {
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_AUTHORIZATION_INVALID');
  }
  const authorization = parsedAuthorization.data;
  const stored = await input.collection.findOne(
    { _id: authorization.jobId },
    { session: input.session },
  );
  const parsedJob = RenderJobSchema.safeParse(stored);
  if (
    !parsedJob.success
    || !staleProjectRenderJobMatchesCleanupAuthorizationV1(
      parsedJob.data,
      authorization,
    )
  ) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_STALE_JOB_NOT_FOUND');
  }
  const job = parsedJob.data;
  if (
    !job.providerRenderId
    || !job.bucketName
    || !job.projectRenderSnapshotBinding
    || !job.finalization
    || !validProjectRenderDate(job.artifactInvalidatedAt!)
  ) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_IDENTITY_INCOMPLETE');
  }
  const expected = input.expectedProviderOutput;
  if (
    expected
    && (
      job.providerRenderId !== expected.providerRenderId.trim()
      || job.bucketName !== expected.bucketName.trim()
      || job.finalization.sourceOutputUrl !== expected.sourceOutputUrl
      || job.finalization.sourceOutputSize !== expected.sourceOutputSize
    )
  ) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_PROVIDER_OUTPUT_MISMATCH');
  }
  const outbox = createProjectRenderSourceCleanupOutboxV1({
    binding: job.projectRenderSnapshotBinding,
    providerRenderId: job.providerRenderId,
    bucketName: job.bucketName,
    region: job.region,
    sourceOutputUrl: job.finalization.sourceOutputUrl,
    sourceOutputSize: job.finalization.sourceOutputSize,
    now: job.artifactInvalidatedAt,
  });
  if (
    job.projectRenderSourceCleanupOutboxId !== undefined
    && job.projectRenderSourceCleanupOutboxId !== outbox._id
  ) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_HANDOFF_CONFLICT');
  }
  await enqueueProjectRenderSourceCleanupOutboxV1({
    outbox,
    collection: input.cleanupCollection,
    session: input.session,
  });
  const linked = await input.collection.updateOne(
    {
      _id: authorization.jobId,
      artifactState: 'STALE',
      'projectRenderSnapshotBinding.bindingHash': authorization.bindingHash,
      $or: [
        { projectRenderSourceCleanupOutboxId: { $exists: false } },
        { projectRenderSourceCleanupOutboxId: outbox._id },
      ],
    },
    { $set: { projectRenderSourceCleanupOutboxId: outbox._id } },
    { session: input.session },
  );
  if (linked.matchedCount !== 1) {
    throw new Error('PROJECT_RENDER_SOURCE_CLEANUP_HANDOFF_WRITE_UNPROVED');
  }
  return outbox;
}

/**
 * Strict stale-finalization fence. Unlike the compatibility owner above, this
 * owner cannot succeed without atomically materializing provider cleanup work.
 */
export async function fenceStaleProjectRenderJobFinalizationWithCleanupV1(input: {
  authorization: unknown;
  observedProjectRevision: unknown | null;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection: Collection<RenderJob>;
  cleanupCollection: Collection<ProjectRenderSourceCleanupOutboxV1>;
  session: ClientSession;
}): Promise<
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: true;
      status: 'STALE' | 'ALREADY_STALE';
      cleanupOutboxId: string;
    }
  | {
      ok: true;
      status: 'CLAIM_REPLACED' | 'ALREADY_TERMINAL';
    }
> {
  const fenced = await fenceStaleProjectRenderJobFinalizationV1(input);
  if (!fenced.ok) return fenced;
  if (fenced.status === 'CLAIM_REPLACED' || fenced.status === 'ALREADY_TERMINAL') {
    return { ok: true, status: fenced.status };
  }
  const outbox = await materializeProjectRenderSourceCleanupHandoffV1({
    authorization: input.authorization,
    collection: input.collection,
    cleanupCollection: input.cleanupCollection,
    session: input.session,
  });
  return { ...fenced, cleanupOutboxId: outbox._id };
}

/**
 * Fence a provider output that arrives after its project snapshot became
 * stale, before a finalization lease could be claimed. Provider output and
 * cleanup work are persisted together; no artifact may become orphaned.
 */
export async function fenceStaleProjectRenderJobProviderOutputWithCleanupV1(input: {
  authorization: unknown;
  observedProjectRevision: unknown | null;
  providerRenderId: string;
  bucketName: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  error: unknown;
  now?: Date;
  collection: Collection<RenderJob>;
  cleanupCollection: Collection<ProjectRenderSourceCleanupOutboxV1>;
  session: ClientSession;
}): Promise<
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: true;
      status: 'STALE' | 'ALREADY_STALE';
      cleanupOutboxId: string;
    }
> {
  const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
  if (!parsedAuthorization.success) {
    return nonCurrentProjectRenderJobResult('AUTHORIZATION_INVALID');
  }
  if (input.observedProjectRevision !== null) {
    const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(
      input.observedProjectRevision,
    );
    if (
      !parsedRevision.success
      || sameProjectArtifactRevisionV1(
        parsedAuthorization.data.projectRevision,
        parsedRevision.data,
      )
    ) {
      return nonCurrentProjectRenderJobResult('INPUT_INVALID');
    }
  }
  if (
    !isBoundRenderInputString(input.providerRenderId)
    || !isBoundRenderInputString(input.bucketName)
    || typeof input.sourceOutputUrl !== 'string'
    || !Number.isInteger(input.sourceOutputSize)
    || input.sourceOutputSize < 0
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  try {
    assertHttpsUrl(input.sourceOutputUrl, 'Provider output URL');
  } catch {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const providerRenderId = input.providerRenderId.trim();
  const bucketName = input.bucketName.trim();
  const message = boundedError(input.error);
  const authorization = parsedAuthorization.data;
  const fenced = await input.collection.updateOne(
    {
      $and: [
        currentProjectRenderJobMutationFilter(authorization, {
          status: { $in: ['pending', 'rendering'] },
          expectedDurationMs: { $exists: true, $gt: 0 },
          finalization: { $exists: false },
        }),
        {
          $or: [
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
            },
            { providerRenderId, bucketName },
          ],
        },
      ],
    },
    {
      $set: {
        status: 'error',
        progress: 0.99,
        providerRenderId,
        bucketName,
        error: message,
        completedAt,
        artifactState: 'STALE',
        artifactCleanup: {
          state: 'PENDING',
          pendingArtifactIds: [authorization.jobId],
        },
        artifactInvalidatedAt: completedAt,
        finalization: {
          version: 'editron-render-finalization-v1',
          state: 'failed',
          sourceOutputUrl: input.sourceOutputUrl,
          sourceOutputSize: input.sourceOutputSize,
          attempts: 0,
          completedAt,
          error: message,
        },
      },
    },
    { session: input.session },
  );
  const expectedProviderOutput = {
    providerRenderId,
    bucketName,
    sourceOutputUrl: input.sourceOutputUrl,
    sourceOutputSize: input.sourceOutputSize,
  };
  if (fenced.modifiedCount !== 1) {
    const latest = await input.collection.findOne(
      { _id: authorization.jobId },
      { session: input.session },
    );
    const parsedLatest = RenderJobSchema.safeParse(latest);
    if (
      !parsedLatest.success
      || !staleProjectRenderJobMatchesCleanupAuthorizationV1(
        parsedLatest.data,
        authorization,
      )
    ) {
      return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
    }
  }
  const outbox = await materializeProjectRenderSourceCleanupHandoffV1({
    authorization,
    collection: input.collection,
    cleanupCollection: input.cleanupCollection,
    session: input.session,
    expectedProviderOutput,
  });
  return {
    ok: true,
    status: fenced.modifiedCount === 1 ? 'STALE' : 'ALREADY_STALE',
    cleanupOutboxId: outbox._id,
  };
}

export interface FencedRenderJobsForProjectArtifactInvalidationV1 {
  fences: ProjectArtifactInvalidationFenceV1[];
  fencedArtifactIds: string[];
  unresolvedArtifactIds: string[];
  resolvedDerivativeClasses: ProjectArtifactInvalidationDerivativeClassV1[];
}

/**
 * Fence only render jobs that carry the exact pre-change binding. Unbound
 * legacy rows are not eligible for this bound fence; existing generic
 * consumers remain unchanged until their bound route migration. ProjectService
 * owns the receipt decision; this service owns the render-job state transition.
 */
export async function fenceRenderJobsForProjectArtifactInvalidationV1(input: {
  receipt: ProjectArtifactInvalidationReceiptV1;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<FencedRenderJobsForProjectArtifactInvalidationV1> {
  assertProjectArtifactInvalidationReceiptV1(input.receipt);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Artifact invalidation time is invalid.');
  const jobs = input.collection ?? await getCollection();
  const candidates = await jobs.find({
    userId: input.receipt.ownerId,
    projectId: input.receipt.projectId,
    artifactState: 'ACTIVE',
    artifactBinding: { $exists: true },
  }).toArray();
  const fences: ProjectArtifactInvalidationFenceV1[] = [];
  const unresolvedArtifactIds: string[] = [];
  const unresolvedDerivativeClasses = new Set<ProjectArtifactInvalidationDerivativeClassV1>();
  let unresolvedUnknownDerivativeClass = false;

  for (const candidate of candidates) {
    if (!candidate.artifactBinding) {
      unresolvedArtifactIds.push(candidate._id);
      unresolvedUnknownDerivativeClass = true;
      continue;
    }
    try {
      assertProjectArtifactBindingV1(candidate.artifactBinding);
    } catch {
      unresolvedArtifactIds.push(candidate._id);
      unresolvedUnknownDerivativeClass = true;
      continue;
    }
    if (!projectArtifactBindingMatchesInvalidationV1(candidate.artifactBinding, input.receipt)) {
      continue;
    }
    const nextState = candidate.status === 'done' || candidate.status === 'error'
      ? 'HISTORY_ONLY' as const
      : 'STALE' as const;
    const fence: ProjectArtifactInvalidationFenceV1 = {
      schemaVersion: 1,
      binding: structuredClone(candidate.artifactBinding),
      priorState: 'ACTIVE',
      nextState,
      cleanup: 'PENDING',
      fencedAt: now.toISOString(),
    };
    const result = await jobs.updateOne(
      withLegacyRenderJobMutationExclusion({
        _id: candidate._id,
        userId: input.receipt.ownerId,
        projectId: input.receipt.projectId,
        artifactState: 'ACTIVE',
        'artifactBinding.bindingHash': candidate.artifactBinding.bindingHash,
      }),
      {
        $set: {
          artifactState: nextState,
          artifactCleanup: {
            state: 'PENDING',
            pendingArtifactIds: [candidate._id],
          },
          artifactInvalidation: {
            schemaVersion: 1,
            receiptId: input.receipt.receiptId,
            receiptHash: input.receipt.receiptHash,
            state: 'PENDING',
          },
          artifactInvalidatedAt: now,
        },
      },
    );
    if (result.matchedCount === 1) {
      fences.push(fence);
      continue;
    }
    const latest = await jobs.findOne({ _id: candidate._id });
    if (
      latest?.artifactBinding
      && latest.artifactBinding.bindingHash === candidate.artifactBinding.bindingHash
      && latest.artifactInvalidation?.receiptId === input.receipt.receiptId
      && latest.artifactInvalidation.receiptHash === input.receipt.receiptHash
      && latest.artifactState !== 'ACTIVE'
    ) {
      fences.push(fence);
    } else {
      unresolvedArtifactIds.push(candidate._id);
      unresolvedDerivativeClasses.add(candidate.artifactBinding.artifactKind);
    }
  }

  // The full owner/project scan is the proof boundary.  A class is resolved
  // only after every matching active row was fenced (or no such row exists).
  // Unknown/malformed rows conservatively block resolution for all classes.
  const resolvedDerivativeClasses = unresolvedUnknownDerivativeClass
    ? []
    : input.receipt.affectedDerivativeClasses.filter(
        (derivativeClass) => !unresolvedDerivativeClasses.has(derivativeClass),
      );

  return {
    fences,
    fencedArtifactIds: fences.map((fence) => fence.binding.artifactId),
    unresolvedArtifactIds,
    resolvedDerivativeClasses,
  };
}

/** Resolve one current render only when its complete binding is supplied. */
export async function getCurrentRenderJobV1(input: {
  binding: Parameters<typeof assertProjectArtifactBindingV1>[0];
  collection?: Collection<RenderJob>;
}): Promise<RenderJob | null> {
  assertProjectArtifactBindingV1(input.binding);
  const jobs = input.collection ?? await getCollection();
  const job = await jobs.findOne({
    _id: input.binding.artifactId,
    userId: input.binding.ownerId,
    projectId: input.binding.projectId,
    artifactState: 'ACTIVE',
    artifactInvalidation: { $exists: false },
  });
  if (!job?.artifactBinding || job.artifactBinding.artifactId !== input.binding.artifactId) {
    return null;
  }
  if (job.artifactBinding.bindingHash !== input.binding.bindingHash) return null;
  return projectArtifactBindingMatchesCurrentV1(job.artifactBinding, input.binding)
    ? job
    : null;
}

export function calculateExpectedRenderDurationMs(
  totalFrames: number,
  fps: number,
): number {
  if (!Number.isFinite(totalFrames) || !Number.isFinite(fps) || totalFrames <= 0 || fps <= 0) {
    throw new Error('A positive frame count and FPS are required for render finalization.');
  }
  return RenderExpectedDurationMsSchema.parse(Math.round((totalFrames / fps) * 1000));
}

export interface ClaimedRenderFinalization {
  jobId: string;
  providerRenderId?: string;
  claimToken: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  expectedDurationMs: number;
}

export interface ProjectRenderFinalizationClaimV1 extends ClaimedRenderFinalization {
  ok: true;
  status: 'CURRENT';
  authorization: ProjectRenderJobAuthorizationV1;
  binding: ProjectRenderSnapshotBindingV1;
}

/**
 * Atomically lease finalization to one completion observer. Webhook and polling
 * may race; only the winner receives a claim and may dispatch the durable worker.
 */
export async function claimJobFinalization(input: {
  renderId: string;
  providerRenderId?: string;
  bucketName?: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<ClaimedRenderFinalization | null> {
  assertHttpsUrl(input.sourceOutputUrl, 'Provider output URL');
  const providerRenderId = input.providerRenderId?.trim();
  const bucketName = input.bucketName?.trim();
  if (Boolean(providerRenderId) !== Boolean(bucketName)) {
    throw new Error('Provider render ID and bucket name must be supplied together.');
  }
  if (!Number.isInteger(input.sourceOutputSize) || input.sourceOutputSize < 0) {
    throw new Error('Provider output size must be a non-negative integer.');
  }
  const leaseMs = input.leaseMs ?? DEFAULT_FINALIZATION_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_FINALIZATION_LEASE_MS) {
    throw new Error('Finalization lease must be a positive integer within one hour.');
  }
  const jobs = input.collection ?? await getCollection();
  const now = input.now ?? new Date();
  const claimToken = input.claimToken ?? `rfl_${randomUUID().replaceAll('-', '')}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimableStates: Filter<RenderJob>[] = [
    { status: 'rendering' },
    {
      status: 'finalizing',
      'finalization.sourceOutputUrl': input.sourceOutputUrl,
      'finalization.leaseExpiresAt': { $lte: now },
    },
  ];
  if (providerRenderId) claimableStates.unshift({ status: 'pending' });
  const identityFilters: Filter<RenderJob>[] = [
    withLegacyRenderJobMutationExclusion(renderJobSelector(input.renderId)),
    { expectedDurationMs: { $exists: true, $gt: 0 } },
  ];
  if (providerRenderId) {
    identityFilters.push({
      $or: [
        { providerRenderId: { $exists: false } },
        { providerRenderId },
      ],
    });
  }
  const claimed = await jobs.findOneAndUpdate(
    {
      $and: [
        ...identityFilters,
        { $or: claimableStates },
      ],
    },
    {
      $set: {
        status: 'finalizing',
        progress: 0.99,
        'finalization.version': 'editron-render-finalization-v1',
        'finalization.state': 'running',
        'finalization.sourceOutputUrl': input.sourceOutputUrl,
        'finalization.sourceOutputSize': input.sourceOutputSize,
        'finalization.claimToken': claimToken,
        'finalization.claimedAt': now,
        'finalization.leaseExpiresAt': leaseExpiresAt,
        ...(providerRenderId && bucketName ? { providerRenderId, bucketName } : {}),
      },
      $inc: { 'finalization.attempts': 1 },
      $unset: {
        'finalization.error': '',
        error: '',
      },
    },
    { returnDocument: 'after' },
  );
  if (!claimed?.expectedDurationMs) return null;
  return {
    jobId: claimed._id,
    providerRenderId: claimed.providerRenderId,
    claimToken,
    sourceOutputUrl: input.sourceOutputUrl,
    sourceOutputSize: input.sourceOutputSize,
    expectedDurationMs: claimed.expectedDurationMs,
  };
}

/** Release only the active dispatch claim so another observer can retry QStash publication. */
export async function releaseJobFinalizationClaim(input: {
  jobId: string;
  claimToken: string;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const released = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    }),
    {
      $set: {
        status: 'rendering',
        progress: 0.99,
      },
      $unset: {
        finalization: '',
      },
    },
  );
  return released.modifiedCount === 1;
}

/**
 * Re-lease a failed finalization without starting or billing another render.
 * The preserved provider artifact is the only valid recovery source.
 */
export async function claimFailedJobFinalizationRetry(input: {
  jobId: string;
  userId: string;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<ClaimedRenderFinalization | null> {
  const leaseMs = input.leaseMs ?? DEFAULT_FINALIZATION_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_FINALIZATION_LEASE_MS) {
    throw new Error('Finalization lease must be a positive integer within one hour.');
  }
  const jobs = input.collection ?? await getCollection();
  const now = input.now ?? new Date();
  const claimToken = input.claimToken ?? `rfl_${randomUUID().replaceAll('-', '')}`;
  const claimed = await jobs.findOneAndUpdate(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      userId: input.userId,
      status: 'error',
      expectedDurationMs: { $exists: true, $gt: 0 },
      'finalization.state': 'failed',
      'finalization.sourceOutputUrl': { $regex: /^https:\/\// },
      'finalization.sourceOutputSize': { $exists: true, $gte: 0 },
      'finalization.attempts': { $lt: MAX_RENDER_FINALIZATION_ATTEMPTS },
    }),
    {
      $set: {
        status: 'finalizing',
        progress: 0.99,
        'finalization.state': 'running',
        'finalization.claimToken': claimToken,
        'finalization.claimedAt': now,
        'finalization.leaseExpiresAt': new Date(now.getTime() + leaseMs),
      },
      $inc: { 'finalization.attempts': 1 },
      $unset: {
        'finalization.completedAt': '',
        'finalization.error': '',
        completedAt: '',
        error: '',
      },
    },
    { returnDocument: 'after' },
  );
  if (
    !claimed?.expectedDurationMs
    || !claimed.finalization?.sourceOutputUrl
    || claimed.finalization.sourceOutputSize === undefined
  ) {
    return null;
  }
  assertHttpsUrl(claimed.finalization.sourceOutputUrl, 'Preserved provider output URL');
  return {
    jobId: claimed._id,
    providerRenderId: claimed.providerRenderId,
    claimToken,
    sourceOutputUrl: claimed.finalization.sourceOutputUrl,
    sourceOutputSize: claimed.finalization.sourceOutputSize,
    expectedDurationMs: claimed.expectedDurationMs,
  };
}

/** Restore a failed retry claim when durable queue publication did not succeed. */
export async function releaseFailedJobFinalizationRetryClaim(input: {
  jobId: string;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const completedAt = input.now ?? new Date();
  const message = boundedError(input.error);
  const released = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken,
    }),
    {
      $set: {
        status: 'error',
        progress: 0.99,
        error: message,
        completedAt,
        'finalization.state': 'failed',
        'finalization.error': message,
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.claimedAt': '',
        'finalization.leaseExpiresAt': '',
      },
    },
  );
  return released.modifiedCount === 1;
}

/** Re-lease a failed current project render without buying another render. */
export async function claimFailedProjectRenderJobFinalizationRetryV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderFinalizationClaimV1 | ProjectRenderJobNotCurrentResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  const lease = resolveProjectRenderLease(input, 'rfl');
  if (!lease) return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  const jobs = input.collection ?? await getCollection();
  const retryConditions: Filter<RenderJob> = {
    status: 'error',
    expectedDurationMs: { $exists: true, $gt: 0 },
    providerRenderId: { $exists: true, $type: 'string', $ne: '' },
    bucketName: { $exists: true, $type: 'string', $ne: '' },
    'finalization.state': 'failed',
    'finalization.sourceOutputUrl': { $regex: /^https:\/\// },
    'finalization.sourceOutputSize': { $exists: true, $gte: 0 },
    'finalization.attempts': { $lt: MAX_RENDER_FINALIZATION_ATTEMPTS },
  };
  const storedCandidate = await jobs.findOne(
    currentProjectRenderJobMutationFilter(validation.authorization, retryConditions),
    { session: input.session },
  );
  const parsedCandidate = RenderJobSchema.safeParse(storedCandidate);
  if (!parsedCandidate.success) {
    return nonCurrentProjectRenderJobResult(
      storedCandidate ? 'JOB_NOT_CURRENT' : 'JOB_STATE_NOT_ACTIVE',
    );
  }
  const candidate = parsedCandidate.data;
  const candidateInvalidReason = validateCurrentProjectRenderJob(
    candidate,
    validation.authorization,
  );
  if (
    candidateInvalidReason
    || !candidate.projectRenderSnapshotBinding
    || !candidate.deliveryManifest
    || !candidate.expectedDurationMs
    || !candidate.providerRenderId
    || !candidate.bucketName
    || !candidate.finalization?.sourceOutputUrl
    || candidate.finalization.sourceOutputSize === undefined
  ) {
    return nonCurrentProjectRenderJobResult(candidateInvalidReason ?? 'JOB_NOT_CURRENT');
  }
  try {
    assertHttpsUrl(candidate.finalization.sourceOutputUrl, 'Preserved provider output URL');
  } catch {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  const claimed = await jobs.findOneAndUpdate(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      ...retryConditions,
      providerRenderId: candidate.providerRenderId,
      bucketName: candidate.bucketName,
      expectedDurationMs: candidate.expectedDurationMs,
      projectRenderSnapshotBinding: candidate.projectRenderSnapshotBinding,
      deliveryManifest: candidate.deliveryManifest,
      'finalization.sourceOutputUrl': candidate.finalization.sourceOutputUrl,
      'finalization.sourceOutputSize': candidate.finalization.sourceOutputSize,
      'finalization.attempts': candidate.finalization.attempts,
    }),
    {
      $set: {
        status: 'finalizing',
        progress: 0.99,
        'finalization.state': 'running',
        'finalization.claimToken': lease.claimToken,
        'finalization.claimedAt': lease.now,
        'finalization.leaseExpiresAt': new Date(lease.now.getTime() + lease.leaseMs),
      },
      $inc: { 'finalization.attempts': 1 },
      $unset: {
        'finalization.completedAt': '',
        'finalization.error': '',
        completedAt: '',
        error: '',
      },
    },
    { returnDocument: 'after', session: input.session },
  );
  if (!claimed) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(claimed, validation.authorization);
  if (
    invalidReason
    || !claimed.projectRenderSnapshotBinding
    || !claimed.expectedDurationMs
    || !claimed.providerRenderId
    || !claimed.finalization?.sourceOutputUrl
    || claimed.finalization.sourceOutputSize === undefined
  ) {
    return nonCurrentProjectRenderJobResult(invalidReason ?? 'JOB_NOT_CURRENT');
  }
  try {
    assertHttpsUrl(claimed.finalization.sourceOutputUrl, 'Preserved provider output URL');
  } catch {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  return {
    ok: true,
    status: 'CURRENT',
    jobId: claimed._id,
    providerRenderId: claimed.providerRenderId,
    claimToken: lease.claimToken,
    sourceOutputUrl: claimed.finalization.sourceOutputUrl,
    sourceOutputSize: claimed.finalization.sourceOutputSize,
    expectedDurationMs: claimed.expectedDurationMs,
    authorization: validation.authorization,
    binding: structuredClone(claimed.projectRenderSnapshotBinding),
  };
}

/** Restore only the exact current failed-retry claim after queue failure. */
export async function releaseFailedProjectRenderJobFinalizationRetryClaimV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const message = boundedError(input.error);
  const jobs = input.collection ?? await getCollection();
  const released = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken.trim(),
    }),
    {
      $set: {
        status: 'error',
        progress: 0.99,
        error: message,
        completedAt,
        'finalization.state': 'failed',
        'finalization.error': message,
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.claimedAt': '',
        'finalization.leaseExpiresAt': '',
      },
    },
    { session: input.session },
  );
  return released.modifiedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/** Publish only a receipt-verified artifact held by the active finalization lease. */
export async function completeJobFinalization(input: {
  jobId: string;
  claimToken: string;
  result: RenderFinalizerResult;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const result = RenderFinalizerResultSchema.parse(input.result);
  const current = await jobs.findOne({
    ...withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    }),
  });
  if (!current) return false;
  if (current.expectedDurationMs !== result.expectedDurationMs) {
    throw new Error('Finalized artifact duration belongs to a different render contract.');
  }
  const completedAt = input.now ?? new Date();
  const deliveryManifest = current.deliveryManifest
    ? completeRenderDeliveryManifest(current.deliveryManifest, result.url, completedAt.toISOString())
    : undefined;
  const update = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    }),
    {
      $set: {
        status: 'done',
        progress: 1,
        outputUrl: result.url,
        outputSize: result.sizeBytes,
        completedAt,
        'finalization.state': 'done',
        'finalization.outputUrl': result.url,
        'finalization.outputSize': result.sizeBytes,
        'finalization.receipt': result.receipt,
        'finalization.completedAt': completedAt,
        ...(deliveryManifest ? { deliveryManifest } : {}),
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.leaseExpiresAt': '',
        'finalization.error': '',
        error: '',
      },
    },
  );
  return update.modifiedCount === 1;
}

export async function failJobFinalization(input: {
  jobId: string;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const completedAt = input.now ?? new Date();
  const message = boundedError(input.error);
  const update = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    }),
    {
      $set: {
        status: 'error',
        error: message,
        completedAt,
        'finalization.state': 'failed',
        'finalization.error': message,
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.leaseExpiresAt': '',
      },
    },
  );
  return update.modifiedCount === 1;
}

/**
 * Atomically lease finalization for a current whole-project render.  This is
 * intentionally independent from claimJobFinalization so a legacy caller
 * cannot mutate a snapshot-bound row by supplying only its render ID.
 */
export async function claimProjectRenderJobFinalizationV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  providerRenderId?: string;
  bucketName?: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderFinalizationClaimV1 | ProjectRenderJobNotCurrentResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (
    typeof input.sourceOutputUrl !== 'string'
    || input.providerRenderId !== undefined && !isBoundRenderInputString(input.providerRenderId)
    || input.bucketName !== undefined && !isBoundRenderInputString(input.bucketName)
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  try {
    assertHttpsUrl(input.sourceOutputUrl, 'Provider output URL');
  } catch {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  if (!Number.isInteger(input.sourceOutputSize) || input.sourceOutputSize < 0) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const providerRenderId = input.providerRenderId?.trim();
  const bucketName = input.bucketName?.trim();
  if (Boolean(providerRenderId) !== Boolean(bucketName)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const lease = resolveProjectRenderLease(input, 'rfl');
  if (!lease) return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  const jobs = input.collection ?? await getCollection();
  const claimableStates: Filter<RenderJob>[] = [
    { status: 'rendering' },
    {
      status: 'finalizing',
      'finalization.sourceOutputUrl': input.sourceOutputUrl,
      'finalization.leaseExpiresAt': { $lte: lease.now },
    },
  ];
  if (providerRenderId) claimableStates.unshift({ status: 'pending' });
  const claimed = await jobs.findOneAndUpdate(
    {
      $and: [
        currentProjectRenderJobMutationFilter(validation.authorization, {
          expectedDurationMs: { $exists: true, $gt: 0 },
        }),
        { $or: claimableStates },
        ...(providerRenderId
          ? [{
              $or: [
                {
                  providerRenderId: { $exists: false },
                  bucketName: { $exists: false },
                },
                { providerRenderId, bucketName },
              ],
            }]
          : []),
      ],
    },
    {
      $set: {
        status: 'finalizing',
        progress: 0.99,
        'finalization.version': 'editron-render-finalization-v1',
        'finalization.state': 'running',
        'finalization.sourceOutputUrl': input.sourceOutputUrl,
        'finalization.sourceOutputSize': input.sourceOutputSize,
        'finalization.claimToken': lease.claimToken,
        'finalization.claimedAt': lease.now,
        'finalization.leaseExpiresAt': new Date(lease.now.getTime() + lease.leaseMs),
        ...(providerRenderId && bucketName ? { providerRenderId, bucketName } : {}),
      },
      $inc: { 'finalization.attempts': 1 },
      $unset: {
        'finalization.error': '',
        error: '',
      },
    },
    { returnDocument: 'after', session: input.session },
  );
  if (!claimed) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(claimed, validation.authorization);
  if (invalidReason || !claimed.projectRenderSnapshotBinding || !claimed.expectedDurationMs) {
    return nonCurrentProjectRenderJobResult(invalidReason ?? 'JOB_NOT_CURRENT');
  }
  return {
    ok: true,
    status: 'CURRENT',
    jobId: claimed._id,
    providerRenderId: claimed.providerRenderId,
    claimToken: lease.claimToken,
    sourceOutputUrl: input.sourceOutputUrl,
    sourceOutputSize: input.sourceOutputSize,
    expectedDurationMs: claimed.expectedDurationMs,
    authorization: validation.authorization,
    binding: structuredClone(claimed.projectRenderSnapshotBinding),
  };
}

/** Release only the exact current bound finalization claim. */
export async function releaseProjectRenderJobFinalizationClaimV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const released = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken.trim(),
    }),
    {
      $set: {
        status: 'rendering',
        progress: 0.99,
      },
      $unset: {
        finalization: '',
      },
    },
    { session: input.session },
  );
  return released.modifiedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/** Publish only a receipt-verified artifact held by the exact bound claim. */
export async function completeProjectRenderJobFinalizationV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  result: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const parsedResult = RenderFinalizerResultSchema.safeParse(input.result);
  if (!parsedResult.success) return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const claimToken = input.claimToken.trim();
  const current = await jobs.findOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': claimToken,
    }),
    { session: input.session },
  );
  if (!current) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(current, validation.authorization);
  if (invalidReason) return nonCurrentProjectRenderJobResult(invalidReason);
  if (
    current.expectedDurationMs === undefined
    || current.expectedDurationMs !== parsedResult.data.expectedDurationMs
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const reservedDeliveryManifest = parseProjectRenderDeliveryManifest(current.deliveryManifest);
  if (
    !reservedDeliveryManifest
    || reservedDeliveryManifest.primaryArtifact.renderId !== validation.authorization.jobId
  ) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  let deliveryManifest: RenderDeliveryManifest;
  try {
    deliveryManifest = completeRenderDeliveryManifest(
      reservedDeliveryManifest,
      parsedResult.data.url,
      completedAt.toISOString(),
    );
  } catch {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completed = await jobs.findOneAndUpdate(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': claimToken,
      expectedDurationMs: parsedResult.data.expectedDurationMs,
      deliveryManifest: reservedDeliveryManifest,
    }),
    {
      $set: {
        status: 'done',
        progress: 1,
        outputUrl: parsedResult.data.url,
        outputSize: parsedResult.data.sizeBytes,
        completedAt,
        'finalization.state': 'done',
        'finalization.outputUrl': parsedResult.data.url,
        'finalization.outputSize': parsedResult.data.sizeBytes,
        'finalization.receipt': parsedResult.data.receipt,
        'finalization.completedAt': completedAt,
        deliveryManifest,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.leaseExpiresAt': '',
        'finalization.error': '',
        error: '',
      },
    },
    { returnDocument: 'after', session: input.session },
  );
  if (!completed) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const completedInvalidReason = validateCurrentProjectRenderJob(
    completed,
    validation.authorization,
  );
  if (completedInvalidReason) return nonCurrentProjectRenderJobResult(completedInvalidReason);
  return verifiedProjectRenderDeliveryManifest(completed)
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
}

/** Fail only the exact current bound finalization claim; never publish success. */
export async function failProjectRenderJobFinalizationV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  error: unknown;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const failed = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken.trim(),
    }),
    {
      $set: {
        status: 'error',
        error: boundedError(input.error),
        completedAt,
        'finalization.state': 'failed',
        'finalization.error': boundedError(input.error),
        'finalization.completedAt': completedAt,
      },
      $unset: {
        'finalization.claimToken': '',
        'finalization.leaseExpiresAt': '',
      },
    },
    { session: input.session },
  );
  return failed.modifiedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

export interface ClaimedRenderCompletionEffects {
  jobId: string;
  userId: string;
  projectId: string;
  providerRenderId?: string;
  outputUrl: string;
  outputSize: number;
  claimToken: string;
}

export interface ProjectRenderCompletionEffectsClaimV1 extends ClaimedRenderCompletionEffects {
  ok: true;
  status: 'CURRENT';
  authorization: ProjectRenderJobAuthorizationV1;
  binding: ProjectRenderSnapshotBindingV1;
}

/** Lease post-render integrations only after exact-duration finalization is committed. */
export async function claimRenderCompletionEffects(input: {
  renderId: string;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<ClaimedRenderCompletionEffects | null> {
  const leaseMs = input.leaseMs ?? DEFAULT_COMPLETION_EFFECTS_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_FINALIZATION_LEASE_MS) {
    throw new Error('Completion-effects lease must be a positive integer within one hour.');
  }
  const jobs = input.collection ?? await getCollection();
  const now = input.now ?? new Date();
  const claimToken = input.claimToken ?? `rce_${randomUUID().replaceAll('-', '')}`;
  const claimed = await jobs.findOneAndUpdate(
    {
      $and: [
        renderJobSelector(input.renderId),
        LEGACY_RENDER_JOB_MUTATION_EXCLUSION,
        { status: 'done' },
        { outputUrl: { $exists: true } },
        { 'finalization.state': 'done' },
        { 'finalization.receipt': { $exists: true } },
        {
          $or: [
            { 'completionEffects.state': { $exists: false } },
            {
              'completionEffects.state': 'running',
              'completionEffects.leaseExpiresAt': { $lte: now },
            },
          ],
        },
      ],
    },
    {
      $set: {
        'completionEffects.version': 'editron-render-completion-effects-v1',
        'completionEffects.state': 'running',
        'completionEffects.claimToken': claimToken,
        'completionEffects.claimedAt': now,
        'completionEffects.leaseExpiresAt': new Date(now.getTime() + leaseMs),
      },
      $inc: { 'completionEffects.attempts': 1 },
      $unset: { 'completionEffects.completedAt': '' },
    },
    { returnDocument: 'after' },
  );
  if (!claimed?.outputUrl) return null;
  return {
    jobId: claimed._id,
    userId: claimed.userId,
    projectId: claimed.projectId,
    providerRenderId: claimed.providerRenderId,
    outputUrl: claimed.outputUrl,
    outputSize: claimed.outputSize ?? 0,
    claimToken,
  };
}

export async function completeRenderCompletionEffects(input: {
  jobId: string;
  claimToken: string;
  now?: Date;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const completed = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'done',
      'completionEffects.state': 'running',
      'completionEffects.claimToken': input.claimToken,
    }),
    {
      $set: {
        'completionEffects.state': 'done',
        'completionEffects.completedAt': input.now ?? new Date(),
      },
      $unset: {
        'completionEffects.claimToken': '',
        'completionEffects.leaseExpiresAt': '',
      },
    },
  );
  return completed.modifiedCount === 1;
}

export async function releaseRenderCompletionEffects(input: {
  jobId: string;
  claimToken: string;
  collection?: Collection<RenderJob>;
}): Promise<boolean> {
  const jobs = input.collection ?? await getCollection();
  const released = await jobs.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      status: 'done',
      'completionEffects.state': 'running',
      'completionEffects.claimToken': input.claimToken,
    }),
    { $unset: { completionEffects: '' } },
  );
  return released.modifiedCount === 1;
}

function verifiedProjectRenderFinalizerReceipt(
  job: RenderJob,
): RenderFinalizerResult['receipt'] | null {
  const outputSize = job.outputSize;
  if (
    job.expectedDurationMs === undefined
    || typeof job.outputUrl !== 'string'
    || typeof outputSize !== 'number'
    || !Number.isInteger(outputSize)
    || outputSize <= 0
  ) {
    return null;
  }
  const parsed = RenderFinalizerResultSchema.safeParse({
    url: job.outputUrl,
    sizeBytes: outputSize,
    expectedDurationMs: job.expectedDurationMs,
    receipt: job.finalization?.receipt,
  });
  return parsed.success ? parsed.data.receipt : null;
}

/** Lease post-render effects only from a receipt-verified current bound job. */
export async function claimProjectRenderCompletionEffectsV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderCompletionEffectsClaimV1 | ProjectRenderJobNotCurrentResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  const lease = resolveProjectRenderLease(input, 'rce');
  if (!lease) return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  const completionEffectsConditions: Filter<RenderJob> = {
    status: 'done',
    outputUrl: { $exists: true },
    'finalization.state': 'done',
    'finalization.receipt': { $exists: true },
    $or: [
      { 'completionEffects.state': { $exists: false } },
      {
        'completionEffects.state': 'running',
        'completionEffects.leaseExpiresAt': { $lte: lease.now },
      },
    ],
  };
  const jobs = input.collection ?? await getCollection();
  const current = await jobs.findOne(
    currentProjectRenderJobMutationFilter(validation.authorization, completionEffectsConditions),
    { session: input.session },
  );
  if (!current) return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  const invalidReason = validateCurrentProjectRenderJob(current, validation.authorization);
  if (invalidReason) return nonCurrentProjectRenderJobResult(invalidReason);
  const receipt = verifiedProjectRenderFinalizerReceipt(current);
  if (!receipt || !current.outputUrl || current.outputSize === undefined) {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  const deliveryManifest = verifiedProjectRenderDeliveryManifest(current);
  if (!deliveryManifest) return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  try {
    assertHttpsUrl(current.outputUrl, 'Finalized output URL');
  } catch {
    return nonCurrentProjectRenderJobResult('JOB_NOT_CURRENT');
  }
  const claimed = await jobs.findOneAndUpdate(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      ...completionEffectsConditions,
      outputUrl: current.outputUrl,
      outputSize: current.outputSize,
      'finalization.receipt': receipt,
      deliveryManifest,
    }),
    {
      $set: {
        'completionEffects.version': 'editron-render-completion-effects-v1',
        'completionEffects.state': 'running',
        'completionEffects.claimToken': lease.claimToken,
        'completionEffects.claimedAt': lease.now,
        'completionEffects.leaseExpiresAt': new Date(lease.now.getTime() + lease.leaseMs),
      },
      $inc: { 'completionEffects.attempts': 1 },
      $unset: { 'completionEffects.completedAt': '' },
    },
    { returnDocument: 'after', session: input.session },
  );
  if (!claimed) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const claimedInvalidReason = validateCurrentProjectRenderJob(
    claimed,
    validation.authorization,
  );
  const claimedReceipt = verifiedProjectRenderFinalizerReceipt(claimed);
  const claimedDeliveryManifest = verifiedProjectRenderDeliveryManifest(claimed);
  const claimedOutputSize = claimed.outputSize;
  if (
    claimedInvalidReason
    || !claimedReceipt
    || !claimedDeliveryManifest
    || !sameProjectRenderDeliveryManifestV1(claimedDeliveryManifest, deliveryManifest)
    || !claimed.outputUrl
    || typeof claimedOutputSize !== 'number'
    || !Number.isInteger(claimedOutputSize)
    || claimedOutputSize <= 0
  ) {
    return nonCurrentProjectRenderJobResult(claimedInvalidReason ?? 'JOB_NOT_CURRENT');
  }
  return {
    ok: true,
    status: 'CURRENT',
    jobId: claimed._id,
    userId: claimed.userId,
    projectId: claimed.projectId,
    providerRenderId: claimed.providerRenderId,
    outputUrl: claimed.outputUrl,
    outputSize: claimedOutputSize,
    claimToken: lease.claimToken,
    authorization: validation.authorization,
    binding: structuredClone(claimed.projectRenderSnapshotBinding!),
  };
}

/** Complete only the exact current bound completion-effects lease. */
export async function completeProjectRenderCompletionEffectsV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  now?: Date;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const completedAt = input.now ?? new Date();
  if (!validProjectRenderDate(completedAt)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const claimToken = input.claimToken.trim();
  const conditions: Filter<RenderJob> = {
    status: 'done',
    outputUrl: { $exists: true },
    'finalization.state': 'done',
    'finalization.receipt': { $exists: true },
    'completionEffects.state': 'running',
    'completionEffects.claimToken': claimToken,
  };
  const current = await jobs.findOne(
    currentProjectRenderJobMutationFilter(validation.authorization, conditions),
    { session: input.session },
  );
  if (!current) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(current, validation.authorization);
  const receipt = verifiedProjectRenderFinalizerReceipt(current);
  const deliveryManifest = verifiedProjectRenderDeliveryManifest(current);
  if (
    invalidReason
    || !receipt
    || !deliveryManifest
    || !current.outputUrl
    || current.outputSize === undefined
  ) {
    return nonCurrentProjectRenderJobResult(invalidReason ?? 'JOB_NOT_CURRENT');
  }
  const completed = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      ...conditions,
      outputUrl: current.outputUrl,
      outputSize: current.outputSize,
      'finalization.receipt': receipt,
      deliveryManifest,
    }),
    {
      $set: {
        'completionEffects.state': 'done',
        'completionEffects.completedAt': completedAt,
      },
      $unset: {
        'completionEffects.claimToken': '',
        'completionEffects.leaseExpiresAt': '',
      },
    },
    { session: input.session },
  );
  return completed.matchedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/** Release only the exact current bound completion-effects lease. */
export async function releaseProjectRenderCompletionEffectsV1(input: {
  authorization: unknown;
  currentProjectRevision: unknown;
  claimToken: string;
  collection?: Collection<RenderJob>;
  session?: ClientSession;
}): Promise<ProjectRenderJobMutationResultV1> {
  const validation = validateProjectRenderJobAuthorization(input);
  if ('result' in validation) return validation.result;
  if (!isBoundRenderInputString(input.claimToken)) {
    return nonCurrentProjectRenderJobResult('INPUT_INVALID');
  }
  const jobs = input.collection ?? await getCollection();
  const claimToken = input.claimToken.trim();
  const conditions: Filter<RenderJob> = {
    status: 'done',
    outputUrl: { $exists: true },
    'finalization.state': 'done',
    'finalization.receipt': { $exists: true },
    'completionEffects.state': 'running',
    'completionEffects.claimToken': claimToken,
  };
  const current = await jobs.findOne(
    currentProjectRenderJobMutationFilter(validation.authorization, conditions),
    { session: input.session },
  );
  if (!current) return nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
  const invalidReason = validateCurrentProjectRenderJob(current, validation.authorization);
  const receipt = verifiedProjectRenderFinalizerReceipt(current);
  const deliveryManifest = verifiedProjectRenderDeliveryManifest(current);
  if (
    invalidReason
    || !receipt
    || !deliveryManifest
    || !current.outputUrl
    || current.outputSize === undefined
  ) {
    return nonCurrentProjectRenderJobResult(invalidReason ?? 'JOB_NOT_CURRENT');
  }
  const released = await jobs.updateOne(
    currentProjectRenderJobMutationFilter(validation.authorization, {
      ...conditions,
      outputUrl: current.outputUrl,
      outputSize: current.outputSize,
      'finalization.receipt': receipt,
      deliveryManifest,
    }),
    { $unset: { completionEffects: '' } },
    { session: input.session },
  );
  return released.matchedCount === 1
    ? currentProjectRenderJobMutationResult()
    : nonCurrentProjectRenderJobResult('JOB_STATE_NOT_ACTIVE');
}

/**
 * Idempotently bind a provider render to its pre-dispatch admission record.
 */
export async function markJobStarted(
  jobId: string,
  userId: string,
  providerRenderId: string,
  bucketName: string,
  region: string,
  deliveryManifest: RenderDeliveryManifest,
): Promise<void> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: jobId,
      userId,
      $or: [
        { status: 'pending' },
        { status: 'rendering', providerRenderId },
      ],
    }),
    {
      $set: {
        status: 'rendering',
        providerRenderId,
        bucketName,
        region,
        deliveryManifest,
      },
    },
  );
  if (result.matchedCount !== 1) {
    throw new Error(`Render admission ${jobId} could not be bound to provider render ${providerRenderId}`);
  }
}

export type RenderProviderTerminalEvent =
  | { type: 'success'; outputUrl: string }
  | { type: 'error' | 'timeout'; error: string };

/**
 * Atomically repair provider identity and terminal state from a signed callback.
 */
export async function reconcileProviderTerminalEvent(input: {
  jobId: string;
  providerRenderId: string;
  bucketName: string;
  event: RenderProviderTerminalEvent;
}): Promise<void> {
  const collection = await getCollection();
  const current = await collection.findOne({ _id: input.jobId });
  if (!current) {
    throw new Error(`Render admission ${input.jobId} does not exist`);
  }
  if (
    current.providerRenderId
    && current.providerRenderId !== input.providerRenderId
  ) {
    throw new Error(`Render admission ${input.jobId} belongs to another provider render`);
  }
  if (current.status === 'done') {
    if (
      input.event.type === 'success'
      && current.outputUrl
      && current.outputUrl !== input.event.outputUrl
    ) {
      throw new Error(`Render admission ${input.jobId} already completed with another output`);
    }
    return;
  }

  const completedAt = new Date();
  const deliveryManifest = input.event.type === 'success' && current.deliveryManifest
    ? completeRenderDeliveryManifest(
        current.deliveryManifest,
        input.event.outputUrl,
        completedAt.toISOString(),
      )
    : undefined;
  const result = await collection.updateOne(
    withLegacyRenderJobMutationExclusion({
      _id: input.jobId,
      ...(input.event.type === 'success' ? {} : { status: { $ne: 'done' } }),
      $or: [
        { providerRenderId: { $exists: false } },
        { providerRenderId: input.providerRenderId },
      ],
    }),
    {
      $set: {
        providerRenderId: input.providerRenderId,
        bucketName: input.bucketName,
        completedAt,
        ...(input.event.type === 'success'
          ? {
              status: 'done' as const,
              progress: 1,
              outputUrl: input.event.outputUrl,
              outputSize: 0,
              ...(deliveryManifest ? { deliveryManifest } : {}),
            }
          : {
              status: 'error' as const,
              error: input.event.error,
            }),
      },
    },
  );
  if (result.matchedCount !== 1) {
    const latest = await collection.findOne({ _id: input.jobId });
    if (latest?.status === 'done' && input.event.type !== 'success') return;
    throw new Error(`Render admission ${input.jobId} could not reconcile its provider callback`);
  }
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  renderId: string,
  progress: number
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    withLegacyRenderJobMutationExclusion(renderJobSelector(renderId)),
    { $set: { progress } }
  );
}

/**
 * Mark job as completed
 */
export async function completeJob(
  renderId: string,
  outputUrl: string,
  outputSize: number
): Promise<void> {
  const collection = await getCollection();
  const completedAt = new Date();
  const current = await collection.findOne(
    renderJobSelector(renderId),
    { projection: { deliveryManifest: 1 } },
  );
  const deliveryManifest = current?.deliveryManifest
    ? completeRenderDeliveryManifest(
        current.deliveryManifest,
        outputUrl,
        completedAt.toISOString(),
      )
    : undefined;
  await collection.updateOne(
    withLegacyRenderJobMutationExclusion(renderJobSelector(renderId)),
    { 
      $set: { 
        status: 'done',
        progress: 1,
        outputUrl,
        outputSize,
        completedAt,
        ...(deliveryManifest ? { deliveryManifest } : {}),
      } 
    }
  );
}

/**
 * Mark job as failed
 */
export async function failJob(
  renderId: string,
  error: string
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    withLegacyRenderJobMutationExclusion(renderJobSelector(renderId)),
    { 
      $set: { 
        status: 'error',
        error,
        completedAt: new Date()
      } 
    }
  );
}

/**
 * Get all active renders for a user
 */
export async function getActiveRendersForUser(
  userId: string
): Promise<RenderJob[]> {
  const collection = await getCollection();
  return collection.find({
    userId,
    status: { $in: ['rendering', 'finalizing', 'queued', 'pending'] }
  }).toArray();
}

/**
 * Get job by ID
 */
export async function getJob(renderId: string): Promise<RenderJob | null> {
  const collection = await getCollection();
  return collection.findOne(renderJobSelector(renderId));
}

/**
 * Get render history for a project (for persistent render list)
 * Returns durable render history, including finalization recovery in progress.
 */
export async function getRenderHistoryForProject(
  projectId: string,
  userId: string,
  limit: number = 10
): Promise<RenderJob[]> {
  const collection = await getCollection();
  return collection.find({
    projectId,
    userId,
    status: { $in: ['done', 'error', 'finalizing'] }
  })
  .sort({ completedAt: -1, startedAt: -1 })
  .limit(limit)
  .toArray();
}

function assertHttpsUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS.`);
  }
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Render finalization failed.').slice(0, 1000);
}
