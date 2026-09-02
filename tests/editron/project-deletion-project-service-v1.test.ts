import { beforeEach, describe, expect, it, vi } from "vitest";

const mongo = vi.hoisted(() => ({
  checkpointDeleteMany: vi.fn(),
  chatDeleteMany: vi.fn(),
  endSession: vi.fn(),
  linkUpdateMany: vi.fn(),
  outboxFindOne: vi.fn(),
  outboxInsertOne: vi.fn(),
  projectDeleteOne: vi.fn(),
  projectFindOne: vi.fn(),
  tombstoneFindOne: vi.fn(),
  tombstoneInsertOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => {
  const COLLECTIONS = {
    PROJECTS: "projects",
    CHECKPOINTS: "checkpoints",
    CHAT_SESSIONS: "chatSessions",
    PROJECT_LINKS: "project_links",
  };
  const collection = (name: string) => {
    if (name === "projects") {
      return { findOne: mongo.projectFindOne, deleteOne: mongo.projectDeleteOne };
    }
    if (name === "checkpoints") return { deleteMany: mongo.checkpointDeleteMany };
    if (name === "chatSessions") return { deleteMany: mongo.chatDeleteMany };
    if (name === "project_links") return { updateMany: mongo.linkUpdateMany };
    if (name === "editron_project_render_snapshot_invalidation_outbox_v1") {
      return { findOne: mongo.outboxFindOne, insertOne: mongo.outboxInsertOne };
    }
    if (name === "editron_project_deletion_tombstones_v1") {
      return { findOne: mongo.tombstoneFindOne, insertOne: mongo.tombstoneInsertOne };
    }
    throw new Error(`Unexpected collection: ${name}`);
  };
  const session = {
    inTransaction: () => true,
    withTransaction: mongo.withTransaction,
    endSession: mongo.endSession,
  };
  const db = { collection: vi.fn(collection) };
  return {
    COLLECTIONS,
    connectToDatabase: vi.fn(async () => ({
      client: { startSession: () => session },
      db,
    })),
    getDatabase: vi.fn(async () => db),
  };
});

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: vi.fn((overlays) => overlays),
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: { isMember: vi.fn(async () => false) },
}));

import {
  ProjectMutationConflictError,
  projectService,
} from "@/lib/editron/services/project-service";

const USER_ID = "user-delete-owner";
const PROJECT_ID = "project-delete-target";
const BEFORE = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-09-02T06:00:00.000Z",
};

describe("ProjectService project deletion V1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T06:01:00.000Z"));
    mongo.checkpointDeleteMany.mockReset().mockResolvedValue({
      acknowledged: true,
      deletedCount: 2,
    });
    mongo.chatDeleteMany.mockReset().mockResolvedValue({
      acknowledged: true,
      deletedCount: 1,
    });
    mongo.endSession.mockReset().mockResolvedValue(undefined);
    mongo.linkUpdateMany.mockReset().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    mongo.outboxFindOne.mockReset().mockResolvedValue(null);
    mongo.outboxInsertOne.mockReset().mockResolvedValue({ acknowledged: true });
    mongo.projectDeleteOne.mockReset().mockResolvedValue({
      acknowledged: true,
      deletedCount: 1,
    });
    mongo.projectFindOne.mockReset().mockResolvedValue({
      projectId: PROJECT_ID,
      userId: USER_ID,
      projectRevision: BEFORE.value,
      updatedAt: new Date(BEFORE.compatibilityUpdatedAt),
    });
    mongo.tombstoneFindOne.mockReset().mockResolvedValue(null);
    mongo.tombstoneInsertOne.mockReset().mockResolvedValue({ acknowledged: true });
    mongo.withTransaction.mockReset().mockImplementation(async (callback) => callback());
  });

  it("routes the real delete through invalidation and one majority transaction", async () => {
    const result = await projectService.deleteProject(USER_ID, PROJECT_ID, BEFORE);

    expect(result.status).toBe("DELETED");
    expect(result.tombstone.operation).toBe("DELETE_PROJECT");
    expect(result.tombstone.beforeRevision).toEqual(BEFORE);
    expect(result.tombstone.afterRevision).toEqual({
      schemaVersion: 1,
      value: 8,
      compatibilityUpdatedAt: "2026-09-02T06:01:00.000Z",
    });
    expect(mongo.outboxInsertOne).toHaveBeenCalledOnce();
    expect(mongo.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
    expect(mongo.projectDeleteOne).toHaveBeenCalledOnce();
    expect(mongo.checkpointDeleteMany).toHaveBeenCalledOnce();
    expect(mongo.chatDeleteMany).toHaveBeenCalledOnce();
    expect(mongo.linkUpdateMany).toHaveBeenCalledOnce();
    expect(mongo.tombstoneInsertOne).toHaveBeenCalledOnce();
    expect(mongo.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a stale caller revision before enqueuing or deleting", async () => {
    await expect(projectService.deleteProject(USER_ID, PROJECT_ID, {
      ...BEFORE,
      value: 6,
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);

    expect(mongo.outboxInsertOne).not.toHaveBeenCalled();
    expect(mongo.withTransaction).not.toHaveBeenCalled();
    expect(mongo.projectDeleteOne).not.toHaveBeenCalled();
    expect(mongo.tombstoneInsertOne).not.toHaveBeenCalled();
  });
});
