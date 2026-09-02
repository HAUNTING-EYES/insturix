import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPendingProjectGeneratedCompositionStateV1,
  type ProjectGeneratedCompositionDraftV1,
  type ProjectGeneratedCompositionEntryV1,
} from "@/lib/editron/services/project-generated-composition-entry-v1";
import {
  PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
  type ProjectGeneratedCompositionStateV1,
} from "@/lib/editron/services/project-generated-composition-state-v1";
import {
  ProjectGeneratedCompositionStateConflictErrorV1,
  ProjectMutationWriteError,
  projectService,
  type Project,
  type ProjectRevisionV1,
} from "@/lib/editron/services/project-service";

const persistence = vi.hoisted(() => ({
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  materializeMediaPrerequisite: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    PROJECTS: "editron_prev.projects",
    MEDIA_ASSETS: "editron_prev.media_assets",
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
vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: { isMember: vi.fn() },
}));
vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));
vi.mock("@/lib/services/org-wallet-flag", () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1", () => ({
  materializeProjectWholeStateMediaPrerequisiteInMongoV1:
    persistence.materializeMediaPrerequisite,
  projectWholeStateMediaPrerequisiteLinkV1: vi.fn(() => ({
    status: "MATERIALIZED",
    collection: "editron_project_whole_state_media_prerequisites_v1",
    receiptSha256: "a".repeat(64),
    candidateMediaSetSha256: "b".repeat(64),
    candidateMediaContentSha256: "c".repeat(64),
    mediaEntryCount: 0,
  })),
}));

const PROJECT_ID = "project-1";
const USER_ID = "user-1";
const TOKEN_A = `gcp-state-v1:${"1".repeat(64)}`;
const TOKEN_B = `gcp-state-v1:${"2".repeat(64)}`;
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: "2026-08-15T10:00:00.000Z",
};

