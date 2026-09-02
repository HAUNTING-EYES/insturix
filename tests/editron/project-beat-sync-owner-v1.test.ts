import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  projectFindOne: vi.fn(),
  mediaFindOne: vi.fn(),
  outboxFindOne: vi.fn(),
  outboxInsertOne: vi.fn(),
  projectUpdateOne: vi.fn(),
  wholeStateMediaPrerequisite: vi.fn(),
  resolveSourceBinding: vi.fn(),
  classifySourceRate: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects", MEDIA_ASSETS: "media_assets" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => (
      name === "projects"
        ? {
            findOne: persistenceMocks.projectFindOne,
            updateOne: persistenceMocks.projectUpdateOne,
          }
        : name === "media_assets"
          ? { findOne: persistenceMocks.mediaFindOne }
          : {
              findOne: persistenceMocks.outboxFindOne,
              insertOne: persistenceMocks.outboxInsertOne,
            }
    )),
  })),
  connectToDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1", () => ({
  materializeProjectWholeStateMediaPrerequisiteInMongoV1:
    persistenceMocks.wholeStateMediaPrerequisite,
  projectWholeStateMediaPrerequisiteLinkV1: (receipt: any) => ({
    status: "MATERIALIZED",
    collection: "editron_project_whole_state_media_prerequisites_v1",
    receiptSha256: receipt.receiptSha256,
    candidateMediaSetSha256: receipt.candidateMediaSetSha256,
    candidateMediaContentSha256: receipt.candidateMediaContentSha256,
    mediaEntryCount: receipt.mediaEntries.length,
  }),
}));

vi.mock("@/lib/editron/services/video-source-time-transform-v1", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/editron/services/video-source-time-transform-v1")>(),
  resolveVerifiedVideoSourceTimeBindingV1: persistenceMocks.resolveSourceBinding,
  classifyVerifiedVideoSourceRateCompatibilityV1: persistenceMocks.classifySourceRate,
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

const USER_ID = "user_beat_owner";
const PROJECT_ID = "proj_beat_owner";
const UPDATED_AT = "2026-09-02T03:00:00.000Z";

function musicRights() {
  return {
    mediaRole: "music",
    source: "generated",
    userChoice: "attested",
    licensed: true,
    evidence: {
      kind: "generated-provider",
      sourceAssetId: "music-a",
      licenseId: "provider-license-beat-001",
    },
  };
}

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Beat owner fixture",
    fps: 30,
    durationInFrames: 150,
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    overlays: [
      {
        id: 1,
        type: "video",
        row: 0,
        assetId: "video-a",
        from: 0,
        durationInFrames: 60,
        sourceStartFrame: 0,
        videoStartTime: 0,
      },
      {
        id: 2,
        type: "video",
        row: 0,
        assetId: "video-b",
        from: 60,
        durationInFrames: 60,
        sourceStartFrame: 12,
        videoStartTime: 12,
      },
      {
        id: 3,
        type: "sound",
        row: 1,
        assetId: "music-a",
        from: 30,
        durationInFrames: 120,
        startFromSound: 30,
        musicRights: musicRights(),
        beatGrid: {
          bpm: 120,
          bpmConfidence: 0.94,
          beats: [{ frame: 63, strength: 0.9, isDownbeat: true }],
          downbeats: [63],
        },
      },
      {
        id: 4,
        type: "transition",
        row: 2,
        from: 60,
        durationInFrames: 6,
        clipAId: 1,
        clipBId: 2,
        boundaryFrame: 60,
      },
    ],
    createdAt: new Date(UPDATED_AT),
    updatedAt: new Date(UPDATED_AT),
    projectRevision: 4,
    visibility: "private" as const,
    ...overrides,
  };
}

function command() {
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 4,
      compatibilityUpdatedAt: UPDATED_AT,
    },
    actorKind: "AGENT" as const,
    audioOverlayId: 3,
    beatFilter: "downbeats" as const,
    strengthThreshold: 0.6,
    evidenceSource: "persisted-beat-grid" as const,
  };
}

