import { COLLECTIONS, getDatabase } from "../db/mongodb";
import type { RenderJob } from "../schemas/render-job";
import {
  PROJECT_DELETION_TOMBSTONES_COLLECTION_V1,
} from "./project-deletion-v1";
import {
  PROJECT_RENDER_JOBS_COLLECTION_V1,
} from "./render-job-service";
import {
  PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
  assertProjectRenderSnapshotInvalidationOutboxV1,
  type ProjectRenderSnapshotInvalidationOutboxCollectionV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "./project-render-snapshot-invalidation-v1";
import {
  runProjectRenderSnapshotInvalidationWorkerV1,
  type ProjectRenderSnapshotInvalidationDeletionTombstoneCollectionV1,
  type ProjectRenderSnapshotInvalidationProjectCollectionV1,
  type ProjectRenderSnapshotInvalidationWorkerResultV1,
} from "./project-render-snapshot-invalidation-worker-v1";

export const MAX_PROJECT_RENDER_SNAPSHOT_INVALIDATION_RECOVERY_BATCH_V1 = 10;
export const DEFAULT_PROJECT_RENDER_SNAPSHOT_INVALIDATION_RECOVERY_BATCH_V1 = 5;

export interface ProjectRenderSnapshotInvalidationRecoveryCollectionV1
  extends ProjectRenderSnapshotInvalidationOutboxCollectionV1 {
  find(filter: Record<string, unknown>): {
    sort(sort: Record<string, 1 | -1>): {
      limit(limit: number): {
        toArray(): Promise<ProjectRenderSnapshotInvalidationOutboxV1[]>;
      };
    };
  };
}

export interface ProjectRenderSnapshotInvalidationRecoveryItemV1 {
  outboxId: string;
  disposition: ProjectRenderSnapshotInvalidationOutboxV1["status"] | "ERROR";
  commitLinkFound?: boolean;
  unresolvedArtifactIds?: string[];
  errorCode?: string;
}

export interface ProjectRenderSnapshotInvalidationRecoveryResultV1 {
  scanned: number;
  awaitingCommit: number;
  pending: number;
  materialized: number;
  abandoned: number;
  errors: number;
  results: ProjectRenderSnapshotInvalidationRecoveryItemV1[];
}

type RecoveryWorkerV1 = (input: {
  outboxId: string;
  now: Date;
}) => Promise<ProjectRenderSnapshotInvalidationWorkerResultV1>;

function recoveryLimitV1(limit: number | undefined): number {
  const resolved = limit ?? DEFAULT_PROJECT_RENDER_SNAPSHOT_INVALIDATION_RECOVERY_BATCH_V1;
  if (
    !Number.isSafeInteger(resolved)
    || resolved <= 0
    || resolved > MAX_PROJECT_RENDER_SNAPSHOT_INVALIDATION_RECOVERY_BATCH_V1
  ) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_RECOVERY_LIMIT_INVALID");
  }
  return resolved;
}

function boundedErrorCodeV1(error: unknown): string {
  if (!(error instanceof Error) || !error.message.startsWith("PROJECT_SNAPSHOT_INVALIDATION")) {
    return "PROJECT_SNAPSHOT_INVALIDATION_RECOVERY_ITEM_FAILED";
  }
  return error.message.slice(0, 200);
}

export async function sweepProjectRenderSnapshotInvalidationRecoveryV1(input: {
  limit?: number;
  now?: Date;
  outboxCollection?: ProjectRenderSnapshotInvalidationRecoveryCollectionV1;
  runWorker?: RecoveryWorkerV1;
} = {}): Promise<ProjectRenderSnapshotInvalidationRecoveryResultV1> {
  const limit = recoveryLimitV1(input.limit);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_RECOVERY_TIME_INVALID");
  }
  const needsDatabase = !input.outboxCollection || !input.runWorker;
  const db = needsDatabase ? await getDatabase() : undefined;
  const outboxCollection = input.outboxCollection ?? db!.collection(
    PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
  ) as unknown as ProjectRenderSnapshotInvalidationRecoveryCollectionV1;
  const runWorker = input.runWorker ?? (async ({ outboxId, now: workerNow }) => (
    runProjectRenderSnapshotInvalidationWorkerV1({
      outboxId,
      outboxCollection,
      projectCollection: db!.collection(COLLECTIONS.PROJECTS) as unknown as
        ProjectRenderSnapshotInvalidationProjectCollectionV1,
      deletionTombstoneCollection: db!.collection(
        PROJECT_DELETION_TOMBSTONES_COLLECTION_V1,
      ) as unknown as ProjectRenderSnapshotInvalidationDeletionTombstoneCollectionV1,
      renderJobCollection: db!.collection<RenderJob>(PROJECT_RENDER_JOBS_COLLECTION_V1),
      now: workerNow,
    })
  ));
  const candidates = await outboxCollection.find({
    status: { $in: ["AWAITING_PROJECT_COMMIT", "PENDING"] },
  }).sort({ updatedAt: 1, createdAt: 1, _id: 1 }).limit(limit).toArray();
  const result: ProjectRenderSnapshotInvalidationRecoveryResultV1 = {
    scanned: candidates.length,
    awaitingCommit: 0,
    pending: 0,
    materialized: 0,
    abandoned: 0,
    errors: 0,
    results: [],
  };

  for (const candidate of candidates) {
    try {
      assertProjectRenderSnapshotInvalidationOutboxV1(candidate);
      const advanced = await runWorker({ outboxId: candidate.outboxId, now });
      if (advanced.status === "AWAITING_PROJECT_COMMIT") result.awaitingCommit += 1;
      if (advanced.status === "PENDING") result.pending += 1;
      if (advanced.status === "MATERIALIZED") result.materialized += 1;
      if (advanced.status === "ABANDONED") result.abandoned += 1;
      result.results.push({
        outboxId: candidate.outboxId,
        disposition: advanced.status,
        commitLinkFound: advanced.commitLinkFound,
        ...(advanced.renderFence?.unresolvedArtifactIds.length
          ? { unresolvedArtifactIds: [...advanced.renderFence.unresolvedArtifactIds] }
          : {}),
      });
    } catch (error) {
      result.errors += 1;
      result.results.push({
        outboxId: typeof candidate?.outboxId === "string"
          ? candidate.outboxId.slice(0, 200)
          : "INVALID_OUTBOX",
        disposition: "ERROR",
        errorCode: boundedErrorCodeV1(error),
      });
    }
  }
  return result;
}
