import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({ findOne: vi.fn(), updateOne: vi.fn() }));

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

const PROJECT_ID = "proj_deep";
const USER_ID = "user_deep";
const ASSET_ID = "asset_deep";
const RUN_ID = "analysis_run_12345678901234567890";
const UPDATED_AT = "2026-09-01T12:00:00.000Z";

function revision(value = 7, at = UPDATED_AT) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt: at };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    admissionHash: "admission_hash",
    sourceAssetId: ASSET_ID,
    creditTransactionId: "credit_tx",
    chargedCredits: 12,
    lane: "auto",
    state: "analysis_complete",
    admittedRevision: revision(1),
    admittedAt: "2026-09-01T11:00:00.000Z",
    updatedAt: UPDATED_AT,
    phase1EvidenceHash: "phase1_hash",
    phase1EvidenceCommittedAt: UPDATED_AT,
    ...overrides,
  };
}

function project(runValue = run(), overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    overlays: [{ id: 1, type: "video", assetId: ASSET_ID }],
    autoEditStatus: runValue.state,
    autoEditAnalysisRunV1: runValue,
    projectRevision: 7,
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService deep-analysis lifecycle V1", () => {
  it("claims Phase 2 with a server lease and revision receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project());
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const captured = await projectService.captureMutationReceipts(() => (
        projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, {
          expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID,
        })
      ));
      expect(captured.value).toMatchObject({
        disposition: "CLAIMED",
        reclaimed: false,
        lease: {
          leaseId: expect.stringMatching(/^analysis_deep_lease_/),
          claimedAt: "2026-09-01T12:00:01.000Z",
          expiresAt: "2026-09-01T12:15:01.000Z",
        },
        run: { state: "analyzing_deep" },
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ projectRevision: 7, autoEditStatus: "analysis_complete" }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "analyzing_deep",
            autoEditAnalysisRunV1: expect.objectContaining({ state: "analyzing_deep" }),
          }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally { vi.useRealTimers(); }
  });

  it("skips an active duplicate and reclaims only an expired lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:20:00.000Z"));
    try {
      const active = run({
        state: "analyzing_deep",
        deepAnalysisLease: {
          schemaVersion: 1,
          leaseId: "active_lease",
          claimedAt: "2026-09-01T12:10:00.000Z",
          expiresAt: "2026-09-01T12:25:00.000Z",
        },
      });
      const expired = run({
        state: "analyzing_deep",
        deepAnalysisLease: {
          schemaVersion: 1,
          leaseId: "expired_lease",
          claimedAt: "2026-09-01T12:00:00.000Z",
          expiresAt: "2026-09-01T12:15:00.000Z",
        },
      });
      persistenceMocks.findOne
        .mockResolvedValueOnce(project(active))
        .mockResolvedValueOnce(project(expired));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = { expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID };
      await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, command))
        .resolves.toMatchObject({ disposition: "DUPLICATE_ACTIVE" });
      await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, command))
        .resolves.toMatchObject({ disposition: "CLAIMED", reclaimed: true });
      expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
      expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toMatchObject({
        "autoEditAnalysisRunV1.deepAnalysisLease.leaseId": "expired_lease",
      });
    } finally { vi.useRealTimers(); }
  });

  it("commits exact Phase-2 evidence and prepares a durable Director dispatch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:02.000Z"));
    try {
      const lease = {
        schemaVersion: 1,
        leaseId: "lease_exact",
        claimedAt: "2026-09-01T11:50:00.000Z",
        expiresAt: "2026-09-01T12:05:00.000Z",
      };
      persistenceMocks.findOne.mockResolvedValueOnce(project(run({ state: "analyzing_deep", deepAnalysisLease: lease })));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const result = await projectService.commitProjectAnalysisPhase2V1(USER_ID, PROJECT_ID, {
        expectedRevision: revision(),
        runId: RUN_ID,
        sourceAssetId: ASSET_ID,
        leaseId: "lease_exact",
        evidence: {
          vjepaAnalysis: { segments: [{ score: 0.8 }] },
          wav2vecAnalysis: { segments: [{ emotion: 0.7 }] },
          musicAnalysis: { bpm: 100 },
          momentWeightMap: { weights: [0.8] },
          segmentAnalysis: { segments: [{ id: "s1" }] },
        },
      });
      expect(result).toMatchObject({
        disposition: "ADVANCED",
        run: {
          state: "directing_queued",
          phase2EvidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          directorDispatch: {
            status: "pending",
            deduplicationId: expect.stringMatching(/^editron_director_/),
          },
        },
      });
      if (result.disposition !== "ADVANCED") throw new Error("expected Phase-2 commit");
      expect(result.run).not.toHaveProperty("deepAnalysisLease");
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          autoEditStatus: "analyzing_deep",
          "autoEditAnalysisRunV1.deepAnalysisLease.leaseId": "lease_exact",
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "directing_queued",
            musicAnalysis: { bpm: 100 },
            "musicAnalysisByAsset.YXNzZXRfZGVlcA": { bpm: 100 },
          }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally { vi.useRealTimers(); }
  });

  it("records one exact provider publication and replays it idempotently", async () => {
    const pendingDispatch = {
      schemaVersion: 1,
      deduplicationId: "dispatch_1",
      status: "pending",
      preparedAt: UPDATED_AT,
    };
    const pending = run({
      state: "directing_queued",
      phase2EvidenceHash: "phase2_hash",
      phase2EvidenceCommittedAt: UPDATED_AT,
      directorDispatch: pendingDispatch,
    });
    const published = run({
      ...pending,
      directorDispatch: {
        ...pendingDispatch,
        status: "published",
        publishedAt: "2026-09-01T12:00:03.000Z",
        providerMessageId: "msg_1",
      },
    });
    persistenceMocks.findOne
      .mockResolvedValueOnce(project(pending))
      .mockResolvedValueOnce(project(published, {
        projectRevision: 8,
        updatedAt: new Date("2026-09-01T12:00:03.000Z"),
      }));
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      deduplicationId: "dispatch_1",
      providerMessageId: "msg_1",
    };
    await expect(projectService.recordProjectAnalysisDirectorDispatchPublishedV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({ disposition: "ADVANCED", run: { directorDispatch: { status: "published" } } });
    await expect(projectService.recordProjectAnalysisDirectorDispatchPublishedV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({ disposition: "ALREADY_ADVANCED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects the wrong lease and malformed evidence without mutation", async () => {
    const active = run({
      state: "analyzing_deep",
      deepAnalysisLease: {
        schemaVersion: 1,
        leaseId: "lease_real",
        claimedAt: "2026-09-01T11:50:00.000Z",
        expiresAt: "2026-09-01T12:05:00.000Z",
      },
    });
    persistenceMocks.findOne.mockResolvedValueOnce(project(active));
    const { projectService } = await import("@/lib/editron/services/project-service");
    await expect(projectService.commitProjectAnalysisPhase2V1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID,
      leaseId: "lease_wrong", evidence: {},
    })).resolves.toEqual({ disposition: "OWNERSHIP_LOST" });
    await expect(projectService.commitProjectAnalysisPhase2V1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID,
      leaseId: "lease_real", evidence: { vjepaAnalysis: new Date() },
    })).rejects.toThrow("canonical JSON");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
