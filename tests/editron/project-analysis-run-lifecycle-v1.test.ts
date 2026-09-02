import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  outboxFindOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => (
      name === "editron_project_render_snapshot_invalidation_outbox_v1"
        ? {
            findOne: persistenceMocks.outboxFindOne,
            insertOne: persistenceMocks.insertOne,
          }
        : {
            findOne: persistenceMocks.findOne,
            updateOne: persistenceMocks.updateOne,
          }
    )),
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

const PROJECT_ID = "proj_analysis_lifecycle";
const USER_ID = "user_analysis_lifecycle";
const ASSET_ID = "asset_video_1";
const RUN_ID = "analysis_run_12345678901234567890";
const UPDATED_AT = "2026-09-01T12:00:00.000Z";

function revision(value = 4, compatibilityUpdatedAt = UPDATED_AT) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt };
}

function run(state: string = "queued", lane: "auto" | "assist" = "auto") {
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    admissionHash: "analysis_admission_hash",
    sourceAssetId: ASSET_ID,
    creditTransactionId: "credit_tx_1",
    chargedCredits: 12,
    lane,
    state,
    admittedRevision: revision(3),
    admittedAt: "2026-09-01T11:59:59.000Z",
    updatedAt: UPDATED_AT,
  };
}

function project(state = "queued", overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    fps: 30,
    durationInFrames: 300,
    overlays: [{
      id: 1,
      type: "video",
      assetId: ASSET_ID,
      from: 0,
      durationInFrames: 300,
    }],
    autoEditStatus: state,
    autoEditAnalysisRunV1: run(state),
    projectRevision: 4,
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
  persistenceMocks.outboxFindOne.mockResolvedValue(null);
  persistenceMocks.insertOne.mockResolvedValue({ acknowledged: true });
});

