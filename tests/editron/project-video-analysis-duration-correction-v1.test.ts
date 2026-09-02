import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashEditronCanonicalJsonV1 } from "@/lib/editron/services/canonical-json-v1";
import {
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type VerifiedVideoSourceTimeBindingV1,
} from "@/lib/editron/services/video-source-time-transform-v1";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  getAsset: vi.fn(),
  resolveSourceBinding: vi.fn(),
  outboxFindOne: vi.fn(),
  outboxInsertOne: vi.fn(),
  materializeMediaPrerequisite: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects", MEDIA_ASSETS: "mediaAssets" },
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
    getAsset: persistenceMocks.getAsset,
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/editron/services/video-source-time-transform-v1", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/editron/services/video-source-time-transform-v1")
  >();
  return {
    ...actual,
    resolveVerifiedVideoSourceTimeBindingV1: persistenceMocks.resolveSourceBinding,
  };
});

vi.mock("@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1", () => ({
  loadProjectWholeStateMediaPrerequisiteByLinkV1: vi.fn(),
  materializeProjectWholeStateMediaPrerequisiteInMongoV1:
    persistenceMocks.materializeMediaPrerequisite,
  projectWholeStateMediaPrerequisiteLinkV1: (receipt: any) => ({
    status: "MATERIALIZED",
    collection: "editron_project_whole_state_media_prerequisites_v1",
    receiptSha256: receipt.receiptSha256,
    candidateMediaSetSha256: receipt.candidateMediaSetSha256,
    candidateMediaContentSha256: receipt.candidateMediaContentSha256,
    mediaEntryCount: receipt.mediaEntries.length,
  }),
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
    persistenceMocks.getAsset.mockReset().mockResolvedValue({
      assetId: "asset-analyzed",
      type: "video",
    });
    persistenceMocks.resolveSourceBinding.mockReset().mockReturnValue(sourceBinding());
    persistenceMocks.outboxFindOne.mockReset().mockResolvedValue(null);
    persistenceMocks.outboxInsertOne.mockReset().mockResolvedValue({ acknowledged: true });
    persistenceMocks.materializeMediaPrerequisite.mockReset().mockImplementation(async (input) => ({
      ...input,
      mediaEntries: input.overlays.map((overlay: { id: number }) => ({ overlayId: overlay.id })),
      candidateMediaSetSha256: "e".repeat(64),
      candidateMediaContentSha256: "f".repeat(64),
      receiptSha256: "a".repeat(64),
    }));
  });

  it("uses the verified source frame count and corrects only one exact initial overlay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = {
        ...await durationCommand(project),
        observedDurationMs: 20_000,
      };

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
          observedDurationMs: 20_000,
          durationSource: "container",
          projectFps: 25,
          durationDerivation: "VERIFIED_SOURCE_FRAME_COUNT",
          sourceTimeBindingSha256: sourceBinding().bindingSha256,
          correctedDurationInFrames: 300,
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
            downstreamInvalidation: {
              status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
            },
            wholeStateMediaPrerequisite: {
              status: "MATERIALIZED",
              mediaEntryCount: 1,
            },
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
      expect(persistenceMocks.materializeMediaPrerequisite.mock.calls[0]?.[0]).toMatchObject({
        operation: "CORRECT_VIDEO_ANALYSIS_DURATION",
        projectRevision: { value: 7 },
        overlays: [expect.objectContaining({ id: 10, durationInFrames: 300 })],
      });
      expect(persistenceMocks.materializeMediaPrerequisite.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.outboxInsertOne.mock.invocationCallOrder[0]);
      expect(persistenceMocks.outboxInsertOne.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.updateOne.mock.invocationCallOrder[0]);
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

  it("reads complete legacy receipts but rejects partially upgraded receipt evidence", async () => {
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

    const legacyReceipt = structuredClone(first.correctionReceipt) as Record<string, any>;
    delete legacyReceipt.durationDerivation;
    delete legacyReceipt.sourceTimeBindingSha256;
    delete legacyReceipt.correctedDurationInFrames;
    legacyReceipt.timelineChangeReceipt.downstreamInvalidation = {
      status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
      affectedFrameRangesBefore: [{ startFrame: 0, endFrame: 300 }],
    };
    delete legacyReceipt.timelineChangeReceipt.wholeStateMediaPrerequisite;
    persistenceMocks.findOne.mockResolvedValueOnce({
      ...project,
      videoAnalysisDurationCorrectionReceipts: [legacyReceipt],
    });
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toMatchObject({ disposition: "ALREADY_APPLIED" });

    persistenceMocks.findOne.mockResolvedValueOnce({
      ...project,
      videoAnalysisDurationCorrectionReceipts: [{
        ...legacyReceipt,
        durationDerivation: "VERIFIED_SOURCE_FRAME_COUNT",
      }],
    });
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
  });

  it("blocks missing source timing, locks and media evidence before project mutation", async () => {
    const project = projectFixture();
    const command = await durationCommand(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.resolveSourceBinding.mockReturnValueOnce(null);
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toEqual({
      disposition: "NOT_ELIGIBLE",
      reason: "SOURCE_TIME_EVIDENCE_INCOMPLETE",
    });

    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.resolveSourceBinding.mockReturnValueOnce(sourceBinding({
      sourceCadence: { kind: "VFR" },
    }));
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toEqual({
      disposition: "NOT_ELIGIBLE",
      reason: "SOURCE_EVENT_REBIND_UNSUPPORTED",
    });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture({
      timelineRangeCutLocks: [{
        schemaVersion: 1,
        lockId: "timeline-cut-lock_durationcorrect001",
        actorKind: "USER",
        frameRange: { startFrame: 250, endFrame: 300 },
        acquiredAt: "2026-08-25T00:00:00.000Z",
        expiresAt: "2099-08-25T00:05:00.000Z",
      }],
    }));
    await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).rejects.toMatchObject({ code: "PROJECT_TIMELINE_RANGE_LOCKED" });

    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.materializeMediaPrerequisite.mockRejectedValueOnce(
      new Error("PROJECT_WHOLE_STATE_MEDIA_AUDIO_EVIDENCE_MISSING"),
    );
    const captured = await projectService.captureMutationReceipts(async () => {
      await expect(projectService.commitVideoAnalysisDurationCorrectionV1(
        USER_ID,
        PROJECT_ID,
        command,
      )).rejects.toThrow("PROJECT_WHOLE_STATE_MEDIA_AUDIO_EVIDENCE_MISSING");
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.outboxInsertOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
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

function sourceBinding(
  overrides: Partial<Omit<VerifiedVideoSourceTimeBindingV1, "bindingSha256">> = {},
): VerifiedVideoSourceTimeBindingV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: "asset-analyzed",
    sourceVersionSha256: "a".repeat(64),
    sourcePtsMapStateSha256: "b".repeat(64),
    mapBindingSha256: "c".repeat(64),
    terminalReceiptSha256: "d".repeat(64),
    sourceTimebase: { numerator: "1", denominator: "90000" },
    sourceCadence: { kind: "CFR" as const, durationTicks: "3600" },
    sourceStartPresentationTimestampTicks: "0",
    sourceEndExclusivePresentationTimestampTicks: String(300 * 3600),
    totalSourceFrameCount: "300",
    ...overrides,
  };
  return { ...material, bindingSha256: hashEditronCanonicalJsonV1(material) };
}
