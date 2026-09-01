import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashEditronCanonicalJsonV1 } from "@/lib/editron/services/canonical-json-v1";
import {
  assertPersistedDirectorDecisionLogV1,
  buildPersistedDirectorDecisionLogV1,
  type PersistedDirectorDecisionLogV1,
} from "@/lib/editron/services/director-decision-log-v1";
import type { ProjectDecisionLog } from "@/lib/editron/services/decision-tracker";

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
  value: 21,
  compatibilityUpdatedAt: "2026-09-01T12:59:00.000Z",
};

function sourceLog(snapshotCount = 140): ProjectDecisionLog {
  return {
    projectId: "proj_decision_log",
    userId: "user_decision_log",
    createdAt: 1_788_267_600_000,
    contentMode: "agency-long-form",
    totalDurationMs: 4 * 60 * 60 * 1_000,
    snapshots: Array.from({ length: snapshotCount }, (_, index) => ({
      id: `decision-${index}`,
      type: "cut" as const,
      technique: index === 70
        ? "rare-middle"
        : index === snapshotCount - 1
          ? "rare-end"
          : "common-cut",
      frame: index * 100,
      confidence: 0.8,
      reason: index === 0 ? "" : `Reason ${index}`,
      source: "creative-brief",
      params: { unusedHeavyPayload: "x".repeat(2_000) },
      signalContext: Object.fromEntries(
        Array.from({ length: 12 }, (_, signalIndex) => [`signal-${signalIndex}`, signalIndex / 12]),
      ),
    })),
  };
}

function command(decisionLog = buildPersistedDirectorDecisionLogV1(sourceLog())) {
  return {
    expectedRevision: EXPECTED_REVISION,
    directorLeaseId: "director_lease_decision_log",
    decisionLog,
  };
}

function projectFixture() {
  return {
    projectId: "proj_decision_log",
    userId: "user_decision_log",
    name: "Decision-log fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 432_000,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T13:00:01.000Z"),
    projectRevision: 22,
    visibility: "private" as const,
    autoEditStatus: "ready_for_chat",
    directorLock: false,
  };
}

describe("ProjectService Director decision log V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("builds one deterministic bounded sample across techniques and timeline", () => {
    const first = buildPersistedDirectorDecisionLogV1(sourceLog());
    const replay = buildPersistedDirectorDecisionLogV1(sourceLog());

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      version: "director-decision-log-v1",
      snapshotCount: 140,
      snapshotsTruncated: true,
      samplingStrategy: "STRATIFIED_TECHNIQUE_THEN_TIMELINE_V1",
      snapshotParamsOmitted: true,
    });
    expect(first.snapshots).toHaveLength(100);
    expect(first.snapshots.map((snapshot) => snapshot.technique)).toEqual(
      expect.arrayContaining(["common-cut", "rare-middle", "rare-end"]),
    );
    expect(first.snapshots[0].reason).toBe("");
    expect(first.snapshots.every((snapshot) => Object.keys(snapshot.params).length === 0)).toBe(true);
    expect(first.snapshots.every((snapshot) => Object.keys(snapshot.signalContext).length <= 8)).toBe(true);
    expect(first.snapshotFieldTruncationCount).toBeGreaterThan(0);

    expect(() => assertPersistedDirectorDecisionLogV1({
      ...first,
      snapshots: undefined,
    } as unknown as PersistedDirectorDecisionLogV1)).toThrow("DIRECTOR_DECISION_LOG_INVALID");
  });

  it("commits the bounded log through the exact Director lease and revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T13:00:01.000Z"));
    try {
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const input = command();

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordDirectorDecisionLogV1(
          "user_decision_log",
          "proj_decision_log",
          input,
        )
      ));

      expect(captured.value).toMatchObject({
        projectId: "proj_decision_log",
        revision: { value: 22, compatibilityUpdatedAt: "2026-09-01T13:00:01.000Z" },
      });
      expect(captured.receipts).toEqual([captured.value]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_decision_log",
          userId: "user_decision_log",
          projectRevision: 21,
          updatedAt: new Date("2026-09-01T12:59:00.000Z"),
          directorLock: true,
          directorLockToken: "director_lease_decision_log",
          autoEditStatus: "directing",
        },
        {
          $set: {
            "intelligence.decisionLog": input.decisionLog,
            "intelligence.directorDecisionLogBinding": expect.objectContaining({
              schemaVersion: 1,
              decisionLogHash: hashEditronCanonicalJsonV1(input.decisionLog),
              sourceSnapshotIdentityHash: input.decisionLog.sourceSnapshotIdentityHash,
              sourceProjectRevision: EXPECTED_REVISION,
              predecessor: "ACTIVE_DIRECTOR_LEASE",
              affectedRange: null,
              rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
              invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            }),
            updatedAt: new Date("2026-09-01T13:00:01.000Z"),
          },
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits no receipt for stale ownership and rejects cross-project evidence", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );
    let settled: readonly unknown[] | undefined;

    await expect(projectService.captureMutationReceipts(
      () => projectService.recordDirectorDecisionLogV1(
        "user_decision_log",
        "proj_decision_log",
        command(),
      ),
      (receipts) => { settled = receipts; },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 22 },
    });
    expect(settled).toEqual([]);

    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
    const wrongProject = {
      ...command().decisionLog,
      projectId: "proj_other",
    } as PersistedDirectorDecisionLogV1;
    await expect(projectService.recordDirectorDecisionLogV1(
      "user_decision_log",
      "proj_decision_log",
      command(wrongProject),
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
