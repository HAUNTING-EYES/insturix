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

const PROJECT_ID = "proj_deep_dispatch";
const USER_ID = "user_deep_dispatch";
const ASSET_ID = "asset_deep_dispatch";
const RUN_ID = "analysis_run_12345678901234567890";
const BASE_AT = "2026-09-01T12:00:00.000Z";
const DISPATCH_ID = "editron_tribe_dispatch_exact";

function revision(value = 7, at = BASE_AT) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt: at };
}

function dispatch(status: "pending" | "published" | "inline_ready" = "pending") {
  return {
    schemaVersion: 1 as const,
    deduplicationId: DISPATCH_ID,
    status,
    preparedAt: BASE_AT,
    ...(status === "published"
      ? { publishedAt: "2026-09-01T12:00:01.000Z", providerMessageId: "qstash_message_1" }
      : {}),
    ...(status === "inline_ready"
      ? { inlineReadyAt: "2026-09-01T12:00:01.000Z" }
      : {}),
  };
}

function analysisRun(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    runId: RUN_ID,
    admissionHash: "admission_hash",
    sourceAssetId: ASSET_ID,
    creditTransactionId: "credit_tx",
    chargedCredits: 12,
    lane: "auto" as const,
    state: "analysis_complete",
    admittedRevision: revision(1, "2026-09-01T11:00:00.000Z"),
    admittedAt: "2026-09-01T11:00:00.000Z",
    updatedAt: BASE_AT,
    phase1EvidenceHash: "phase1_hash",
    phase1EvidenceCommittedAt: BASE_AT,
    ...overrides,
  };
}

function project(run = analysisRun(), projectRevision = 7, updatedAt = BASE_AT) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    overlays: [{ id: 1, type: "video", assetId: ASSET_ID }],
    autoEditStatus: run.state,
    autoEditAnalysisRunV1: run,
    projectRevision,
    updatedAt: new Date(updatedAt),
  };
}

beforeEach(() => {
  vi.useRealTimers();
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService analysis deep dispatch V1", () => {
  it("prepares one deterministic dispatch from committed Phase-1 evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project());
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const result = await projectService.prepareProjectAnalysisDeepDispatchV1(USER_ID, PROJECT_ID, {
        expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID,
      });

      expect(result).toMatchObject({
        disposition: "ADVANCED",
        run: {
          state: "analysis_complete",
          deepAnalysisDispatch: {
            status: "pending",
            deduplicationId: expect.stringMatching(/^editron_tribe_[a-f0-9]{48}$/),
            preparedAt: "2026-09-01T12:00:01.000Z",
          },
        },
        receipt: { revision: { value: 8 } },
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRevision: 7,
          autoEditStatus: "analysis_complete",
          "autoEditAnalysisRunV1.runId": RUN_ID,
          "autoEditAnalysisRunV1.sourceAssetId": ASSET_ID,
          "autoEditAnalysisRunV1.deepAnalysisDispatch": { $exists: false },
        }),
        expect.objectContaining({ $inc: { projectRevision: 1 } }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks an early delivery and rejects a forged dispatch without mutation", async () => {
    const pendingRun = analysisRun({ deepAnalysisDispatch: dispatch() });
    persistenceMocks.findOne
      .mockResolvedValueOnce(project(pendingRun))
      .mockResolvedValueOnce(project(pendingRun));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      deepAnalysisDispatchId: DISPATCH_ID,
    })).resolves.toMatchObject({ disposition: "DEEP_DISPATCH_PENDING" });
    await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      deepAnalysisDispatchId: "forged_dispatch",
    })).resolves.toEqual({ disposition: "OWNERSHIP_LOST" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("records provider publication before claiming the exact execution lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      const pendingRun = analysisRun({ deepAnalysisDispatch: dispatch() });
      const publishedRun = analysisRun({
        updatedAt: "2026-09-01T12:00:01.000Z",
        deepAnalysisDispatch: dispatch("published"),
      });
      persistenceMocks.findOne
        .mockResolvedValueOnce(project(pendingRun))
        .mockResolvedValueOnce(project(publishedRun, 8, "2026-09-01T12:00:01.000Z"));
      persistenceMocks.updateOne
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.recordProjectAnalysisDeepDispatchPublishedV1(USER_ID, PROJECT_ID, {
        expectedRevision: revision(),
        runId: RUN_ID,
        sourceAssetId: ASSET_ID,
        deduplicationId: DISPATCH_ID,
        providerMessageId: "qstash_message_1",
      })).resolves.toMatchObject({
        disposition: "ADVANCED",
        run: { deepAnalysisDispatch: { status: "published" } },
      });
      await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, {
        expectedRevision: revision(8, "2026-09-01T12:00:01.000Z"),
        runId: RUN_ID,
        sourceAssetId: ASSET_ID,
        deepAnalysisDispatchId: DISPATCH_ID,
      })).resolves.toMatchObject({ disposition: "CLAIMED", run: { state: "analyzing_deep" } });
      expect(persistenceMocks.updateOne.mock.calls[1]?.[0]).toMatchObject({
        "autoEditAnalysisRunV1.deepAnalysisDispatch.status": "published",
        "autoEditAnalysisRunV1.deepAnalysisDispatch.deduplicationId": DISPATCH_ID,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("activates a trusted inline dispatch before claiming its exact execution lease", async () => {
    const pendingRun = analysisRun({ deepAnalysisDispatch: dispatch() });
    const inlineRun = analysisRun({ deepAnalysisDispatch: dispatch("inline_ready") });
    persistenceMocks.findOne
      .mockResolvedValueOnce(project(pendingRun))
      .mockResolvedValueOnce(project(inlineRun, 8, "2026-09-01T12:00:01.000Z"));
    persistenceMocks.updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.recordProjectAnalysisDeepDispatchInlineReadyV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      deduplicationId: DISPATCH_ID,
    })).resolves.toMatchObject({
      disposition: "ADVANCED",
      run: { deepAnalysisDispatch: { status: "inline_ready" } },
    });
    await expect(projectService.claimProjectAnalysisDeepRunV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(8, "2026-09-01T12:00:01.000Z"),
      runId: RUN_ID,
      sourceAssetId: ASSET_ID,
      deepAnalysisDispatchId: DISPATCH_ID,
    })).resolves.toMatchObject({ disposition: "CLAIMED" });
  });
});
