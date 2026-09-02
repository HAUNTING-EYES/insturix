import type { Collection, MongoClient } from "mongodb";

import { connectToDatabase } from "../db/mongodb";
import { RenderJobSchema, type RenderJob } from "../schemas/render-job";
import {
  materializeProjectRenderSnapshotInvalidationCleanupV1,
  type ProjectRenderSnapshotCleanupResultV1,
} from "./project-render-snapshot-invalidation-cleanup-v1";
import {
  sweepProjectRenderSnapshotInvalidationRecoveryV1,
  type ProjectRenderSnapshotInvalidationRecoveryResultV1,
} from "./project-render-snapshot-invalidation-recovery-v1";
import {
  PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
  assertProjectRenderSnapshotInvalidationOutboxV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "./project-render-snapshot-invalidation-v1";
import {
  PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "./project-render-source-cleanup-v1";
import { PROJECT_RENDER_JOBS_COLLECTION_V1 } from "./render-job-service";

export const MAX_PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_BATCH_V1 = 10;
export const DEFAULT_PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_BATCH_V1 = 5;

export interface ProjectRenderSnapshotCleanupRecoveryStoreV1 {
  listActionableJobIds(limit: number): Promise<string[]>;
  materialize(
    jobId: string,
    now: Date,
  ): Promise<ProjectRenderSnapshotCleanupResultV1>;
}

export interface ProjectRenderSnapshotCleanupRecoveryResultV1 {
  candidates: number;
  handoffCreated: number;
  handoffPending: number;
  cleanupDone: number;
  providerOutcomeUnresolved: number;
  chapterOwnerRequired: number;
  errors: number;
  results: Array<
    ProjectRenderSnapshotCleanupResultV1
    | { jobId: string; disposition: "ERROR"; errorCode: string }
  >;
}

export interface ProjectRenderSnapshotRecoveryCycleResultV1 {
  invalidation: ProjectRenderSnapshotInvalidationRecoveryResultV1;
  cleanup: ProjectRenderSnapshotCleanupRecoveryResultV1;
}

function recoveryLimitV1(limit: number | undefined): number {
  const resolved = limit ?? DEFAULT_PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_BATCH_V1;
  if (
    !Number.isSafeInteger(resolved)
    || resolved <= 0
    || resolved > MAX_PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_BATCH_V1
  ) {
    throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_LIMIT_INVALID");
  }
  return resolved;
}

function boundedErrorCodeV1(error: unknown): string {
  if (
    !(error instanceof Error)
    || !error.message.startsWith("PROJECT_RENDER_SNAPSHOT_CLEANUP_")
  ) {
    return "PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_ITEM_FAILED";
  }
  return error.message.slice(0, 200);
}

export function createProjectRenderSnapshotCleanupRecoveryMongoStoreV1(input: {
  client: Pick<MongoClient, "startSession">;
  renderJobs: Collection<RenderJob>;
  invalidationOutboxes: Collection<ProjectRenderSnapshotInvalidationOutboxV1>;
  cleanupOutboxes: Collection<ProjectRenderSourceCleanupOutboxV1>;
}): ProjectRenderSnapshotCleanupRecoveryStoreV1 {
  return {
    async listActionableJobIds(limit) {
      const rows = await input.renderJobs.aggregate<{ _id: string }>([
        {
          $match: {
            projectRenderSnapshotBinding: { $exists: true },
            projectRenderSnapshotInvalidation: { $exists: true },
            artifactState: { $in: ["STALE", "HISTORY_ONLY"] },
            "artifactCleanup.state": "PENDING",
            chapterOrchestration: { $exists: false },
          },
        },
        {
          $lookup: {
            from: PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
            localField: "projectRenderSourceCleanupOutboxId",
            foreignField: "_id",
            as: "completedSourceCleanup",
          },
        },
        {
          $match: {
            $or: [
              {
                projectRenderSourceCleanupOutboxId: { $exists: false },
                $or: [
                  {
                    "dispatch.phase": "NOT_ATTEMPTED",
                    providerRenderId: { $exists: false },
                    bucketName: { $exists: false },
                    finalization: { $exists: false },
                  },
                  {
                    providerRenderId: { $exists: true },
                    bucketName: { $exists: true },
                    finalization: { $exists: true },
                  },
                ],
              },
              {
                projectRenderSourceCleanupOutboxId: { $exists: true },
                completedSourceCleanup: { $elemMatch: { status: "DONE" } },
              },
            ],
          },
        },
        { $sort: { artifactInvalidatedAt: 1, _id: 1 } },
        { $limit: limit },
        { $project: { _id: 1 } },
      ]).toArray();
      const ids = rows.map((row) => row._id);
      if (
        ids.length > limit
        || new Set(ids).size !== ids.length
        || ids.some((id) => typeof id !== "string" || id.length < 1 || id.length > 500)
      ) {
        throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_CANDIDATES_INVALID");
      }
      return ids;
    },
    async materialize(jobId, now) {
      const session = input.client.startSession();
      try {
        const result = await session.withTransaction(async () => {
          const storedJob = await input.renderJobs.findOne({ _id: jobId }, { session });
          const parsedJob = RenderJobSchema.safeParse(storedJob);
          if (!parsedJob.success) {
            throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_JOB_INVALID");
          }
          const invalidation = parsedJob.data.projectRenderSnapshotInvalidation;
          if (!invalidation) {
            throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_LINK_MISSING");
          }
          const outbox = await input.invalidationOutboxes.findOne(
            { _id: invalidation.invalidationId },
            { session },
          );
          assertProjectRenderSnapshotInvalidationOutboxV1(outbox);
          if (
            outbox.outboxId !== invalidation.invalidationId
            || outbox.receipt.receiptHash !== invalidation.receiptHash
            || (outbox.status !== "PENDING" && outbox.status !== "MATERIALIZED")
          ) {
            throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_OUTBOX_MISMATCH");
          }
          return materializeProjectRenderSnapshotInvalidationCleanupV1({
            receipt: outbox.receipt,
            jobId,
            renderJobs: input.renderJobs,
            cleanupOutboxes: input.cleanupOutboxes,
            session,
            now,
          });
        }, {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        });
        if (!result) {
          throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_TRANSACTION_UNPROVED");
        }
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

async function mongoStoreV1(): Promise<ProjectRenderSnapshotCleanupRecoveryStoreV1> {
  const { client, db } = await connectToDatabase();
  return createProjectRenderSnapshotCleanupRecoveryMongoStoreV1({
    client,
    renderJobs: db.collection<RenderJob>(PROJECT_RENDER_JOBS_COLLECTION_V1),
    invalidationOutboxes: db.collection<ProjectRenderSnapshotInvalidationOutboxV1>(
      PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
    ),
    cleanupOutboxes: db.collection<ProjectRenderSourceCleanupOutboxV1>(
      PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
    ),
  });
}

export async function runProjectRenderSnapshotCleanupRecoveryV1(input: {
  store?: ProjectRenderSnapshotCleanupRecoveryStoreV1;
  limit?: number;
  now?: Date;
} = {}): Promise<ProjectRenderSnapshotCleanupRecoveryResultV1> {
  const limit = recoveryLimitV1(input.limit);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_TIME_INVALID");
  }
  const store = input.store ?? await mongoStoreV1();
  const jobIds = await store.listActionableJobIds(limit);
  if (jobIds.length > limit || new Set(jobIds).size !== jobIds.length) {
    throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_CANDIDATES_INVALID");
  }
  const result: ProjectRenderSnapshotCleanupRecoveryResultV1 = {
    candidates: jobIds.length,
    handoffCreated: 0,
    handoffPending: 0,
    cleanupDone: 0,
    providerOutcomeUnresolved: 0,
    chapterOwnerRequired: 0,
    errors: 0,
    results: [],
  };
  for (const jobId of jobIds) {
    try {
      const item = await store.materialize(jobId, now);
      if (item.disposition === "CLEANUP_HANDOFF_CREATED") result.handoffCreated += 1;
      if (item.disposition === "CLEANUP_HANDOFF_PENDING") result.handoffPending += 1;
      if (item.disposition === "CLEANUP_DONE") result.cleanupDone += 1;
      if (item.disposition === "PROVIDER_OUTCOME_UNRESOLVED") {
        result.providerOutcomeUnresolved += 1;
      }
      if (item.disposition === "CHAPTER_OWNER_REQUIRED") result.chapterOwnerRequired += 1;
      result.results.push(item);
    } catch (error) {
      result.errors += 1;
      result.results.push({
        jobId: typeof jobId === "string" ? jobId.slice(0, 500) : "INVALID_JOB",
        disposition: "ERROR",
        errorCode: boundedErrorCodeV1(error),
      });
    }
  }
  return result;
}

export async function runProjectRenderSnapshotRecoveryCycleV1(input: {
  limit?: number;
  now?: Date;
  runInvalidation?: typeof sweepProjectRenderSnapshotInvalidationRecoveryV1;
  runCleanup?: typeof runProjectRenderSnapshotCleanupRecoveryV1;
} = {}): Promise<ProjectRenderSnapshotRecoveryCycleResultV1> {
  const limit = recoveryLimitV1(input.limit);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_TIME_INVALID");
  }
  const invalidation = await (input.runInvalidation
    ?? sweepProjectRenderSnapshotInvalidationRecoveryV1)({ limit, now });
  const cleanup = await (input.runCleanup ?? runProjectRenderSnapshotCleanupRecoveryV1)({
    limit,
    now,
  });
  return { invalidation, cleanup };
}
