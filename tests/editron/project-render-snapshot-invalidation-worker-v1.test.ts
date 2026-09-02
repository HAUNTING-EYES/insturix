import type { Collection } from "mongodb";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(),
}));

import {
  createPendingRenderJob,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import {
  createProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  activateProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationReceiptV1,
  projectRenderSnapshotInvalidationLinkV1,
  type ProjectRenderSnapshotInvalidationOutboxCollectionV1,
  type ProjectRenderSnapshotInvalidationOutboxV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";
import {
  runProjectRenderSnapshotInvalidationWorkerV1,
  type ProjectRenderSnapshotInvalidationProjectDocumentV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-worker-v1";

const OWNER_ID = "worker-owner";
const PROJECT_ID = "worker-project";
const BEFORE = {
  schemaVersion: 1 as const,
  value: 4,
  compatibilityUpdatedAt: "2026-09-02T00:00:00.000Z",
};
const AFTER = {
  schemaVersion: 1 as const,
  value: 5,
  compatibilityUpdatedAt: "2026-09-02T00:01:00.000Z",
};
const NOW = new Date("2026-09-02T00:01:01.000Z");

function makeReceipt() {
  return createProjectRenderSnapshotInvalidationReceiptV1({
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    operation: "REPLACE_EDITOR_STATE",
    beforeRevision: BEFORE,
    afterRevision: AFTER,
    issuedAt: new Date(AFTER.compatibilityUpdatedAt),
  });
}

function projectWithLink(): ProjectRenderSnapshotInvalidationProjectDocumentV1 {
  const receipt = makeReceipt();
  return {
    projectId: PROJECT_ID,
    userId: OWNER_ID,
    timelineRangeChangeReceipts: [{
      projectId: PROJECT_ID,
      operation: "REPLACE_EDITOR_STATE",
      committedAt: AFTER.compatibilityUpdatedAt,
      beforeProjectRevision: BEFORE,
      afterProjectRevision: AFTER,
      downstreamInvalidation: {
        status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
        projectRenderSnapshotInvalidation: projectRenderSnapshotInvalidationLinkV1(receipt),
      },
    }],
  };
}

class MemoryOutboxes implements ProjectRenderSnapshotInvalidationOutboxCollectionV1 {
  current: ProjectRenderSnapshotInvalidationOutboxV1;
  conflictWinner?: ProjectRenderSnapshotInvalidationOutboxV1;

  constructor(outbox = createProjectRenderSnapshotInvalidationOutboxV1(makeReceipt())) {
    this.current = structuredClone(outbox);
  }

  async findOne(filter: Record<string, unknown>) {
    return filter._id === this.current.outboxId ? structuredClone(this.current) : null;
  }

  async insertOne(document: ProjectRenderSnapshotInvalidationOutboxV1) {
    this.current = structuredClone(document);
    return { acknowledged: true };
  }

  async replaceOne(
    filter: Record<string, unknown>,
    replacement: ProjectRenderSnapshotInvalidationOutboxV1,
  ) {
    if (this.conflictWinner) {
      this.current = structuredClone(this.conflictWinner);
      this.conflictWinner = undefined;
      return { matchedCount: 0 };
    }
    if (filter._id !== this.current.outboxId || filter.outboxHash !== this.current.outboxHash) {
      return { matchedCount: 0 };
    }
    this.current = structuredClone(replacement);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

function pathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (
    current && typeof current === "object"
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

function matches(value: unknown, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
      return (expected as Record<string, unknown>[]).some((entry) => matches(value, entry));
    }
    const actual = pathValue(value, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operator = expected as Record<string, unknown>;
      if ("$exists" in operator) return (actual !== undefined) === operator.$exists;
      if ("$in" in operator) return (operator.$in as unknown[]).includes(actual);
    }
    return actual === expected;
  });
}

class MemoryRenders {
  constructor(readonly documents: RenderJob[]) {}

  find(filter: Record<string, unknown>) {
    return { toArray: async () => this.documents.filter((job) => matches(job, filter)) };
  }

  async findOne(filter: Record<string, unknown>) {
    return this.documents.find((job) => matches(job, filter)) ?? null;
  }

  async updateOne(filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) {
    const job = this.documents.find((candidate) => matches(candidate, filter));
    if (!job) return { matchedCount: 0, modifiedCount: 0 };
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      const parts = path.split(".");
      let cursor = job as unknown as Record<string, unknown>;
      for (const part of parts.slice(0, -1)) {
        cursor[part] = (cursor[part] as Record<string, unknown> | undefined) ?? {};
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[parts.at(-1)!] = value;
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

function renderJob(kind: "RENDERED_PREVIEW" | "DELIVERY_PROOF", id: string): RenderJob {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: kind,
    artifactId: id,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: BEFORE,
    sequenceId: "sequence-1",
    compositionId: "composition-1",
    renderContract: { renderer: "remotion", codec: "h264" },
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSourceSnapshotHash: "a".repeat(64),
    containedVideoTargets: [],
  });
  return createPendingRenderJob(
    id,
    OWNER_ID,
    PROJECT_ID,
    "us-east-1",
    5_000,
    undefined,
    binding,
    OWNER_ID,
  );
}

function input(
  outboxes: MemoryOutboxes,
  renders: MemoryRenders,
  project: ProjectRenderSnapshotInvalidationProjectDocumentV1 | null,
  now = NOW,
) {
  return {
    outboxId: outboxes.current.outboxId,
    outboxCollection: outboxes,
    projectCollection: { findOne: async () => structuredClone(project) },
    renderJobCollection: renders as unknown as Collection<RenderJob>,
    now,
  };
}

describe("project render snapshot invalidation worker V1", () => {
  it("activates from the exact timeline link, fences both classes, and materializes", async () => {
    const outboxes = new MemoryOutboxes();
    const renders = new MemoryRenders([
      renderJob("RENDERED_PREVIEW", "preview-1"),
      renderJob("DELIVERY_PROOF", "delivery-1"),
    ]);
    const result = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(outboxes, renders, projectWithLink()),
    );

    expect(result).toMatchObject({ status: "MATERIALIZED", commitLinkFound: true });
    expect(result.renderFence?.resolvedDerivativeClasses).toEqual([
      "RENDERED_PREVIEW",
      "DELIVERY_PROOF",
    ]);
    expect(renders.documents.map((job) => job.artifactState)).toEqual(["STALE", "STALE"]);
    expect(outboxes.current.status).toBe("MATERIALIZED");
  });

  it("waits for a commit before expiry and abandons only after expiry", async () => {
    const waiting = new MemoryOutboxes();
    const renders = new MemoryRenders([]);
    const beforeExpiry = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(waiting, renders, null, new Date("2026-09-02T00:05:59.999Z")),
    );
    expect(beforeExpiry.status).toBe("AWAITING_PROJECT_COMMIT");
    expect(waiting.current.attempts).toBe(0);

    const abandoned = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(waiting, renders, null, new Date("2026-09-02T00:06:00.001Z")),
    );
    expect(abandoned.status).toBe("ABANDONED");
    expect(waiting.current.status).toBe("ABANDONED");
  });

  it("persists partial progress when a legacy render blocks both classes", async () => {
    const outboxes = new MemoryOutboxes();
    const legacy = createPendingRenderJob(
      "legacy-unbound",
      OWNER_ID,
      PROJECT_ID,
      "us-east-1",
      1_000,
    );
    const result = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(outboxes, new MemoryRenders([legacy]), projectWithLink()),
    );
    expect(result.status).toBe("PENDING");
    expect(result.renderFence?.unresolvedArtifactIds).toEqual(["legacy-unbound"]);
    expect(outboxes.current.pendingDerivativeClasses).toEqual([
      "RENDERED_PREVIEW",
      "DELIVERY_PROOF",
    ]);
  });

  it("rejects forged and duplicate matching commit links", async () => {
    const receipt = makeReceipt();
    const link = projectRenderSnapshotInvalidationLinkV1(receipt);
    const forged = projectWithLink();
    const entries = forged.timelineRangeChangeReceipts as Array<Record<string, unknown>>;
    entries[0] = {
      projectId: PROJECT_ID,
      operation: "REPLACE_EDITOR_STATE",
      committedAt: AFTER.compatibilityUpdatedAt,
      beforeProjectRevision: BEFORE,
      afterProjectRevision: AFTER,
      downstreamInvalidation: {
        status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
        projectRenderSnapshotInvalidation: { ...link, receiptHash: "f".repeat(64) },
      },
    };
    await expect(runProjectRenderSnapshotInvalidationWorkerV1(
      input(new MemoryOutboxes(), new MemoryRenders([]), forged),
    )).rejects.toThrow("PROJECT_SNAPSHOT_INVALIDATION_COMMIT_LINK_MISMATCH");

    const duplicate = projectWithLink();
    duplicate.timelineRangeChangeReceipts = [
      ...(duplicate.timelineRangeChangeReceipts as unknown[]),
      ...(duplicate.timelineRangeChangeReceipts as unknown[]),
    ];
    await expect(runProjectRenderSnapshotInvalidationWorkerV1(
      input(new MemoryOutboxes(), new MemoryRenders([]), duplicate),
    )).rejects.toThrow("PROJECT_SNAPSHOT_INVALIDATION_WORKER_COMMIT_LINK_NOT_UNIQUE");

    const wrongOperation = projectWithLink();
    (wrongOperation.timelineRangeChangeReceipts as Array<Record<string, unknown>>)[0]!.operation =
      "RESTORE_CHECKPOINT_STATE";
    await expect(runProjectRenderSnapshotInvalidationWorkerV1(
      input(new MemoryOutboxes(), new MemoryRenders([]), wrongOperation),
    )).rejects.toThrow("PROJECT_SNAPSHOT_INVALIDATION_WORKER_COMMIT_RECEIPT_MISMATCH");
  });

  it("continues from a concurrent worker's activation CAS winner", async () => {
    const outboxes = new MemoryOutboxes();
    outboxes.conflictWinner = activateProjectRenderSnapshotInvalidationOutboxV1({
      outbox: outboxes.current,
      committedLink: projectRenderSnapshotInvalidationLinkV1(makeReceipt()),
      now: NOW,
    });
    const result = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(outboxes, new MemoryRenders([]), projectWithLink()),
    );
    expect(result.status).toBe("MATERIALIZED");
    expect(outboxes.current.attempts).toBe(2);

    const replay = await runProjectRenderSnapshotInvalidationWorkerV1(
      input(outboxes, new MemoryRenders([]), null),
    );
    expect(replay.status).toBe("MATERIALIZED");
    expect(replay.renderFence).toBeNull();
  });
});
