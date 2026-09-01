import { randomUUID } from 'node:crypto';

import { Collection, type Filter } from 'mongodb';
import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  RenderJob,
  RenderExpectedDurationMsSchema,
  RenderFinalizerResultSchema,
  createPendingRenderJob,
} from '../schemas/render-job';
import type { RenderFinalizerResult } from './render-finalizer-client';
import {
  completeRenderDeliveryManifest,
  type RenderDeliveryManifest,
} from './render-delivery-manifest';
import {
  assertProjectArtifactBindingV1,
  assertProjectArtifactInvalidationReceiptV1,
  projectArtifactBindingMatchesCurrentV1,
  projectArtifactBindingMatchesInvalidationV1,
  type ProjectArtifactBindingV1,
  type ProjectArtifactInvalidationDerivativeClassV1,
  type ProjectArtifactInvalidationFenceV1,
  type ProjectArtifactInvalidationReceiptV1,
} from './project-artifact-invalidation-v1';

const COLLECTION_NAME = 'editron_render_jobs';
const DEFAULT_FINALIZATION_LEASE_MS = 20 * 60 * 1000;
const MAX_FINALIZATION_LEASE_MS = 60 * 60 * 1000;
export const MAX_RENDER_FINALIZATION_ATTEMPTS = 3;
const DEFAULT_COMPLETION_EFFECTS_LEASE_MS = 5 * 60 * 1000;

async function getCollection(): Promise<Collection<RenderJob>> {
  const db = await getDatabase();
  return db.collection<RenderJob>(COLLECTION_NAME);
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
      {
        _id: candidate._id,
        userId: input.receipt.ownerId,
        projectId: input.receipt.projectId,
        artifactState: 'ACTIVE',
        'artifactBinding.bindingHash': candidate.artifactBinding.bindingHash,
      },
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
    renderJobSelector(input.renderId),
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
    {
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    },
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
    {
      _id: input.jobId,
      userId: input.userId,
      status: 'error',
      expectedDurationMs: { $exists: true, $gt: 0 },
      'finalization.state': 'failed',
      'finalization.sourceOutputUrl': { $regex: /^https:\/\// },
      'finalization.sourceOutputSize': { $exists: true, $gte: 0 },
      'finalization.attempts': { $lt: MAX_RENDER_FINALIZATION_ATTEMPTS },
    },
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
    {
      _id: input.jobId,
      status: 'finalizing',
      'finalization.state': 'running',
      'finalization.claimToken': input.claimToken,
    },
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
    _id: input.jobId,
    status: 'finalizing',
    'finalization.claimToken': input.claimToken,
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
    {
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    },
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
    {
      _id: input.jobId,
      status: 'finalizing',
      'finalization.claimToken': input.claimToken,
    },
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

export interface ClaimedRenderCompletionEffects {
  jobId: string;
  userId: string;
  projectId: string;
  providerRenderId?: string;
  outputUrl: string;
  outputSize: number;
  claimToken: string;
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
    {
      _id: input.jobId,
      status: 'done',
      'completionEffects.state': 'running',
      'completionEffects.claimToken': input.claimToken,
    },
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
    {
      _id: input.jobId,
      status: 'done',
      'completionEffects.state': 'running',
      'completionEffects.claimToken': input.claimToken,
    },
    { $unset: { completionEffects: '' } },
  );
  return released.modifiedCount === 1;
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
    {
      _id: jobId,
      userId,
      $or: [
        { status: 'pending' },
        { status: 'rendering', providerRenderId },
      ],
    },
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
    {
      _id: input.jobId,
      ...(input.event.type === 'success' ? {} : { status: { $ne: 'done' } }),
      $or: [
        { providerRenderId: { $exists: false } },
        { providerRenderId: input.providerRenderId },
      ],
    },
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
    renderJobSelector(renderId),
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
    renderJobSelector(renderId),
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
    renderJobSelector(renderId),
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
