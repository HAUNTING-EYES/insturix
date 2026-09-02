import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_RESTORABLE_PROJECT_FIELDS,
  CheckpointService,
  captureRestorableProjectState,
  projectStateFingerprint,
} from "@/lib/editron/services/checkpoint-service";
import {
  ProjectGeneratedCompositionEntryValidationErrorV1,
} from "@/lib/editron/services/project-generated-composition-entry-v1";
import {
  ProjectMutationWriteError,
  projectService,
  type ProjectRevisionV1,
} from "@/lib/editron/services/project-service";

const persistence = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  loadWholeStateMediaPrerequisite: vi.fn(),
  materializeWholeStateMediaPrerequisite: vi.fn(),
  outboxFindOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    CHECKPOINTS: "editron_prev.checkpoints",
    MEDIA_ASSETS: "mediaAssets",
    PROJECTS: "editron_prev.projects",
  },
  connectToDatabase: vi.fn(),
  getDatabase: persistence.getDatabase,
}));
vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
    stripUrlsForLLM: vi.fn((overlays) => overlays),
  },
}));
vi.mock("@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1", () => ({
  assertProjectWholeStateMediaPrerequisiteLinkV1: (value: unknown) => value,
  loadProjectWholeStateMediaPrerequisiteByLinkV1:
    persistence.loadWholeStateMediaPrerequisite,
  materializeProjectWholeStateMediaPrerequisiteInMongoV1:
    persistence.materializeWholeStateMediaPrerequisite,
  projectWholeStateMediaPrerequisiteLinkV1: () => MEDIA_PREREQUISITE_LINK,
}));
vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: { isMember: vi.fn() },
}));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));
vi.mock("@/lib/services/org-wallet-flag", () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));

const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 4,
  compatibilityUpdatedAt: "2026-08-15T10:00:00.000Z",
};
const MEDIA_PREREQUISITE_LINK = Object.freeze({
  status: "MATERIALIZED" as const,
  collection: "editron_project_whole_state_media_prerequisites_v1" as const,
  receiptSha256: "d".repeat(64),
  candidateMediaSetSha256: "c".repeat(64),
  candidateMediaContentSha256: "e".repeat(64),
  mediaEntryCount: 0,
});