describe("ProjectService generated-composition lifecycle V1", () => {
  beforeEach(() => {
    persistence.findOne.mockReset();
    persistence.getDatabase.mockReset();
    persistence.insertOne.mockReset();
    persistence.materializeMediaPrerequisite.mockReset();
    persistence.updateOne.mockReset();
    persistence.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: persistence.findOne,
        insertOne: persistence.insertOne,
        updateOne: persistence.updateOne,
      })),
    });
    persistence.insertOne.mockResolvedValue({ acknowledged: true });
    persistence.materializeMediaPrerequisite.mockResolvedValue({});
    persistence.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it("issues and receipts one pending insert without accepting caller identity", async () => {
    persistence.findOne.mockResolvedValue(project());

    const captured = await projectService.captureMutationReceipts(() =>
      projectService.prepareProjectGeneratedCompositionV1(USER_ID, PROJECT_ID, {
        kind: "INSERT",
        expectedRevision: REVISION,
        actorKind: "AGENT",
        draft: draft(),
      }));

    const { entry, receipt } = captured.value;
    expect(entry.activeState).toBeNull();
    expect(entry.candidateState).toMatchObject({
      projectId: PROJECT_ID,
      verificationDisposition: "PENDING",
      renderArtifacts: [],
      proof: null,
    });
    expect(entry.candidateState?.stateIdentity.token)
      .toMatch(/^gcp-state-v1:[a-f0-9]{64}$/);
    expect(receipt.revision.value).toBe(8);
    expect(captured.receipts).toEqual([receipt]);
    expect(captured.value.timelineChangeReceipt).toBeNull();
    const [filter, update] = persistence.updateOne.mock.calls[0];
    expect(filter).toMatchObject({
      projectId: PROJECT_ID,
      userId: USER_ID,
      projectRevision: 7,
      generatedCompositions: {
        $not: { $elemMatch: { compositionId: "composition-1" } },
      },
    });
    expect(update.$inc).toEqual({ projectRevision: 1 });
    expect(update.$push.generatedCompositions).toEqual(entry);
  });

  it("preserves a passing active state while preparing an explicitly based revision", async () => {
    const active = passingState(pendingState(TOKEN_A));
    persistence.findOne.mockResolvedValue(project([entry(active, null)]));

    await expect(projectService.prepareProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      {
        kind: "REVISE",
        expectedRevision: REVISION,
        actorKind: "AGENT",
        expectedBaseStateToken: `gcp-state-v1:${"9".repeat(64)}`,
        draft: draft(),
      },
    )).rejects.toBeInstanceOf(ProjectGeneratedCompositionStateConflictErrorV1);
    expect(persistence.updateOne).not.toHaveBeenCalled();

    const result = await projectService.prepareProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      {
        kind: "REVISE",
        expectedRevision: REVISION,
        actorKind: "AGENT",
        expectedBaseStateToken: TOKEN_A,
        draft: draft(),
      },
    );
    expect(result.entry.activeState).toEqual(active);
    expect(result.entry.candidateState?.verificationDisposition).toBe("PENDING");
    expect(result.entry.candidateState?.stateIdentity.token).not.toBe(TOKEN_A);
  });

  it("promotes only the exact prepared passing candidate", async () => {
    const pending = pendingState(TOKEN_A);
    persistence.findOne
      .mockResolvedValueOnce(project([entry(null, pending)]))
      .mockResolvedValueOnce(null);
    const terminal = passingState(pending);

    const result = await projectService.finalizeProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      { expectedRevision: REVISION, actorKind: "SYSTEM", terminalState: terminal },
    );

    expect(result.entry.activeState).toEqual(terminal);
    expect(result.entry.candidateState).toBeNull();
    expect(result.receipt.revision.value).toBe(8);
    expect(result.timelineChangeReceipt).toMatchObject({
      operation: "FINALIZE_GENERATED_COMPOSITION",
      actorKind: "SYSTEM",
      affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 60 }],
      wholeStateMediaPrerequisite: { mediaEntryCount: 0 },
      downstreamInvalidation: {
        status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
      },
    });
    expect(persistence.updateOne.mock.calls[0][0]).toMatchObject({
      generatedCompositions: {
        $elemMatch: {
          compositionId: "composition-1",
          "candidateState.stateIdentity.token": TOKEN_A,
          "candidateState.verificationDisposition": "PENDING",
        },
      },
    });
    expect(persistence.materializeMediaPrerequisite).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "FINALIZE_GENERATED_COMPOSITION",
        projectRevision: REVISION,
        overlays: [],
      }),
      expect.anything(),
      "editron_prev.media_assets",
    );
    expect(persistence.materializeMediaPrerequisite.mock.invocationCallOrder[0])
      .toBeLessThan(persistence.insertOne.mock.invocationCallOrder[0]!);
    expect(persistence.insertOne.mock.invocationCallOrder[0])
      .toBeLessThan(persistence.updateOne.mock.invocationCallOrder[0]!);
  });

  it("rejects a terminal result that changes prepared creative material", async () => {
    const pending = pendingState(TOKEN_A);
    persistence.findOne.mockResolvedValue(project([entry(null, pending)]));
    const terminal = passingState(pending);
    terminal.referenceBinding = {
      blueprintId: "forged-reference",
      blueprintArtifact: artifact("forged-reference", "f"),
    };

    await expect(projectService.finalizeProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      { expectedRevision: REVISION, actorKind: "SYSTEM", terminalState: terminal },
    )).rejects.toBeInstanceOf(ProjectGeneratedCompositionStateConflictErrorV1);
    expect(persistence.updateOne).not.toHaveBeenCalled();
  });

  it("retains the last passing state when the new candidate fails proof", async () => {
    const active = passingState(pendingState(TOKEN_A));
    const pending = pendingState(TOKEN_B);
    persistence.findOne.mockResolvedValue(project([entry(active, pending)]));
    const terminal = failedState(pending);

    const result = await projectService.finalizeProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      { expectedRevision: REVISION, actorKind: "SYSTEM", terminalState: terminal },
    );

    expect(result.entry.activeState).toEqual(active);
    expect(result.entry.candidateState).toEqual(terminal);
    expect(result.timelineChangeReceipt).toBeNull();
    expect(persistence.materializeMediaPrerequisite).not.toHaveBeenCalled();
    expect(persistence.insertOne).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated generated-composition media before promotion side effects", async () => {
    const sourceDraft = draft();
    sourceDraft.sourceBindings = [{
      slotId: "source-1",
      asset: artifact("source-asset", "4"),
      rightsReceipt: artifact("source-rights", "5"),
      mediaKind: "IMAGE",
      coordinateDomain: "STATIC",
    }];
    const pending = createPendingProjectGeneratedCompositionStateV1(
      PROJECT_ID,
      TOKEN_A,
      sourceDraft,
    );
    persistence.findOne.mockResolvedValue(project([entry(null, pending)]));

    await expect(projectService.finalizeProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      {
        expectedRevision: REVISION,
        actorKind: "SYSTEM",
        terminalState: passingState(pending),
      },
    )).rejects.toThrow(/live source and rights authority/);
    expect(persistence.materializeMediaPrerequisite).not.toHaveBeenCalled();
    expect(persistence.insertOne).not.toHaveBeenCalled();
    expect(persistence.updateOne).not.toHaveBeenCalled();
  });

  it("closes the post-read race with the writer-issued current revision", async () => {
    persistence.findOne
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project([], { ...REVISION, value: 8 }));
    persistence.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await expect(projectService.prepareProjectGeneratedCompositionV1(
      USER_ID,
      PROJECT_ID,
      { kind: "INSERT", expectedRevision: REVISION, actorKind: "AGENT", draft: draft() },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 8 },
    });
  });

  it("blocks every generic project update path from writing composition state", async () => {
    await expect(projectService.updateProject(USER_ID, PROJECT_ID, {
      generatedCompositions: [],
    })).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect("replaceOverlayFamilyAtomic" in projectService).toBe(false);
    await expect(projectService.saveProjectWithReceipt(USER_ID, PROJECT_ID, {
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
    }, {
      expectedRevision: REVISION,
      projectUpdates: { generatedCompositions: [] },
    }))
      .rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });
});

