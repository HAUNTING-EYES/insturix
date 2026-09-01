import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDirectorAuditFactV1,
  type DirectorAuditFactKindV1,
} from "@/lib/editron/services/director-audit-fact-v1";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

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

const EXPECTED_REVISION = {
  schemaVersion: 1 as const,
  value: 12,
  compatibilityUpdatedAt: "2026-09-01T11:59:00.000Z",
};

function unifiedPayload(): Record<string, unknown> {
  return {
    version: 1,
    source: "creative-brief-primary",
    authority: { decisionMode: "creative-brief-primary" },
    totalDecisions: 2,
    expectedExecuted: 2,
    expectedSkipped: 0,
    graphicsDensity: "moderate",
    byType: { cut: 1, caption: 1 },
    canonicalTimeline: null,
    executionTrace: { executed: 2 },
    evidence: { primaryDecisionCount: 2 },
  };
}

function policyPayload(): Record<string, unknown> {
  return {
    version: "post-bundle-profile-action-policy-v1",
    unifiedDecisionBundleExecuted: true,
    evaluatedAt: "2026-09-01T12:00:00.000Z",
    allowedActionCount: 1,
    skippedActionCount: 1,
    allowedTools: ["quality_review"],
    skippedActions: [{
      tool: "add_transition",
      action: "Add transitions",
      reason: "legacy-creative-profile-action",
    }],
  };
}

function runSummaryPayload(): Record<string, unknown> {
  return {
    version: "director-intelligence-run-summary-v1",
    status: "partial",
    assetsAnalyzed: 8,
    assetsFailed: 2,
    failedAssets: ["asset-7", "asset-8"],
    decisionsGenerated: 12,
    decisionsExecuted: 10,
    cinematicMoments: 3,
    completedAt: "2026-09-01T12:00:00.000Z",
  };
}

function skipSummaryPayload(): Record<string, unknown> {
  return {
    version: "director-intelligence-skip-summary-v1",
    status: "skipped_edl",
    reason: "asset-analysis-unavailable",
    failedAssetCount: 1,
    failedAssets: ["asset-1"],
    message: "Intelligence EDL skipped: asset-analysis-unavailable; 1 asset failure(s).",
    attemptedAt: "2026-09-01T12:00:00.000Z",
  };
}

function payloadFor(kind: DirectorAuditFactKindV1): Record<string, unknown> {
  switch (kind) {
    case "UNIFIED_DECISION_BUNDLE": return unifiedPayload();
    case "POST_BUNDLE_PROFILE_ACTION_POLICY": return policyPayload();
    case "INTELLIGENCE_RUN_SUMMARY": return runSummaryPayload();
    case "INTELLIGENCE_SKIP_SUMMARY": return skipSummaryPayload();
  }
}

function command(kind: DirectorAuditFactKindV1) {
  return {
    expectedRevision: EXPECTED_REVISION,
    directorLeaseId: "director_lease_audit_fact",
    fact: createDirectorAuditFactV1({
      kind,
      payload: payloadFor(kind),
    }),
  };
}

function projectFixture() {
  return {
    projectId: "proj_director_audit",
    userId: "user_director_audit",
    name: "Director audit fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 900,
    createdAt: new Date("2026-09-01T11:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:01.000Z"),
    projectRevision: 13,
    visibility: "private" as const,
    autoEditStatus: "ready_for_chat",
    directorLock: false,
  };
}

