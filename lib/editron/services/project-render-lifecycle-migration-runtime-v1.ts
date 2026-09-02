import { getDatabase } from "../db/mongodb";
import {
  migrateProjectRenderLifecycleV1,
  type ProjectRenderLifecycleMigrationDocumentV1,
  type ProjectRenderLifecycleMigrationResultV1,
} from "./project-render-lifecycle-migration-v1";
import { PROJECT_RENDER_JOBS_COLLECTION_V1 } from "./render-job-service";

const MAX_BATCH_SIZE_V1 = 25;

export interface ProjectRenderLifecycleMigrationBatchStoreV1 {
  listCandidateIds(limit: number): Promise<string[]>;
  migrate(jobId: string, now: Date): Promise<ProjectRenderLifecycleMigrationResultV1>;
}

export interface ProjectRenderLifecycleMigrationBatchResultV1 {
  candidates: number;
  migrated: number;
  blocked: number;
  alreadyAssessed: number;
  missing: number;
  failed: number;
  results: Array<{
    jobId: string;
    state: "MIGRATED" | "BLOCKED" | "ALREADY_MIGRATED" | "ALREADY_ASSESSED" | "NOT_FOUND" | "FAILED";
  }>;
}

function boundedLimitV1(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_BATCH_SIZE_V1) {
    throw new Error("PROJECT_RENDER_LIFECYCLE_MIGRATION_BATCH_SIZE_INVALID");
  }
  return value;
}

function validDateV1(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

async function mongoStoreV1(): Promise<ProjectRenderLifecycleMigrationBatchStoreV1> {
  const db = await getDatabase();
  const jobs = db.collection<ProjectRenderLifecycleMigrationDocumentV1>(
    PROJECT_RENDER_JOBS_COLLECTION_V1,
  );
  return {
    async listCandidateIds(limit) {
      const rows = await jobs.find({
        status: { $in: ["pending", "queued", "rendering", "finalizing"] },
        artifactState: { $exists: false },
        projectRenderLifecycleMigration: { $exists: false },
      }).sort({ startedAt: 1, _id: 1 }).limit(limit)
        .project<{ _id: string }>({ _id: 1 }).toArray();
      return rows.map((row) => row._id);
    },
    async migrate(jobId, now) {
      return migrateProjectRenderLifecycleV1({
        jobId,
        collection: jobs,
        projectRevisionReader: async (ownerId, projectId) => {
          const { projectService } = await import("./project-service");
          return projectService.getProjectRevision(ownerId, projectId);
        },
        now,
      });
    },
  };
}

export async function runProjectRenderLifecycleMigrationBatchV1(input: {
  store?: ProjectRenderLifecycleMigrationBatchStoreV1;
  limit?: number;
  now?: Date;
} = {}): Promise<ProjectRenderLifecycleMigrationBatchResultV1> {
  const limit = boundedLimitV1(input.limit);
  const now = input.now ?? new Date();
  if (!validDateV1(now)) throw new Error("PROJECT_RENDER_LIFECYCLE_MIGRATION_TIME_INVALID");
  const store = input.store ?? await mongoStoreV1();
  const ids = await store.listCandidateIds(limit);
  if (ids.length > limit || new Set(ids).size !== ids.length) {
    throw new Error("PROJECT_RENDER_LIFECYCLE_MIGRATION_CANDIDATES_INVALID");
  }
  const result: ProjectRenderLifecycleMigrationBatchResultV1 = {
    candidates: ids.length,
    migrated: 0,
    blocked: 0,
    alreadyAssessed: 0,
    missing: 0,
    failed: 0,
    results: [],
  };
  for (const jobId of ids) {
    try {
      const outcome = await store.migrate(jobId, now);
      result.results.push({ jobId, state: outcome.status });
      if (outcome.status === "MIGRATED") result.migrated += 1;
      else if (outcome.status === "BLOCKED") result.blocked += 1;
      else if (outcome.status === "ALREADY_MIGRATED" || outcome.status === "ALREADY_ASSESSED") {
        result.alreadyAssessed += 1;
      } else result.missing += 1;
    } catch {
      result.failed += 1;
      result.results.push({ jobId, state: "FAILED" });
    }
  }
  return result;
}
