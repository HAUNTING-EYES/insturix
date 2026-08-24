import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

function projectFixture(
  projectRevision = 7,
  updatedAt = "2026-08-25T00:00:00.000Z",
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: "proj_director_failure",
    userId: "user_director_failure",
    name: "Director failure fixture",
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
    directorMessageId: "message_7",
    sourceUploadBatchId: "batch_7",
    ...overrides,
  };
}

function failureInput() {
  return {
    sourceMessageId: "message_7",
    errorMessage: "Director delivery failed with HTTP 504: timeout",
    audit: {
      source: "qstash-failure-callback",
      sourceMessageId: "message_7",
      error: "Director delivery failed with HTTP 504: timeout",
      failedAt: new Date("2026-08-25T01:02:03.000Z"),
    },
  };
}

describe("ProjectService Director delivery failure V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("records the current callback through one revision-bound receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordDirectorDeliveryFailureV1(
          "user_director_failure",
          "proj_director_failure",
          failureInput(),
        )
      ));

      expect(captured.value).toMatchObject({
        disposition: "RECORDED",
        sourceUploadBatchId: "batch_7",
        beforeRevision: { value: 7 },
        receipt: {
          projectId: "proj_director_failure",
          revision: { value: 8 },
          committedAt: "2026-08-25T01:02:03.000Z",
        },
      });
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_director_failure",
          userId: "user_director_failure",
          projectRevision: 7,
          updatedAt: new Date("2026-08-25T00:00:00.000Z"),
          autoEditStatus: { $in: ["directing_queued", "directing", "analysis_complete"] },
          directorMessageId: "message_7",
        },
        {
          $set: {
            autoEditStatus: "failed",
            autoEditError: "Director delivery failed with HTTP 504: timeout",
            autoEditFailedAt: new Date("2026-08-25T01:02:03.000Z"),
            autoEditStageDesc: "Director delivery failed",
            "intelligence.directorDeliveryFailure": failureInput().audit,
            updatedAt: new Date("2026-08-25T01:02:03.000Z"),
          },
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not write or issue a receipt for a stale callback", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, undefined, {
      directorMessageId: "message_8",
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.recordDirectorDeliveryFailureV1(
        "user_director_failure",
        "proj_director_failure",
        failureInput(),
      )
    ));

    expect(captured.value).toEqual({
      disposition: "STALE_SOURCE_MESSAGE",
      sourceUploadBatchId: null,
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("fails closed after a lost compare-and-swap without issuing a receipt", async () => {
    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture())
      .mockResolvedValueOnce(projectFixture(8, "2026-08-25T01:02:04.000Z"));
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.recordDirectorDeliveryFailureV1(
        "user_director_failure",
        "proj_director_failure",
        failureInput(),
      )
    ));

    expect(captured.value).toEqual({
      disposition: "PROJECT_STATE_CHANGED",
      sourceUploadBatchId: null,
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed callback facts before reading or writing a project", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.recordDirectorDeliveryFailureV1(
      "user_director_failure",
      "proj_director_failure",
      {
        ...failureInput(),
        audit: {
          ...failureInput().audit,
          failedAt: "not-a-date",
        },
      },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);

    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
