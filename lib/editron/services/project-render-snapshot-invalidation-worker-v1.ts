import type { Collection } from "mongodb";

import type { RenderJob } from "../schemas/render-job";
import {
  assertProjectDeletionTombstoneV1,
  type ProjectDeletionTombstoneV1,
} from "./project-deletion-v1";
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
  audioRightsAttestationReceiptsV1?: unknown;
  autoEditAnalysisRunV1?: unknown;
}

export interface ProjectRenderSnapshotInvalidationProjectCollectionV1 {
  findOne(
    filter: Record<string, unknown>,
  ): Promise<ProjectRenderSnapshotInvalidationProjectDocumentV1 | null>;
}

export interface ProjectRenderSnapshotInvalidationDeletionTombstoneCollectionV1 {
  findOne(
    filter: Record<string, unknown>,
  ): Promise<ProjectDeletionTombstoneV1 | null>;
}

export interface ProjectRenderSnapshotInvalidationWorkerInputV1 {
  outboxId: string;
  outboxCollection: ProjectRenderSnapshotInvalidationOutboxCollectionV1;
  projectCollection: ProjectRenderSnapshotInvalidationProjectCollectionV1;
  deletionTombstoneCollection?:
    ProjectRenderSnapshotInvalidationDeletionTombstoneCollectionV1;
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

  const matches: ProjectRenderSnapshotInvalidationLinkV1[] = [];
  if (project.timelineRangeChangeReceipts !== undefined) {
    if (!Array.isArray(project.timelineRangeChangeReceipts)) {
      fail("PROJECT_TIMELINE_HISTORY_INVALID");
    }
    for (const receipt of project.timelineRangeChangeReceipts) {
      if (!isRecord(receipt) || receipt.projectId !== outbox.receipt.projectId) continue;
      const downstream = receipt.downstreamInvalidation;
      if (!isRecord(downstream)) continue;
      const candidate = downstream.projectRenderSnapshotInvalidation;
      if (!isRecord(candidate) || candidate.invalidationId !== outbox.outboxId) continue;
      const parsed = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(candidate);
      if (!parsed.success) fail("COMMIT_LINK_INVALID");
      assertCommittedReceiptBasisV1({
        operation: receipt.operation,
        committedAt: receipt.committedAt,
        beforeRevision: receipt.beforeProjectRevision,
        afterRevision: receipt.afterProjectRevision,
        outbox,
      });
      if (downstream.status !== "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING") {
        fail("COMMIT_RECEIPT_MISMATCH");
      }
      matches.push(parsed.data);
    }
  }

  if (project.audioRightsAttestationReceiptsV1 !== undefined) {
    if (!Array.isArray(project.audioRightsAttestationReceiptsV1)) {
      fail("PROJECT_AUDIO_RIGHTS_HISTORY_INVALID");
    }
    for (const receipt of project.audioRightsAttestationReceiptsV1) {
      if (!isRecord(receipt) || receipt.projectId !== outbox.receipt.projectId) continue;
      const candidate = receipt.projectRenderSnapshotInvalidation;
      if (!isRecord(candidate) || candidate.invalidationId !== outbox.outboxId) continue;
      const parsed = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(candidate);
      if (!parsed.success) fail("COMMIT_LINK_INVALID");
      if (
        outbox.receipt.operation !== "COMMIT_AUDIO_RIGHTS_ATTESTATION"
        || (receipt.kind !== "native-video" && receipt.kind !== "uploaded-export-audio")
      ) {
        fail("COMMIT_RECEIPT_MISMATCH");
      }
      assertCommittedReceiptBasisV1({
        operation: "COMMIT_AUDIO_RIGHTS_ATTESTATION",
        committedAt: receipt.committedAt,
        beforeRevision: receipt.beforeProjectRevision,
        afterRevision: receipt.afterProjectRevision,
        outbox,
      });
      matches.push(parsed.data);
    }
  }