describe("ProjectService Director audit facts V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it.each([
    {
      kind: "UNIFIED_DECISION_BUNDLE" as const,
      targetPath: "intelligence.unifiedDecisionBundle",
      bindingPath: "intelligence.directorAuditFactBindings.unifiedDecisionBundle",
      compatibility: {},
    },
    {
      kind: "POST_BUNDLE_PROFILE_ACTION_POLICY" as const,
      targetPath: "intelligence.postBundleProfileActionPolicy",
      bindingPath: "intelligence.directorAuditFactBindings.postBundleProfileActionPolicy",
      compatibility: {},
    },
    {
      kind: "INTELLIGENCE_RUN_SUMMARY" as const,
      targetPath: "intelligence.directorRunSummary",
      bindingPath: "intelligence.directorAuditFactBindings.intelligenceRunSummary",
      compatibility: {
        "intelligence.status": "partial",
        "intelligence.assetsAnalyzed": 8,
        "intelligence.assetsFailed": 2,
        "intelligence.failedAssets": ["asset-7", "asset-8"],
        "intelligence.decisionsGenerated": 12,
        "intelligence.decisionsExecuted": 10,
        "intelligence.cinematicMoments": 3,
        "intelligence.lastRun": new Date("2026-09-01T12:00:00.000Z"),
      },
    },
    {
      kind: "INTELLIGENCE_SKIP_SUMMARY" as const,
      targetPath: "intelligence.directorSkipSummary",
      bindingPath: "intelligence.directorAuditFactBindings.intelligenceSkipSummary",
      compatibility: {
        "intelligence.status": "skipped_edl",
        "intelligence.reason": "asset-analysis-unavailable",
        "intelligence.failedAssets": ["asset-1"],
        "intelligence.lastAttempt": new Date("2026-09-01T12:00:00.000Z"),
        "intelligence.message": "Intelligence EDL skipped: asset-analysis-unavailable; 1 asset failure(s).",
      },
    },
  ])("commits $kind through the exact Director lease and revision", async ({
    kind,
    targetPath,
    bindingPath,
    compatibility,
  }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:01.000Z"));
    try {
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const input = command(kind);

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordDirectorAuditFactV1(
          "user_director_audit",
          "proj_director_audit",
          input,
        )
      ));

      expect(captured.value).toMatchObject({
        projectId: "proj_director_audit",
        revision: { value: 13, compatibilityUpdatedAt: "2026-09-01T12:00:01.000Z" },
      });
      expect(captured.receipts).toEqual([captured.value]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_director_audit",
          userId: "user_director_audit",
          projectRevision: 12,
          updatedAt: new Date("2026-09-01T11:59:00.000Z"),
          directorLock: true,
          directorLockToken: "director_lease_audit_fact",
          autoEditStatus: "directing",
        },
        {
          $set: expect.objectContaining({
            [targetPath]: input.fact.payload,
            ...compatibility,
            [bindingPath]: expect.objectContaining({
              schemaVersion: 1,
              kind,
              payloadHash: input.fact.payloadHash,
              sourceProjectRevision: EXPECTED_REVISION,
              predecessor: "ACTIVE_DIRECTOR_LEASE",
              affectedRange: null,
              rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
              invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            }),
            updatedAt: new Date("2026-09-01T12:00:01.000Z"),
          }),
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits no receipt when revision or Director ownership is stale", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");
    let settled: readonly unknown[] | undefined;

    await expect(projectService.captureMutationReceipts(
      () => projectService.recordDirectorAuditFactV1(
        "user_director_audit",
        "proj_director_audit",
        command("UNIFIED_DECISION_BUNDLE"),
      ),
      (receipts) => { settled = receipts; },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 13 },
    });
    expect(settled).toEqual([]);
  });

  it("rejects forged and non-serializable facts before project access", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );
    const forged = command("UNIFIED_DECISION_BUNDLE");
    forged.fact = {
      ...forged.fact,
      payload: { ...forged.fact.payload, totalDecisions: 99 },
    };

    await expect(projectService.recordDirectorAuditFactV1(
      "user_director_audit",
      "proj_director_audit",
      forged,
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);

    const cyclic: Record<string, unknown> = unifiedPayload();
    cyclic.authority = cyclic;
    expect(() => createDirectorAuditFactV1({
      kind: "UNIFIED_DECISION_BUNDLE",
      payload: cyclic,
    })).toThrow("DIRECTOR_AUDIT_FACT_INVALID");
    expect(() => createDirectorAuditFactV1({
      kind: "INTELLIGENCE_RUN_SUMMARY",
      payload: { ...runSummaryPayload(), assetsFailed: 0 },
    })).toThrow("DIRECTOR_AUDIT_FACT_INVALID");
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
