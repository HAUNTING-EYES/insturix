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

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

const PROJECT_ID = "proj_duration_correction";
const USER_ID = "user_duration_correction";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";

function videoOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    type: "video",
    row: 2,
    from: 0,
    durationInFrames: 250,
    sourceStartFrame: 0,
    assetId: "asset-analyzed",
    src: "https://assets.example.test/analyzed.mp4",
    content: "https://assets.example.test/analyzed.mp4",
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    keyframeTracks: [],
    styles: { objectFit: "cover", opacity: 1 },
    ...overrides,
  };
}

function projectFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Video duration correction fixture",
    overlays: [
      videoOverlay(),
      videoOverlay({
        id: 11,
        from: 30,
        durationInFrames: 90,
        assetId: "asset-unrelated",
      }),
    ],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 25,
    durationInFrames: 250,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(BASE_UPDATED_AT),
    projectRevision: 7,
    visibility: "private" as const,
    ...overrides,
  };
}

function revisionFor(project: ReturnType<typeof projectFixture>) {
  return {
    schemaVersion: 1 as const,
    value: project.projectRevision,
    compatibilityUpdatedAt: project.updatedAt.toISOString(),
  };
}

async function durationCommand(project: ReturnType<typeof projectFixture>) {
  const { selectVideoAnalysisDurationCorrectionTargetV1 } = await import(
    "@/lib/editron/services/project-service"
  );
  const target = selectVideoAnalysisDurationCorrectionTargetV1(project as never, "asset-analyzed");
  if (!target) throw new Error("Fixture must contain exactly one eligible target.");
  return {
    expectedRevision: revisionFor(project),
    assetId: "asset-analyzed",
    observedDurationMs: 12_000,
    durationSource: "container" as const,
    target,
  };
}

describe("ProjectService Video Analysis duration correction V1", () => {
  beforeEach(() => {
    vi.useRealTimers();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("uses the project FPS and corrects only one exact initial source overlay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = await durationCommand(project);

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.commitVideoAnalysisDurationCorrectionV1(USER_ID, PROJECT_ID, command)
      ));
      if (captured.value.disposition !== "APPLIED") {
        throw new Error("Fixture did not apply duration correction.");
      }

      expect(captured.value).toMatchObject({
        disposition: "APPLIED",
        correctionReceipt: {
          assetId: "asset-analyzed",
          observedDurationMs: 12_000,
          durationSource: "container",
          projectFps: 25,
          target: { overlayId: 10, expectedDurationInFrames: 250 },
          requestedRevision: { value: 7 },
          beforeRevision: { value: 7 },
          afterRevision: { value: 8 },
          proof: {
            required: true,
            status: "UNVERIFIABLE",
            reason: "NO_RENDERED_VIDEO_PROOF",
          },
          timelineChangeReceipt: {
            operation: "CORRECT_VIDEO_ANALYSIS_DURATION",
            readFrameRangesBefore: [{ startFrame: 0, endFrame: 250 }],
            writeFrameRangesBefore: [{ startFrame: 0, endFrame: 300 }],
            affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 300 }],
            rangeObservation: "EXACT",
          },
        },
      });
      expect(captured.receipts).toEqual([captured.value.correctionReceipt.mutationReceipt]);

      const [filter, update, options] = persistenceMocks.updateOne.mock.calls[0] as [
        Record<string, any>,
        Record<string, any>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        projectRevision: 7,
        durationInFrames: 250,
        overlays: {
          $elemMatch: {
            id: 10,
            type: "video",
            assetId: "asset-analyzed",
            from: 0,
            durationInFrames: 250,
          },
        },
      });
      expect(update.$set.durationInFrames).toBe(300);
      expect(update.$set["overlays.$[target]"]).toMatchObject({
        id: 10,
        assetId: "asset-analyzed",
        durationInFrames: 300,
      });
      expect(update.$set).not.toHaveProperty("overlays.$[unrelated]");
      expect(options.arrayFilters).toEqual([{
        "target.id": 10,
        "target.type": "video",
        "target.assetId": "asset-analyzed",
        "target.from": 0,
        "target.durationInFrames": 250,
      }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the original receipt for an exact replay and makes no second write", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = await durationCommand(project);
    const first = await projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    );
    if (first.disposition !== "APPLIED") throw new Error("Fixture did not apply correction.");

    persistenceMocks.findOne.mockResolvedValueOnce({
      ...project,
      videoAnalysisDurationCorrectionReceipts: [first.correctionReceipt],
    });
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toMatchObject({ disposition: "ALREADY_APPLIED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale snapshot before any write", async () => {
    const base = projectFixture();
    const current = projectFixture({
      projectRevision: 8,
      updatedAt: new Date("2026-08-25T00:01:00.000Z"),
    });
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      await durationCommand(base),
    )).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT", currentRevision: { value: 8 } });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("makes no write for an ambiguous or root-mismatched initial source layout", async () => {
    const rootMismatch = projectFixture({ durationInFrames: 251 });
    persistenceMocks.findOne.mockResolvedValueOnce(rootMismatch);
    const { projectService, selectVideoAnalysisDurationCorrectionTargetV1 } = await import(
      "@/lib/editron/services/project-service"
    );
    const target = {
      overlayId: 10,
      expectedAssetId: "asset-analyzed",
      expectedFromFrame: 0 as const,
      expectedSourceStartFrame: 0 as const,
      expectedDurationInFrames: 250,
    };
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      {
        expectedRevision: revisionFor(rootMismatch),
        assetId: "asset-analyzed",
        observedDurationMs: 12_000,
        durationSource: "container",
        target,
      },
    )).resolves.toEqual({ disposition: "NOT_ELIGIBLE", reason: "PROJECT_DURATION_MISMATCH" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();

    const duplicate = projectFixture({
      overlays: [videoOverlay(), videoOverlay({ id: 12 })],
    });
    expect(selectVideoAnalysisDurationCorrectionTargetV1(duplicate as never, "asset-analyzed"))
      .toBeNull();

    const duplicateId = projectFixture({
      overlays: [videoOverlay(), videoOverlay({
        id: 10,
        from: 30,
        durationInFrames: 90,
        assetId: "asset-unrelated",
      })],
    });
    persistenceMocks.findOne.mockResolvedValueOnce(duplicateId);
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      await durationCommand(duplicateId),
    )).resolves.toEqual({
      disposition: "NOT_ELIGIBLE",
      reason: "TARGET_EXPECTATION_MISMATCH",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
