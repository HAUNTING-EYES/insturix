import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advanceDirectorRevisionFromReceiptsV1 } from "@/lib/editron/agent/director-revision-chain-v1";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      updateOne: persistenceMocks.updateOne,
    })),
  })),
  connectToDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

function projectFixture(
  projectRevision = 7,
  updatedAt = "2026-08-25T00:00:00.000Z",
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: "proj_director_progress",
    userId: "user_director_progress",
    name: "Director progress fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 0,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    autoEditStatus: "directing",
    directorLock: true,
    directorLockToken: "director_lease_7",
    ...overrides,
  };
}

function progressInput() {
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
    },
    directorLeaseId: "director_lease_7",
    stagePercent: 42,
    stageDescription: "Applying captions",
  };
}

describe("ProjectService Director progress V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("commits active lease-bound progress through one revision-bound receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordDirectorProgressV1(
          "user_director_progress",
          "proj_director_progress",
          progressInput(),
        )
      ));

      expect(captured.value).toMatchObject({
        projectId: "proj_director_progress",
        revision: { value: 8, compatibilityUpdatedAt: "2026-08-25T01:02:03.000Z" },
        committedAt: "2026-08-25T01:02:03.000Z",
      });
      expect(captured.receipts).toEqual([captured.value]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_director_progress",
          userId: "user_director_progress",
          projectRevision: 7,
          updatedAt: new Date("2026-08-25T00:00:00.000Z"),
          directorLock: true,
          directorLockToken: "director_lease_7",
          autoEditStatus: "directing",
        },
        {
          $set: {
            autoEditStagePercent: 42,
            autoEditStageDesc: "Applying captions",
            updatedAt: new Date("2026-08-25T01:02:03.000Z"),
          },
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed without a receipt when the revision, lease, or Director state is no longer current", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(8, "2026-08-25T01:02:04.000Z", {
      autoEditStatus: "ready_for_chat",
      directorLock: false,
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");
    let settled: readonly unknown[] | undefined;

    await expect(projectService.captureMutationReceipts(
      () => projectService.recordDirectorProgressV1(
        "user_director_progress",
        "proj_director_progress",
        progressInput(),
      ),
      (receipts) => { settled = receipts; },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 8 },
    });

    expect(settled).toEqual([]);
  });

  it("rejects malformed progress before reading or writing the project", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.recordDirectorProgressV1(
      "user_director_progress",
      "proj_director_progress",
      { ...progressInput(), stagePercent: 100 },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);

    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});

describe("Director receipt revision chain V1", () => {
  const revision = {
    schemaVersion: 1 as const,
    value: 7,
    compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
  };

  it("adopts only contiguous writer-issued receipts for its own project", () => {
    expect(advanceDirectorRevisionFromReceiptsV1({
      projectId: "proj_director_progress",
      currentRevision: revision,
      receipts: [
        {
          schemaVersion: 1,
          projectId: "proj_director_progress",
          revision: { schemaVersion: 1, value: 8, compatibilityUpdatedAt: "2026-08-25T00:00:01.000Z" },
          committedAt: "2026-08-25T00:00:01.000Z",
        },
        {
          schemaVersion: 1,
          projectId: "proj_director_progress",
          revision: { schemaVersion: 1, value: 9, compatibilityUpdatedAt: "2026-08-25T00:00:02.000Z" },
          committedAt: "2026-08-25T00:00:02.000Z",
        },
      ],
    })).toMatchObject({ value: 9 });
  });

  it("rejects foreign or non-consecutive receipts instead of adopting a guessed revision", () => {
    expect(() => advanceDirectorRevisionFromReceiptsV1({
      projectId: "proj_director_progress",
      currentRevision: revision,
      receipts: [{
        schemaVersion: 1,
        projectId: "another_project",
        revision: { schemaVersion: 1, value: 8, compatibilityUpdatedAt: "2026-08-25T00:00:01.000Z" },
        committedAt: "2026-08-25T00:00:01.000Z",
      }],
    })).toThrow("contiguous writer-issued revision chain");

    expect(() => advanceDirectorRevisionFromReceiptsV1({
      projectId: "proj_director_progress",
      currentRevision: revision,
      receipts: [{
        schemaVersion: 1,
        projectId: "proj_director_progress",
        revision: { schemaVersion: 1, value: 9, compatibilityUpdatedAt: "2026-08-25T00:00:02.000Z" },
        committedAt: "2026-08-25T00:00:02.000Z",
      }],
    })).toThrow("contiguous writer-issued revision chain");
  });
});

describe("Director worker progress ownership migration", () => {
  it("does not retain a fire-and-forget raw progress writer", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "app/api/internal/workers/director/route.ts"),
      "utf8",
    );

    expect(routeSource).toContain("persistProjectProgress: true");
    expect(routeSource).not.toContain("autoEditStagePercent: pct");
    expect(routeSource).not.toContain("void db.collection('projects')");
  });

  it("carries captured action receipts into the final ProjectService save", () => {
    const agentSource = readFileSync(
      resolve(process.cwd(), "lib/editron/agent/director-agent.ts"),
      "utf8",
    );

    expect(agentSource).toContain("projectService.captureMutationReceipts");
    expect(agentSource).toContain("advanceDirectorRevisionFromReceiptsV1");
    expect(agentSource).toContain("expectedRevision: directorCurrentRevision");
    expect(agentSource).not.toContain("revision: directorStartRevision");
  });
});
