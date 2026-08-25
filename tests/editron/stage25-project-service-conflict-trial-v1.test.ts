import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStage25ProjectServiceConflictPersistenceV1,
} from "./helpers/stage25-project-service-conflict-fixture-v1";

const persistenceState = vi.hoisted(() => ({ database: null as unknown }));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => {
    if (!persistenceState.database) throw new Error("PROJECT_SERVICE_TEST_DATABASE_NOT_INSTALLED");
    return persistenceState.database;
  }),
  connectToDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: readonly T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: readonly T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

function installPersistence(input: { movableOverlayStart?: number } = {}) {
  const persistence = createStage25ProjectServiceConflictPersistenceV1(input);
  persistenceState.database = persistence.asDatabase();
  return persistence;
}

describe("Stage 2.5 real ProjectService conflict trial V1", () => {
  beforeEach(() => {
    persistenceState.database = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
  });

  afterEach(() => {
    persistenceState.database = null;
    vi.useRealTimers();
  });

  it("preserves a disjoint user edit while safely rebasing a stale cut and reloading its receipt chain", async () => {
    const persistence = installPersistence();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const initial = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );

    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    const userEdit = await projectService.captureMutationReceipts(() => (
      projectService.updateOverlay(
        "user_stage25_conflict",
        "proj_stage25_conflict",
        2,
        { content: "preserve this user edit" },
      )
    ));
    expect(userEdit.receipts).toHaveLength(1);
    expect(userEdit.receipts[0]?.revision.value).toBe(8);

    vi.setSystemTime(new Date("2026-08-25T00:00:02.000Z"));
    const cut = await projectService.cutTimelineRangeV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: initial.revision,
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      },
    );
    const reloaded = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );

    expect(cut.rebase).toMatchObject({
      disposition: "SAFE_REBASED",
      requestedRevision: { value: 7 },
      appliedBaseRevision: { value: 8 },
      traversedReceiptIds: [expect.stringMatching(/^timeline-overlay_/)],
    });
    expect(reloaded.revision.value).toBe(9);
    expect(reloaded.project.durationInFrames).toBe(210);
    expect(reloaded.project.overlays.find((overlay) => overlay.id === 2)).toMatchObject({
      from: 0,
      durationInFrames: 20,
      content: "preserve this user edit",
    });
    expect(reloaded.project.timelineRangeChangeReceipts?.map((receipt) => receipt.operation))
      .toEqual(["UPDATE_OVERLAY", "CUT_TIMELINE_RANGE"]);
    expect(reloaded.project.timelineRangeChangeReceipts?.[0]?.afterProjectRevision)
      .toEqual(reloaded.project.timelineRangeChangeReceipts?.[1]?.beforeProjectRevision);
    expect(persistence.updateAttempts()).toBe(2);
  });

  it("blocks an overlapping stale edit before persistence and leaves canonical state byte-equivalent", async () => {
    const persistence = installPersistence({ movableOverlayStart: 35 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const initial = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );

    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    await projectService.updateOverlay(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      2,
      { from: 0, durationInFrames: 20 },
    );
    const beforeBlockedCut = persistence.snapshot();

    await expect(projectService.cutTimelineRangeV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: initial.revision,
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
      },
    )).rejects.toMatchObject({
      code: "PROJECT_TIMELINE_REBASE_BLOCKED",
      reason: "OVERLAPPING_UPDATE",
    });
    expect(persistence.snapshot()).toEqual(beforeBlockedCut);
    expect(persistence.updateAttempts()).toBe(1);
  });

  it("blocks overlapping locks, then consumes the exact full-tail lock in the successful cut", async () => {
    const persistence = installPersistence();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const initial = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );
    const acquired = await projectService.acquireTimelineRangeCutLockV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: initial.revision,
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 240,
      },
    );
    const lockedState = persistence.snapshot();

    await expect(projectService.acquireTimelineRangeCutLockV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: acquired.mutationReceipt.revision,
        actorKind: "USER",
        startFrame: 20,
        endFrame: 50,
      },
    )).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });
    expect(persistence.snapshot()).toEqual(lockedState);

    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    const cut = await projectService.cutTimelineRangeV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: acquired.mutationReceipt.revision,
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 60,
        rangeCutLockId: acquired.lock.lockId,
      },
    );
    const reloaded = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );

    expect(cut.rebase.disposition).toBe("FRESH");
    expect(reloaded.revision.value).toBe(9);
    expect(reloaded.project.timelineRangeCutLocks).toEqual([]);
    expect(reloaded.project.timelineRangeChangeReceipts?.at(-1)?.operation)
      .toBe("CUT_TIMELINE_RANGE");
  });

  it("rejects forged and expired locks without mutating the stored project", async () => {
    const persistence = installPersistence();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const initial = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );
    const acquired = await projectService.acquireTimelineRangeCutLockV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      {
        expectedRevision: initial.revision,
        actorKind: "AGENT",
        startFrame: 30,
        endFrame: 240,
        ttlMs: 1_000,
      },
    );
    const lockedState = persistence.snapshot();
    const baseCut = {
      expectedRevision: acquired.mutationReceipt.revision,
      actorKind: "AGENT" as const,
      startFrame: 30,
      endFrame: 60,
    };

    vi.setSystemTime(new Date("2026-08-25T00:00:00.500Z"));
    await expect(projectService.cutTimelineRangeV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      { ...baseCut, rangeCutLockId: "timeline-cut-lock_1234567890ABCDEFGH" },
    )).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });
    expect(persistence.snapshot()).toEqual(lockedState);

    vi.setSystemTime(new Date("2026-08-25T00:00:01.001Z"));
    await expect(projectService.cutTimelineRangeV1(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      { ...baseCut, rangeCutLockId: acquired.lock.lockId },
    )).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });
    expect(persistence.snapshot()).toEqual(lockedState);
  });

  it("publishes no cut receipt when a stale safe rebase loses its final CAS", async () => {
    const persistence = installPersistence();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const initial = await projectService.loadProjectForMutation(
      "user_stage25_conflict",
      "proj_stage25_conflict",
    );
    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    await projectService.updateOverlay(
      "user_stage25_conflict",
      "proj_stage25_conflict",
      2,
      { content: "survives losing cut CAS" },
    );
    const beforeCut = persistence.snapshot();
    persistence.forceNextMatchedUpdateToLoseCas((current) => ({
      ...current,
      projectRevision: 9,
      updatedAt: new Date("2026-08-25T00:00:02.000Z"),
      concurrentMetadataMarker: "won-final-cas",
    }));

    vi.setSystemTime(new Date("2026-08-25T00:00:03.000Z"));
    const captured = await projectService.captureMutationReceipts(async () => {
      await expect(projectService.cutTimelineRangeV1(
        "user_stage25_conflict",
        "proj_stage25_conflict",
        {
          expectedRevision: initial.revision,
          actorKind: "AGENT",
          startFrame: 30,
          endFrame: 60,
        },
      )).rejects.toMatchObject({
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: { value: 9 },
      });
    });
    const afterCut = persistence.snapshot();

    expect(captured.receipts).toEqual([]);
    expect(afterCut.durationInFrames).toBe(beforeCut.durationInFrames);
    expect(afterCut.overlays).toEqual(beforeCut.overlays);
    expect(afterCut.timelineRangeChangeReceipts).toEqual(beforeCut.timelineRangeChangeReceipts);
    expect(afterCut).toMatchObject({
      projectRevision: 9,
      concurrentMetadataMarker: "won-final-cas",
    });
  });
});
