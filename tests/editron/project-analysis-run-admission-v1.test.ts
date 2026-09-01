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

const PROJECT_ID = "proj_analysis_admission";
const USER_ID = "user_analysis_admission";
const ASSET_ID = "asset_video_1";
const UPDATED_AT = "2026-09-01T12:00:00.000Z";

const expectedRevision = {
  schemaVersion: 1 as const,
  value: 4,
  compatibilityUpdatedAt: UPDATED_AT,
};

function project(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Analysis admission",
    overlays: [{ id: 1, type: "video", assetId: ASSET_ID }],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 900,
    createdAt: new Date(UPDATED_AT),
    updatedAt: new Date(UPDATED_AT),
    projectRevision: 4,
    visibility: "private",
    ...overrides,
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    expectedRevision,
    sourceAssetId: ASSET_ID,
    creditTransactionId: "credit_tx_1",
    chargedCredits: 12,
    lane: "auto" as const,
    queueFacts: {
      referenceAssetId: "reference_1",
      referenceImageAssetIds: ["image_1"],
      editorialPreferences: { pacing: "measured" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService analysis-run admission V1", () => {
  it("admits one exact automatic source run and issues its revision receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(project());
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(async (_filter, update) => project({
        ...update.$set,
        projectRevision: 5,
      }));
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command())
      ));
      if (captured.value.disposition !== "ADMITTED") {
        throw new Error(`expected admission, got ${captured.value.disposition}`);
      }

      expect(captured.value).toMatchObject({
        disposition: "ADMITTED",
        run: {
          runId: expect.stringMatching(/^analysis_run_[A-Za-z0-9_-]{20}$/),
          sourceAssetId: ASSET_ID,
          creditTransactionId: "credit_tx_1",
          state: "queued",
          intakeDispatch: {
            status: "pending",
            deduplicationId: expect.stringMatching(/^editron_analysis_[a-f0-9]{48}$/),
            preparedAt: "2026-09-01T12:00:01.000Z",
          },
        },
        receipt: { revision: { value: 5, compatibilityUpdatedAt: "2026-09-01T12:00:01.000Z" } },
      });
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 4,
          updatedAt: new Date(UPDATED_AT),
          editMode: { $ne: "assist" },
          overlays: { $elemMatch: { type: "video", assetId: ASSET_ID } },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditStatus: "queued",
            sourceAssetId: ASSET_ID,
            autoEditAnalysisRunV1: expect.objectContaining({ state: "queued" }),
          }),
          $inc: { projectRevision: 1 },
        }),
        { returnDocument: "after", includeResultMetadata: false },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires the exact persisted Assist charge", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(project({
      editMode: "assist",
      assistCreditTransactionId: "credit_tx_1",
      assistChargedCredits: 12,
    }));
    persistenceMocks.findOneAndUpdate.mockImplementationOnce(async (_filter, update) => project({
      editMode: "assist",
      assistCreditTransactionId: "credit_tx_1",
      assistChargedCredits: 12,
      ...update.$set,
      projectRevision: 5,
    }));
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command({
      lane: "assist",
    }))).resolves.toMatchObject({ disposition: "ADMITTED", run: { lane: "assist" } });
    expect(persistenceMocks.findOneAndUpdate.mock.calls[0]?.[0]).toMatchObject({
      editMode: "assist",
      assistCreditTransactionId: "credit_tx_1",
      assistChargedCredits: 12,
    });
  });

  it("replays only the identical queued admission", async () => {
    const firstCommand = command();
    const { projectService } = await import("@/lib/editron/services/project-service");
    persistenceMocks.findOne.mockResolvedValueOnce(project());
    persistenceMocks.findOneAndUpdate.mockImplementationOnce(async (_filter, update) => project({
      ...update.$set,
      projectRevision: 5,
    }));
    const admitted = await projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, firstCommand);
    if (admitted.disposition !== "ADMITTED") throw new Error("expected admission");

    persistenceMocks.findOne.mockResolvedValueOnce(project({
      autoEditStatus: "queued",
      autoEditAnalysisRunV1: admitted.run,
      projectRevision: 5,
      updatedAt: new Date(admitted.receipt.committedAt),
    }));
    await expect(projectService.admitProjectAnalysisRunV1(
      USER_ID,
      PROJECT_ID,
      firstCommand,
    )).resolves.toMatchObject({ disposition: "ALREADY_ADMITTED", run: admitted.run });
    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects the wrong source, lane, occupied lifecycle and competing replay", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");
    persistenceMocks.findOne
      .mockResolvedValueOnce(project({ overlays: [] }))
      .mockResolvedValueOnce(project({ editMode: "assist" }))
      .mockResolvedValueOnce(project({ autoEditStatus: "analyzing" }))
      .mockResolvedValueOnce(project({
        autoEditStatus: "queued",
        autoEditAnalysisRunV1: {
          schemaVersion: 1,
          runId: "analysis_run_12345678901234567890",
          admissionHash: "different_hash",
          sourceAssetId: ASSET_ID,
          creditTransactionId: "other_tx",
          chargedCredits: 12,
          lane: "auto",
          state: "queued",
          admittedRevision: expectedRevision,
          admittedAt: UPDATED_AT,
          updatedAt: UPDATED_AT,
        },
      }));

    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command()))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command()))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command()))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command()))
      .resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("blocks a stale project revision and a mismatched Assist charge", async () => {
    const { projectService, ProjectMutationConflictError } = await import(
      "@/lib/editron/services/project-service"
    );
    persistenceMocks.findOne
      .mockResolvedValueOnce(project({
        projectRevision: 5,
        updatedAt: new Date("2026-09-01T12:00:02.000Z"),
      }))
      .mockResolvedValueOnce(project({
        editMode: "assist",
        assistCreditTransactionId: "different_tx",
        assistChargedCredits: 12,
      }));

    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command()))
      .rejects.toBeInstanceOf(ProjectMutationConflictError);
    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command({
      lane: "assist",
    }))).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("fails malformed input before opening Mongo", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");
    await expect(projectService.admitProjectAnalysisRunV1(USER_ID, PROJECT_ID, command({
      creditTransactionId: " ",
      chargedCredits: -1,
    }))).rejects.toThrow("Analysis admission requires one exact revision");
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
  });

  it("records only the exact pending intake provider receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      const { projectService } = await import("@/lib/editron/services/project-service");
      persistenceMocks.findOne.mockResolvedValueOnce(project({
        autoEditStatus: "queued",
        autoEditAnalysisRunV1: {
          schemaVersion: 1,
          runId: "analysis_run_12345678901234567890",
          admissionHash: "a".repeat(64),
          sourceAssetId: ASSET_ID,
          creditTransactionId: "credit_tx_1",
          chargedCredits: 12,
          lane: "auto",
          state: "queued",
          admittedRevision: expectedRevision,
          admittedAt: UPDATED_AT,
          updatedAt: UPDATED_AT,
          intakeDispatch: {
            schemaVersion: 1,
            deduplicationId: "editron_analysis_exact_dispatch",
            status: "pending",
            preparedAt: UPDATED_AT,
          },
        },
      }));
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

      await expect(projectService.recordProjectAnalysisIntakeDispatchPublishedV1(USER_ID, PROJECT_ID, {
        expectedRevision,
        runId: "analysis_run_12345678901234567890",
        sourceAssetId: ASSET_ID,
        deduplicationId: "editron_analysis_exact_dispatch",
        providerMessageId: "qstash_message_1",
      })).resolves.toMatchObject({
        disposition: "ADVANCED",
        run: {
          intakeDispatch: {
            status: "published",
            providerMessageId: "qstash_message_1",
          },
        },
        receipt: { revision: { value: 5, compatibilityUpdatedAt: "2026-09-01T12:00:01.000Z" } },
      });
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          projectRevision: 4,
          "autoEditAnalysisRunV1.intakeDispatch.status": "pending",
          "autoEditAnalysisRunV1.intakeDispatch.deduplicationId": "editron_analysis_exact_dispatch",
        }),
        expect.objectContaining({ $inc: { projectRevision: 1 } }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
