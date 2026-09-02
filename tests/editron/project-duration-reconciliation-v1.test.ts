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

const PROJECT_ID = "proj_duration_reconciliation";
const USER_ID = "user_duration_reconciliation";
const BASE_UPDATED_AT = "2026-08-25T03:00:00.000Z";

function overlay(id: number, from: number, durationInFrames: number) {
  return {
    id,
    type: "video",
    row: 0,
    from,
    durationInFrames,
    src: `https://assets.example.test/${id}.mp4`,
    content: `https://assets.example.test/${id}.mp4`,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    keyframeTracks: [],
    styles: { objectFit: "cover", opacity: 1 },
  };
}

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Duration reconciliation fixture",
    overlays: [overlay(1, 0, 90), overlay(2, 120, 60)],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 25,
    durationInFrames: 120,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(BASE_UPDATED_AT),
    projectRevision: 7,
    visibility: "private" as const,
    ...overrides,
  };
}

describe("ProjectService duration reconciliation V1", () => {
  beforeEach(() => {
    vi.useRealTimers();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("derives duration from exact current overlays and issues one CAS receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T03:04:05.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.reconcileProjectDurationFromOverlaysV1(USER_ID, PROJECT_ID, {
          actorKind: "AGENT",
        })
      ));

      expect(captured.value).toMatchObject({
        disposition: "APPLIED",
        durationInFrames: 180,
        mutationReceipt: { revision: { value: 8 } },
        timelineChangeReceipt: {
          operation: "RECONCILE_PROJECT_DURATION",
          actorKind: "AGENT",
          beforeProjectRevision: { value: 7 },
          afterProjectRevision: { value: 8 },
          readFrameRangesBefore: [{ startFrame: 0, endFrame: 180 }],
          writeFrameRangesBefore: [{ startFrame: 120, endFrame: 180 }],
          affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 180 }],
          rangeObservation: "EXACT",
          affectedOverlayRefs: [],
        },
      });
      if (captured.value.disposition !== "APPLIED") {
        throw new Error("Fixture did not apply duration reconciliation.");
      }
      expect(captured.receipts).toEqual([captured.value.mutationReceipt]);

      const [filter, update] = persistenceMocks.updateOne.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        projectRevision: 7,
        updatedAt: new Date(BASE_UPDATED_AT),
      });
      expect(update.$set.durationInFrames).toBe(180);
      expect(update.$inc).toEqual({ projectRevision: 1 });
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        operation: "RECONCILE_PROJECT_DURATION",
        changedPaths: ["durationInFrames", "timelineRangeChangeReceipts"],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a legacy actor before project access", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.reconcileProjectDurationFromOverlaysV1(
      USER_ID,
      PROJECT_ID,
      { actorKind: "UNKNOWN_LEGACY_CALLER" } as never,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied duration before project access", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.reconcileProjectDurationFromOverlaysV1(
      USER_ID,
      PROJECT_ID,
      { actorKind: "AGENT", assertedDurationInFrames: 180 } as never,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("does not repair legacy overlay timing by guessing", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture({
      overlays: [overlay(1, 0, 90), { ...overlay(2, 120, 60), from: 120.5 }],
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.reconcileProjectDurationFromOverlaysV1(
      USER_ID,
      PROJECT_ID,
      { actorKind: "SYSTEM" },
    )).resolves.toMatchObject({
      disposition: "NOT_ELIGIBLE",
      reason: "OVERLAY_TIMING_UNREPRESENTABLE",
      currentRevision: { value: 7 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("reports a true revision conflict without overwriting a newer project", async () => {
    const current = projectFixture();
    const newer = projectFixture({
      projectRevision: 8,
      updatedAt: new Date("2026-08-25T03:01:00.000Z"),
    });
    persistenceMocks.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(newer);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.reconcileProjectDurationFromOverlaysV1(
      USER_ID,
      PROJECT_ID,
      { actorKind: "SYSTEM" },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 8 },
    });
  });

  it("keeps the generic update tombstone fail closed", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.updateProject(USER_ID, PROJECT_ID, {
      projectStatus: "complete",
    })).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects even a matching duration through the generic update tombstone", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.updateProject(USER_ID, PROJECT_ID, {
      durationInFrames: 180,
    })).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
