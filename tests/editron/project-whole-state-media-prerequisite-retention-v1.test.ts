import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import { createProjectWholeStateMediaPrerequisiteReceiptV1 } from "@/lib/editron/services/project-whole-state-media-prerequisite-contract-v1";
import {
  sweepProjectWholeStateMediaPrerequisiteRetentionV1,
  type ProjectWholeStateMediaPrerequisiteRetentionStateV1,
  type ProjectWholeStateMediaPrerequisiteRetentionStoreV1,
  type StoredProjectWholeStateMediaPrerequisiteV1,
} from "@/lib/editron/services/project-whole-state-media-prerequisite-retention-v1";

const NOW = new Date("2026-09-02T12:00:00.000Z");

function candidate(
  operation: "REPLACE_EDITOR_STATE" | "CAPTURE_CHECKPOINT_STATE",
  retention?: ProjectWholeStateMediaPrerequisiteRetentionStateV1,
): StoredProjectWholeStateMediaPrerequisiteV1 {
  const issuedAt = "2026-08-01T00:00:00.000Z";
  const receipt = createProjectWholeStateMediaPrerequisiteReceiptV1({
    operation,
    userId: "user_1",
    projectOwnerId: "user_1",
    orgId: null,
    projectId: "project_1",
    projectRevision: {
      schemaVersion: 1 as const,
      value: 4,
      compatibilityUpdatedAt: "2026-08-01T00:00:00.000Z",
    },
    mediaEntries: [],
    issuedAt,
  });
  return {
    _id: receipt.receiptSha256,
    receipt,
    createdAt: new Date(issuedAt),
    ...(retention ? { retention } : {}),
  };
}

class MemoryStore implements ProjectWholeStateMediaPrerequisiteRetentionStoreV1 {
  readonly candidates: StoredProjectWholeStateMediaPrerequisiteV1[];
  readonly referenced = new Set<string>();
  readonly recorded = new Map<string, ProjectWholeStateMediaPrerequisiteRetentionStateV1>();

  constructor(candidates: StoredProjectWholeStateMediaPrerequisiteV1[]) {
    this.candidates = candidates;
  }

  async listCandidates({ limit }: { limit: number }): Promise<StoredProjectWholeStateMediaPrerequisiteV1[]> {
    return this.candidates.slice(0, limit);
  }

  async hasAuthoritativeReference(receiptSha256: string): Promise<boolean> {
    return this.referenced.has(receiptSha256);
  }

  async recordRetention(input: {
    candidate: StoredProjectWholeStateMediaPrerequisiteV1;
    retention: ProjectWholeStateMediaPrerequisiteRetentionStateV1;
  }): Promise<void> {
    this.recorded.set(input.candidate._id, structuredClone(input.retention));
  }
}

describe("project whole-state media prerequisite retention V1", () => {
  it("pins referenced receipts and quarantines unreferenced receipts", async () => {
    const referenced = candidate("REPLACE_EDITOR_STATE");
    const orphaned = candidate("CAPTURE_CHECKPOINT_STATE");
    const store = new MemoryStore([referenced, orphaned]);
    store.referenced.add(referenced._id);

    const result = await sweepProjectWholeStateMediaPrerequisiteRetentionV1({
      store,
      now: NOW,
      limit: 2,
    });

    expect(result).toMatchObject({ scanned: 2, pinned: 1, quarantined: 1, errors: 0 });
    expect(store.recorded.get(referenced._id)).toMatchObject({ status: "PINNED" });
    expect(store.recorded.get(referenced._id)).not.toHaveProperty("expiresAt");
    expect(store.recorded.get(orphaned._id)).toMatchObject({
      status: "QUARANTINED",
      expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    });
  });

  it("rescues a quarantined receipt when its authoritative reference appears", async () => {
    const quarantined = candidate("REPLACE_EDITOR_STATE", {
      schemaVersion: 1,
      status: "QUARANTINED",
      checkedAt: new Date("2026-09-01T12:00:00.000Z"),
      nextCheckAt: NOW,
      expiresAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    const store = new MemoryStore([quarantined]);
    store.referenced.add(quarantined._id);

    const result = await sweepProjectWholeStateMediaPrerequisiteRetentionV1({
      store,
      now: NOW,
    });

    expect(result).toMatchObject({ recovered: 1, quarantined: 0, errors: 0 });
    expect(store.recorded.get(quarantined._id)).toMatchObject({ status: "PINNED" });
    expect(store.recorded.get(quarantined._id)).not.toHaveProperty("expiresAt");
  });

  it("contains malformed rows and rejects unbounded sweeps", async () => {
    const malformed = candidate("REPLACE_EDITOR_STATE");
    malformed._id = "f".repeat(64);
    const store = new MemoryStore([malformed]);
    const result = await sweepProjectWholeStateMediaPrerequisiteRetentionV1({
      store,
      now: NOW,
    });
    expect(result).toMatchObject({ scanned: 1, errors: 1, pinned: 0, quarantined: 0 });
    expect(store.recorded.size).toBe(0);
    await expect(sweepProjectWholeStateMediaPrerequisiteRetentionV1({
      store,
      limit: 26,
    })).rejects.toThrow("PROJECT_WHOLE_STATE_MEDIA_RETENTION_LIMIT_INVALID");
  });
});
