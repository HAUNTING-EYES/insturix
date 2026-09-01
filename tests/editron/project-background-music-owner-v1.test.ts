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

const USER_ID = "user_bgm_owner";
const PROJECT_ID = "proj_bgm_owner";
const UPDATED_AT = "2026-09-02T02:00:00.000Z";

function musicCoveragePlan() {
  return {
    version: "music-coverage-plan-v1",
    mode: "full",
    sections: [{
      startFrame: 0,
      endFrame: 300,
      intent: "continuous-bed",
      energyTier: "low",
      sources: ["authored-direction"],
    }],
    reasonCodes: ["authored-full-coverage"],
    evidence: { coveredFrames: 300, coverageRatio: 1 },
  };
}

function musicRights() {
  return {
    mediaRole: "music",
    source: "generated",
    userChoice: "attested",
    licensed: true,
    evidence: {
      kind: "generated-provider",
      sourceAssetId: "source_song",
      licenseId: "provider-license-001",
    },
  };
}

function videoOverlay() {
  return {
    id: 1,
    type: "video",
    assetId: "video_master",
    from: 0,
    durationInFrames: 300,
    row: 2,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    styles: {},
  };
}

function bgmOverlay(
  id: number,
  assetId: string,
  rights: Record<string, unknown> = musicRights(),
) {
  const plan = musicCoveragePlan();
  return {
    id,
    type: "sound",
    assetId,
    from: 0,
    durationInFrames: 300,
    startFromSound: 0,
    row: 1,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    content: `r2://${assetId}`,
    src: `r2://${assetId}`,
    audioRights: structuredClone(rights),
    musicRights: structuredClone(rights),
    styles: { volume: 0.2 },
    metadata: {
      musicCoverage: {
        version: plan.version,
        mode: plan.mode,
        sectionIndex: 0,
        section: plan.sections[0],
        reasonCodes: plan.reasonCodes,
      },
    },
  };
}

function assignmentReceipt(overrides: Record<string, unknown> = {}) {
  return {
    version: "background-music-assignment-v1",
    idempotencyKey: "assign_music_001",
    sourceAssetId: "source_song",
    derivativeAssetId: "bgm_new",
    usageMode: "embedded",
    musicRights: musicRights(),
    musicCoveragePlan: musicCoveragePlan(),
    snappedCutCount: 0,
    beatRealignEnabled: false,
    assignedAt: "2026-09-02T02:01:00.000Z",
    ...overrides,
  };
}

function projectFixture(projectRevision = 4, updatedAt = UPDATED_AT) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "BGM owner fixture",
    overlays: [videoOverlay(), bgmOverlay(2, "bgm_old")],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 300,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
  };
}

function command(candidateOverlays: any[], receipt = assignmentReceipt()) {
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 4,
      compatibilityUpdatedAt: UPDATED_AT,
    },
    actorKind: "USER" as const,
    candidateOverlays,
    musicCoveragePlan: musicCoveragePlan(),
    evidence: {
      kind: "ASSIGNMENT" as const,
      usageMode: "embedded" as const,
      receipt,
    },
  };
}

describe("ProjectService background-music owner V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("commits one rights-bound BGM family while preserving stored video state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T02:01:00.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const result = await projectService.replaceBackgroundMusicAtRevisionV1(
        USER_ID,
        PROJECT_ID,
        command([structuredClone(project.overlays[0]), bgmOverlay(3, "bgm_new")]) as any,
      );

      expect(result.disposition).toBe("APPLIED");
      const update = persistenceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
      expect(update.$set.overlays[0]).toBe(project.overlays[0]);
      expect(update.$set.overlays[1]).toMatchObject({ id: 3, assetId: "bgm_new" });
      expect(update.$set).toMatchObject({
        musicCoveragePlan: { version: "music-coverage-plan-v1" },
        "intelligence.audio.musicUsageMode": "embedded",
        "intelligence.audio.lastMusicAssignment": { derivativeAssetId: "bgm_new" },
      });
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        receiptId: expect.stringMatching(/^timeline-background-music_/),
        operation: "REPLACE_BACKGROUND_MUSIC",
        actorKind: "USER",
        beforeProjectRevision: { value: 4 },
        afterProjectRevision: { value: 5 },
        readFrameRangesBefore: [{ startFrame: 0, endFrame: 300 }],
        writeFrameRangesBefore: [{ startFrame: 0, endFrame: 300 }],
        affectedOverlayRefs: ["overlay:2", "overlay:3"],
        timelineCoordinateTransform: null,
        ripple: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a stale revision before any write", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(5, "2026-09-02T02:00:01.000Z"));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceBackgroundMusicAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command([videoOverlay(), bgmOverlay(3, "bgm_new")]) as any,
    )).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a forged non-BGM change", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceBackgroundMusicAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command([{ ...videoOverlay(), from: 1 }, bgmOverlay(3, "bgm_new")]) as any,
    )).rejects.toThrow("cannot alter or reorder non-BGM overlays");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects embedded BGM without licensed rights evidence", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");
    const rights = { mediaRole: "music", source: "preview-only", userChoice: "no-music", licensed: false };

    await expect(projectService.replaceBackgroundMusicAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command([videoOverlay(), bgmOverlay(3, "bgm_new", rights)], assignmentReceipt({
        musicRights: rights,
      })) as any,
    )).rejects.toThrow("Embedded background music requires licensed");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a BGM receipt that falsely claims beat-realigned cuts", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceBackgroundMusicAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(
        [videoOverlay(), bgmOverlay(3, "bgm_new")],
        assignmentReceipt({ beatRealignEnabled: true, snappedCutCount: 1 }),
      ) as any,
    )).rejects.toThrow("assignment evidence does not match");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