function project(
  generatedCompositions: ProjectGeneratedCompositionEntryV1[] = [],
  revision = REVISION,
): Project {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Project",
    overlays: [],
    aspectRatio: "9:16",
    playerDimensions: { width: 1080, height: 1920 },
    fps: 30,
    durationInFrames: 60,
    createdAt: new Date("2026-08-15T09:00:00.000Z"),
    updatedAt: new Date(revision.compatibilityUpdatedAt),
    projectRevision: revision.value,
    generatedCompositions,
    visibility: "private",
  };
}

function entry(
  activeState: ProjectGeneratedCompositionStateV1 | null,
  candidateState: ProjectGeneratedCompositionStateV1 | null,
): ProjectGeneratedCompositionEntryV1 {
  return { schemaVersion: 1, compositionId: "composition-1", activeState, candidateState };
}

function pendingState(token: string): ProjectGeneratedCompositionStateV1 {
  return createPendingProjectGeneratedCompositionStateV1(PROJECT_ID, token, draft());
}

function passingState(
  pending: ProjectGeneratedCompositionStateV1,
): ProjectGeneratedCompositionStateV1 {
  const preview = artifact("preview", "d");
  return {
    ...structuredClone(pending),
    renderArtifacts: [{
      stage: "PREVIEW",
      artifact: preview,
      boundStateToken: pending.stateIdentity.token,
      programDigest: pending.programRef.programArtifact.digest,
      width: 1080,
      height: 1920,
      frameRate: { numerator: "30", denominator: "1" },
      durationTicks: "60",
      contentOffsetTicks: "0",
      outputKind: "OPAQUE_NESTED_COMPOSITION",
    }],
    verificationDisposition: "PASS",
    proof: proof(pending, "PASS", preview),
  };
}

function failedState(
  pending: ProjectGeneratedCompositionStateV1,
): ProjectGeneratedCompositionStateV1 {
  const evidence = artifact("failed-preview-log", "f");
  return {
    ...structuredClone(pending),
    verificationDisposition: "FAIL",
    proof: proof(pending, "FAIL", evidence),
  };
}

function proof(
  state: ProjectGeneratedCompositionStateV1,
  status: "PASS" | "FAIL",
  evidence: ReturnType<typeof artifact>,
): NonNullable<ProjectGeneratedCompositionStateV1["proof"]> {
  return {
    ownerId: "generated-composition-proof-owner",
    receipt: artifact("proof-receipt", "e"),
    boundStateToken: state.stateIdentity.token,
    programDigest: state.programRef.programArtifact.digest,
    status,
    observations: [{ obligationId: "render:visual", required: true, status, evidence: [evidence] }],
  };
}

function draft(): ProjectGeneratedCompositionDraftV1 {
  return {
    schemaVersion: 1,
    contractVersion: PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
    kind: "generated-composition",
    compositionId: "composition-1",
    programRef: {
      artifactType: "GeneratedCompositionProgramV1",
      contractVersion: "EDITRON_GENERATED_COMPOSITION_PROGRAM_V1",
      programId: "program-1",
      boundProjectId: PROJECT_ID,
      programArtifact: artifact("program", "a"),
      sourceBundleArtifact: artifact("source-bundle", "b"),
      generator: { kind: "HUMAN_AUTHORED", authorId: USER_ID },
      allowedApi: { apiId: "editron-gcp", apiVersion: "1", runtimeDigest: digest("c") },
    },
    referenceBinding: null,
    placement: {
      projectTimebase: timebase("project-1:timeline", "PROJECT", PROJECT_ID),
      compositionTimebase: timebase("composition-1:local", "COMPOSITION", "composition-1"),
      projectRange: { startTick: "0", endExclusiveTick: "60" },
      compositionRange: { startTick: "0", endExclusiveTick: "60" },
      headHandleTicks: "0",
      tailHandleTicks: "0",
      handlePolicy: "LOCKED_BOUNDARY_NO_TRIM",
    },
    canvas: {
      width: 1080,
      height: 1920,
      pixelAspectRatio: { numerator: "1", denominator: "1" },
      colorIntent: "SDR_BT709",
    },
    sourceBindings: [],
    dependencyBindings: [],
    fontBindings: [],
    exposedControls: [],
    output: {
      kind: "OPAQUE_NESTED_COMPOSITION",
      representation: "EDITABLE_PROGRAM_AND_PROXY",
      flatteningDisposition: "EXPLICIT_HANDOFF_ONLY",
      audioDisposition: "CUE_HANDOFF_ONLY",
    },
    audioCueIntents: [],
  };
}

function timebase(
  timebaseId: string,
  scope: "PROJECT" | "COMPOSITION",
  scopeId: string,
) {
  return {
    timebaseId,
    version: "v1",
    scope,
    scopeId,
    rate: { numerator: "30", denominator: "1" },
  };
}

function artifact(artifactId: string, fill: string) {
  return { artifactId, version: "v1", digest: digest(fill) };
}

function digest(fill: string) {
  return { algorithm: "sha-256" as const, value: fill.repeat(64) };
}
