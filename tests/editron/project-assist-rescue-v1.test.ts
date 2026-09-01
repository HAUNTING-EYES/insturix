import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      findOneAndUpdate: persistenceMocks.findOneAndUpdate,
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

const PROJECT_ID = "proj_assist_rescue";
const USER_ID = "user_assist_rescue";
const BASE_UPDATED_AT = "2026-09-01T00:00:00.000Z";
const RESCUED_AT = "2026-09-01T00:00:01.000Z";

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Assist rescue fixture",
    overlays: [{ id: "video_1", type: "video", assetId: "asset_1" }],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 300,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    editMode: "auto",
    autoEditStatus: "failed",
    rawFootageAnalysis: { originalDurationMs: 10_000, segments: [] },
    autoEditError: "Director failed.",
    ...overrides,
  };
}

function expectedRevision(value = 7, compatibilityUpdatedAt = BASE_UPDATED_AT) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt };
}

beforeEach(() => {
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService Assist rescue V1", () => {
  it("rescues the exact paid failed project and publishes one mutation receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RESCUED_AT));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
      persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(projectFixture(8, RESCUED_AT, {
        editMode: "assist",
        autoEditStatus: "ready_for_chat",
        assistRescuedFrom: "failed",
        assistRescuedAt: new Date(RESCUED_AT),
        autoEditError: undefined,
      }));
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
          expectedRevision: expectedRevision(),
        })
      ));
      expect(captured.value).toMatchObject({
        disposition: "RESCUED",
        project: { editMode: "assist", autoEditStatus: "ready_for_chat" },
        receipt: {
          projectId: PROJECT_ID,
          revision: { value: 8, compatibilityUpdatedAt: RESCUED_AT },
        },
      });
      if (captured.value.disposition !== "RESCUED") throw new Error("Expected rescue receipt.");
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 7,
          updatedAt: new Date(BASE_UPDATED_AT),
          editMode: { $ne: "assist" },
          autoEditStatus: "failed",
          autoEditRefunded: { $ne: true },
          overlays: { $elemMatch: { type: { $in: ["video", "image"] } } },
          $or: [
            { rawFootageAnalysis: { $exists: true, $ne: null } },
            { segmentAnalysis: { $exists: true, $ne: null } },
          ],
        },
        {
          $set: {
            editMode: "assist",
            autoEditStatus: "ready_for_chat",
            assistRescuedFrom: "failed",
            assistRescuedAt: new Date(RESCUED_AT),
            updatedAt: new Date(RESCUED_AT),
          },
          $unset: {
            autoEditError: "",
            autoEditFailedAt: "",
            autoEditStageDesc: "",
            "intelligence.directorDeliveryFailure": "",
          },
          $inc: { projectRevision: 1 },
        },
        { returnDocument: "after", includeResultMetadata: false },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats an actually rescued project as an idempotent no-write replay", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(8, RESCUED_AT, {
      editMode: "assist",
      autoEditStatus: "ready_for_chat",
      assistRescuedFrom: "failed",
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
        expectedRevision: expectedRevision(),
      })
    ));
    expect(captured.value).toMatchObject({
      disposition: "ALREADY_RESCUED",
      currentRevision: { value: 8, compatibilityUpdatedAt: RESCUED_AT },
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects refunded or substrate-free failures before any write", async () => {
    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, { autoEditRefunded: true }))
      .mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
        overlays: [],
        rawFootageAnalysis: undefined,
        segmentAnalysis: undefined,
      }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
        expectedRevision: expectedRevision(),
      })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    }
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a stale revision before attempting the rescue CAS", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(8, RESCUED_AT));
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("classifies a lost CAS only from the latest project truth", async () => {
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture())
      .mockResolvedValueOnce(projectFixture(8, RESCUED_AT, {
        editMode: "assist",
        autoEditStatus: "ready_for_chat",
        assistRescuedFrom: "failed",
      }));
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
    })).resolves.toMatchObject({ disposition: "ALREADY_RESCUED" });

    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture())
      .mockResolvedValueOnce(projectFixture(8, RESCUED_AT));
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(projectService.rescueFailedAutoEditToAssistV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
  });
});
