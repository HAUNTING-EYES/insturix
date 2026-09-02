import { describe, expect, it, vi } from "vitest";

import {
  assertProjectDeletionTombstoneV1,
  commitProjectDeletionV1,
} from "@/lib/editron/services/project-deletion-v1";
import {
  createProjectRenderSnapshotInvalidationReceiptV1,
  projectRenderSnapshotInvalidationLinkV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-v1";

const NOW = new Date("2026-09-02T05:00:00.000Z");
const BEFORE = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-09-02T04:59:00.000Z",
};
const AFTER = {
  schemaVersion: 1 as const,
  value: 8,
  compatibilityUpdatedAt: NOW.toISOString(),
};

function fixture() {
  let tombstone: any = null;
  let project: {
    projectId: string;
    userId: string;
    projectRevision: number;
    updatedAt: Date;
  } | null = {
    projectId: "project-1",
    userId: "user-1",
    projectRevision: 7,
    updatedAt: new Date(BEFORE.compatibilityUpdatedAt),
  };
  const invalidation = projectRenderSnapshotInvalidationLinkV1(
    createProjectRenderSnapshotInvalidationReceiptV1({
      ownerId: "user-1",
      projectId: "project-1",
      operation: "DELETE_PROJECT",
      beforeRevision: BEFORE,
      afterRevision: AFTER,
      issuedAt: NOW,
    }),
  );
  const projectCollection = {
    findOne: vi.fn(async () => project),
    deleteOne: vi.fn(async () => ({ acknowledged: true, deletedCount: 1 })),
  };
  const checkpointCollection = {
    deleteMany: vi.fn(async () => ({ acknowledged: true, deletedCount: 3 })),
  };
  const chatSessionCollection = {
    deleteMany: vi.fn(async () => ({ acknowledged: true, deletedCount: 2 })),
  };
  const projectLinkCollection = {
    updateMany: vi.fn(async () => ({
      acknowledged: true,
      matchedCount: 4,
      modifiedCount: 4,
      upsertedCount: 0,
      upsertedId: null,
    })),
  };
  const tombstoneCollection = {
    findOne: vi.fn(async () => tombstone),
    insertOne: vi.fn(async (value: any) => {
      tombstone = structuredClone(value);
      return { acknowledged: true, insertedId: value._id };
    }),
  };
  const session = { inTransaction: () => true } as any;
  return {
    input: {
      ownerId: "user-1",
      projectId: "project-1",
      beforeRevision: BEFORE,
      afterRevision: AFTER,
      invalidation,
      projectCollection: projectCollection as any,
      checkpointCollection: checkpointCollection as any,
      chatSessionCollection: chatSessionCollection as any,
      projectLinkCollection: projectLinkCollection as any,
      tombstoneCollection: tombstoneCollection as any,
      session,
      now: NOW,
    },
    projectCollection,
    checkpointCollection,
    chatSessionCollection,
    projectLinkCollection,
    tombstoneCollection,
    getTombstone: () => tombstone,
    setProject: (value: typeof project) => { project = value; },
  };
}

describe("project deletion V1", () => {
  it("atomically deletes project-owned documents, preserves shared media, and seals a tombstone", async () => {
    const f = fixture();
    const result = await commitProjectDeletionV1(f.input);

    expect(result.status).toBe("DELETED");
    expect(result.tombstone.cleanup).toEqual({
      project: { state: "DELETED", deletedCount: 1 },
      checkpoints: { state: "DELETED", deletedCount: 3 },
      chatSessions: { state: "DELETED", deletedCount: 2 },
      projectLinks: { state: "REMOVED", modifiedCount: 4 },
      sharedMedia: { state: "PRESERVED_SHARED" },
      renderArtifacts: {
        state: "PENDING_DURABLE_INVALIDATION",
        invalidationId: f.input.invalidation.invalidationId,
      },
    });
    assertProjectDeletionTombstoneV1(result.tombstone);
    expect(f.projectCollection.deleteOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "user-1",
        projectRevision: 7,
        updatedAt: new Date(BEFORE.compatibilityUpdatedAt),
      }),
      { session: f.input.session },
    );
    expect(f.projectLinkCollection.updateMany).toHaveBeenCalledWith(
      { userId: "user-1", projectIds: "project-1" },
      expect.any(Object),
      { session: f.input.session },
    );
  });

  it("fails closed outside a transaction before reading or deleting anything", async () => {
    const f = fixture();
    await expect(commitProjectDeletionV1({
      ...f.input,
      session: { inTransaction: () => false } as any,
    })).rejects.toThrow("PROJECT_DELETION_TRANSACTION_REQUIRED");
    expect(f.projectCollection.findOne).not.toHaveBeenCalled();
    expect(f.projectCollection.deleteOne).not.toHaveBeenCalled();
  });

  it("fails closed when the exact revision cannot be deleted", async () => {
    const f = fixture();
    f.projectCollection.deleteOne.mockResolvedValueOnce({
      acknowledged: true,
      deletedCount: 0,
    });
    await expect(commitProjectDeletionV1(f.input))
      .rejects.toThrow("PROJECT_DELETION_PROJECT_DELETE_UNPROVED");
    expect(f.tombstoneCollection.insertOne).not.toHaveBeenCalled();
  });

  it("recognizes an exact transaction replay after the project is gone", async () => {
    const f = fixture();
    const first = await commitProjectDeletionV1(f.input);
    f.setProject(null);

    const replay = await commitProjectDeletionV1(f.input);
    expect(replay.status).toBe("ALREADY_DELETED");
    expect(replay.tombstone.receiptHash).toBe(first.tombstone.receiptHash);
    expect(f.projectCollection.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("rejects a tampered deletion tombstone", async () => {
    const f = fixture();
    const first = await commitProjectDeletionV1(f.input);
    const tampered = structuredClone(first.tombstone);
    tampered.cleanup.checkpoints.deletedCount = 99;
    expect(() => assertProjectDeletionTombstoneV1(tampered))
      .toThrow("PROJECT_DELETION_TOMBSTONE_HASH_MISMATCH");
  });
});
