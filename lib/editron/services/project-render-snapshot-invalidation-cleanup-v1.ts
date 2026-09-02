import type { ClientSession, Collection, Filter } from "mongodb";

import { RenderJobSchema, type RenderJob } from "../schemas/render-job";
import {
  sameProjectArtifactRevisionV1,
} from "./project-artifact-invalidation-v1";
import {
  assertProjectRenderSnapshotInvalidationReceiptV1,
  type ProjectRenderSnapshotInvalidationReceiptV1,
} from "./project-render-snapshot-invalidation-v1";
import {
  assertProjectRenderSourceCleanupOutboxV1,
  createProjectRenderSourceCleanupOutboxV1,
  enqueueProjectRenderSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "./project-render-source-cleanup-v1";

export type ProjectRenderSnapshotCleanupDispositionV1 =
  | "CLEANUP_HANDOFF_CREATED"
  | "CLEANUP_HANDOFF_PENDING"
  | "CLEANUP_DONE"
  | "PROVIDER_OUTCOME_UNRESOLVED"
  | "CHAPTER_OWNER_REQUIRED";

export interface ProjectRenderSnapshotCleanupResultV1 {
  jobId: string;
  disposition: ProjectRenderSnapshotCleanupDispositionV1;
  cleanupOutboxId?: string;
  retainedUntil?: string;
}

function fail(code: string): never {
  throw new Error(`PROJECT_RENDER_SNAPSHOT_CLEANUP_${code}`);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function exactFencedJobV1(
  stored: unknown,
  receipt: ProjectRenderSnapshotInvalidationReceiptV1,
  jobId: string,
): RenderJob {
  const parsed = RenderJobSchema.safeParse(stored);
  if (!parsed.success) fail("JOB_INVALID");
  const job = parsed.data;
  const binding = job.projectRenderSnapshotBinding;
  const invalidation = job.projectRenderSnapshotInvalidation;
  if (
    job._id !== jobId
    || job.userId !== receipt.ownerId
    || job.projectId !== receipt.projectId
    || !binding
    || binding.artifactId !== jobId
    || binding.ownerId !== receipt.ownerId
    || binding.projectId !== receipt.projectId
    || !sameProjectArtifactRevisionV1(binding.projectRevision, receipt.beforeRevision)
    || !invalidation
    || invalidation.invalidationId !== receipt.receiptId
    || invalidation.receiptHash !== receipt.receiptHash
    || !sameProjectArtifactRevisionV1(invalidation.beforeRevision, receipt.beforeRevision)
    || !sameProjectArtifactRevisionV1(invalidation.afterRevision, receipt.afterRevision)
    || (job.artifactState !== "STALE" && job.artifactState !== "HISTORY_ONLY")
    || !job.artifactCleanup
  ) {
    fail("JOB_SCOPE_MISMATCH");
  }
  if (
    job.artifactCleanup.state === "DONE"
    && job.artifactCleanup.pendingArtifactIds.length === 0
  ) {
    return job;
  }
  if (
    job.artifactCleanup.state !== "PENDING"
    || job.artifactCleanup.pendingArtifactIds.length !== 1
    || job.artifactCleanup.pendingArtifactIds[0] !== jobId
  ) {
    fail("JOB_CLEANUP_STATE_INVALID");
  }
  return job;
}

function exactCleanupOutboxForJobV1(
  value: unknown,
  job: RenderJob,
): ProjectRenderSourceCleanupOutboxV1 {
  assertProjectRenderSourceCleanupOutboxV1(value);
  const outbox = value as ProjectRenderSourceCleanupOutboxV1;
  const binding = job.projectRenderSnapshotBinding!;
  if (
    outbox._id !== job.projectRenderSourceCleanupOutboxId
    || outbox.descriptor.binding.artifactId !== job._id
    || outbox.descriptor.binding.ownerId !== job.userId
    || outbox.descriptor.binding.projectId !== job.projectId
    || outbox.descriptor.binding.bindingHash !== binding.bindingHash
  ) {
    fail("OUTBOX_SCOPE_MISMATCH");
  }
  return outbox;
}

async function markRenderCleanupDoneV1(input: {
  job: RenderJob;
  collection: Collection<RenderJob>;
  session: ClientSession;
}): Promise<void> {
  const invalidation = input.job.projectRenderSnapshotInvalidation!;
  const filter: Filter<RenderJob> = {
    _id: input.job._id,
    userId: input.job.userId,
    projectId: input.job.projectId,
    artifactState: input.job.artifactState,
    "artifactCleanup.state": "PENDING",
    "artifactCleanup.pendingArtifactIds": [input.job._id],
    "projectRenderSnapshotInvalidation.invalidationId": invalidation.invalidationId,
    "projectRenderSnapshotInvalidation.receiptHash": invalidation.receiptHash,
    ...(input.job.projectRenderSourceCleanupOutboxId
      ? { projectRenderSourceCleanupOutboxId: input.job.projectRenderSourceCleanupOutboxId }
      : { projectRenderSourceCleanupOutboxId: { $exists: false } }),
  };
  const marked = await input.collection.updateOne(
    filter,
    { $set: { artifactCleanup: { state: "DONE", pendingArtifactIds: [] } } },
    { session: input.session },
  );
  if (marked.matchedCount === 1) return;
  const latest = await input.collection.findOne({ _id: input.job._id }, { session: input.session });
  if (
    latest?.artifactCleanup?.state === "DONE"
    && latest.artifactCleanup.pendingArtifactIds.length === 0
    && latest.projectRenderSnapshotInvalidation?.invalidationId === invalidation.invalidationId
    && latest.projectRenderSnapshotInvalidation.receiptHash === invalidation.receiptHash
    && latest.projectRenderSourceCleanupOutboxId
      === input.job.projectRenderSourceCleanupOutboxId
  ) {
    return;
  }
  fail("CLEANUP_DONE_WRITE_UNPROVED");
}

function providerOutputV1(job: RenderJob): {
  providerRenderId: string;
  bucketName: string;
  region: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
} | null {
  const hasTopLevelProvider = job.providerRenderId !== undefined
    || job.bucketName !== undefined;
  const hasDispatchProvider = job.dispatch?.providerRenderId !== undefined
    || job.dispatch?.providerBucketName !== undefined
    || job.dispatch?.providerRegion !== undefined;
  if (!hasTopLevelProvider && !hasDispatchProvider && !job.finalization) return null;
  if (
    !job.providerRenderId
    || !job.bucketName
    || !job.finalization
    || (hasDispatchProvider && (
      job.dispatch?.providerRenderId !== job.providerRenderId
      || job.dispatch.providerBucketName !== job.bucketName
      || job.dispatch.providerRegion !== job.region
    ))
  ) {
    fail("PROVIDER_IDENTITY_INCOMPLETE");
  }
  return {
    providerRenderId: job.providerRenderId,
    bucketName: job.bucketName,
    region: job.region,
    sourceOutputUrl: job.finalization.sourceOutputUrl,
    sourceOutputSize: job.finalization.sourceOutputSize,
  };
}

/**
 * Materialize or reconcile cleanup for one exact standard render fenced by a
 * project-snapshot invalidation. The caller must wrap this in a Mongo
 * transaction; chapter aggregate parents remain owned by chapter cleanup.
 */
export async function materializeProjectRenderSnapshotInvalidationCleanupV1(input: {
  receipt: ProjectRenderSnapshotInvalidationReceiptV1;
  jobId: string;
  renderJobs: Collection<RenderJob>;
  cleanupOutboxes: Collection<ProjectRenderSourceCleanupOutboxV1>;
  session: ClientSession;
  now?: Date;
}): Promise<ProjectRenderSnapshotCleanupResultV1> {
  assertProjectRenderSnapshotInvalidationReceiptV1(input.receipt);
  if (!input.session.inTransaction()) fail("TRANSACTION_REQUIRED");
  if (typeof input.jobId !== "string" || input.jobId.length < 1 || input.jobId.length > 500) {
    fail("JOB_ID_INVALID");
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) fail("TIME_INVALID");
  const stored = await input.renderJobs.findOne({ _id: input.jobId }, { session: input.session });
  const job = exactFencedJobV1(stored, input.receipt, input.jobId);

  if (job.chapterOrchestration) {
    return { jobId: job._id, disposition: "CHAPTER_OWNER_REQUIRED" };
  }
  if (job.artifactCleanup?.state === "DONE") {
    if (job.projectRenderSourceCleanupOutboxId) {
      const existing = await input.cleanupOutboxes.findOne(
        { _id: job.projectRenderSourceCleanupOutboxId },
        { session: input.session },
      );
      if (exactCleanupOutboxForJobV1(existing, job).status !== "DONE") {
        fail("JOB_DONE_WITHOUT_COMPLETED_OUTBOX");
      }
    }
    return {
      jobId: job._id,
      disposition: "CLEANUP_DONE",
      ...(job.projectRenderSourceCleanupOutboxId
        ? { cleanupOutboxId: job.projectRenderSourceCleanupOutboxId }
        : {}),
    };
  }

  if (job.projectRenderSourceCleanupOutboxId) {
    const existing = await input.cleanupOutboxes.findOne(
      { _id: job.projectRenderSourceCleanupOutboxId },
      { session: input.session },
    );
    const outbox = exactCleanupOutboxForJobV1(existing, job);
    if (outbox.status === "DONE") {
      await markRenderCleanupDoneV1({ job, collection: input.renderJobs, session: input.session });
      return { jobId: job._id, disposition: "CLEANUP_DONE", cleanupOutboxId: outbox._id };
    }
    return {
      jobId: job._id,
      disposition: "CLEANUP_HANDOFF_PENDING",
      cleanupOutboxId: outbox._id,
      retainedUntil: outbox.availableAt.toISOString(),
    };
  }

  const providerOutput = providerOutputV1(job);
  if (!providerOutput) {
    if (job.dispatch?.phase !== "NOT_ATTEMPTED") {
      return { jobId: job._id, disposition: "PROVIDER_OUTCOME_UNRESOLVED" };
    }
    await markRenderCleanupDoneV1({ job, collection: input.renderJobs, session: input.session });
    return { jobId: job._id, disposition: "CLEANUP_DONE" };
  }
  if (!validDate(job.artifactInvalidatedAt) || job.artifactInvalidatedAt.getTime() > now.getTime()) {
    fail("INVALIDATION_TIME_INVALID");
  }
  const availableAt = job.artifactState === "HISTORY_ONLY"
    ? new Date(Math.max(now.getTime(), job.expiresAt.getTime()))
    : now;
  const outbox = createProjectRenderSourceCleanupOutboxV1({
    binding: job.projectRenderSnapshotBinding!,
    ...providerOutput,
    now: job.artifactInvalidatedAt,
    availableAt,
  });
  await enqueueProjectRenderSourceCleanupOutboxV1({
    outbox,
    collection: input.cleanupOutboxes,
    session: input.session,
  });
  const linked = await input.renderJobs.updateOne(
    {
      _id: job._id,
      artifactState: job.artifactState,
      "artifactCleanup.state": "PENDING",
      "projectRenderSnapshotInvalidation.invalidationId": input.receipt.receiptId,
      projectRenderSourceCleanupOutboxId: { $exists: false },
    },
    { $set: { projectRenderSourceCleanupOutboxId: outbox._id } },
    { session: input.session },
  );
  if (linked.matchedCount !== 1) {
    const latest = await input.renderJobs.findOne({ _id: job._id }, { session: input.session });
    if (latest?.projectRenderSourceCleanupOutboxId !== outbox._id) {
      fail("HANDOFF_LINK_WRITE_UNPROVED");
    }
  }
  return {
    jobId: job._id,
    disposition: "CLEANUP_HANDOFF_CREATED",
    cleanupOutboxId: outbox._id,
    retainedUntil: availableAt.toISOString(),
  };
}
