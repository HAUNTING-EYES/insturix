import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "mongodb";

import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import type { RenderDeliveryManifest } from "@/lib/editron/services/render-delivery-manifest";
import {
  createProjectArtifactBindingV1,
  type ProjectArtifactProjectRevisionV1,
} from "@/lib/editron/services/project-artifact-invalidation-v1";
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";

const databaseMocks = vi.hoisted(() => ({
  collection: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(async () => ({ collection: databaseMocks.collection })),
}));

import {
  claimJobFinalization,
  claimRenderCompletionEffects,
  completeJob,
  completeJobFinalization,
  createProjectRenderJobAuthorizationV1,
  getCurrentProjectRenderJobV1,
  markJobStarted,
  markProjectRenderJobStartedV1,
  reserveProjectRenderJobV1,
  updateJobProgress,
  updateProjectRenderJobProgressV1,
} from "@/lib/editron/services/render-job-service";

const OWNER_ID = "owner-render-job-test";
const PROJECT_ID = "project-render-job-test";
const JOB_ID = "project-render-job-1";
const REVISION: ProjectArtifactProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: "2026-08-31T00:00:00.000Z",
};

const VIDEO_OVERLAY = {
  id: 12,
  type: "video" as const,
  from: 30,
  durationInFrames: 90,
  assetId: "asset-before",
  src: "https://signed.example.test/before.mp4",
  content: "https://signed.example.test/before.mp4",
  opacity: 1,
};

const DELIVERY_MANIFEST: RenderDeliveryManifest = {
  version: "editron-render-delivery-manifest-v1",
  mode: "embedded",
  createdAt: "2026-08-31T00:00:00.000Z",
  completedAt: null,
  primaryArtifact: {
    kind: "mixed-master",
    renderId: JOB_ID,
    status: "rendering",
    url: null,
  },
  music: {
    embedded: true,
    removedOverlayIds: [],
    handoff: null,
  },
};

const RENDER_CONTRACT = {
  renderer: "remotion-lambda",
  codec: "h264",
  audioCodec: "aac",
  framesPerLambda: 20,
};

const FINALIZER_RESULT = {
  url: "https://render.example.test/finalized/project-render-job-1.mp4",
  sizeBytes: 100,
  expectedDurationMs: 5_000,
  receipt: {
    expectedDurationMs: 5_000,
    formatDurationMs: 5_000,
    videoDurationMs: 5_000,
    audioDurationMs: 5_000,
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    sampleRate: 48_000,
    channels: 2,
    verificationToleranceMs: 1,
  },
};

type TestCollection = {
  insertOne: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
};

function makeCollection(): Collection<RenderJob> & TestCollection {
  return {
    insertOne: vi.fn(async () => ({ acknowledged: true })),
    findOne: vi.fn(async () => null),
    findOneAndUpdate: vi.fn(async () => null),
    updateOne: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
    find: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
  } as unknown as Collection<RenderJob> & TestCollection;
}

function makeBinding(
  jobId = JOB_ID,
  projectRevision: ProjectArtifactProjectRevisionV1 = REVISION,
  ownerId = OWNER_ID,
  projectId = PROJECT_ID,
): ProjectRenderSnapshotBindingV1 {
  const project = {
    overlays: [VIDEO_OVERLAY],
    durationInFrames: 180,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: "preview" },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: jobId,
    ownerId,
    projectId,
    projectRevision,
    sequenceId: "sequence-1",
    compositionId: "composition-1",
    renderContract: RENDER_CONTRACT,
    durationInFrames: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function makeBoundJob(
  binding: ProjectRenderSnapshotBindingV1 = makeBinding(),
  status: RenderJob["status"] = "pending",
): RenderJob {
  return RenderJobSchema.parse({
    ...createPendingRenderJob(
      binding.artifactId,
      binding.ownerId,
      binding.projectId,
      "us-east-1",
      5_000,
      undefined,
      binding,
    ),
    status,
  });
}

function makeLegacyJob(): RenderJob {
  return RenderJobSchema.parse({
    ...createPendingRenderJob(JOB_ID, OWNER_ID, PROJECT_ID, "us-east-1", 5_000),
    status: "rendering",
  });
}

function makeDualScopeJob(binding: ProjectRenderSnapshotBindingV1): RenderJob {
  const artifactBinding = createProjectArtifactBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: binding.artifactId,
    ownerId: binding.ownerId,
    projectId: binding.projectId,
    projectRevision: binding.projectRevision,
    target: binding.containedVideoTargets[0]!,
  });
  return {
    ...makeBoundJob(binding),
    artifactBinding,
  } as unknown as RenderJob;
}

