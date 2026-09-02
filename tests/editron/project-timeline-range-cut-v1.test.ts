import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  outboxFindOne: vi.fn(),
  outboxInsertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => name
      === "editron_project_render_snapshot_invalidation_outbox_v1"
      ? {
          findOne: persistenceMocks.outboxFindOne,
          insertOne: persistenceMocks.outboxInsertOne,
        }
      : {
          findOne: persistenceMocks.findOne,
          updateOne: persistenceMocks.updateOne,
        }),
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

function exactOverlayReceipt(input: {
  receiptId: string;
  overlayRef: string;
  beforeRevision: number;
  beforeUpdatedAt: string;
  afterRevision: number;
  afterUpdatedAt: string;
  frameRange: { startFrame: number; endFrame: number };
}) {
  return {
    schemaVersion: 1,
    receiptId: input.receiptId,
    projectId: "proj_timeline_cut",
    operation: "UPDATE_OVERLAY",
    actorKind: "UNKNOWN_LEGACY_CALLER",
    coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
    fps: 30,
    beforeProjectRevision: {
      schemaVersion: 1,
      value: input.beforeRevision,
      compatibilityUpdatedAt: input.beforeUpdatedAt,
    },
    afterProjectRevision: {
      schemaVersion: 1,
      value: input.afterRevision,
      compatibilityUpdatedAt: input.afterUpdatedAt,
    },
    committedAt: input.afterUpdatedAt,
    readFrameRangesBefore: [input.frameRange],
    writeFrameRangesBefore: [input.frameRange],
    affectedFrameRangesAfter: [input.frameRange],
    affectedOverlayRefs: [input.overlayRef],
    changedPaths: ["overlays", "timelineRangeChangeReceipts"],
    rangeObservation: "EXACT",
    overlayTemporalChange: {
      overlayRef: input.overlayRef,
      beforeFrameRange: input.frameRange,
      afterFrameRange: input.frameRange,
      unionFrameRange: input.frameRange,
    },
    timelineCoordinateTransform: null,
    splitChildren: [],
    ripple: null,
    downstreamInvalidation: {
      status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
      affectedFrameRangesBefore: [input.frameRange],
    },
  };
}

function cutLock(input: {
  lockId: string;
  startFrame: number;
  endFrame: number;
  expiresAt?: string;
}) {
  return {
    schemaVersion: 1,
    lockId: input.lockId,
    actorKind: "AGENT",
    frameRange: { startFrame: input.startFrame, endFrame: input.endFrame },
    acquiredAt: "2026-08-25T01:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-08-25T01:10:00.000Z",
  };
}

