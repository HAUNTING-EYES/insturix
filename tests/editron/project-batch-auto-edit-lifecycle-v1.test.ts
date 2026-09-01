import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistence.findOne,
      updateOne: persistence.updateOne,
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

const USER_ID = "user_batch_lifecycle";
const PROJECT_ID = "proj_batch_lifecycle";
const BATCH_ID = "batch_lifecycle";
const TRANSITION_ID = "batch_lifecycle_transition_1";
const UPDATED_AT = "2026-09-01T12:00:00.000Z";
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: UPDATED_AT,
};

function project(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Batch lifecycle fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 0,
    createdAt: new Date(UPDATED_AT),
    updatedAt: new Date(UPDATED_AT),
    projectRevision: 7,
    visibility: "private" as const,
    editMode: "auto",
    autoEditStatus: "analyzing",
    sourceUploadBatchId: BATCH_ID,
    ...overrides,
  };
}

describe("ProjectService batch auto-edit lifecycle V1", () => {
  beforeEach(() => {
    persistence.findOne.mockReset();
    persistence.updateOne.mockReset();
  });

  it("starts coverage recovery under the exact project revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:01:00.000Z"));
    try {
      persistence.findOne.mockResolvedValueOnce(project({ autoEditStatus: "needs_input" }));
      persistence.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
          expectedRevision: REVISION,
          uploadBatchId: BATCH_ID,
          transitionId: TRANSITION_ID,
          event: {
            kind: "COVERAGE_RESUME_STARTED",
            sourceAssetIds: ["asset_a", "asset_b"],
            previousScriptCoverage: { missingBeatIds: ["beat_2"] },
          },
        })
      ));

      expect(captured.value).toMatchObject({
        disposition: "RECORDED",
        beforeRevision: REVISION,
        receipt: { projectId: PROJECT_ID, revision: { value: 8 } },
      });
      if (captured.value.disposition !== "RECORDED") {
        throw new Error(`Unexpected lifecycle disposition: ${captured.value.disposition}`);
      }
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistence.updateOne).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          userId: USER_ID,
          projectRevision: 7,
          updatedAt: new Date(UPDATED_AT),
          sourceUploadBatchId: BATCH_ID,
          autoEditStatus: "needs_input",
          editMode: { $ne: "assist" },
        },
        {
          $set: expect.objectContaining({
            autoEditStatus: "analyzing",
            autoEditStageDesc: "Analyzing additional footage",
            sourceAssetIds: ["asset_a", "asset_b"],
            "storylinePlan.previousScriptCoverage": { missingBeatIds: ["beat_2"] },
            "intelligence.batchAutoEditLifecycle": expect.objectContaining({
              event: "COVERAGE_RESUME_STARTED",
              previousStatus: "needs_input",
              transitionId: TRANSITION_ID,
            }),
          }),
          $unset: {
            autoEditError: "",
            autoEditFailedAt: "",
            "storylinePlan.scriptCoverage": "",
          },
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["NO_USABLE_VISUAL_ASSETS", "No usable media"],
    ["ANALYSIS_DEADLINE_EXHAUSTED", "Analysis failed"],
    ["INSUFFICIENT_CREDITS", "Insufficient credits"],
    ["ORCHESTRATION_FAILED", "Auto-edit failed"],
  ] as const)("records %s as a fixed terminal transition", async (kind, stage) => {
    persistence.findOne.mockResolvedValueOnce(project());
    persistence.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
      expectedRevision: REVISION,
      uploadBatchId: BATCH_ID,
      transitionId: TRANSITION_ID,
      event: { kind, errorMessage: "terminal fixture" },
    });

    expect(result.disposition).toBe("RECORDED");
    expect(persistence.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ autoEditStatus: "analyzing" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          autoEditStatus: "failed",
          autoEditError: "terminal fixture",
          autoEditStageDesc: stage,
          autoEditFailedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("records and finalizes the exact pre-Director refund identity without changing status", async () => {
    const refundAt = "2026-09-01T12:03:00.000Z";
    const refundEvent = {
      creditTransactionId: "credit_tx_exact",
      chargedCredits: 15,
      reason: "Director publication failed",
    } as const;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(refundAt));
    try {
      persistence.findOne
        .mockResolvedValueOnce(project({ autoEditStatus: "directing_queued" }))
        .mockResolvedValueOnce(project({
          autoEditStatus: "directing_queued",
          projectRevision: 8,
          updatedAt: new Date(refundAt),
          autoEditRefundPending: {
            schemaVersion: 1,
            uploadBatchId: BATCH_ID,
            ...refundEvent,
            requestedAt: refundAt,
          },
        }));
      persistence.updateOne
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const pending = await projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
        expectedRevision: REVISION,
        uploadBatchId: BATCH_ID,
        transitionId: TRANSITION_ID,
        event: { kind: "PRE_DIRECTOR_REFUND_PENDING", ...refundEvent },
      });
      expect(pending).toMatchObject({
        disposition: "RECORDED",
        receipt: { revision: { value: 8, compatibilityUpdatedAt: refundAt } },
      });
      expect(persistence.updateOne).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          autoEditStatus: "directing_queued",
          autoEditRefunded: { $ne: true },
          autoEditRefundPending: null,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditRefundPending: expect.objectContaining({
              uploadBatchId: BATCH_ID,
              ...refundEvent,
            }),
          }),
        }),
      );

      const recorded = await projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
        expectedRevision: {
          schemaVersion: 1,
          value: 8,
          compatibilityUpdatedAt: refundAt,
        },
        uploadBatchId: BATCH_ID,
        transitionId: TRANSITION_ID,
        event: { kind: "PRE_DIRECTOR_REFUND_RECORDED", ...refundEvent },
      });
      expect(recorded).toMatchObject({ disposition: "RECORDED", receipt: { revision: { value: 9 } } });
      expect(persistence.updateOne).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          autoEditStatus: "directing_queued",
          "autoEditRefundPending.schemaVersion": 1,
          "autoEditRefundPending.uploadBatchId": BATCH_ID,
          "autoEditRefundPending.creditTransactionId": refundEvent.creditTransactionId,
          "autoEditRefundPending.chargedCredits": refundEvent.chargedCredits,
          "autoEditRefundPending.reason": refundEvent.reason,
          autoEditRefunded: { $ne: true },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            autoEditRefunded: true,
            autoEditRefundReceipt: expect.objectContaining({
              uploadBatchId: BATCH_ID,
              ...refundEvent,
            }),
          }),
          $unset: { autoEditRefundPending: "" },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not finalize a refund when the pending identity no longer matches", async () => {
    persistence.findOne
      .mockResolvedValueOnce(project({
        autoEditStatus: "directing_queued",
        autoEditRefundPending: {
          schemaVersion: 1,
          uploadBatchId: BATCH_ID,
          creditTransactionId: "credit_tx_other",
          chargedCredits: 10,
          reason: "Different refund",
        },
      }))
      .mockResolvedValueOnce(project({ projectRevision: 8 }));
    persistence.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
      expectedRevision: REVISION,
      uploadBatchId: BATCH_ID,
      transitionId: TRANSITION_ID,
      event: {
        kind: "PRE_DIRECTOR_REFUND_RECORDED",
        creditTransactionId: "credit_tx_exact",
        chargedCredits: 15,
        reason: "Director publication failed",
      },
    })).resolves.toMatchObject({ disposition: "PROJECT_STATE_CHANGED", currentRevision: { value: 8 } });
    expect(persistence.updateOne).toHaveBeenCalledOnce();
  });

  it.each([
    ["wrong batch", project({ sourceUploadBatchId: "batch_other" })],
    ["Assist lane", project({ editMode: "assist" })],
  ])("rejects an ineligible %s without writing", async (_label, fixture) => {
    persistence.findOne.mockResolvedValueOnce(fixture);
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
        expectedRevision: REVISION,
        uploadBatchId: BATCH_ID,
        transitionId: TRANSITION_ID,
        event: { kind: "ORCHESTRATION_FAILED", errorMessage: "failure" },
      })
    ));

    expect(captured.value.disposition).toBe("NOT_ELIGIBLE");
    expect(captured.receipts).toEqual([]);
    expect(persistence.updateOne).not.toHaveBeenCalled();
  });

  it("fails closed when the revision changes before or during compare-and-set", async () => {
    persistence.findOne
      .mockResolvedValueOnce(project({ projectRevision: 8, updatedAt: new Date("2026-09-01T12:02:00.000Z") }))
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project({ projectRevision: 8, updatedAt: new Date("2026-09-01T12:02:00.000Z") }));
    persistence.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
      expectedRevision: REVISION,
      uploadBatchId: BATCH_ID,
      transitionId: TRANSITION_ID,
      event: { kind: "ORCHESTRATION_FAILED", errorMessage: "failure" },
    })).resolves.toMatchObject({ disposition: "PROJECT_STATE_CHANGED", currentRevision: { value: 8 } });
    expect(persistence.updateOne).not.toHaveBeenCalled();

    await expect(projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
      expectedRevision: REVISION,
      uploadBatchId: BATCH_ID,
      transitionId: TRANSITION_ID,
      event: { kind: "ORCHESTRATION_FAILED", errorMessage: "failure" },
    })).resolves.toMatchObject({ disposition: "PROJECT_STATE_CHANGED", currentRevision: { value: 8 } });
    expect(persistence.updateOne).toHaveBeenCalledOnce();
  });

  it("rejects malformed transition facts before database work", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.recordBatchAutoEditLifecycleV1(USER_ID, PROJECT_ID, {
      expectedRevision: REVISION,
      uploadBatchId: BATCH_ID,
      transitionId: TRANSITION_ID,
      event: {
        kind: "COVERAGE_RESUME_STARTED",
        sourceAssetIds: ["asset_a", "asset_a"],
        previousScriptCoverage: null,
      },
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistence.findOne).not.toHaveBeenCalled();
    expect(persistence.updateOne).not.toHaveBeenCalled();
  });
});
