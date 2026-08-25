import { readFileSync } from "node:fs";
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

const PROJECT_ID = "proj_pipeline_director";
const USER_ID = "user_pipeline_director";
const BATCH_ID = "vb_123456789012";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";
const DISPATCH_TOKEN = "pipeline_director_dispatch_12345678901234567890";

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Pipeline Director dispatch fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 0,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    editMode: "auto",
    pendingDirectorProfileId: "G-01",
    pendingDirectorUserId: USER_ID,
    ...overrides,
  };
}

function revision(value = 7, compatibilityUpdatedAt = BASE_UPDATED_AT) {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt,
  };
}

function preparedDispatch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    batchId: BATCH_ID,
    profileId: "G-01",
    dispatchToken: DISPATCH_TOKEN,
    preparedAt: "2026-08-25T00:00:01.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService pipeline Director dispatch V1", () => {
  it("prepares one signed-worker handoff without clearing the durable finalize signal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(
        async (_filter: unknown, update: any) => projectFixture(
          8,
          "2026-08-25T00:00:01.000Z",
          {
            autoEditStatus: update.$set.autoEditStatus,
            pipelineDirectorDispatch: update.$set.pipelineDirectorDispatch,
          },
        ),
      );
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.preparePipelineDirectorDispatchV1(USER_ID, PROJECT_ID, {
          expectedRevision: revision(),
          batchId: BATCH_ID,
        })
      ));
      if (captured.value.disposition !== "PREPARED") {
        throw new Error(`Expected PREPARED, got ${captured.value.disposition}.`);
      }

      expect(captured.value).toMatchObject({
        disposition: "PREPARED",
        dispatch: {
          batchId: BATCH_ID,
          profileId: "G-01",
          dispatchToken: expect.stringMatching(/^pipeline_director_dispatch_[A-Za-z0-9_-]{20}$/),
        },
        receipt: { revision: { value: 8, compatibilityUpdatedAt: "2026-08-25T00:00:01.000Z" } },
      });
      expect(captured.receipts).toEqual([captured.value.receipt]);

      const [filter, update] = persistenceMocks.findOneAndUpdate.mock.calls[0] as [
        Record<string, any>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        pendingDirectorProfileId: "G-01",
        pendingDirectorUserId: USER_ID,
        directorRunToken: { $exists: false },
        pipelineDirectorDispatch: { $exists: false },
      });
      expect(filter.$and).toEqual(expect.arrayContaining([
        expect.objectContaining({
          projectRevision: 7,
          updatedAt: new Date(BASE_UPDATED_AT),
        }),
        {
          $or: [
            { autoEditStatus: { $exists: false } },
            { autoEditStatus: "analysis_complete" },
          ],
        },
      ]));
      expect(update.$set).toMatchObject({
        autoEditStatus: "directing_queued",
        pipelineDirectorDispatch: {
          batchId: BATCH_ID,
          profileId: "G-01",
        },
      });
      expect(update).not.toHaveProperty("$unset");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the same prepared dispatch without a second write", async () => {
    const prepared = projectFixture(8, "2026-08-25T00:00:01.000Z", {
      autoEditStatus: "directing_queued",
      pipelineDirectorDispatch: preparedDispatch(),
    });
    persistenceMocks.findOne.mockResolvedValueOnce(prepared);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.preparePipelineDirectorDispatchV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(8, "2026-08-25T00:00:01.000Z"),
      batchId: BATCH_ID,
    })).resolves.toEqual({
      disposition: "ALREADY_PREPARED",
      dispatch: preparedDispatch(),
      currentRevision: revision(8, "2026-08-25T00:00:01.000Z"),
    });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns the winning same-batch dispatch after a final CAS race", async () => {
    const base = projectFixture();
    const winner = projectFixture(8, "2026-08-25T00:00:01.000Z", {
      autoEditStatus: "directing_queued",
      pipelineDirectorDispatch: preparedDispatch(),
    });
    persistenceMocks.findOne
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(winner);
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.preparePipelineDirectorDispatchV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      batchId: BATCH_ID,
    })).resolves.toEqual({
      disposition: "ALREADY_PREPARED",
      dispatch: preparedDispatch(),
      currentRevision: revision(8, "2026-08-25T00:00:01.000Z"),
    });
    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("consumes the pending signal only when the signed worker supplies its exact token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:02.000Z"));
    try {
      const prepared = projectFixture(8, "2026-08-25T00:00:01.000Z", {
        autoEditStatus: "directing_queued",
        pipelineDirectorDispatch: preparedDispatch(),
      });
      persistenceMocks.findOne.mockResolvedValueOnce(prepared);
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(
        async (_filter: unknown, update: any) => projectFixture(
          9,
          "2026-08-25T00:00:02.000Z",
          {
            autoEditStatus: update.$set.autoEditStatus,
            directorRunToken: update.$set.directorRunToken,
          },
        ),
      );
      const { projectService } = await import("@/lib/editron/services/project-service");

      const claimed = await projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, {
        pipelineDirectorDispatchToken: DISPATCH_TOKEN,
      });
      expect(claimed).toMatchObject({
        disposition: "CLAIMED",
        project: { autoEditStatus: "directing" },
        runToken: expect.stringMatching(/^director_run_[A-Za-z0-9_-]{20}$/),
        receipt: { revision: { value: 9, compatibilityUpdatedAt: "2026-08-25T00:00:02.000Z" } },
      });

      const [filter, update] = persistenceMocks.findOneAndUpdate.mock.calls[0] as [
        Record<string, any>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        "pipelineDirectorDispatch.dispatchToken": DISPATCH_TOKEN,
        pendingDirectorProfileId: "G-01",
        pendingDirectorUserId: USER_ID,
      });
      expect(update.$unset).toEqual({
        pendingDirectorProfileId: "",
        pendingDirectorUserId: "",
        pipelineDirectorDispatch: "",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a missing or forged token without writing a prepared pipeline project", async () => {
    const prepared = projectFixture(8, "2026-08-25T00:00:01.000Z", {
      autoEditStatus: "directing_queued",
      pipelineDirectorDispatch: preparedDispatch(),
    });
    persistenceMocks.findOne.mockResolvedValueOnce(prepared);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID)).resolves.toEqual({
      disposition: "NOT_ELIGIBLE",
    });
    await expect(projectService.claimDirectorRunV1(USER_ID, PROJECT_ID, {
      pipelineDirectorDispatchToken: "forged",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("wires pipeline completion only to the signed internal worker and never clears project fields directly", () => {
    const pipelineWorker = readFileSync('app/api/internal/workers/pipeline/video/route.ts', 'utf8');
    const directorWorker = readFileSync('app/api/internal/workers/director/route.ts', 'utf8');

    expect(pipelineWorker).toContain('preparePipelineDirectorDispatchV1');
    expect(pipelineWorker).toContain('/api/internal/workers/director');
    expect(pipelineWorker).toContain('pipelineDirectorDispatchToken');
    expect(pipelineWorker).toContain('isInternalQStashWorkerAuthConfigured');
    expect(pipelineWorker).not.toContain('/api/services/editron/director/execute');
    expect(pipelineWorker).not.toContain('fetch(directorUrl');
    expect(pipelineWorker).not.toContain('$unset: { pendingDirectorProfileId');
    expect(directorWorker).toContain('pipelineDirectorDispatchToken');
    expect(directorWorker).toContain('claimDirectorRunV1(');
  });
});
