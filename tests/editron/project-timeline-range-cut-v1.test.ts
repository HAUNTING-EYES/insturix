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

function projectFixture(projectRevision = 7, updatedAt = "2026-08-25T00:00:00.000Z") {
  return {
    projectId: "proj_timeline_cut",
    userId: "user_timeline_cut",
    name: "Timeline cut fixture",
    overlays: [
      {
        id: 1,
        type: "video",
        from: 0,
        row: 0,
        durationInFrames: 240,
        sourceStartFrame: 100,
        videoStartTime: 100,
      },
      {
        id: 2,
        type: "text",
        from: 180,
        row: 1,
        durationInFrames: 30,
      },
    ],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 240,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
  };
}

describe("ProjectService timeline range cut V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("persists one full ripple receipt with its exact writer revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
          expectedRevision: {
            schemaVersion: 1,
            value: 7,
            compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
          },
          actorKind: "AGENT",
          startFrame: 30,
          endFrame: 60,
        })
      ));

      expect(captured.value.cut.newDurationInFrames).toBe(210);
      expect(captured.value.mutationReceipt).toEqual({
        schemaVersion: 1,
        projectId: "proj_timeline_cut",
        revision: {
          schemaVersion: 1,
          value: 8,
          compatibilityUpdatedAt: "2026-08-25T01:02:03.000Z",
        },
        committedAt: "2026-08-25T01:02:03.000Z",
      });
      expect(captured.receipts).toEqual([captured.value.mutationReceipt]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_timeline_cut",
          userId: "user_timeline_cut",
          projectRevision: 7,
          updatedAt: new Date("2026-08-25T00:00:00.000Z"),
        },
        expect.objectContaining({
          $inc: { projectRevision: 1 },
          $set: expect.objectContaining({
            durationInFrames: 210,
            updatedAt: new Date("2026-08-25T01:02:03.000Z"),
          }),
        }),
      );

      const update = persistenceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
      const persistedReceipt = update.$push.timelineRangeChangeReceipts.$each[0];
      expect(persistedReceipt).toMatchObject({
        schemaVersion: 1,
        receiptId: expect.stringMatching(/^timeline-cut_/),
        projectId: "proj_timeline_cut",
        operation: "CUT_TIMELINE_RANGE",
        actorKind: "AGENT",
        coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
        fps: 30,
        beforeProjectRevision: { value: 7 },
        afterProjectRevision: { value: 8 },
        readFrameRangesBefore: [{ startFrame: 0, endFrame: 240 }],
        writeFrameRangesBefore: [{ startFrame: 30, endFrame: 240 }],
        affectedFrameRangesAfter: [{ startFrame: 30, endFrame: 210 }],
        affectedOverlayRefs: ["overlay:1", "overlay:2"],
        changedPaths: ["overlays", "durationInFrames", "timelineRangeChangeReceipts"],
        timelineCoordinateTransform: {
          removedRange: { startFrame: 30, endFrame: 60 },
          beforeDurationInFrames: 240,
          afterDurationInFrames: 210,
          shiftAfterRemovedRangeFrames: -30,
        },
        ripple: {
          kind: "REMOVE_AND_SHIFT_LEFT",
          removedFrameRange: { startFrame: 30, endFrame: 60 },
          shiftedBeforeFrameRange: { startFrame: 60, endFrame: 240 },
          shiftedAfterFrameRange: { startFrame: 30, endFrame: 210 },
          deltaFrames: -30,
        },
        downstreamInvalidation: {
          status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
          affectedFrameRangesBefore: [{ startFrame: 30, endFrame: 240 }],
        },
      });
      expect(update.$push.timelineRangeChangeReceipts.$slice).toBe(-200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed on a lost compare-and-swap and publishes no receipt", async () => {
    const project = projectFixture();
    const latest = projectFixture(8, "2026-08-25T00:00:01.000Z");
    persistenceMocks.findOne
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(latest);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    const captured = await projectService.captureMutationReceipts(async () => {
      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
        },
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      })).rejects.toMatchObject({
        name: "ProjectMutationConflictError",
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: { value: 8 },
      });
    });

    expect(captured.receipts).toEqual([]);
    expect(project.durationInFrames).toBe(240);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects an active Director lease before it can write or publish a receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = {
        ...projectFixture(),
        directorLock: true,
        directorLockAt: new Date("2026-08-25T01:00:00.000Z"),
      };
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(async () => {
        await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
          actorKind: "AGENT",
          startFrame: 30,
          endFrame: 60,
        })).rejects.toMatchObject({
          code: "PROJECT_REVISION_CONFLICT",
          currentRevision: { value: 7 },
        });
      });

      expect(captured.receipts).toEqual([]);
      expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invent a shifted-after range when the cut reaches project end", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.cutTimelineRangeV1(
      "user_timeline_cut",
      "proj_timeline_cut",
      { actorKind: "AGENT", startFrame: 180, endFrame: 240 },
    );

    expect(result.timelineChangeReceipt).toMatchObject({
      writeFrameRangesBefore: [{ startFrame: 180, endFrame: 240 }],
      affectedFrameRangesAfter: [],
      ripple: {
        shiftedBeforeFrameRange: null,
        shiftedAfterFrameRange: null,
      },
    });
  });

  it("rejects a changed overlay without a stable identity before writing", async () => {
    const project = projectFixture();
    project.overlays[0].type = "text";
    (project.overlays[0] as Record<string, unknown>).id = undefined;
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
      actorKind: "AGENT",
      startFrame: 30,
      endFrame: 60,
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);

    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
