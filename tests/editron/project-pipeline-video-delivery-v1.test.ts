import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPipelineVideoProjectDeliveryPrerequisiteV1,
  materializePipelineVideoProjectDeliveryPrerequisiteV1,
  pipelineVideoDeliveryInvalidationAdmissionHashV1,
  pipelineVideoDeliveryInvalidationAdmissionKeyV1,
  pipelineVideoDeliveryTargetFingerprintV1,
  pipelineVideoProjectDeliveryPrerequisiteHashV1,
} from "@/lib/editron/services/pipeline-video-project-delivery-v1";
import {
  applyProjectArtifactInvalidationProgressV1,
  createProjectArtifactInvalidationOutboxV1,
  createProjectArtifactInvalidationReceiptV1,
} from "@/lib/editron/services/project-artifact-invalidation-v1";

const persistenceMocks = vi.hoisted(() => ({
  artifactOutboxFindOne: vi.fn(),
  findOne: vi.fn(),
  materializeMediaPrerequisite: vi.fn(),
  snapshotOutboxFindOne: vi.fn(),
  snapshotOutboxInsertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { MEDIA_ASSETS: "media_assets", PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name === "projects") {
        return {
          findOne: persistenceMocks.findOne,
          updateOne: persistenceMocks.updateOne,
        };
      }
      if (name === "editron_project_artifact_invalidation_outbox_v1") {
        return { findOne: persistenceMocks.artifactOutboxFindOne };
      }
      if (name === "editron_project_render_snapshot_invalidation_outbox_v1") {
        return {
          findOne: persistenceMocks.snapshotOutboxFindOne,
          insertOne: persistenceMocks.snapshotOutboxInsertOne,
        };
      }
      return {};
    }),
  })),
  connectToDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

vi.mock("@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1", () => ({
  materializeProjectWholeStateMediaPrerequisiteInMongoV1:
    persistenceMocks.materializeMediaPrerequisite,
  projectWholeStateMediaPrerequisiteLinkV1: vi.fn(() => ({
    status: "MATERIALIZED",
    collection: "editron_project_whole_state_media_prerequisites_v1",
    receiptSha256: "a".repeat(64),
    candidateMediaSetSha256: "b".repeat(64),
    candidateMediaContentSha256: "c".repeat(64),
    mediaEntryCount: 1,
  })),
}));

const PROJECT_ID = "proj_video_delivery";
const USER_ID = "user_video_delivery";
const DELIVERY_ID = "video-delivery_abcdefghijklmnopqr";
const QUALITY_JOB_ID = "vb_quality_batch_s2";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";
const PROVIDER_LICENSE_ID = "fal-ai:seedance-1.5:service-output-terms";

function nativeAudioRights(assetId: string) {
  return {
    mediaRole: "native-video" as const,
    source: "generated" as const,
    userChoice: "attested" as const,
    licensed: true,
    evidence: {
      kind: "generated-provider" as const,
      sourceAssetId: assetId,
      licenseId: PROVIDER_LICENSE_ID,
    },
  };
}

function generatedVideoReceipt(assetId: string, present = true) {
  return {
    version: "editron-generated-video-receipt-v1" as const,
    provider: "fal-ai" as const,
    model: "seedance-1.5",
    assetId,
    providerJobId: "provider-job-123",
    generatedAt: "2026-08-25T00:01:00.000Z",
    nativeAudio: {
      requestMode: "enabled" as const,
      present,
      probe: "ffmpeg-audio-stream-decode" as const,
      probedAt: "2026-08-25T00:01:01.000Z",
      ...(present ? { licenseId: PROVIDER_LICENSE_ID } : {}),
    },
  };
}

function videoOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    type: "video",
    row: 2,
    from: 30,
    durationInFrames: 150,
    sourceStartFrame: 0,
    assetId: "video-old",
    src: "https://assets.example.test/video-old.mp4",
    content: "https://assets.example.test/video-old.mp4",
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    keyframeTracks: [{ property: "scale", keyframes: [{ frame: 0, value: 1, easing: "linear" }] }],
    styles: { objectFit: "cover", opacity: 1 },
    ...overrides,
  };
}

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overlays: unknown[] = [videoOverlay()],
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Pipeline video delivery fixture",
    overlays,
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 180,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
  };
}

