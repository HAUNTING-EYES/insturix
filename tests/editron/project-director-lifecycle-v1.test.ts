import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      findOneAndUpdate: persistenceMocks.findOneAndUpdate,
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

const PROJECT_ID = "proj_director_lifecycle";
const USER_ID = "user_director_lifecycle";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";
const RUN_TOKEN = "director_run_12345678901234567890";

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Director lifecycle fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 0,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    editMode: "auto",
    autoEditStatus: "directing_queued",
    ...overrides,
  };
}

function revision(value = 9, compatibilityUpdatedAt = "2026-08-25T00:00:02.000Z") {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt,
  };
}

function terminalReceipt() {
  const terminalRevision = revision();
  return {
    schemaVersion: 1 as const,
    projectId: PROJECT_ID,
    revision: terminalRevision,
    committedAt: terminalRevision.compatibilityUpdatedAt,
  };
}

function completionInput(overrides: Record<string, unknown> = {}) {
  return {
    directorRunToken: RUN_TOKEN,
    expectedRevision: revision(),
    terminalReceipt: terminalReceipt(),
    totalPipelineMs: 4200,
    directorMs: 3900,
    profileId: "A-01",
    autoEditStatus: "needs_review" as const,
    needsQualityAttention: true,
    autoEditWarning: "Rendered quality review needs attention.",
    decisionAuthority: { version: "decision-authority-v1" },
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService Director run lifecycle V1", () => {
  it("claims only one eligible automatic project and issues its first writer receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(
        async (_filter: unknown, update: any) => projectFixture(8, "2026-08-25T00:00:01.000Z", {
          autoEditStatus: "directing",
          directorRunToken: update.$set.directorRunToken,
        }),
      );
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.claimDirectorRunV1(USER_ID, PROJECT_ID)
      ));
      if (captured.value.disposition !== "CLAIMED") {
        throw new Error(`Expected claimed Director run, got ${captured.value.disposition}.`);
      }
      const claimed = captured.value;

      expect(claimed).toMatchObject({
        disposition: "CLAIMED",
        project: { autoEditStatus: "directing" },
        runToken: expect.stringMatching(/^director_run_[A-Za-z0-9_-]{20}$/),
        receipt: {
          projectId: PROJECT_ID,
          revision: { value: 8, compatibilityUpdatedAt: "2026-08-25T00:00:01.000Z" },
        },
      });
      expect(captured.receipts).toEqual([claimed.receipt]);
      expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 7,
          updatedAt: new Date(BASE_UPDATED_AT),
          editMode: { $ne: "assist" },
          autoEditStatus: { $in: ["analysis_complete", "directing_queued"] },
          directorRunToken: { $exists: false },
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "directing",
            directorRunToken: claimed.runToken,
            updatedAt: new Date("2026-08-25T00:00:01.000Z"),
          }),
          $inc: { projectRevision: 1 },
        }),
        { returnDocument: "after", includeResultMetadata: false },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns no-write claim dispositions for missing, Assist, and concurrently claimed projects", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");

    persistenceMocks.findOne.mockResolvedValueOnce(null);
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID)).resolves.toEqual({
      disposition: "PROJECT_NOT_FOUND",
    });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      editMode: "assist",
      autoEditStatus: "analysis_complete",
    }));
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID)).resolves.toMatchObject({
      disposition: "ASSIST_PROJECT",
    });

    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture())
      .mockResolvedValueOnce(projectFixture(8, "2026-08-25T00:00:01.000Z", {
        autoEditStatus: "directing",
        directorRunToken: RUN_TOKEN,
      }));
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID)).resolves.toEqual({
      disposition: "NOT_ELIGIBLE",
    });
    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("completes only against the exact active run token and terminal writer receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:03.000Z"));
    try {
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.completeDirectorRunV1(USER_ID, PROJECT_ID, completionInput())
      ));

      expect(captured.value).toMatchObject({
        disposition: "RECORDED",
        receipt: { revision: { value: 10, compatibilityUpdatedAt: "2026-08-25T00:00:03.000Z" } },
      });
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 9,
          updatedAt: new Date("2026-08-25T00:00:02.000Z"),
          autoEditStatus: "directing",
          directorRunToken: RUN_TOKEN,
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "needs_review",
            projectStatus: "needs-attention",
            autoEditHealth: "needs_review",
            autoEditWarning: "Rendered quality review needs attention.",
            directorProfileUsed: "A-01",
            updatedAt: new Date("2026-08-25T00:00:03.000Z"),
          }),
          $unset: { directorRunToken: "" },
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns ownership_lost instead of completing a rescued or newer project", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(10, "2026-08-25T00:00:04.000Z", {
      editMode: "assist",
      autoEditStatus: "ready_for_chat",
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.completeDirectorRunV1(USER_ID, PROJECT_ID, completionInput())
    ));

    expect(captured.value).toEqual({ disposition: "OWNERSHIP_LOST" });
    expect(captured.receipts).toEqual([]);
  });

  it("clears stale quality-attention fields on a healthy terminal completion", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.completeDirectorRunV1(USER_ID, PROJECT_ID, completionInput({
      autoEditStatus: "complete",
      needsQualityAttention: false,
      autoEditWarning: undefined,
      decisionAuthority: undefined,
    }))).resolves.toMatchObject({ disposition: "RECORDED" });

    const [, update] = persistenceMocks.updateOne.mock.calls[0];
    expect(update.$set).toMatchObject({ autoEditStatus: "complete" });
    expect(update.$set).not.toHaveProperty("autoEditHealth");
    expect(update.$set).not.toHaveProperty("autoEditWarning");
    expect(update.$unset).toEqual({
      directorRunToken: "",
      autoEditHealth: "",
      autoEditWarning: "",
    });
  });

  it("fails only the active matching run and clears its lifecycle token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:04.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(9, "2026-08-25T00:00:02.000Z", {
        autoEditStatus: "directing",
        directorRunToken: RUN_TOKEN,
      }));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const result = await projectService.failDirectorRunV1(USER_ID, PROJECT_ID, {
        directorRunToken: RUN_TOKEN,
        errorMessage: "Director worker timed out.",
      });

      expect(result).toMatchObject({
        disposition: "RECORDED",
        receipt: { revision: { value: 10, compatibilityUpdatedAt: "2026-08-25T00:00:04.000Z" } },
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 9,
          updatedAt: new Date("2026-08-25T00:00:02.000Z"),
          autoEditStatus: "directing",
          directorRunToken: RUN_TOKEN,
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "failed",
            autoEditError: "Director worker timed out.",
          }),
          $unset: { directorRunToken: "" },
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an old run fail a rescued or newer project", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(10, "2026-08-25T00:00:04.000Z", {
      editMode: "assist",
      autoEditStatus: "ready_for_chat",
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.failDirectorRunV1(USER_ID, PROJECT_ID, {
      directorRunToken: RUN_TOKEN,
      errorMessage: "Old worker failure.",
    })).resolves.toEqual({ disposition: "OWNERSHIP_LOST" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects forged lifecycle input before reading or writing a project", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.completeDirectorRunV1(USER_ID, PROJECT_ID, completionInput({
      directorRunToken: "forged",
    }))).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.completeDirectorRunV1(USER_ID, PROJECT_ID, completionInput({
      terminalReceipt: { ...terminalReceipt(), projectId: "another_project" },
    }))).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.failDirectorRunV1(USER_ID, PROJECT_ID, {
      directorRunToken: RUN_TOKEN,
      errorMessage: " ",
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);

    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