describe("generated composition checkpoint participation", () => {
  beforeEach(() => {
    persistence.findOne.mockReset();
    persistence.findOneAndUpdate.mockReset();
    persistence.getDatabase.mockReset();
    persistence.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
    persistence.loadWholeStateMediaPrerequisite.mockReset().mockResolvedValue({
      operation: "CAPTURE_CHECKPOINT_STATE",
      projectId: "project-1",
      userId: "user-1",
      projectOwnerId: "user-1",
      orgId: null,
      projectRevision: REVISION,
      candidateMediaContentSha256: MEDIA_PREREQUISITE_LINK.candidateMediaContentSha256,
      mediaEntries: [],
    });
    persistence.materializeWholeStateMediaPrerequisite.mockReset().mockResolvedValue({
      candidateMediaContentSha256: MEDIA_PREREQUISITE_LINK.candidateMediaContentSha256,
      mediaEntries: [],
    });
    persistence.outboxFindOne.mockReset().mockResolvedValue(null);
    persistence.updateOne.mockReset().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
    });
    persistence.getDatabase.mockResolvedValue({
      collection: vi.fn((name: string) => name
        === "editron_project_render_snapshot_invalidation_outbox_v1"
        ? {
            findOne: persistence.outboxFindOne,
            insertOne: persistence.insertOne,
          }
        : {
            findOne: persistence.findOne,
            findOneAndUpdate: persistence.findOneAndUpdate,
            updateOne: persistence.updateOne,
          }),
    });
  });

  it("captures generated composition state in the canonical checkpoint snapshot", () => {
    const generatedCompositions = [{ compositionId: "composition-1" }];
    const state = captureRestorableProjectState({
      overlays: [],
      generatedCompositions,
    });

    expect(CHAT_RESTORABLE_PROJECT_FIELDS).toContain("generatedCompositions");
    expect(state.presentFields).toContain("generatedCompositions");
    expect(state.fields.generatedCompositions).toEqual(generatedCompositions);
  });

  it("restores the whole field through ProjectService and advances once", async () => {
    persistence.findOne.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      overlays: [],
      generatedCompositions: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      projectRevision: REVISION.value,
      updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    });
    persistence.findOneAndUpdate.mockResolvedValue({
      projectId: "project-1",
      generatedCompositions: [],
      projectRevision: 5,
    });

    const result = await projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-generated-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        capturedWholeStateMediaPrerequisite: MEDIA_PREREQUISITE_LINK,
        setFields: { generatedCompositions: [] },
        unsetFields: [],
      },
    );

    expect(result.receipt.revision.value).toBe(5);
    expect(persistence.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
      $set: { generatedCompositions: [] },
      $inc: { projectRevision: 1 },
    });
    const insertedOutbox = persistence.insertOne.mock.calls[0]?.[0];
    expect(insertedOutbox).toMatchObject({
      status: "AWAITING_PROJECT_COMMIT",
      receipt: {
        operation: "RESTORE_CHECKPOINT_STATE",
        beforeRevision: { value: 4 },
        afterRevision: { value: 5 },
      },
    });
    expect(result.timelineChangeReceipt.downstreamInvalidation).toMatchObject({
      status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
      projectRenderSnapshotInvalidation: {
        invalidationId: insertedOutbox.receipt.receiptId,
        receiptHash: insertedOutbox.receipt.receiptHash,
      },
    });
    expect(persistence.insertOne.mock.invocationCallOrder[0])
      .toBeLessThan(persistence.findOneAndUpdate.mock.invocationCallOrder[0]!);
  });

  it("fails closed for older checkpoints that never captured composition state", async () => {
    const legacyState = {
      presentFields: ["overlays" as const],
      fields: { overlays: [] },
    };
    const service = new CheckpointService();
    vi.spyOn(service, "getCheckpoint").mockResolvedValue({
      checkpointId: "checkpoint-legacy",
      sessionId: "session-1",
      projectId: "project-1",
      userId: "user-1",
      overlays: [],
      projectState: legacyState,
      stateHash: projectStateFingerprint(legacyState),
      stateHashVersion: 2,
      timestamp: new Date(),
      description: "Legacy checkpoint",
      type: "before-llm",
      createdAt: new Date(),
    });

    const result = await service.restoreProjectCheckpoint(
      "checkpoint-legacy",
      "user-1",
      { projectId: "project-1", expectedRevision: REVISION, actorKind: "SYSTEM" },
    );

    expect(result).toMatchObject({
      restored: false,
      reason: "legacy-checkpoint-missing-generated-composition-state",
    });
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });

  it("recaptures media evidence only when a legacy full-state checkpoint is current", async () => {
    const currentProject = {
      projectId: "project-1",
      userId: "user-1",
      orgId: null,
      overlays: [],
      generatedCompositions: [],
      aspectRatio: "16:9",
      fps: 30,
      durationInFrames: 0,
    };
    const projectState = captureRestorableProjectState(currentProject);
    const checkpoint = {
      checkpointId: "checkpoint-legacy-current",
      sessionId: "session-1",
      projectId: "project-1",
      userId: "user-1",
      overlays: [],
      projectState,
      stateHash: projectStateFingerprint(projectState),
      stateHashVersion: 2 as const,
      timestamp: new Date(),
      description: "Legacy current-state checkpoint",
      type: "before-llm" as const,
      createdAt: new Date(),
    };
    let storedCheckpoint = structuredClone(checkpoint) as typeof checkpoint & {
      capturedProjectRevision?: ProjectRevisionV1;
      wholeStateMediaPrerequisite?: typeof MEDIA_PREREQUISITE_LINK;
    };
    persistence.findOne.mockImplementation(async () => storedCheckpoint);
    persistence.updateOne.mockImplementation(async (_filter, update) => {
      storedCheckpoint = { ...storedCheckpoint, ...structuredClone(update.$set) };
      return { acknowledged: true, matchedCount: 1 };
    });
    const service = new CheckpointService();
    vi.spyOn(service, "getCheckpoint").mockResolvedValue(checkpoint);
    const loadProject = vi.spyOn(projectService, "loadProjectForMutation").mockResolvedValue({
      project: currentProject as never,
      revision: REVISION,
    });
    const restore = vi.spyOn(projectService, "restoreCheckpointState");

    const result = await service.restoreProjectCheckpoint(
      checkpoint.checkpointId,
      checkpoint.userId,
      { projectId: checkpoint.projectId, expectedRevision: REVISION, actorKind: "SYSTEM" },
    );

    expect(result).toMatchObject({
      restored: true,
      reason: "legacy-checkpoint-recaptured-current-state",
      restoredRevision: REVISION,
    });
    expect(persistence.materializeWholeStateMediaPrerequisite).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "CAPTURE_CHECKPOINT_STATE",
        projectId: checkpoint.projectId,
        projectRevision: REVISION,
        overlays: [],
      }),
      expect.anything(),
      "mediaAssets",
    );
    expect(persistence.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpointId: checkpoint.checkpointId,
        stateHash: checkpoint.stateHash,
        wholeStateMediaPrerequisite: { $exists: false },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          capturedProjectRevision: REVISION,
          wholeStateMediaPrerequisite: MEDIA_PREREQUISITE_LINK,
        }),
      }),
    );
    expect(persistence.loadWholeStateMediaPrerequisite)
      .toHaveBeenCalledWith(MEDIA_PREREQUISITE_LINK, expect.anything());
    expect(loadProject).toHaveBeenCalledTimes(2);
    expect(restore).not.toHaveBeenCalled();
  });

  it("rejects partial and invalid checkpoint state before persistence", async () => {
    await expect(projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-partial-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        capturedWholeStateMediaPrerequisite: MEDIA_PREREQUISITE_LINK,
        setFields: { "generatedCompositions.0": {} },
        unsetFields: [],
      },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-invalid-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        capturedWholeStateMediaPrerequisite: MEDIA_PREREQUISITE_LINK,
        setFields: { generatedCompositions: [{}] },
        unsetFields: [],
      },
    )).rejects.toBeInstanceOf(ProjectGeneratedCompositionEntryValidationErrorV1);
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });
});