describe("ProjectService analysis-run lifecycle V1", () => {
  it("advances one exact run and emits its revision receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project());
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.advanceProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
          expectedRevision: revision(),
          runId: RUN_ID,
          sourceAssetId: ASSET_ID,
          fromState: "queued",
          toState: "analyzing",
        })
      ));

      expect(captured.value).toMatchObject({
        disposition: "ADVANCED",
        run: { runId: RUN_ID, state: "analyzing" },
        receipt: { revision: { value: 5, compatibilityUpdatedAt: "2026-09-01T12:00:01.000Z" } },
      });
      if (captured.value.disposition !== "ADVANCED") throw new Error("expected advancement");
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 4,
          autoEditStatus: "queued",
          "autoEditAnalysisRunV1.runId": RUN_ID,
          "autoEditAnalysisRunV1.sourceAssetId": ASSET_ID,
          "autoEditAnalysisRunV1.state": "queued",
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "analyzing",
            autoEditStartedAt: new Date("2026-09-01T12:00:01.000Z"),
            autoEditAnalysisRunV1: expect.objectContaining({ state: "analyzing" }),
          }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays only the exact current target state without another write", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(project("analyzing", {
      projectRevision: 5,
      updatedAt: new Date("2026-09-01T12:00:01.000Z"),
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.advanceProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      fromState: "queued",
      toState: "analyzing",
    })).resolves.toMatchObject({ disposition: "ALREADY_ADVANCED", run: { state: "analyzing" } });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects illegal jumps before Mongo and stale revisions before mutation", async () => {
    const { projectService, ProjectMutationConflictError } = await import(
      "@/lib/editron/services/project-service"
    );
    await expect(projectService.advanceProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      fromState: "queued",
      toState: "directing_queued",
    })).rejects.toThrow("legal state transition");
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();

    persistenceMocks.findOne.mockResolvedValueOnce(project("queued", {
      projectRevision: 5,
      updatedAt: new Date("2026-09-01T12:00:02.000Z"),
    }));
    await expect(projectService.advanceProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      fromState: "queued",
      toState: "analyzing",
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns ownership loss for the wrong run and for an Assist failure", async () => {
    persistenceMocks.findOne
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project("analyzing", {
        autoEditAnalysisRunV1: run("analyzing", "assist"),
        editMode: "assist",
      }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.advanceProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: "analysis_run_wrong_1234567890",
      sourceAssetId: ASSET_ID,
      fromState: "queued",
      toState: "analyzing",
    })).resolves.toEqual({ disposition: "OWNERSHIP_LOST" });
    await expect(projectService.failProjectAnalysisRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      errorMessage: "decoder failed",
    })).resolves.toEqual({ disposition: "OWNERSHIP_LOST" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("terminalizes only the exact automatic run and makes replay idempotent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:03.000Z"));
    try {
      persistenceMocks.findOne
        .mockResolvedValueOnce(project("analyzing"))
        .mockResolvedValueOnce(project("failed", {
          autoEditAnalysisRunV1: run("failed"),
          projectRevision: 5,
          updatedAt: new Date("2026-09-01T12:00:03.000Z"),
        }));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = {
        expectedRevision: revision(),
        runId: RUN_ID,
        sourceAssetId: ASSET_ID,
        errorMessage: "decoder failed",
      };

      await expect(projectService.failProjectAnalysisRunV1(USER_ID, PROJECT_ID, command))
        .resolves.toMatchObject({ disposition: "RECORDED", run: { state: "failed" } });
      await expect(projectService.failProjectAnalysisRunV1(USER_ID, PROJECT_ID, command))
        .resolves.toMatchObject({ disposition: "ALREADY_RECORDED", run: { state: "failed" } });
      expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          autoEditStatus: "analyzing",
          "autoEditAnalysisRunV1.runId": RUN_ID,
          "autoEditAnalysisRunV1.state": "analyzing",
          editMode: { $ne: "assist" },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "failed",
            autoEditError: "decoder failed",
            autoEditAnalysisRunV1: expect.objectContaining({ state: "failed" }),
          }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("atomically binds Phase-1 evidence, native audio, lifecycle and receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:04.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project("computing_params"));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const captured = await projectService.captureMutationReceipts(() => (
        projectService.commitProjectAnalysisPhase1V1(USER_ID, PROJECT_ID, {
          expectedRevision: revision(),
          runId: RUN_ID,
          sourceAssetId: ASSET_ID,
          fromState: "computing_params",
          evidence: {
            rawFootageAnalysis: { transcription: { words: [{ text: "hello" }] } },
            vjepaAnalysis: { modelVersion: "vjepa-2" },
            nativeAudioEvidence: {
              hasNativeAudio: true,
              hasSpeech: true,
              source: "transcription",
              wordCount: 1,
              speechCoverage: 0.5,
              speechRegions: [{
                sourceStartFrame: 0,
                sourceEndFrame: 30,
                startMs: 0,
                endMs: 1000,
              }],
              regionCount: 1,
            },
          },
        })
      ));

      expect(captured.value).toMatchObject({
        disposition: "ADVANCED",
        run: {
          state: "analysis_complete",
          phase1EvidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          phase1EvidenceCommittedAt: "2026-09-01T12:00:04.000Z",
          phase1ProjectRenderSnapshotInvalidation: expect.objectContaining({
            receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            beforeRevision: revision(),
            afterRevision: revision(5, "2026-09-01T12:00:04.000Z"),
          }),
        },
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRevision: 4,
          autoEditStatus: "computing_params",
          "autoEditAnalysisRunV1.runId": RUN_ID,
          overlays: { $elemMatch: { type: "video", assetId: ASSET_ID } },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "analysis_complete",
            rawFootageAnalysis: expect.any(Object),
            "rawFootageAnalysisByAsset.YXNzZXRfdmlkZW9fMQ": expect.any(Object),
            "overlays.$[analysisSource].hasNativeAudio": true,
            "overlays.$[analysisSource].metadata.nativeAudioEvidence": expect.objectContaining({
              sourceAssetId: ASSET_ID,
              sourceVersion: "analysis_admission_hash",
              evidenceId: expect.stringMatching(/^native_audio_[a-f0-9]{64}$/),
            }),
          }),
          $inc: { projectRevision: 1 },
        }),
        { arrayFilters: [{ "analysisSource.type": "video", "analysisSource.assetId": ASSET_ID }] },
      );
      expect(persistenceMocks.insertOne).toHaveBeenCalledOnce();
      expect(persistenceMocks.insertOne.mock.invocationCallOrder[0])
        .toBeLessThan(persistenceMocks.updateOne.mock.invocationCallOrder[0]!);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not publish native-audio evidence when render invalidation is unavailable", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(project("computing_params"));
    persistenceMocks.insertOne.mockRejectedValueOnce(new Error("OUTBOX_UNAVAILABLE"));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitProjectAnalysisPhase1V1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      fromState: "computing_params",
      evidence: {
        nativeAudioEvidence: {
          hasNativeAudio: true,
          hasSpeech: true,
          source: "transcription",
          wordCount: 1,
          speechCoverage: 0.5,
          speechRegions: [{
            sourceStartFrame: 0,
            sourceEndFrame: 30,
            startMs: 0,
            endMs: 1000,
          }],
          regionCount: 1,
        },
      },
    })).rejects.toThrow("Project render invalidation could not be durably enqueued");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects malformed or oversized Phase-1 evidence before Mongo", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");
    await expect(projectService.commitProjectAnalysisPhase1V1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      fromState: "computing_params",
      evidence: {
        nativeAudioEvidence: {
          hasNativeAudio: true,
          hasSpeech: true,
          source: "transcription",
          wordCount: 1,
          speechCoverage: 0.5,
          speechRegions: [],
          regionCount: 1,
        },
      },
    })).rejects.toThrow("bounded evidence bundle");
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
  });
});
