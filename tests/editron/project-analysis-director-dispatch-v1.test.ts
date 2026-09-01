import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      findOneAndUpdate: persistenceMocks.findOneAndUpdate,
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

const PROJECT_ID = "proj_analysis_dispatch";
const USER_ID = "user_analysis_dispatch";
const ASSET_ID = "asset_analysis_dispatch";
const RUN_ID = "analysis_run_12345678901234567890";
const BASE_AT = "2026-09-01T12:00:00.000Z";
const DISPATCH_ID = "editron_director_dispatch_exact";

function revision(value = 7, at = BASE_AT) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt: at };
}

function dispatch(
  status: "pending" | "published" | "inline_ready" = "pending",
) {
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

function project(
  run = analysisRun(),
  projectRevision = 7,
  updatedAt = BASE_AT,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Analysis dispatch fixture",
    overlays: [{ id: 1, type: "video", assetId: ASSET_ID }],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 30,
    createdAt: new Date("2026-09-01T11:00:00.000Z"),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    editMode: "auto",
    autoEditStatus: run.state,
    autoEditAnalysisRunV1: run,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService analysis Director dispatch V1", () => {
  it("prepares one exact dispatch when Phase 2 is skipped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project());
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = { expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID };
      const prepared = await projectService.prepareProjectAnalysisDirectorDispatchV1(
        USER_ID,
        PROJECT_ID,
        command,
      );
      expect(prepared).toMatchObject({
        disposition: "ADVANCED",
        run: {
          state: "directing_queued",
          directorDispatch: {
            status: "pending",
            deduplicationId: expect.stringMatching(/^editron_director_/),
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
          "autoEditAnalysisRunV1.directorDispatch": { $exists: false },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ autoEditStatus: "directing_queued" }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("upgrades a legacy directing_queued run with no dispatch instead of approximating ownership", async () => {
    const legacyRun = analysisRun({ state: "directing_queued" });
    persistenceMocks.findOne.mockResolvedValueOnce(project(legacyRun));
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.prepareProjectAnalysisDirectorDispatchV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(), runId: RUN_ID, sourceAssetId: ASSET_ID,
    })).resolves.toMatchObject({ disposition: "ADVANCED", run: { directorDispatch: { status: "pending" } } });
  });

  it("activates only the exact pending dispatch for trusted inline execution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:02.000Z"));
    try {
      const pendingRun = analysisRun({ state: "directing_queued", directorDispatch: dispatch() });
      persistenceMocks.findOne.mockResolvedValueOnce(project(pendingRun));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const result = await projectService.recordProjectAnalysisDirectorDispatchInlineReadyV1(
        USER_ID,
        PROJECT_ID,
        {
          expectedRevision: revision(),
          runId: RUN_ID,
          sourceAssetId: ASSET_ID,
          deduplicationId: DISPATCH_ID,
        },
      );
      expect(result).toMatchObject({
        disposition: "ADVANCED",
        run: { directorDispatch: { status: "inline_ready", inlineReadyAt: "2026-09-01T12:00:02.000Z" } },
      });
      expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toMatchObject({
        "autoEditAnalysisRunV1.runId": RUN_ID,
        "autoEditAnalysisRunV1.directorDispatch.status": "pending",
        "autoEditAnalysisRunV1.directorDispatch.deduplicationId": DISPATCH_ID,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes an early exact worker retry and rejects a forged dispatch without mutation", async () => {
    const pendingRun = analysisRun({ state: "directing_queued", directorDispatch: dispatch() });
    persistenceMocks.findOne
      .mockResolvedValueOnce(project(pendingRun))
      .mockResolvedValueOnce(project(pendingRun));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, {
      analysisRunId: RUN_ID,
      analysisDirectorDispatchId: DISPATCH_ID,
    })).resolves.toEqual({ disposition: "DISPATCH_PENDING" });
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, {
      analysisRunId: RUN_ID,
      analysisDirectorDispatchId: "forged_dispatch",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("claims a published dispatch only through its exact run and durable identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:02.000Z"));
    try {
      const publishedRun = analysisRun({ state: "directing_queued", directorDispatch: dispatch("published") });
      persistenceMocks.findOne.mockResolvedValueOnce(project(publishedRun));
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(async (_filter: unknown, update: any) => (
        project(
          publishedRun,
          8,
          "2026-09-01T12:00:02.000Z",
          { autoEditStatus: "directing", directorRunToken: update.$set.directorRunToken },
        )
      ));
      const { projectService } = await import("@/lib/editron/services/project-service");

      await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, {
        analysisRunId: RUN_ID,
        analysisDirectorDispatchId: DISPATCH_ID,
      })).resolves.toMatchObject({ disposition: "CLAIMED", project: { autoEditStatus: "directing" } });
      expect(persistenceMocks.findOneAndUpdate.mock.calls[0]?.[0]).toMatchObject({
        "autoEditAnalysisRunV1.runId": RUN_ID,
        "autoEditAnalysisRunV1.sourceAssetId": ASSET_ID,
        "autoEditAnalysisRunV1.directorDispatch.status": "published",
        "autoEditAnalysisRunV1.directorDispatch.deduplicationId": DISPATCH_ID,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a run identity but accepts a legacy exact-run message without a dispatch field", async () => {
    const legacyRun = analysisRun({ state: "directing_queued" });
    persistenceMocks.findOne
      .mockResolvedValueOnce(project(legacyRun))
      .mockResolvedValueOnce(project(legacyRun))
      .mockResolvedValueOnce(project(legacyRun));
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, { analysisRunId: RUN_ID }))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.findOneAndUpdate.mock.calls[0]?.[0]).toMatchObject({
      "autoEditAnalysisRunV1.runId": RUN_ID,
      "autoEditAnalysisRunV1.directorDispatch": { $exists: false },
    });
  });
});
