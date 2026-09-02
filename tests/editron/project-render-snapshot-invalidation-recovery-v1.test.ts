import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(),
}));

import {
  handleProjectRenderSnapshotInvalidationRecoveryCronV1,
} from "@/app/api/cron/recover-editron-project-render-invalidations/route";
import {
  sweepProjectRenderSnapshotInvalidationRecoveryV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-recovery-v1";
import {
  activateProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationReceiptV1,
  projectRenderSnapshotInvalidationLinkV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";

const REPO_ROOT = resolve(__dirname, "../..");
const NOW = new Date("2026-09-02T00:01:00.000Z");

function outbox(sequence: number): ProjectRenderSnapshotInvalidationOutboxV1 {
  return createProjectRenderSnapshotInvalidationOutboxV1(
    createProjectRenderSnapshotInvalidationReceiptV1({
      ownerId: "owner-1",
      projectId: "project-1",
      operation: "REPLACE_EDITOR_STATE",
      beforeRevision: {
        schemaVersion: 1,
        value: sequence,
        compatibilityUpdatedAt: `2026-09-02T00:00:0${sequence}.000Z`,
      },
      afterRevision: {
        schemaVersion: 1,
        value: sequence + 1,
        compatibilityUpdatedAt: `2026-09-02T00:00:0${sequence + 1}.000Z`,
      },
      issuedAt: new Date(`2026-09-02T00:00:0${sequence + 1}.000Z`),
    }),
  );
}

class RecoveryOutboxes {
  readonly documents = [outbox(1), outbox(3), outbox(5)];
  observedLimit = 0;
  observedFilter: Record<string, unknown> | undefined;

  find(filter: Record<string, unknown>) {
    this.observedFilter = filter;
    return {
      sort: () => ({
        limit: (limit: number) => ({
          toArray: async () => {
            this.observedLimit = limit;
            return this.documents.slice(0, limit);
          },
        }),
      }),
    };
  }

  async findOne(filter: Record<string, unknown>) {
    return this.documents.find((item) => item.outboxId === filter._id) ?? null;
  }

  async insertOne() {
    return { acknowledged: true };
  }

  async replaceOne() {
    return { matchedCount: 1 };
  }
}

describe("project render snapshot invalidation recovery V1", () => {
  it("bounds the sweep and reports terminal, pending, and per-item errors", async () => {
    const collection = new RecoveryOutboxes();
    const runWorker = vi.fn(async ({ outboxId }: { outboxId: string; now: Date }) => {
      const stored = collection.documents.find((item) => item.outboxId === outboxId)!;
      if (outboxId === collection.documents[2]!.outboxId) throw new Error("provider detail");
      const active = activateProjectRenderSnapshotInvalidationOutboxV1({
        outbox: stored,
        committedLink: projectRenderSnapshotInvalidationLinkV1(stored.receipt),
        now: NOW,
      });
      return {
        status: outboxId === collection.documents[0]!.outboxId ? "MATERIALIZED" as const : "PENDING" as const,
        outbox: active,
        commitLinkFound: true,
        renderFence: outboxId === collection.documents[1]!.outboxId
          ? {
              fences: [],
              fencedArtifactIds: [],
              unresolvedArtifactIds: ["legacy-render"],
              resolvedDerivativeClasses: [],
            }
          : null,
      };
    });
    const result = await sweepProjectRenderSnapshotInvalidationRecoveryV1({
      limit: 3,
      now: NOW,
      outboxCollection: collection,
      runWorker,
    });

    expect(collection.observedLimit).toBe(3);
    expect(collection.observedFilter).toEqual({
      status: { $in: ["AWAITING_PROJECT_COMMIT", "PENDING"] },
    });
    expect(result).toMatchObject({
      scanned: 3,
      materialized: 1,
      pending: 1,
      errors: 1,
    });
    expect(result.results[1]?.unresolvedArtifactIds).toEqual(["legacy-render"]);
    expect(result.results[2]?.errorCode)
      .toBe("PROJECT_SNAPSHOT_INVALIDATION_RECOVERY_ITEM_FAILED");
    await expect(sweepProjectRenderSnapshotInvalidationRecoveryV1({
      limit: 11,
      outboxCollection: collection,
      runWorker,
    })).rejects.toThrow("PROJECT_SNAPSHOT_INVALIDATION_RECOVERY_LIMIT_INVALID");
  });

  it("protects the cron, preserves incomplete work, and registers production wiring", async () => {
    vi.stubEnv("CRON_SECRET", "snapshot-secret");
    const runner = vi.fn(async () => ({
      invalidation: {
        scanned: 1,
        awaitingCommit: 0,
        pending: 1,
        materialized: 0,
        abandoned: 0,
        errors: 0,
        results: [],
      },
      cleanup: {
        candidates: 0,
        handoffCreated: 0,
        handoffPending: 0,
        cleanupDone: 0,
        providerOutcomeUnresolved: 0,
        chapterOwnerRequired: 0,
        errors: 0,
        results: [],
      },
      prerequisiteRetention: {
        scanned: 1,
        pinned: 1,
        quarantined: 0,
        recovered: 0,
        errors: 0,
        results: [],
      },
    }));
    const request = (token?: string) => new Request("https://editron.example.test/api/cron/recover", {
      headers: token ? { authorization: token } : undefined,
    });
    const response = await handleProjectRenderSnapshotInvalidationRecoveryCronV1(
      request("Bearer snapshot-secret"),
      runner,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      recoveryRequired: true,
    });
    expect(runner).toHaveBeenCalledWith({ limit: 5 });

    const retentionFailureRunner = vi.fn(async () => ({
      ...(await runner()),
      prerequisiteRetention: {
        scanned: 1,
        pinned: 0,
        quarantined: 0,
        recovered: 0,
        errors: 1,
        results: [],
      },
    }));
    const failureResponse = await handleProjectRenderSnapshotInvalidationRecoveryCronV1(
      request("Bearer snapshot-secret"),
      retentionFailureRunner,
    );
    expect(failureResponse.status).toBe(503);
    await expect(failureResponse.json()).resolves.toMatchObject({ success: false });
    await expect(handleProjectRenderSnapshotInvalidationRecoveryCronV1(
      request("Bearer wrong"),
      runner,
    )).resolves.toMatchObject({ status: 401 });
    vi.stubEnv("CRON_SECRET", "");
    await expect(handleProjectRenderSnapshotInvalidationRecoveryCronV1(
      request("Bearer snapshot-secret"),
      runner,
    )).resolves.toMatchObject({ status: 503 });

    const vercel = JSON.parse(readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/recover-editron-project-render-invalidations",
      schedule: "* * * * *",
    });
    const mongo = readFileSync(resolve(REPO_ROOT, "lib/editron/db/mongodb.ts"), "utf8");
    expect(mongo).toContain("project_render_snapshot_invalidation_recovery_v1");
    expect(mongo).toContain("project_render_snapshot_cleanup_recovery_v1");
    expect(mongo).toContain("project_whole_state_media_prerequisite_retention_due_v1");
    expect(mongo).toContain("project_whole_state_media_prerequisite_legacy_created_v1");
    expect(mongo).toContain("project_whole_state_media_prerequisite_retention_ttl_v1");
    expect(mongo).toContain("expireAfterSeconds: 0");
  });
});