function revisionFor(project: ReturnType<typeof projectFixture>) {
  return {
    schemaVersion: 1 as const,
    value: project.projectRevision,
    compatibilityUpdatedAt: project.updatedAt.toISOString(),
  };
}

function videoCommand(
  project: ReturnType<typeof projectFixture>,
  overrides: Record<string, unknown> = {},
) {
  const replacementAssetId = "video-new";
  const targetOverlay = project.overlays.find((overlay: any) => (
    overlay.type === "video" && overlay.assetId === "video-old"
  ));
  if (!targetOverlay) throw new Error("videoCommand fixture target missing");
  const prerequisite = createPipelineVideoProjectDeliveryPrerequisiteV1({
    projectId: PROJECT_ID,
    expectedRevision: revisionFor(project),
    overlay: targetOverlay as any,
  });
  return {
    expectedRevision: revisionFor(project),
    deliveryId: DELIVERY_ID,
    target: {
      overlayId: 10,
      expectedAssetId: "video-old",
    },
    replacement: {
      assetId: replacementAssetId,
      sourceUrl: "https://assets.example.test/video-new.mp4",
      durationMs: 5_000,
      hasNativeAudio: true,
      audioRights: nativeAudioRights(replacementAssetId),
      generatedVideoReceipt: generatedVideoReceipt(replacementAssetId),
    },
    prerequisite,
    ...overrides,
  } as any;
}

function pendingAdmissionPrerequisite(
  project: ReturnType<typeof projectFixture>,
  ownerId = USER_ID,
) {
  const prerequisite = createPipelineVideoProjectDeliveryPrerequisiteV1({
    projectId: PROJECT_ID,
    expectedRevision: revisionFor(project),
    overlay: project.overlays[0] as any,
  });
  const beforeRevision = revisionFor(project);
  const admittedAt = new Date("2026-08-25T00:00:10.000Z");
  const afterRevision = {
    schemaVersion: 1 as const,
    value: beforeRevision.value + 1,
    compatibilityUpdatedAt: admittedAt.toISOString(),
  };
  const admissionId = `pipeline-video-invalidation_${pipelineVideoDeliveryInvalidationAdmissionKeyV1({
    projectId: PROJECT_ID,
    ownerId,
    expectedRevision: beforeRevision,
    target: prerequisite.target,
  })}`;
  const unsignedAdmission = {
    required: true as const,
    status: "ADMITTED_ARTIFACT_CHAIN_PENDING" as const,
    admissionId,
    projectId: PROJECT_ID,
    ownerId,
    beforeRevision,
    afterRevision,
    target: prerequisite.target,
    affectedDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"] as const,
    admittedAt: admittedAt.toISOString(),
    expiresAt: new Date(admittedAt.getTime() + 15 * 60 * 1000).toISOString(),
  };
  const admission = {
    ...unsignedAdmission,
    admissionHash: pipelineVideoDeliveryInvalidationAdmissionHashV1(unsignedAdmission),
  };
  return {
    admission,
    prerequisite: materializePipelineVideoProjectDeliveryPrerequisiteV1(
      prerequisite,
      admission,
    ),
  };
}

function materializedArtifactInvalidationOutbox(
  admission: ReturnType<typeof pendingAdmissionPrerequisite>["admission"],
) {
  const receipt = createProjectArtifactInvalidationReceiptV1({
    admissionId: admission.admissionId,
    admissionHash: admission.admissionHash,
    ownerId: admission.ownerId,
    projectId: admission.projectId,
    beforeRevision: admission.beforeRevision,
    afterRevision: admission.afterRevision,
    target: admission.target,
    affectedDerivativeClasses: admission.affectedDerivativeClasses,
  });
  return applyProjectArtifactInvalidationProgressV1({
    outbox: createProjectArtifactInvalidationOutboxV1({
      receipt,
      now: new Date("2026-08-25T00:00:11.000Z"),
    }),
    resolvedDerivativeClasses: admission.affectedDerivativeClasses,
    now: new Date("2026-08-25T00:00:12.000Z"),
  });
}

