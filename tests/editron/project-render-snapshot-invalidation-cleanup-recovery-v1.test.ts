import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({
  connectToDatabase: vi.fn(),
  getDatabase: vi.fn(),
}));

import {
  createProjectRenderSnapshotCleanupRecoveryMongoStoreV1,
  runProjectRenderSnapshotCleanupRecoveryV1,
  runProjectRenderSnapshotRecoveryCycleV1,
  type ProjectRenderSnapshotCleanupRecoveryStoreV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-cleanup-recovery-v1";
import type { ProjectRenderSnapshotCleanupResultV1 } from "@/lib/editron/services/project-render-snapshot-invalidation-cleanup-v1";

const NOW = new Date("2026-09-02T02:00:00.000Z");

class MemoryCleanupRecoveryStore implements ProjectRenderSnapshotCleanupRecoveryStoreV1 {
  readonly ids = ["render-a", "render-b", "render-c", "render-d"];

  async listActionableJobIds(limit: number): Promise<string[]> {
    return this.ids.slice(0, limit);
  }

  async materialize(jobId: string): Promise<ProjectRenderSnapshotCleanupResultV1> {
    if (jobId === "render-d") throw new Error("provider credentials leaked");
    if (jobId === "render-a") {
      return { jobId, disposition: "CLEANUP_HANDOFF_CREATED", cleanupOutboxId: "cleanup-a" };
    }
    if (jobId === "render-b") {
      return { jobId, disposition: "CLEANUP_DONE", cleanupOutboxId: "cleanup-b" };
    }
    return { jobId, disposition: "PROVIDER_OUTCOME_UNRESOLVED" };
  }
}

describe("project render snapshot cleanup recovery V1", () => {
  it("selects only actionable handoffs and completed cleanup receipts", async () => {
    let pipeline: unknown[] = [];
    const aggregate = vi.fn((observed: unknown[]) => {
      pipeline = observed;
      return { toArray: async () => [{ _id: "render-a" }] };
    });
    const store = createProjectRenderSnapshotCleanupRecoveryMongoStoreV1({
      client: {} as never,
      renderJobs: { aggregate } as never,
      invalidationOutboxes: {} as never,
      cleanupOutboxes: {} as never,
    });
    await expect(store.listActionableJobIds(2)).resolves.toEqual(["render-a"]);
    const serialized = JSON.stringify(pipeline);
    expect(serialized).toContain('"chapterOrchestration":{"$exists":false}');
    expect(serialized).toContain('"dispatch.phase":"NOT_ATTEMPTED"');
    expect(serialized).toContain('"completedSourceCleanup":{"$elemMatch":{"status":"DONE"}}');
    expect(serialized).toContain('"$limit":2');
  });

  it("bounds actionable cleanup, preserves unresolved outcomes, and sanitizes failures", async () => {
    const result = await runProjectRenderSnapshotCleanupRecoveryV1({
      store: new MemoryCleanupRecoveryStore(),
      limit: 4,
      now: NOW,
    });
    expect(result).toMatchObject({
      candidates: 4,
      handoffCreated: 1,
      cleanupDone: 1,
      providerOutcomeUnresolved: 1,
      errors: 1,
    });
    expect(result.results[3]).toEqual({
      jobId: "render-d",
      disposition: "ERROR",
      errorCode: "PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_ITEM_FAILED",
    });
    await expect(runProjectRenderSnapshotCleanupRecoveryV1({
      store: new MemoryCleanupRecoveryStore(),
      limit: 11,
    })).rejects.toThrow("PROJECT_RENDER_SNAPSHOT_CLEANUP_RECOVERY_LIMIT_INVALID");
  });

  it("runs cleanup only after the invalidation worker sweep", async () => {
    const order: string[] = [];
    const runInvalidation = vi.fn(async () => {
      order.push("invalidation");
      return {
        scanned: 1,
        awaitingCommit: 0,
        pending: 0,
        materialized: 1,
        abandoned: 0,
        errors: 0,
        results: [],
      };
    });
    const runCleanup = vi.fn(async () => {
      order.push("cleanup");
      return {
        candidates: 1,
        handoffCreated: 1,
        handoffPending: 0,
        cleanupDone: 0,
        providerOutcomeUnresolved: 0,
        chapterOwnerRequired: 0,
        errors: 0,
        results: [],
      };
    });
    const runPrerequisiteRetention = vi.fn(async () => {
      order.push("retention");
      return {
        scanned: 1,
        pinned: 1,
        quarantined: 0,
        recovered: 0,
        errors: 0,
        results: [],
      };
    });
    const cycle = await runProjectRenderSnapshotRecoveryCycleV1({
      limit: 5,
      now: NOW,
      runInvalidation,
      runCleanup,
      runPrerequisiteRetention,
    });
    expect(order).toEqual(["invalidation", "cleanup", "retention"]);
    expect(cycle.invalidation.materialized).toBe(1);
    expect(cycle.cleanup.handoffCreated).toBe(1);
    expect(cycle.prerequisiteRetention.pinned).toBe(1);
    expect(runInvalidation).toHaveBeenCalledWith({ limit: 5, now: NOW });
    expect(runCleanup).toHaveBeenCalledWith({ limit: 5, now: NOW });
    expect(runPrerequisiteRetention).toHaveBeenCalledWith({ limit: 5, now: NOW });
  });
});