function makeAuthorization(binding: ProjectRenderSnapshotBindingV1 = makeBinding()) {
  return createProjectRenderJobAuthorizationV1({
    jobId: binding.artifactId,
    ownerId: binding.ownerId,
    projectId: binding.projectId,
    projectRevision: binding.projectRevision,
    binding,
  });
}

function useDatabaseCollection(collection: Collection<RenderJob>): void {
  databaseMocks.collection.mockReturnValue(collection);
}

function containsLegacyMutationExclusion(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsLegacyMutationExclusion);
  const record = value as Record<string, unknown>;
  const exclusion = record.projectRenderSnapshotBinding;
  if (
    exclusion
    && typeof exclusion === "object"
    && (exclusion as Record<string, unknown>).$exists === false
  ) {
    return true;
  }
  return Object.values(record).some(containsLegacyMutationExclusion);
}

describe("Project render-job owner V1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an exact snapshot binding before reserving a project render", async () => {
    const collection = makeCollection();
    const binding = makeBinding();

    const reserved = await reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection,
    });

    expect(reserved.projectRenderSnapshotBinding).toEqual(binding);
    expect(reserved.artifactBinding).toBeUndefined();
    expect(reserved.artifactState).toBe("ACTIVE");
    expect(collection.insertOne).toHaveBeenCalledTimes(1);

    const invalidCollection = makeCollection();
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: "wrong-owner",
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_AUTHORIZATION_SCOPE_MISMATCH");
    await expect(reserveProjectRenderJobV1({
      jobId: "wrong-job",
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_AUTHORIZATION_SCOPE_MISMATCH");
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_AUTHORIZATION_SCOPE_MISMATCH");
    expect(invalidCollection.insertOne).not.toHaveBeenCalled();
  });

  it("reads only the exact current bound job and fails closed for stale, forged, legacy, or dual scope", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const job = makeBoundJob(binding);
    collection.findOne.mockResolvedValue(job);

    await expect(getCurrentProjectRenderJobV1({
      authorization,
      currentProjectRevision: REVISION,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT", job });

    const stale = await getCurrentProjectRenderJobV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      collection,
    });
    expect(stale).toMatchObject({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
    });

    const forged = await getCurrentProjectRenderJobV1({
      authorization: { ...authorization, bindingHash: "0".repeat(64) },
      currentProjectRevision: REVISION,
      collection,
    });
    expect(forged).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });

    collection.findOne.mockResolvedValueOnce(makeLegacyJob());
    const legacy = await getCurrentProjectRenderJobV1({
      authorization,
      currentProjectRevision: REVISION,
      collection,
    });
    expect(legacy).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });

    collection.findOne.mockResolvedValueOnce(makeDualScopeJob(binding));
    const dual = await getCurrentProjectRenderJobV1({
      authorization,
      currentProjectRevision: REVISION,
      collection,
    });
    expect(dual).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
  });

  it("atomically starts the exact current job and never writes for a stale authorization", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const startedJob = {
      ...makeBoundJob(binding, "rendering"),
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: DELIVERY_MANIFEST,
    } as RenderJob;
    collection.findOneAndUpdate.mockResolvedValue(startedJob);

    const started = await markProjectRenderJobStartedV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: DELIVERY_MANIFEST,
      collection,
    });
    expect(started).toMatchObject({ ok: true, status: "CURRENT", job: startedJob });
    const startFilter = collection.findOneAndUpdate.mock.calls[0]![0];
    expect(startFilter).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          _id: JOB_ID,
          userId: OWNER_ID,
          projectId: PROJECT_ID,
          artifactState: "ACTIVE",
          artifactBinding: { $exists: false },
          "projectRenderSnapshotBinding.bindingHash": binding.bindingHash,
        }),
        expect.objectContaining({
          $or: expect.arrayContaining([
            { status: "pending" },
            { status: "queued" },
          ]),
        }),
      ]),
    }));

    collection.findOneAndUpdate.mockClear();
    const stale = await markProjectRenderJobStartedV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      providerRenderId: "provider-render-2",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: DELIVERY_MANIFEST,
      collection,
    });
    expect(stale).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    const wrongState = await markProjectRenderJobStartedV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-3",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: DELIVERY_MANIFEST,
      collection,
    });
    expect(wrongState).toMatchObject({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_STATE_NOT_ACTIVE",
    });
  });

  it("atomically updates progress only for the exact current active binding", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    await expect(updateProjectRenderJobProgressV1({
      authorization,
      currentProjectRevision: REVISION,
      progress: 0.42,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const progressFilter = collection.updateOne.mock.calls[0]![0];
    expect(progressFilter).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          artifactState: "ACTIVE",
          artifactInvalidation: { $exists: false },
          artifactBinding: { $exists: false },
          "projectRenderSnapshotBinding.bindingHash": binding.bindingHash,
        }),
        expect.objectContaining({
          status: { $in: ["pending", "queued", "rendering", "finalizing"] },
        }),
      ]),
    }));
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({ $set: { progress: 0.42 } });

    collection.updateOne.mockClear();
    const stale = await updateProjectRenderJobProgressV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      progress: 0.5,
      collection,
    });
    expect(stale).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.updateOne).not.toHaveBeenCalled();

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const stateMismatch = await updateProjectRenderJobProgressV1({
      authorization,
      currentProjectRevision: REVISION,
      progress: 0.5,
      collection,
    });
    expect(stateMismatch).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_STATE_NOT_ACTIVE",
    });
  });

  it("fences representative generic mutators while leaving legacy rows callable", async () => {
    const collection = makeCollection();
    useDatabaseCollection(collection);

    await updateJobProgress(JOB_ID, 0.25);
    expect(containsLegacyMutationExclusion(collection.updateOne.mock.calls.at(-1)?.[0])).toBe(true);

    collection.findOne.mockResolvedValue(makeBoundJob(makeBinding(), "rendering"));
    await completeJob(JOB_ID, "https://render.example.test/complete.mp4", 100);
    expect(containsLegacyMutationExclusion(collection.updateOne.mock.calls.at(-1)?.[0])).toBe(true);

    await expect(claimJobFinalization({
      renderId: JOB_ID,
      sourceOutputUrl: "https://render.example.test/raw.mp4",
      sourceOutputSize: 100,
      now: new Date("2026-08-31T00:01:00.000Z"),
      collection,
    })).resolves.toBeNull();
    expect(containsLegacyMutationExclusion(collection.findOneAndUpdate.mock.calls.at(-1)?.[0])).toBe(true);

    await expect(claimRenderCompletionEffects({
      renderId: JOB_ID,
      now: new Date("2026-08-31T00:01:00.000Z"),
      collection,
    })).resolves.toBeNull();
    expect(containsLegacyMutationExclusion(collection.findOneAndUpdate.mock.calls.at(-1)?.[0])).toBe(true);

    await expect(completeJobFinalization({
      jobId: JOB_ID,
      claimToken: "claim-bound",
      result: FINALIZER_RESULT,
      now: new Date("2026-08-31T00:02:00.000Z"),
      collection,
    })).resolves.toBe(false);
    expect(containsLegacyMutationExclusion(collection.updateOne.mock.calls.at(-1)?.[0])).toBe(true);

    collection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    await expect(markJobStarted(
      JOB_ID,
      OWNER_ID,
      "provider-render-legacy",
      "editron-render-output",
      "us-east-1",
      DELIVERY_MANIFEST,
    )).rejects.toThrow();
    expect(containsLegacyMutationExclusion(collection.updateOne.mock.calls.at(-1)?.[0])).toBe(true);

    collection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    await updateJobProgress("legacy-render-job", 0.5);
    expect(collection.updateOne).toHaveBeenCalled();
  });
});