describe("ProjectService timeline range cut V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.outboxFindOne.mockReset().mockResolvedValue(null);
    persistenceMocks.outboxInsertOne.mockReset().mockResolvedValue({ acknowledged: true });
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

  it("adds an exact direct-overlay receipt in the same CAS write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      await projectService.updateOverlayAtRevisionV1(
        "user_timeline_cut",
        "proj_timeline_cut",
        {
          expectedRevision: {
            schemaVersion: 1,
            value: project.projectRevision,
            compatibilityUpdatedAt: project.updatedAt.toISOString(),
          },
          actorKind: "USER",
          overlayId: 1,
          updates: { from: 10, durationInFrames: 100 } as any,
        },
      );

      const update = persistenceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        receiptId: expect.stringMatching(/^timeline-overlay_/),
        operation: "UPDATE_OVERLAY",
        actorKind: "USER",
        beforeProjectRevision: { value: 7 },
        afterProjectRevision: { value: 8 },
        readFrameRangesBefore: [{ startFrame: 0, endFrame: 240 }],
        writeFrameRangesBefore: [{ startFrame: 0, endFrame: 240 }],
        affectedFrameRangesAfter: [{ startFrame: 10, endFrame: 110 }],
        affectedOverlayRefs: ["overlay:1"],
        rangeObservation: "EXACT",
        overlayTemporalChange: {
          overlayRef: "overlay:1",
          beforeFrameRange: { startFrame: 0, endFrame: 240 },
          afterFrameRange: { startFrame: 10, endFrame: 110 },
          unionFrameRange: { startFrame: 0, endFrame: 240 },
        },
        timelineCoordinateTransform: null,
        ripple: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("safely rebases a stale cut only across a disjoint exact overlay receipt", async () => {
    const beforeUpdatedAt = "2026-08-25T00:00:00.000Z";
    const currentUpdatedAt = "2026-08-25T00:00:01.000Z";
    const base = projectFixture(8, currentUpdatedAt);
    const current = {
      ...base,
      overlays: [base.overlays[0], { ...base.overlays[1], from: 0, durationInFrames: 20 }],
      timelineRangeChangeReceipts: [exactOverlayReceipt({
        receiptId: "timeline-overlay_disjoint",
        overlayRef: "overlay:2",
        beforeRevision: 7,
        beforeUpdatedAt,
        afterRevision: 8,
        afterUpdatedAt: currentUpdatedAt,
        frameRange: { startFrame: 0, endFrame: 20 },
      })],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: beforeUpdatedAt,
      },
      actorKind: "AGENT",
      startFrame: 30,
      endFrame: 60,
    });

    expect(result.rebase).toEqual({
      disposition: "SAFE_REBASED",
      requestedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: beforeUpdatedAt,
      },
      appliedBaseRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: currentUpdatedAt,
      },
      traversedReceiptIds: ["timeline-overlay_disjoint"],
    });
    expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toMatchObject({
      projectRevision: 8,
      updatedAt: new Date(currentUpdatedAt),
    });
  });

  it("blocks a stale cut after a same-object or overlapping update", async () => {
    const cases = [
      ["overlay:1", { startFrame: 0, endFrame: 20 }, "SAME_OBJECT_UPDATE"],
      ["overlay:99", { startFrame: 35, endFrame: 50 }, "OVERLAPPING_UPDATE"],
    ] as const;
    for (const [overlayRef, frameRange, reason] of cases) {
      persistenceMocks.findOne.mockReset();
      persistenceMocks.updateOne.mockReset();
      const beforeUpdatedAt = "2026-08-25T00:00:00.000Z";
      const currentUpdatedAt = "2026-08-25T00:00:01.000Z";
      const current = {
        ...projectFixture(8, currentUpdatedAt),
        timelineRangeChangeReceipts: [exactOverlayReceipt({
          receiptId: `timeline-overlay_${reason}`,
          overlayRef,
          beforeRevision: 7,
          beforeUpdatedAt,
          afterRevision: 8,
          afterUpdatedAt: currentUpdatedAt,
          frameRange,
        })],
      };
      persistenceMocks.findOne.mockResolvedValueOnce(current);
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: beforeUpdatedAt,
        },
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      })).rejects.toMatchObject({
        code: "PROJECT_TIMELINE_REBASE_BLOCKED",
        reason,
      });
      expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
    }
  });

  it("fails closed when a stale cut crosses a coordinate transform or missing history", async () => {
    const beforeUpdatedAt = "2026-08-25T00:00:00.000Z";
    const currentUpdatedAt = "2026-08-25T00:00:01.000Z";
    const transformCurrent = {
      ...projectFixture(8, currentUpdatedAt),
      timelineRangeChangeReceipts: [{
        ...exactOverlayReceipt({
          receiptId: "timeline-cut_intervening",
          overlayRef: "overlay:2",
          beforeRevision: 7,
          beforeUpdatedAt,
          afterRevision: 8,
          afterUpdatedAt: currentUpdatedAt,
          frameRange: { startFrame: 0, endFrame: 20 },
        }),
        operation: "CUT_TIMELINE_RANGE",
      }],
    };
    const missingHistoryCurrent = projectFixture(8, currentUpdatedAt);
    persistenceMocks.findOne
      .mockResolvedValueOnce(transformCurrent)
      .mockResolvedValueOnce(missingHistoryCurrent);
    const { projectService } = await import("@/lib/editron/services/project-service");

    for (const expectedReason of ["COORDINATE_TRANSFORM", "HISTORY_INCOMPLETE"]) {
      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: beforeUpdatedAt,
        },
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      })).rejects.toMatchObject({
        code: "PROJECT_TIMELINE_REBASE_BLOCKED",
        reason: expectedReason,
      });
    }
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("permits adjacent cut locks and rejects overlapping locks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const adjacent = {
        ...projectFixture(),
        timelineRangeCutLocks: [cutLock({
          lockId: "timeline-cut-lock_abcdefghijklmnopqr",
          startFrame: 10,
          endFrame: 20,
        })],
      };
      persistenceMocks.findOne.mockResolvedValueOnce(adjacent);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.acquireTimelineRangeCutLockV1(
        "user_timeline_cut",
        "proj_timeline_cut",
        {
          expectedRevision: {
            schemaVersion: 1,
            value: 7,
            compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
          },
          actorKind: "AGENT",
          startFrame: 20,
          endFrame: 30,
        },
      )).resolves.toMatchObject({ lock: { frameRange: { startFrame: 20, endFrame: 30 } } });

      const overlapping = {
        ...projectFixture(),
        timelineRangeCutLocks: adjacent.timelineRangeCutLocks,
      };
      persistenceMocks.findOne.mockResolvedValueOnce(overlapping);
      await expect(projectService.acquireTimelineRangeCutLockV1(
        "user_timeline_cut",
        "proj_timeline_cut",
        {
          expectedRevision: {
            schemaVersion: 1,
            value: 7,
            compatibilityUpdatedAt: "2026-08-25T00:00:00.000Z",
          },
          actorKind: "AGENT",
          startFrame: 19,
          endFrame: 30,
        },
      )).rejects.toMatchObject({
        code: "PROJECT_TIMELINE_RANGE_LOCKED",
        blockingLockIds: ["timeline-cut-lock_abcdefghijklmnopqr"],
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects forged or expired locks and consumes a matching full-tail lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const lockId = "timeline-cut-lock_abcdefghijklmnopqr";
      const matchingProject = {
        ...projectFixture(8, "2026-08-25T00:00:01.000Z"),
        timelineRangeCutLocks: [cutLock({ lockId, startFrame: 30, endFrame: 240 })],
      };
      const expiredProject = {
        ...projectFixture(8, "2026-08-25T00:00:01.000Z"),
        timelineRangeCutLocks: [cutLock({
          lockId,
          startFrame: 30,
          endFrame: 240,
          expiresAt: "2026-08-25T01:01:00.000Z",
        })],
      };
      persistenceMocks.findOne
        .mockResolvedValueOnce(matchingProject)
        .mockResolvedValueOnce(expiredProject)
        .mockResolvedValueOnce(matchingProject);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = {
        expectedRevision: {
          schemaVersion: 1 as const,
          value: 8,
          compatibilityUpdatedAt: "2026-08-25T00:00:01.000Z",
        },
        actorKind: "AGENT" as const,
        startFrame: 30,
        endFrame: 60,
      };

      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        ...command,
        rangeCutLockId: "timeline-cut-lock_zyxwvutsrqponmlkji",
      })).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });
      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        ...command,
        rangeCutLockId: lockId,
      })).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });

      await projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        ...command,
        rangeCutLockId: lockId,
      });
      const [filter, update] = persistenceMocks.updateOne.mock.calls[0] as [Record<string, any>, Record<string, any>];
      expect(filter.timelineRangeCutLocks.$elemMatch).toMatchObject({
        lockId,
        "frameRange.startFrame": { $lte: 30 },
        "frameRange.endFrame": { $gte: 240 },
      });
      expect(update.$pull).toEqual({ timelineRangeCutLocks: { lockId } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes no receipt when a safely rebased cut loses its final CAS", async () => {
    const beforeUpdatedAt = "2026-08-25T00:00:00.000Z";
    const currentUpdatedAt = "2026-08-25T00:00:01.000Z";
    const base = projectFixture(8, currentUpdatedAt);
    const current = {
      ...base,
      overlays: [base.overlays[0], { ...base.overlays[1], from: 0, durationInFrames: 20 }],
      timelineRangeChangeReceipts: [exactOverlayReceipt({
        receiptId: "timeline-overlay_disjoint",
        overlayRef: "overlay:2",
        beforeRevision: 7,
        beforeUpdatedAt,
        afterRevision: 8,
        afterUpdatedAt: currentUpdatedAt,
        frameRange: { startFrame: 0, endFrame: 20 },
      })],
    };
    const latest = projectFixture(9, "2026-08-25T00:00:02.000Z");
    persistenceMocks.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(latest);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(async () => {
      await expect(projectService.cutTimelineRangeV1("user_timeline_cut", "proj_timeline_cut", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: beforeUpdatedAt,
        },
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      })).rejects.toMatchObject({
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: { value: 9 },
      });
    });
    expect(captured.receipts).toEqual([]);
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
