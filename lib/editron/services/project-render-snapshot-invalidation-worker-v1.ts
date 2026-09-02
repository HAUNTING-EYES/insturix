import type { Collection } from "mongodb";

import type { RenderJob } from "../schemas/render-job";
import {
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
} from "./project-artifact-invalidation-v1";
import {
  fenceRenderJobsForProjectSnapshotInvalidationV1,
  type FencedRenderJobsForProjectSnapshotInvalidationV1,
} from "./render-job-service";
import {
  PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
  ProjectRenderSnapshotInvalidationLinkSchemaV1,
  activateProjectRenderSnapshotInvalidationOutboxV1,
  applyProjectRenderSnapshotInvalidationProgressV1,
  assertProjectRenderSnapshotInvalidationOutboxV1,
  replaceProjectRenderSnapshotInvalidationOutboxV1,
  type ProjectRenderSnapshotInvalidationLinkV1,
  type ProjectRenderSnapshotInvalidationOutboxCollectionV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "./project-render-snapshot-invalidation-v1";

const OUTBOX_ID = /^project-snapshot-invalidation_[a-f0-9]{64}$/;

export interface ProjectRenderSnapshotInvalidationProjectDocumentV1 {
  projectId: string;
  userId: string;
  timelineRangeChangeReceipts?: unknown;
}

export interface ProjectRenderSnapshotInvalidationProjectCollectionV1 {
  findOne(
    filter: Record<string, unknown>,
  ): Promise<ProjectRenderSnapshotInvalidationProjectDocumentV1 | null>;
}

export interface ProjectRenderSnapshotInvalidationWorkerInputV1 {
  outboxId: string;
  outboxCollection: ProjectRenderSnapshotInvalidationOutboxCollectionV1;
  projectCollection: ProjectRenderSnapshotInvalidationProjectCollectionV1;
  renderJobCollection: Collection<RenderJob>;
  now?: Date;
}

export interface ProjectRenderSnapshotInvalidationWorkerResultV1 {
  status: ProjectRenderSnapshotInvalidationOutboxV1["status"];
  outbox: ProjectRenderSnapshotInvalidationOutboxV1;
  commitLinkFound: boolean;
  renderFence: FencedRenderJobsForProjectSnapshotInvalidationV1 | null;
}

function fail(code: string): never {
  throw new Error(`PROJECT_SNAPSHOT_INVALIDATION_WORKER_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function committedLinkFromProjectV1(
  project: ProjectRenderSnapshotInvalidationProjectDocumentV1 | null,
  outbox: ProjectRenderSnapshotInvalidationOutboxV1,
): ProjectRenderSnapshotInvalidationLinkV1 | undefined {
  if (!project) return undefined;
  if (
    project.projectId !== outbox.receipt.projectId
    || project.userId !== outbox.receipt.ownerId
  ) {
    fail("PROJECT_SCOPE_MISMATCH");
  }
  if (project.timelineRangeChangeReceipts === undefined) return undefined;
  if (!Array.isArray(project.timelineRangeChangeReceipts)) {
    fail("PROJECT_TIMELINE_HISTORY_INVALID");
  }

  const matches: ProjectRenderSnapshotInvalidationLinkV1[] = [];
  for (const receipt of project.timelineRangeChangeReceipts) {
    if (!isRecord(receipt) || receipt.projectId !== outbox.receipt.projectId) continue;
    const downstream = receipt.downstreamInvalidation;
    if (!isRecord(downstream)) continue;
    const candidate = downstream.projectRenderSnapshotInvalidation;
    if (!isRecord(candidate) || candidate.invalidationId !== outbox.outboxId) continue;
    const parsed = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(candidate);
    if (!parsed.success) fail("COMMIT_LINK_INVALID");
    const beforeRevision = ProjectArtifactProjectRevisionSchema.safeParse(
      receipt.beforeProjectRevision,
    );
    const afterRevision = ProjectArtifactProjectRevisionSchema.safeParse(
      receipt.afterProjectRevision,
    );
    if (
      downstream.status !== "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING"
      || receipt.operation !== outbox.receipt.operation
      || receipt.committedAt !== outbox.receipt.afterRevision.compatibilityUpdatedAt
      || !beforeRevision.success
      || !afterRevision.success
      || !sameProjectArtifactRevisionV1(
        beforeRevision.data,
        outbox.receipt.beforeRevision,
      )
      || !sameProjectArtifactRevisionV1(
        afterRevision.data,
        outbox.receipt.afterRevision,
      )
    ) {
      fail("COMMIT_RECEIPT_MISMATCH");
    }
    matches.push(parsed.data);
  }
  if (matches.length > 1) fail("COMMIT_LINK_NOT_UNIQUE");
  return matches[0];
}

async function persistTransitionOrReadWinnerV1(input: {
  expected: ProjectRenderSnapshotInvalidationOutboxV1;
  next: ProjectRenderSnapshotInvalidationOutboxV1;
  collection: ProjectRenderSnapshotInvalidationOutboxCollectionV1;
}): Promise<ProjectRenderSnapshotInvalidationOutboxV1> {
  try {
    return await replaceProjectRenderSnapshotInvalidationOutboxV1(input);
  } catch (error) {
    if (
      !(error instanceof Error)
      || error.message !== "PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_CONFLICT"
    ) {
      throw error;
    }
    const winner = await input.collection.findOne({ _id: input.expected.outboxId });
    if (!winner) fail("OUTBOX_MISSING_AFTER_CAS");
    assertProjectRenderSnapshotInvalidationOutboxV1(winner);
    if (winner.receipt.receiptHash !== input.expected.receipt.receiptHash) {
      fail("OUTBOX_SCOPE_CHANGED_AFTER_CAS");
    }
    return structuredClone(winner);
  }
}

/**
 * Advance one project-wide invalidation from inert admission to durable render
 * fencing. Queue transport and scheduling remain outside this owner.
 */
export async function runProjectRenderSnapshotInvalidationWorkerV1(
  input: ProjectRenderSnapshotInvalidationWorkerInputV1,
): Promise<ProjectRenderSnapshotInvalidationWorkerResultV1> {
  if (typeof input.outboxId !== "string" || !OUTBOX_ID.test(input.outboxId)) {
    fail("OUTBOX_ID_INVALID");
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) fail("TIME_INVALID");

  const stored = await input.outboxCollection.findOne({ _id: input.outboxId });
  if (!stored) fail("OUTBOX_NOT_FOUND");
  assertProjectRenderSnapshotInvalidationOutboxV1(stored);
  let current = structuredClone(stored);
  let commitLinkFound = current.status !== "AWAITING_PROJECT_COMMIT";

  if (current.status === "MATERIALIZED" || current.status === "ABANDONED") {
    return { status: current.status, outbox: current, commitLinkFound, renderFence: null };
  }

  if (current.status === "AWAITING_PROJECT_COMMIT") {
    const project = await input.projectCollection.findOne({
      projectId: current.receipt.projectId,
      userId: current.receipt.ownerId,
    });
    const committedLink = committedLinkFromProjectV1(project, current);
    commitLinkFound = committedLink !== undefined;
    const activated = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: current,
      ...(committedLink ? { committedLink } : {}),
      now,
    });
    if (activated.outboxHash === current.outboxHash) {
      return { status: current.status, outbox: current, commitLinkFound, renderFence: null };
    }
    current = await persistTransitionOrReadWinnerV1({
      expected: current,
      next: activated,
      collection: input.outboxCollection,
    });
    if (current.status === "MATERIALIZED" || current.status === "ABANDONED") {
      return { status: current.status, outbox: current, commitLinkFound, renderFence: null };
    }
    if (current.status !== "PENDING") fail("ACTIVATION_STATE_INVALID");
  }

  const renderFence = await fenceRenderJobsForProjectSnapshotInvalidationV1({
    receipt: current.receipt,
    now,
    collection: input.renderJobCollection,
  });
  const advanced = applyProjectRenderSnapshotInvalidationProgressV1({
    outbox: current,
    resolvedDerivativeClasses: renderFence.resolvedDerivativeClasses,
    now,
  });
  current = await persistTransitionOrReadWinnerV1({
    expected: current,
    next: advanced,
    collection: input.outboxCollection,
  });
  return { status: current.status, outbox: current, commitLinkFound, renderFence };
}

export const PROJECT_RENDER_SNAPSHOT_INVALIDATION_WORKER_COLLECTION_V1 =
  PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1;
