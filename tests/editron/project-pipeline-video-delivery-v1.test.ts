import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
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
    ...overrides,
  } as any;
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
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("replaces only the exact planned overlay with a writer receipt and exact range effect", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, videoCommand(project))
      ));

      expect(captured.value).toMatchObject({
        disposition: "APPLIED",
        deliveryReceipt: {
          deliveryId: DELIVERY_ID,
          replacementAssetId: "video-new",
          requestedRevision: { value: 7 },
          beforeRevision: { value: 7 },
          afterRevision: { value: 8 },
          rebase: "FRESH",
          changedPaths: [
            "overlays",
            "pipelineVideoDeliveryReceipts",
            "timelineRangeChangeReceipts",
          ],
          proof: {
            required: true,
            status: "UNVERIFIABLE",
            reason: "NO_RENDERED_VIDEO_PROOF",
          },
          timelineChangeReceipt: {
            operation: "REPLACE_PIPELINE_VIDEO_DELIVERY",
            actorKind: "SYSTEM",
            rangeObservation: "EXACT",
            readFrameRangesBefore: [{ startFrame: 30, endFrame: 180 }],
            writeFrameRangesBefore: [{ startFrame: 30, endFrame: 180 }],
            affectedFrameRangesAfter: [{ startFrame: 30, endFrame: 180 }],
            ripple: null,
            downstreamInvalidation: {
              status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
            },
          },
        },
      });
      expect(captured.receipts).toEqual([captured.value.deliveryReceipt.mutationReceipt]);

      const [filter, update, options] = persistenceMocks.updateOne.mock.calls[0] as [
        Record<string, any>,
        Record<string, any>,
        Record<string, any>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        projectRevision: 7,
        overlays: {
          $elemMatch: { id: 10, type: "video", assetId: "video-old" },
        },
        "pipelineVideoDeliveryReceipts.deliveryId": { $ne: DELIVERY_ID },
      });
      expect(options.arrayFilters).toEqual([{
        "target.id": 10,
        "target.type": "video",
        "target.assetId": "video-old",
      }]);
      expect(update.$set["overlays.$[target]"]).toMatchObject({
        id: 10,
        from: 30,
        durationInFrames: 150,
        assetId: "video-new",
        src: "https://assets.example.test/video-new.mp4",
        content: "https://assets.example.test/video-new.mp4",
        videoDurationMs: 5_000,
        hasNativeAudio: true,
        audioRights: nativeAudioRights("video-new"),
        generatedVideoReceipt: generatedVideoReceipt("video-new"),
        metadata: {
          pipelineVideoDeliveryV1: {
            deliveryId: DELIVERY_ID,
            replacementAssetId: "video-new",
            materialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      });
      expect(update.$set["overlays.$[target]"].keyframeTracks).toEqual([
        { property: "scale", keyframes: [{ frame: 0, value: 1, easing: "linear" }] },
      ]);
      expect(update.$push.pipelineVideoDeliveryReceipts.$each[0]).toMatchObject({
        deliveryId: DELIVERY_ID,
        materialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
        operation: "REPLACE_PIPELINE_VIDEO_DELIVERY",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays only the same material under one delivery identity", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = videoCommand(project);
    const first = await projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command);
    const deliveredProject = {
      ...project,
      pipelineVideoDeliveryReceipts: [first.deliveryReceipt],
    };

    persistenceMocks.findOne.mockResolvedValueOnce(deliveredProject);
    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({ disposition: "ALREADY_APPLIED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    persistenceMocks.findOne.mockResolvedValueOnce(deliveredProject);
    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project, {
        replacement: {
          ...command.replacement,
          sourceUrl: "https://assets.example.test/video-replaced-again.mp4",
        },
      }),
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("safely rebases over an unrelated revision when the exact target asset is unchanged", async () => {
    const base = projectFixture();
    const current = projectFixture(8, "2026-08-25T00:00:01.000Z");
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(base),
    )).resolves.toMatchObject({
      disposition: "APPLIED",
      deliveryReceipt: {
        requestedRevision: { value: 7 },
        beforeRevision: { value: 8 },
        afterRevision: { value: 9 },
        rebase: "SAFE_REBASED_TARGET_UNCHANGED",
      },
    });
    expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toMatchObject({
      projectRevision: 8,
    });
  });

  it("rejects a user-replaced target asset before any project write", async () => {
    const base = projectFixture();
    const current = projectFixture(8, "2026-08-25T00:00:01.000Z", [
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
      currentRevision: { value: 8 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("closes the final CAS race by returning the identical winning delivery only", async () => {
    const project = projectFixture();
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = videoCommand(project);
    const winningReceipt = {
      schemaVersion: 1,
      deliveryId: DELIVERY_ID,
      materialHash: "0".repeat(64),
    };
    const { pipelineVideoDeliveryMaterialHashV1 } = await import(
      "@/lib/editron/services/pipeline-video-project-delivery-v1"
    );
    winningReceipt.materialHash = pipelineVideoDeliveryMaterialHashV1(command);
    persistenceMocks.findOne
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({
        ...project,
        projectRevision: 8,
        updatedAt: new Date("2026-08-25T00:00:01.000Z"),
        pipelineVideoDeliveryReceipts: [winningReceipt],
      });
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({
        disposition: "ALREADY_APPLIED",
        deliveryReceipt: { materialHash: winningReceipt.materialHash },
      });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("retries once after an unrelated CAS loss and preserves the latest target state", async () => {
    const project = projectFixture();
    const afterUnrelatedWrite = projectFixture(8, "2026-08-25T00:00:01.000Z", [
      videoOverlay({ left: 42 }),
    ]);
    persistenceMocks.findOne
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(afterUnrelatedWrite);
    persistenceMocks.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineVideoDeliveryV1(
      USER_ID,
      PROJECT_ID,
      videoCommand(project),
    )).resolves.toMatchObject({
      disposition: "APPLIED",
      deliveryReceipt: {
        requestedRevision: { value: 7 },
        beforeRevision: { value: 8 },
        rebase: "SAFE_REBASED_TARGET_UNCHANGED",
      },
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(2);
    expect(persistenceMocks.updateOne.mock.calls[1]?.[0]).toMatchObject({
      projectRevision: 8,
    });
    expect(persistenceMocks.updateOne.mock.calls[1]?.[1].$set["overlays.$[target]"])
      .toMatchObject({ left: 42, assetId: "video-new" });
  });

  it("permits a provider without a native-audio receipt only when it claims no native audio", async () => {
    const project = projectFixture(7, BASE_UPDATED_AT, [
      videoOverlay({
        hasNativeAudio: true,
        audioRights: nativeAudioRights("video-old"),
        generatedVideoReceipt: generatedVideoReceipt("video-old"),
      }),
    ]);
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = videoCommand(project, {
      replacement: {
        assetId: "video-kie",
        sourceUrl: "https://assets.example.test/video-kie.mp4",
        durationMs: 5_000,
        hasNativeAudio: false,
        audioRights: null,
        generatedVideoReceipt: null,
      },
    });

    await expect(projectService.commitPipelineVideoDeliveryV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({ disposition: "APPLIED" });
    const updatedOverlay = persistenceMocks.updateOne.mock.calls[0]?.[1]
      .$set["overlays.$[target]"] as Record<string, unknown>;
    expect(updatedOverlay).toMatchObject({
      assetId: "video-kie",
      hasNativeAudio: false,
    });
    expect(updatedOverlay).not.toHaveProperty("audioRights");
    expect(updatedOverlay).not.toHaveProperty("generatedVideoReceipt");
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
    const worker = readFileSync("app/api/internal/workers/pipeline/video/route.ts", "utf8");

    expect(worker).toContain("recordPipelineVideoQualityWarningV1");
    expect(worker).not.toContain("collection('projects')");
    expect(worker).not.toContain("'qualityWarnings': {");
  });
});
