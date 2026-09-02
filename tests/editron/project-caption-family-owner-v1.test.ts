import { ensureLiveAtomicOverlayReceipt } from "@/lib/editron/engine/overlay-atomic-receipts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  wholeStateMediaPrerequisite: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects", MEDIA_ASSETS: "media_assets" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      insertOne: persistenceMocks.insertOne,
      updateOne: persistenceMocks.updateOne,
    })),
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

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

const USER_ID = "user_caption_family";
const PROJECT_ID = "proj_caption_family";
const UPDATED_AT = "2026-09-02T00:00:00.000Z";

function videoOverlay() {
  return {
    id: 1,
    type: "video",
    from: 0,
    durationInFrames: 300,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    content: "r2://stored-master",
    styles: {},
  };
}

function captionOverlay(id: number, from = 30, durationInFrames = 120) {
  return ensureLiveAtomicOverlayReceipt({
    id,
    type: "caption",
    from,
    durationInFrames,
    row: 1,
    left: 160,
    top: 820,
    width: 1600,
    height: 180,
    captions: [{
      text: `Caption ${id}`,
      startMs: 0,
      endMs: 1_000,
      timestampMs: 0,
      confidence: 1,
      words: [{
        word: `Caption ${id}`,
        startMs: 0,
        endMs: 1_000,
        confidence: 1,
      }],
    }],
    styles: {
      fontFamily: "Noto Sans",
      fontSize: "64px",
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "center",
      lineHeight: 1.1,
      highlight: {
        color: "#000000",
        backgroundColor: "#ffff00",
        scale: 1,
        effect: "background",
        animation: "none",
      },
    },
  } as any, { source: "caption-owner-test" });
}

function projectFixture(projectRevision = 7, updatedAt = UPDATED_AT) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Caption family fixture",
    overlays: [videoOverlay(), captionOverlay(2)],
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

function expectedRevision() {
  return {
    schemaVersion: 1 as const,
    value: 7,
    compatibilityUpdatedAt: UPDATED_AT,
  };
}

describe("ProjectService caption-family owner V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
    persistenceMocks.updateOne.mockReset();
    persistenceMocks.wholeStateMediaPrerequisite.mockReset().mockImplementation(
      async (input: any) => ({
        ...input,
        mediaEntries: [],
        candidateMediaSetSha256: "a".repeat(64),
        candidateMediaContentSha256: "b".repeat(64),
        receiptSha256: "c".repeat(64),
      }),
    );
  });

  it("atomically replaces captions while persisting the exact stored non-caption objects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:01:00.000Z"));
    try {
      const project = projectFixture();
      const replacement = captionOverlay(3, 60, 90);
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
          expectedRevision: expectedRevision(),
          actorKind: "AGENT",
          candidateOverlays: [replacement, structuredClone(project.overlays[0])] as any,
        })
      ));

      expect(captured.value.disposition).toBe("APPLIED");
      expect(captured.receipts).toEqual([captured.value.mutationReceipt]);
      const update = persistenceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
      expect(update.$set.overlays[0]).toMatchObject({ id: 3, type: "caption" });
      expect(update.$set.overlays[1]).toBe(project.overlays[0]);
      expect(update.$inc).toEqual({ projectRevision: 1 });
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        receiptId: expect.stringMatching(/^timeline-caption-family_/),
        operation: "REPLACE_CAPTION_FAMILY",
        actorKind: "AGENT",
        beforeProjectRevision: { value: 7 },
        afterProjectRevision: { value: 8 },
        readFrameRangesBefore: [{ startFrame: 30, endFrame: 150 }],
        writeFrameRangesBefore: [
          { startFrame: 30, endFrame: 150 },
          { startFrame: 60, endFrame: 150 },
        ],
        affectedFrameRangesAfter: [{ startFrame: 60, endFrame: 150 }],
        affectedOverlayRefs: ["overlay:2", "overlay:3"],
        rangeObservation: "EXACT",
        overlayTemporalChange: null,
        timelineCoordinateTransform: null,
        ripple: null,
        downstreamInvalidation: {
          status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
        },
        wholeStateMediaPrerequisite: {
          status: "MATERIALIZED",
          mediaEntryCount: 0,
        },
      });
      expect(persistenceMocks.wholeStateMediaPrerequisite).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "REPLACE_CAPTION_FAMILY",
          overlays: [expect.objectContaining({ id: 3 })],
        }),
        expect.anything(),
        "media_assets",
      );
      expect(persistenceMocks.wholeStateMediaPrerequisite.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.insertOne.mock.invocationCallOrder[0]!);
      expect(persistenceMocks.insertOne.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.updateOne.mock.invocationCallOrder[0]!);
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks caption replacement before invalidation and CAS when admission fails", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.wholeStateMediaPrerequisite.mockRejectedValueOnce(
      new Error("PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_UNAVAILABLE"),
    );
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
      actorKind: "AGENT",
      candidateOverlays: [videoOverlay(), captionOverlay(3)] as any,
    })).rejects.toThrow("PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_UNAVAILABLE");
    expect(persistenceMocks.insertOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a stale caller revision before any write", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(8, "2026-09-02T00:00:01.000Z"));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
      actorKind: "AGENT",
      candidateOverlays: [videoOverlay(), captionOverlay(3)] as any,
    })).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 8 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a forged non-caption mutation before any write", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
      expectedRevision: expectedRevision(),
      actorKind: "AGENT",
      candidateOverlays: [{ ...videoOverlay(), from: 1 }, captionOverlay(3)] as any,
    })).rejects.toThrow("cannot alter or reorder non-caption overlays");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a caption write that overlaps an active timeline range lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:01:00.000Z"));
    try {
      const project = {
        ...projectFixture(),
        timelineRangeCutLocks: [{
          schemaVersion: 1,
          lockId: "timeline-cut-lock_123456789012345678",
          actorKind: "USER",
          frameRange: { startFrame: 50, endFrame: 80 },
          acquiredAt: "2026-09-02T00:00:00.000Z",
          expiresAt: "2026-09-02T00:05:00.000Z",
        }],
      };
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
        expectedRevision: expectedRevision(),
        actorKind: "AGENT",
        candidateOverlays: [videoOverlay(), captionOverlay(3, 60, 90)] as any,
      })).rejects.toMatchObject({
        code: "PROJECT_TIMELINE_RANGE_LOCKED",
        blockingLockIds: ["timeline-cut-lock_123456789012345678"],
      });
      expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an honest no-op without writing or publishing a receipt", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.replaceCaptionFamilyAtRevisionV1(USER_ID, PROJECT_ID, {
        expectedRevision: expectedRevision(),
        actorKind: "USER",
        candidateOverlays: structuredClone(project.overlays) as any,
      })
    ));

    expect(captured.value).toEqual({
      disposition: "UNCHANGED",
      mutationReceipt: null,
      timelineChangeReceipt: null,
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