function qualityWarningCommand(
  project: ReturnType<typeof projectFixture>,
  overrides: Record<string, unknown> = {},
) {
  return {
    expectedRevision: revisionFor(project),
    batchId: "vb_quality_batch",
    jobId: QUALITY_JOB_ID,
    storyboardId: "sb_quality_warning",
    sceneIndex: 2,
    assetId: "video-low-quality",
    qualityScore: 31,
    qualitySource: "hybrid-vision" as const,
    ...overrides,
  } as any;
}

describe("ProjectService pipeline video delivery V1", () => {
  beforeEach(() => {
    vi.useRealTimers();
    persistenceMocks.artifactOutboxFindOne.mockReset();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.materializeMediaPrerequisite.mockReset();
    persistenceMocks.snapshotOutboxFindOne.mockReset();
    persistenceMocks.snapshotOutboxInsertOne.mockReset();
    persistenceMocks.updateOne.mockReset();
    persistenceMocks.artifactOutboxFindOne.mockResolvedValue(null);
    persistenceMocks.materializeMediaPrerequisite.mockResolvedValue({});
    persistenceMocks.snapshotOutboxFindOne.mockResolvedValue(null);
    persistenceMocks.snapshotOutboxInsertOne.mockResolvedValue({ acknowledged: true });
  });

  it("fails closed when no durable invalidation owner can admit the project delivery", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "INVALIDATION_UNVERIFIABLE",
    });
    expect(persistenceMocks.findOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("persists, reloads, and safely replays a pending admission while delivery stays blocked", async () => {
    const project = projectFixture();
    const prerequisite = createPipelineVideoProjectDeliveryPrerequisiteV1({
      projectId: PROJECT_ID,
      expectedRevision: revisionFor(project),
      overlay: project.overlays[0] as any,
    });
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const admissionResult = await projectService.admitPipelineVideoDeliveryInvalidationV1(
      USER_ID,
      PROJECT_ID,
      prerequisite,
    );
    expect(admissionResult.disposition).toBe("ADMITTED");
    expect(admissionResult.afterRevision.value).toBe(8);
    expect(admissionResult.admission).toMatchObject({
      required: true,
      status: "ADMITTED_ARTIFACT_CHAIN_PENDING",
      projectId: PROJECT_ID,
      ownerId: USER_ID,
      beforeRevision: { value: 7 },
      afterRevision: { value: 8 },
      target: {
        overlayId: 10,
        expectedAssetId: "video-old",
        exactFrameRange: { startFrame: 30, endFrame: 180 },
      },
      affectedDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"],
    });
    const admissionWrite = persistenceMocks.updateOne.mock.calls[0] as [
      Record<string, any>,
      Record<string, any>,
    ];
    expect(admissionWrite[0]).toMatchObject({
      projectId: PROJECT_ID,
      userId: USER_ID,
      projectRevision: 7,
      "pipelineVideoDeliveryInvalidationAdmissionsV1.admissionId": {
        $ne: admissionResult.admission.admissionId,
      },
    });
    expect(admissionWrite[1].$push.pipelineVideoDeliveryInvalidationAdmissionsV1.$each)
      .toEqual([admissionResult.admission]);

    const admittedProject = {
      ...project,
      projectRevision: admissionResult.afterRevision.value,
      updatedAt: new Date(admissionResult.afterRevision.compatibilityUpdatedAt),
      pipelineVideoDeliveryInvalidationAdmissionsV1: [admissionResult.admission],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    await expect(projectService.loadProjectForMutation(USER_ID, PROJECT_ID))
      .resolves.toMatchObject({
        revision: admissionResult.afterRevision,
        project: {
          pipelineVideoDeliveryInvalidationAdmissionsV1: [admissionResult.admission],
        },
      });

    // A retry recovers the same durable admission without advancing revision.
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    await expect(projectService.admitPipelineVideoDeliveryInvalidationV1(
      USER_ID,
      PROJECT_ID,
      prerequisite,
    )).resolves.toMatchObject({
      disposition: "ALREADY_ADMITTED",
      admission: admissionResult.admission,
      prerequisite: {
        expectedRevision: admissionResult.afterRevision,
        invalidation: { status: "ADMITTED_ARTIFACT_CHAIN_PENDING" },
      },
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    // A fresh HTTP retry starts from the already-admitted revision. Recover
    // the same owner-issued prerequisite without advancing the project again.
    const freshRetryPrerequisite = createPipelineVideoProjectDeliveryPrerequisiteV1({
      projectId: PROJECT_ID,
      expectedRevision: admissionResult.afterRevision,
      overlay: project.overlays[0] as any,
    });
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    await expect(projectService.admitPipelineVideoDeliveryInvalidationV1(
      USER_ID,
      PROJECT_ID,
      freshRetryPrerequisite,
    )).resolves.toMatchObject({
      disposition: "ALREADY_ADMITTED",
      admission: admissionResult.admission,
      prerequisite: {
        expectedRevision: admissionResult.afterRevision,
        invalidation: admissionResult.admission,
      },
      beforeRevision: admissionResult.beforeRevision,
      afterRevision: admissionResult.afterRevision,
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    // Admission alone is not artifact invalidation; delivery must not write.
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project, {
        expectedRevision: admissionResult.afterRevision,
        prerequisite: admissionResult.prerequisite,
      }),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "INVALIDATION_UNVERIFIABLE",
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
    expect(admittedProject).not.toHaveProperty("pipelineVideoDeliveryReceipts");
  });

  it("commits only after target invalidation, media admission, and snapshot invalidation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:13.000Z"));
    const base = projectFixture();
    const admitted = pendingAdmissionPrerequisite(base);
    const admittedProject = {
      ...base,
      projectRevision: admitted.admission.afterRevision.value,
      updatedAt: new Date(admitted.admission.afterRevision.compatibilityUpdatedAt),
      pipelineVideoDeliveryInvalidationAdmissionsV1: [admitted.admission],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    persistenceMocks.artifactOutboxFindOne.mockResolvedValueOnce(
      materializedArtifactInvalidationOutbox(admitted.admission),
    );
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base, {
        expectedRevision: admitted.admission.afterRevision,
        prerequisite: admitted.prerequisite,
      }),
    );

    expect(result).toMatchObject({
      disposition: "APPLIED",
      deliveryReceipt: {
        beforeRevision: admitted.admission.afterRevision,
        afterRevision: { value: 9 },
        replacementAssetId: "video-new",
        timelineChangeReceipt: {
          operation: "REPLACE_PIPELINE_VIDEO_DELIVERY",
          fps: 30,
          wholeStateMediaPrerequisite: { mediaEntryCount: 1 },
          downstreamInvalidation: {
            status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
            projectRenderSnapshotInvalidation: {
              receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              beforeRevision: admitted.admission.afterRevision,
              afterRevision: { value: 9 },
            },
          },
        },
      },
    });
    expect(persistenceMocks.materializeMediaPrerequisite).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "REPLACE_PIPELINE_VIDEO_DELIVERY",
        projectRevision: admitted.admission.afterRevision,
        overlays: [expect.objectContaining({ assetId: "video-new", id: 10 })],
      }),
      expect.anything(),
      "media_assets",
    );
    expect(persistenceMocks.materializeMediaPrerequisite.mock.invocationCallOrder[0])
      .toBeLessThan(persistenceMocks.snapshotOutboxInsertOne.mock.invocationCallOrder[0]!);
    expect(persistenceMocks.snapshotOutboxInsertOne.mock.invocationCallOrder[0])
      .toBeLessThan(persistenceMocks.updateOne.mock.invocationCallOrder[0]!);
  });

  it("does not invalidate or mutate when replacement media admission fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:13.000Z"));
    const base = projectFixture();
    const admitted = pendingAdmissionPrerequisite(base);
    const admittedProject = {
      ...base,
      projectRevision: admitted.admission.afterRevision.value,
      updatedAt: new Date(admitted.admission.afterRevision.compatibilityUpdatedAt),
      pipelineVideoDeliveryInvalidationAdmissionsV1: [admitted.admission],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    persistenceMocks.artifactOutboxFindOne.mockResolvedValueOnce(
      materializedArtifactInvalidationOutbox(admitted.admission),
    );
    persistenceMocks.materializeMediaPrerequisite.mockRejectedValueOnce(
      new Error("PROJECT_WHOLE_STATE_MEDIA_RIGHTS_NOT_AUTHORIZED"),
    );
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base, {
        expectedRevision: admitted.admission.afterRevision,
        prerequisite: admitted.prerequisite,
      }),
    )).rejects.toThrow("PROJECT_WHOLE_STATE_MEDIA_RIGHTS_NOT_AUTHORIZED");
    expect(persistenceMocks.snapshotOutboxInsertOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a valid-hash pending admission claim without the persisted ProjectService admission", async () => {
    const project = projectFixture();
    const forged = pendingAdmissionPrerequisite(project);
    const admittedProject = {
      ...project,
      projectRevision: forged.admission.afterRevision.value,
      updatedAt: new Date(forged.admission.afterRevision.compatibilityUpdatedAt),
    };
    persistenceMocks.findOne.mockResolvedValueOnce(admittedProject);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project, {
        expectedRevision: forged.admission.afterRevision,
        prerequisite: forged.prerequisite,
      }),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "INVALIDATION_UNVERIFIABLE",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a replay when no persisted admission remains", async () => {
    const project = projectFixture();
    const admitted = pendingAdmissionPrerequisite(project);
    const projectWithoutAdmission = {
      ...project,
      projectRevision: admitted.admission.afterRevision.value,
      updatedAt: new Date(admitted.admission.afterRevision.compatibilityUpdatedAt),
      pipelineVideoDeliveryReceipts: [],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(projectWithoutAdmission);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project, {
        expectedRevision: admitted.admission.afterRevision,
        prerequisite: admitted.prerequisite,
      }),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "INVALIDATION_UNVERIFIABLE",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("binds every preserved target field while ignoring only resolver-owned URLs", () => {
    const base = videoOverlay();
    const refreshedUrls = videoOverlay({
      src: "https://assets.example.test/refreshed.mp4",
      content: "https://assets.example.test/refreshed.mp4",
    });
    expect(pipelineVideoDeliveryTargetFingerprintV1(base as any))
      .toBe(pipelineVideoDeliveryTargetFingerprintV1(refreshedUrls as any));
    expect(pipelineVideoDeliveryTargetFingerprintV1(
      videoOverlay({ styles: { objectFit: "contain", opacity: 1 } }) as any,
    )).not.toBe(pipelineVideoDeliveryTargetFingerprintV1(base as any));
    expect(pipelineVideoDeliveryTargetFingerprintV1(
      videoOverlay({ keyframeTracks: [] }) as any,
    )).not.toBe(pipelineVideoDeliveryTargetFingerprintV1(base as any));
    expect(pipelineVideoDeliveryTargetFingerprintV1(
      videoOverlay({ left: 24 }) as any,
    )).not.toBe(pipelineVideoDeliveryTargetFingerprintV1(base as any));
  });

  it("does not replay a prior receipt while current invalidation admission is unavailable", async () => {
    const project = projectFixture();
    const command = videoCommand(project);
    persistenceMocks.findOne.mockResolvedValueOnce({
      ...project,
      pipelineVideoDeliveryReceipts: [{
        schemaVersion: 1,
        deliveryId: DELIVERY_ID,
        materialHash: "0".repeat(64),
      }],
    });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .rejects.toMatchObject({
        code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
        reason: "INVALIDATION_UNVERIFIABLE",
      });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a stale prerequisite before any project write", async () => {
    const base = projectFixture();
    const current = projectFixture(8, "2026-08-25T00:00:01.000Z");
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "STALE_REVISION",
      currentRevision: { value: 8 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a valid-hash wrong-project prerequisite before any project read", async () => {
    const project = projectFixture();
    const command = videoCommand(project);
    const wrongPrerequisite = {
      ...command.prerequisite,
      projectId: "proj_wrong_project",
    };
    delete wrongPrerequisite.envelopeHash;
    command.prerequisite = {
      ...wrongPrerequisite,
      projectId: "proj_wrong_project",
      envelopeHash: pipelineVideoProjectDeliveryPrerequisiteHashV1(wrongPrerequisite),
    };
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a missing or forged prerequisite before any project read", async () => {
    const project = projectFixture();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const missing = videoCommand(project);
    delete missing.prerequisite;
    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      missing,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });

    const forged = videoCommand(project);
    forged.prerequisite.target.exactFrameRange.startFrame = 31;
    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      forged,
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an exact target range change before any project write", async () => {
    const base = projectFixture();
    const current = projectFixture(7, BASE_UPDATED_AT, [videoOverlay({ from: 31 })]);
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "TARGET_RANGE_CHANGED",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an exact target fingerprint change before any project write", async () => {
    const base = projectFixture();
    const current = projectFixture(7, BASE_UPDATED_AT, [videoOverlay({ sourceStartFrame: 1 })]);
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "TARGET_FINGERPRINT_CHANGED",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an active Director lease before any project write", async () => {
    const project = projectFixture();
    const current = {
      ...project,
      directorLock: true,
      directorLockAt: new Date().toISOString(),
    };
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "DIRECTOR_LEASE_ACTIVE",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an overlapping active cut lock before any project write", async () => {
    const project = projectFixture();
    const current = {
      ...project,
      timelineRangeCutLocks: [{
        schemaVersion: 1,
        lockId: "timeline-cut-lock_abcdefghijklmnopqr",
        actorKind: "SYSTEM",
        frameRange: { startFrame: 20, endFrame: 100 },
        acquiredAt: BASE_UPDATED_AT,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }],
    };
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "TIMELINE_RANGE_LOCKED",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("ignores old timeline receipts when no current invalidation owner exists", async () => {
    const project = projectFixture();
    const current = {
      ...project,
      timelineRangeChangeReceipts: [{
        downstreamInvalidation: {
          status: "MATERIALIZED",
          evidenceHash: "0".repeat(64),
        },
      }],
    };
    const prerequisite = createPipelineVideoProjectDeliveryPrerequisiteV1({
      projectId: PROJECT_ID,
      expectedRevision: revisionFor(project),
      overlay: project.overlays[0] as any,
    });
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = videoCommand(project, { prerequisite });

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "INVALIDATION_UNVERIFIABLE",
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a user-replaced target asset before any project write", async () => {
    const base = projectFixture();
    const current = projectFixture(7, BASE_UPDATED_AT, [
      videoOverlay({ assetId: "video-user-replacement" }),
    ]);
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
      reason: "TARGET_ASSET_CHANGED",
      currentRevision: { value: 7 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("does not enter a CAS race while invalidation admission is unavailable", async () => {
    const project = projectFixture();
    const command = videoCommand(project);
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .rejects.toMatchObject({
        code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
        reason: "INVALIDATION_UNVERIFIABLE",
      });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("validates a generated predecessor receipt before the invalidation gate", async () => {
    const project = projectFixture(7, BASE_UPDATED_AT, [
      videoOverlay({
        hasNativeAudio: true,
        audioRights: nativeAudioRights("video-old"),
        generatedVideoReceipt: generatedVideoReceipt("video-old"),
      }),
    ]);
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = videoCommand(project, {
      replacement: {
        assetId: "video-kie",
        sourceUrl: "https://assets.example.test/video-kie.mp4",
        durationMs: 5_000,
        hasNativeAudio: false,
        audioRights: null,
        generatedVideoReceipt: generatedVideoReceipt("video-kie", false),
      },
    });

    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .rejects.toMatchObject({
        code: "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT",
        reason: "INVALIDATION_UNVERIFIABLE",
      });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a native-audio claim without the matching durable evidence", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project, {
        replacement: {
          ...videoCommand(project).replacement,
          generatedVideoReceipt: null,
        },
      }),
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("records a job-bound low-quality warning through the project revision owner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T02:03:04.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordPipelineVideoQualityWarningV1(
          USER_ID,
          PROJECT_ID,
          qualityWarningCommand(project),
        )
      ));

      expect(captured.value).toMatchObject({
        disposition: "APPLIED",
        qualityWarning: {
          schemaVersion: 1,
          warningId: expect.stringMatching(/^pipeline-video-quality_[a-f0-9]{64}$/),
          materialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          jobId: QUALITY_JOB_ID,
          sceneIndex: 2,
          assetId: "video-low-quality",
          qualityScore: 31,
          qualitySource: "hybrid-vision",
          message: "Scene 2: Low quality video (31/100). Consider regenerating this scene.",
          requestedRevision: { value: 7 },
          beforeRevision: { value: 7 },
          afterRevision: { value: 8 },
          rebase: "FRESH",
          changedPaths: ["qualityWarnings"],
          proof: {
            required: false,
            status: null,
            reason: "DERIVED_ANALYSIS_WARNING_NOT_RENDERED_ACCEPTANCE_PROOF",
          },
        },
      });
      expect(captured.receipts).toEqual([captured.value.qualityWarning.mutationReceipt]);

      const [filter, update] = persistenceMocks.updateOne.mock.calls[0] as [
        Record<string, any>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        projectRevision: 7,
        "qualityWarnings.warningId": {
          $ne: captured.value.qualityWarning.warningId,
        },
      });
      expect(update.$set).toEqual({ updatedAt: new Date("2026-08-25T02:03:04.000Z") });
      expect(update.$inc).toEqual({ projectRevision: 1 });
      expect(update.$push.qualityWarnings.$each).toEqual([captured.value.qualityWarning]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays only the identical warning and safely rebases an additive warning", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = qualityWarningCommand(project);
    const first = await projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      command,
    );
    const persisted = {
      ...project,
      projectRevision: 8,
      updatedAt: new Date(first.qualityWarning.committedAt),
      qualityWarnings: [first.qualityWarning],
    };

    persistenceMocks.findOne.mockResolvedValueOnce(persisted);
    await expect(projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toMatchObject({ disposition: "ALREADY_APPLIED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    persistenceMocks.findOne.mockResolvedValueOnce(persisted);
    await expect(projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      qualityWarningCommand(project, { qualityScore: 32 }),
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    const unrelatedCurrent = projectFixture(8, "2026-08-25T00:00:01.000Z");
    persistenceMocks.findOne.mockResolvedValueOnce(unrelatedCurrent);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      command,
    )).resolves.toMatchObject({
      disposition: "APPLIED",
      qualityWarning: {
        requestedRevision: { value: 7 },
        beforeRevision: { value: 8 },
        afterRevision: { value: 9 },
        rebase: "SAFE_REBASED_ADDITIVE_WARNING",
      },
    });
    expect(persistenceMocks.updateOne.mock.calls[1]?.[0]).toMatchObject({ projectRevision: 8 });
  });

  it("rejects malformed warning material before any project read", async () => {
    const project = projectFixture();
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      qualityWarningCommand(project, { qualityScore: 101 }),
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
  });

  it("rejects malformed persisted warning history before a new project write", async () => {
    const project = projectFixture();
    const warningId = "pipeline-video-quality_" + createHash("sha256")
      .update(JSON.stringify([PROJECT_ID, QUALITY_JOB_ID]))
      .digest("hex");
    persistenceMocks.findOne.mockResolvedValueOnce({
      ...project,
      qualityWarnings: [{ warningId }],
    });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.recordPipelineVideoQualityWarningV1(
      USER_ID,
      PROJECT_ID,
      qualityWarningCommand(project),
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("wires low-quality warning persistence through ProjectService instead of a raw project write", () => {
    const producer = readFileSync(
      "app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts",
      "utf8",
    );
    const worker = readFileSync("app/api/internal/workers/pipeline/video/route.ts", "utf8");

    expect(producer).toContain("createPipelineVideoProjectDeliveryPrerequisiteV1");
    expect(producer).toContain("prerequisite: scene.projectDeliveryPrerequisite");
    expect(producer).toContain("PROJECT_DELIVERY_INVALIDATION_UNAVAILABLE");
    expect(producer).not.toContain("hasPriorUnmaterializedTimelineChain");
    expect(worker).toContain("recordPipelineVideoQualityWarningV1");
    expect(worker).toContain("prerequisite: payload.projectDelivery.prerequisite");
    expect(worker).not.toContain("collection('projects')");
    expect(worker).not.toContain("'qualityWarnings': {");
  });
});