function installMediaAssets(firstVideoDuration = 3) {
  const assets = new Map<string, Record<string, unknown>>([
    ["music-a", { assetId: "music-a", userId: USER_ID, type: "audio", duration: 8 }],
    ["video-a", { assetId: "video-a", userId: USER_ID, type: "video", duration: firstVideoDuration }],
    ["video-b", { assetId: "video-b", userId: USER_ID, type: "video", duration: 3 }],
  ]);
  persistenceMocks.mediaFindOne.mockImplementation(async (query: { assetId?: string }) => (
    query.assetId ? assets.get(query.assetId) ?? null : null
  ));
}

describe("ProjectService beat-sync owner V1", () => {
  beforeEach(() => {
    persistenceMocks.projectFindOne.mockReset();
    persistenceMocks.mediaFindOne.mockReset();
    persistenceMocks.outboxFindOne.mockReset().mockResolvedValue(null);
    persistenceMocks.outboxInsertOne.mockReset().mockResolvedValue({ acknowledged: true });
    persistenceMocks.projectUpdateOne.mockReset();
    persistenceMocks.wholeStateMediaPrerequisite.mockReset().mockImplementation(
      async (input: any) => ({
        ...input,
        mediaEntries: input.overlays
          .filter((overlay: any) => ["video", "image", "sound", "mg-sequence"]
            .includes(overlay.type))
          .map((overlay: any) => ({ overlayId: overlay.id })),
        candidateMediaSetSha256: "a".repeat(64),
        candidateMediaContentSha256: "b".repeat(64),
        receiptSha256: "c".repeat(64),
      }),
    );
    persistenceMocks.resolveSourceBinding.mockReset().mockImplementation(
      (asset: { assetId?: string; duration?: number }) => ({
        assetId: asset.assetId,
        totalSourceFrameCount: String(Math.round((asset.duration ?? 0) * 30)),
      }),
    );
    persistenceMocks.classifySourceRate.mockReset().mockReturnValue({
      disposition: "COMPATIBLE_SAME_RATE_CFR",
    });
    installMediaAssets();
  });

  it("recomputes and commits one rights-bound cut with its linked transition", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T03:01:00.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.projectFindOne.mockResolvedValueOnce(project);
      persistenceMocks.projectUpdateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const result = await projectService.alignCutsToBeatsAtRevisionV1(
        USER_ID,
        PROJECT_ID,
        command(),
      );

      expect(result).toMatchObject({
        disposition: "APPLIED",
        resolution: { sourceBeatCount: 1, timelineBeatCount: 1, alignment: { snappedCount: 1 } },
      });
      const update = persistenceMocks.projectUpdateOne.mock.calls[0]?.[1] as Record<string, any>;
      expect(update.$set.overlays.find((overlay: any) => overlay.id === 1)).toMatchObject({
        from: 0,
        durationInFrames: 63,
      });
      expect(update.$set.overlays.find((overlay: any) => overlay.id === 2)).toMatchObject({
        from: 63,
        durationInFrames: 57,
        sourceStartFrame: 15,
        videoStartTime: 15,
      });
      expect(update.$set.overlays.find((overlay: any) => overlay.id === 3)).toBe(project.overlays[2]);
      expect(update.$set.overlays.find((overlay: any) => overlay.id === 4)).toMatchObject({
        from: 63,
        boundaryFrame: 63,
      });
      expect(update.$set.latestBeatSync).toMatchObject({
        version: "project-beat-sync-v1",
        audioOverlayId: 3,
        audioAssetId: "music-a",
        changes: [{ originalFrame: 60, alignedFrame: 63, shiftFrames: 3 }],
        sourceDurationFramesByAssetId: { "video-a": 90, "video-b": 90 },
      });
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        receiptId: expect.stringMatching(/^timeline-beat-sync_/),
        operation: "ALIGN_CUTS_TO_BEATS",
        actorKind: "AGENT",
        beforeProjectRevision: { value: 4 },
        afterProjectRevision: { value: 5 },
        downstreamInvalidation: {
          status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
        },
        wholeStateMediaPrerequisite: {
          status: "MATERIALIZED",
          mediaEntryCount: 3,
        },
      });
      expect(persistenceMocks.wholeStateMediaPrerequisite).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "ALIGN_CUTS_TO_BEATS",
          overlays: expect.arrayContaining([
            expect.objectContaining({ id: 1, type: "video" }),
            expect.objectContaining({ id: 2, type: "video" }),
            expect.objectContaining({ id: 3, type: "sound" }),
          ]),
        }),
        expect.anything(),
        "media_assets",
      );
      expect(persistenceMocks.wholeStateMediaPrerequisite.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.outboxInsertOne.mock.invocationCallOrder[0]!);
      expect(persistenceMocks.outboxInsertOne.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.projectUpdateOne.mock.invocationCallOrder[0]!);
    } finally {
      vi.useRealTimers();
    }
  });

  it("safe-stops before mutation when exact source timing is unavailable", async () => {
    persistenceMocks.projectFindOne.mockResolvedValueOnce(projectFixture());
    persistenceMocks.resolveSourceBinding.mockReturnValueOnce(null);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.alignCutsToBeatsAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(),
    )).resolves.toMatchObject({
      disposition: "SAFE_STOP",
      reason: "SOURCE_TIME_EVIDENCE_INCOMPLETE",
      currentRevision: { value: 4 },
    });
    expect(persistenceMocks.wholeStateMediaPrerequisite).not.toHaveBeenCalled();
    expect(persistenceMocks.outboxInsertOne).not.toHaveBeenCalled();
    expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("blocks beat alignment before invalidation and CAS when media admission fails", async () => {
    persistenceMocks.projectFindOne.mockResolvedValueOnce(projectFixture());
    persistenceMocks.wholeStateMediaPrerequisite.mockRejectedValueOnce(
      new Error("PROJECT_WHOLE_STATE_MEDIA_AUDIO_EVIDENCE_MISSING"),
    );
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.alignCutsToBeatsAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(),
    )).rejects.toThrow("PROJECT_WHOLE_STATE_MEDIA_AUDIO_EVIDENCE_MISSING");
    expect(persistenceMocks.outboxInsertOne).not.toHaveBeenCalled();
    expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a stale revision before reading assets or writing", async () => {
    persistenceMocks.projectFindOne.mockResolvedValueOnce(projectFixture({
      projectRevision: 5,
      updatedAt: new Date("2026-09-02T03:00:01.000Z"),
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.alignCutsToBeatsAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(),
    )).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
    expect(persistenceMocks.mediaFindOne).not.toHaveBeenCalled();
    expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects music without durable rights evidence", async () => {
    const project = projectFixture();
    (project.overlays[2] as any).musicRights = undefined;
    persistenceMocks.projectFindOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.alignCutsToBeatsAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(),
    )).rejects.toThrow("valid music-role rights evidence");
    expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("returns a no-op when source handles cannot prove the boundary shift", async () => {
    installMediaAssets(2);
    persistenceMocks.projectFindOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.alignCutsToBeatsAtRevisionV1(
      USER_ID,
      PROJECT_ID,
      command(),
    );

    expect(result).toMatchObject({
      disposition: "UNCHANGED",
      reason: "NO_SAFE_BOUNDARY_ALIGNMENT",
      resolution: {
        alignment: {
          rejections: expect.arrayContaining([
            expect.objectContaining({ reason: "insufficient-source-handle" }),
          ]),
        },
      },
    });
    expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a cut whose exact boundary range is actively locked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T03:01:00.000Z"));
    try {
      persistenceMocks.projectFindOne.mockResolvedValueOnce(projectFixture({
        timelineRangeCutLocks: [{
          schemaVersion: 1,
          lockId: "timeline-cut-lock_abcdefghijklmnopqr",
          actorKind: "USER",
          frameRange: { startFrame: 61, endFrame: 64 },
          acquiredAt: "2026-09-02T03:00:00.000Z",
          expiresAt: "2026-09-02T03:05:00.000Z",
        }],
      }));
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.alignCutsToBeatsAtRevisionV1(
        USER_ID,
        PROJECT_ID,
        command(),
      )).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });
      expect(persistenceMocks.projectUpdateOne).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