  const analysisRun = project.autoEditAnalysisRunV1;
  if (isRecord(analysisRun)) {
    const candidate = analysisRun.phase1ProjectRenderSnapshotInvalidation;
    if (isRecord(candidate) && candidate.invalidationId === outbox.outboxId) {
      const parsed = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(candidate);
      if (!parsed.success) fail("COMMIT_LINK_INVALID");
      if (
        outbox.receipt.operation !== "COMMIT_ANALYSIS_NATIVE_AUDIO_EVIDENCE"
        || typeof analysisRun.phase1EvidenceHash !== "string"
        || !/^[a-f0-9]{64}$/.test(analysisRun.phase1EvidenceHash)
        || typeof analysisRun.sourceAssetId !== "string"
        || analysisRun.sourceAssetId.length === 0
        || analysisRun.phase1EvidenceCommittedAt
          !== outbox.receipt.afterRevision.compatibilityUpdatedAt
      ) {
        fail("COMMIT_RECEIPT_MISMATCH");
      }
      matches.push(parsed.data);
    }
  }
  if (matches.length > 1) fail("COMMIT_LINK_NOT_UNIQUE");
  return matches[0];
}

function assertCommittedReceiptBasisV1(input: {
  operation: unknown;
  committedAt: unknown;
  beforeRevision: unknown;
  afterRevision: unknown;
  outbox: ProjectRenderSnapshotInvalidationOutboxV1;
}): void {
  const beforeRevision = ProjectArtifactProjectRevisionSchema.safeParse(input.beforeRevision);
  const afterRevision = ProjectArtifactProjectRevisionSchema.safeParse(input.afterRevision);
  if (
    input.operation !== input.outbox.receipt.operation
    || input.committedAt !== input.outbox.receipt.afterRevision.compatibilityUpdatedAt
    || !beforeRevision.success
    || !afterRevision.success
    || !sameProjectArtifactRevisionV1(
      beforeRevision.data,
      input.outbox.receipt.beforeRevision,
    )
    || !sameProjectArtifactRevisionV1(
      afterRevision.data,
      input.outbox.receipt.afterRevision,
    )
  ) {
    fail("COMMIT_RECEIPT_MISMATCH");
  }
}

function committedLinkFromDeletionTombstoneV1(
  tombstone: ProjectDeletionTombstoneV1 | null,
  outbox: ProjectRenderSnapshotInvalidationOutboxV1,
): ProjectRenderSnapshotInvalidationLinkV1 | undefined {
  if (!tombstone) return undefined;
  assertProjectDeletionTombstoneV1(tombstone);
  if (
    outbox.receipt.operation !== "DELETE_PROJECT"
    || tombstone.operation !== "DELETE_PROJECT"
    || tombstone.ownerId !== outbox.receipt.ownerId
    || tombstone.projectId !== outbox.receipt.projectId
    || tombstone.deletedAt !== outbox.receipt.afterRevision.compatibilityUpdatedAt
    || !sameProjectArtifactRevisionV1(
      tombstone.beforeRevision,
      outbox.receipt.beforeRevision,
    )
    || !sameProjectArtifactRevisionV1(
      tombstone.afterRevision,
      outbox.receipt.afterRevision,
    )
    || tombstone.projectRenderSnapshotInvalidation.invalidationId !== outbox.outboxId
    || tombstone.projectRenderSnapshotInvalidation.receiptHash
      !== outbox.receipt.receiptHash
  ) fail("DELETION_TOMBSTONE_MISMATCH");
  return structuredClone(tombstone.projectRenderSnapshotInvalidation);
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
    const projectLink = committedLinkFromProjectV1(project, current);
    let deletionLink: ProjectRenderSnapshotInvalidationLinkV1 | undefined;
    if (current.receipt.operation === "DELETE_PROJECT") {
      if (!input.deletionTombstoneCollection) {
        fail("DELETION_TOMBSTONE_COLLECTION_REQUIRED");
      }
      const tombstone = await input.deletionTombstoneCollection.findOne({
        ownerId: current.receipt.ownerId,
        projectId: current.receipt.projectId,
        "projectRenderSnapshotInvalidation.invalidationId": current.outboxId,
      });
      deletionLink = committedLinkFromDeletionTombstoneV1(tombstone, current);
    }
    if (projectLink && deletionLink) fail("COMMIT_LINK_NOT_UNIQUE");
    const committedLink = projectLink ?? deletionLink;
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
