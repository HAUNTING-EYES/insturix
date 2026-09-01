import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientSession, Collection } from "mongodb";

import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from "@/lib/editron/schemas/render-job";
import {
  completeRenderDeliveryManifest,
  type RenderDeliveryManifest,
} from "@/lib/editron/services/render-delivery-manifest";
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
  abandonStaleProjectRenderJobAdmissionV1,
  claimFailedProjectRenderJobFinalizationRetryV1,
  claimJobFinalization,
  claimProjectRenderCompletionEffectsV1,
  claimProjectRenderJobFinalizationV1,
  claimRenderCompletionEffects,
  completeJob,
  completeJobFinalization,
  completeProjectRenderCompletionEffectsV1,
  completeProjectRenderJobFinalizationV1,
  createProjectRenderJobAuthorizationV1,
  failProjectRenderJobFromProviderV1,
  failProjectRenderJobFinalizationV1,
  failProjectRenderJobV1,
  fenceStaleProjectRenderJobFinalizationV1,
  getCurrentProjectRenderJobV1,
  getProjectRenderJobAuthorizationByAdmissionV1,
  markJobStarted,
  markProjectRenderJobStartedV1,
  releaseFailedProjectRenderJobFinalizationRetryClaimV1,
  releaseProjectRenderCompletionEffectsV1,
  releaseProjectRenderJobFinalizationClaimV1,
  reserveProjectRenderJobV1,
  updateJobProgress,
  updateProjectRenderJobProgressV1,
} from "@/lib/editron/services/render-job-service";

const OWNER_ID = "owner-render-job-test";
const REQUESTER_ID = "requester-render-job-test";
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
      REQUESTER_ID,
    ),
    status,
    deliveryManifest: DELIVERY_MANIFEST,
  });
}

const FINALIZATION_SOURCE_URL = "https://render.example.test/raw-project-render.mp4";
const FINALIZATION_CLAIMED_AT = new Date("2026-08-31T00:01:00.000Z");
const FINALIZATION_LEASE_EXPIRES_AT = new Date("2026-08-31T00:21:00.000Z");
const FINALIZATION_COMPLETED_AT = new Date("2026-08-31T00:02:00.000Z");

function makeFinalizingJob(
  binding: ProjectRenderSnapshotBindingV1 = makeBinding(),
  claimToken = "claim-bound",
): RenderJob {
  return RenderJobSchema.parse({
    ...makeBoundJob(binding, "finalizing"),
    finalization: {
      version: "editron-render-finalization-v1",
      state: "running",
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      attempts: 1,
      claimToken,
      claimedAt: FINALIZATION_CLAIMED_AT,
      leaseExpiresAt: FINALIZATION_LEASE_EXPIRES_AT,
    },
    deliveryManifest: DELIVERY_MANIFEST,
  });
}

function makeFailedFinalizationJob(
  binding: ProjectRenderSnapshotBindingV1 = makeBinding(),
): RenderJob {
  return RenderJobSchema.parse({
    ...makeBoundJob(binding, "error"),
    providerRenderId: "provider-render-1",
    bucketName: "editron-render-output",
    completedAt: FINALIZATION_COMPLETED_AT,
    error: "finalizer failed",
    finalization: {
      version: "editron-render-finalization-v1",
      state: "failed",
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      attempts: 1,
      completedAt: FINALIZATION_COMPLETED_AT,
      error: "finalizer failed",
    },
  });
}

function makeDoneJob(
  binding: ProjectRenderSnapshotBindingV1 = makeBinding(),
  withRunningEffects = false,
): RenderJob {
  const job = RenderJobSchema.parse({
    ...makeBoundJob(binding, "done"),
    outputUrl: FINALIZER_RESULT.url,
    outputSize: FINALIZER_RESULT.sizeBytes,
    completedAt: FINALIZATION_COMPLETED_AT,
    finalization: {
      version: "editron-render-finalization-v1",
      state: "done",
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      attempts: 1,
      outputUrl: FINALIZER_RESULT.url,
      outputSize: FINALIZER_RESULT.sizeBytes,
      receipt: FINALIZER_RESULT.receipt,
      completedAt: FINALIZATION_COMPLETED_AT,
    },
    deliveryManifest: completeRenderDeliveryManifest(
      DELIVERY_MANIFEST,
      FINALIZER_RESULT.url,
      FINALIZATION_COMPLETED_AT.toISOString(),
    ),
  });
  return withRunningEffects
    ? {
        ...job,
        completionEffects: {
          version: "editron-render-completion-effects-v1",
          state: "running",
          attempts: 1,
          claimToken: "effects-claim",
          claimedAt: FINALIZATION_COMPLETED_AT,
          leaseExpiresAt: new Date("2026-08-31T00:07:00.000Z"),
        },
      } as unknown as RenderJob
    : job;
}

function makeDoneJobWithoutReceipt(
  binding: ProjectRenderSnapshotBindingV1 = makeBinding(),
): RenderJob {
  const job = makeDoneJob(binding);
  const finalization = { ...job.finalization! };
  delete finalization.receipt;
  return { ...job, finalization } as RenderJob;
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
    requestedByUserId: REQUESTER_ID,
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

  it("reconstructs server authorization only from an exact stored admission", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const boundJob = makeBoundJob(binding, "rendering");
    collection.findOne.mockResolvedValueOnce(boundJob);

    await expect(getProjectRenderJobAuthorizationByAdmissionV1({
      jobId: JOB_ID,
      expectedBindingHash: binding.bindingHash,
      collection,
    })).resolves.toMatchObject({
      ok: true,
      status: "BOUND",
      job: boundJob,
      authorization: makeAuthorization(binding),
    });
    expect(collection.findOne).toHaveBeenCalledWith({ _id: JOB_ID });

    collection.findOne.mockResolvedValueOnce(boundJob);
    const forgedHash = await getProjectRenderJobAuthorizationByAdmissionV1({
      jobId: JOB_ID,
      expectedBindingHash: "f".repeat(64),
      collection,
    });
    expect(forgedHash).toMatchObject({ ok: false, reason: "JOB_NOT_CURRENT" });

    collection.findOne.mockResolvedValueOnce(makeLegacyJob());
    const legacy = await getProjectRenderJobAuthorizationByAdmissionV1({
      jobId: JOB_ID,
      collection,
    });
    expect(legacy).toMatchObject({ ok: false, status: "NOT_PROJECT_RENDER_JOB" });

    const artifactBinding = createProjectArtifactBindingV1({
      artifactKind: "RENDERED_PREVIEW",
      artifactId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      target: binding.containedVideoTargets[0]!,
    });
    collection.findOne.mockResolvedValueOnce(RenderJobSchema.parse({
      ...createPendingRenderJob(
        JOB_ID,
        OWNER_ID,
        PROJECT_ID,
        "us-east-1",
        5_000,
        artifactBinding,
      ),
      deliveryManifest: DELIVERY_MANIFEST,
    }));
    const artifactBound = await getProjectRenderJobAuthorizationByAdmissionV1({
      jobId: JOB_ID,
      collection,
    });
    expect(artifactBound).toMatchObject({
      ok: false,
      status: "NON_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });

    const invalid = await getProjectRenderJobAuthorizationByAdmissionV1({
      jobId: "",
      collection,
    });
    expect(invalid).toMatchObject({ ok: false, reason: "INPUT_INVALID" });
    expect(collection.findOne).toHaveBeenCalledTimes(4);
  });

  it("requires an exact snapshot binding before reserving a project render", async () => {
    const collection = makeCollection();
    const binding = makeBinding();

    const reserved = await reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
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
    expect(reserved.userId).toBe(OWNER_ID);
    expect(reserved.requestedByUserId).toBe(REQUESTER_ID);
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
    const inserted = collection.insertOne.mock.calls[0]![0] as RenderJob;
    expect(inserted.deliveryManifest).toEqual(DELIVERY_MANIFEST);
    expect(inserted.deliveryManifest).not.toBe(DELIVERY_MANIFEST);
    expect(inserted.deliveryManifest?.primaryArtifact).not.toBe(DELIVERY_MANIFEST.primaryArtifact);

    const invalidManifestCollection = makeCollection();
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: {
        ...DELIVERY_MANIFEST,
        primaryArtifact: { ...DELIVERY_MANIFEST.primaryArtifact, status: "invalid" },
      } as unknown as RenderDeliveryManifest,
      binding,
      collection: invalidManifestCollection,
    })).rejects.toThrow();
    expect(invalidManifestCollection.insertOne).not.toHaveBeenCalled();

    const invalidCollection = makeCollection();
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: "wrong-owner",
      requestedByUserId: REQUESTER_ID,
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
      requestedByUserId: REQUESTER_ID,
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
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_AUTHORIZATION_SCOPE_MISMATCH");
    expect(invalidCollection.insertOne).not.toHaveBeenCalled();

    const invalidRequesterCollection = makeCollection();
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: "requester\nforged",
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidRequesterCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_REQUESTER_INVALID");
    expect(invalidRequesterCollection.insertOne).not.toHaveBeenCalled();

    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: " ",
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidRequesterCollection,
    })).rejects.toThrow("PROJECT_RENDER_JOB_REQUESTER_INVALID");

    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: "us-east-1",
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      collection: invalidRequesterCollection,
    } as unknown as Parameters<typeof reserveProjectRenderJobV1>[0])).rejects.toThrow(
      "PROJECT_RENDER_JOB_REQUESTER_INVALID",
    );
  });

  it("keeps requester identity optional for legacy rows but rejects malformed values", () => {
    const legacy = makeLegacyJob();
    expect(legacy.requestedByUserId).toBeUndefined();
    expect(() => RenderJobSchema.parse({
      ...legacy,
      requestedByUserId: "requester\nforged",
    })).toThrow();
    expect(() => RenderJobSchema.parse({
      ...legacy,
      requestedByUserId: "a".repeat(201),
    })).toThrow();
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

    collection.findOne.mockResolvedValueOnce(job);
    const forgedRequester = await getCurrentProjectRenderJobV1({
      authorization: { ...authorization, requestedByUserId: "forged-requester" },
      currentProjectRevision: REVISION,
      collection,
    });
    expect(forgedRequester).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
    expect(collection.findOne.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({
      requestedByUserId: "forged-requester",
    }));

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

    collection.findOne.mockResolvedValueOnce({ ...job, deliveryManifest: undefined });
    const missingManifest = await getCurrentProjectRenderJobV1({
      authorization,
      currentProjectRevision: REVISION,
      collection,
    });
    expect(missingManifest).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
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
          requestedByUserId: REQUESTER_ID,
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
        expect.objectContaining({ deliveryManifest: DELIVERY_MANIFEST }),
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

    const driftedManifest: RenderDeliveryManifest = {
      ...DELIVERY_MANIFEST,
      createdAt: "2026-08-31T00:00:01.000Z",
    };
    collection.findOneAndUpdate.mockClear();
    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    const drifted = await markProjectRenderJobStartedV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-4",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: driftedManifest,
      collection,
    });
    expect(drifted).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_STATE_NOT_ACTIVE",
    });
    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(collection.findOneAndUpdate.mock.calls[0]![0])).toContain(
      '"createdAt":"2026-08-31T00:00:01.000Z"',
    );

    const wrongIdentityManifest: RenderDeliveryManifest = {
      ...DELIVERY_MANIFEST,
      primaryArtifact: {
        ...DELIVERY_MANIFEST.primaryArtifact,
        renderId: "different-reserved-render",
      },
    };
    collection.findOneAndUpdate.mockClear();
    const wrongIdentity = await markProjectRenderJobStartedV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-5",
      bucketName: "editron-render-output",
      region: "us-east-1",
      deliveryManifest: wrongIdentityManifest,
      collection,
    });
    expect(wrongIdentity).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "INPUT_INVALID",
    });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
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
          "deliveryManifest.version": "editron-render-delivery-manifest-v1",
          "deliveryManifest.primaryArtifact.renderId": JOB_ID,
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

  it("keeps bound startup and finalization claims on the exact current job", async () => {
    const collection = makeCollection();
    const session = {} as ClientSession;
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const now = new Date("2026-08-31T00:03:00.000Z");

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(failProjectRenderJobV1({
      authorization,
      currentProjectRevision: REVISION,
      error: "provider startup failed",
      now,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const startupFailure = collection.updateOne.mock.calls[0]!;
    expect(JSON.stringify(startupFailure[0])).toContain(binding.bindingHash);
    expect(startupFailure[1]).toEqual({
      $set: expect.objectContaining({ status: "error", completedAt: now }),
    });
    expect(startupFailure[1].$set.status).not.toBe("done");

    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    const mismatchedBucket = await claimProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-1",
      bucketName: "different-render-output",
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      claimToken: "claim-1",
      now,
      collection,
    });
    expect(mismatchedBucket).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_STATE_NOT_ACTIVE",
    });
    expect(JSON.stringify(collection.findOneAndUpdate.mock.calls[0]![0])).toContain(
      '"bucketName":"different-render-output"',
    );
    expect(collection.findOneAndUpdate.mock.calls[0]![0]).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: [
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
            },
            {
              providerRenderId: "provider-render-1",
              bucketName: "different-render-output",
            },
          ],
        }),
      ]),
    }));
    collection.findOneAndUpdate.mockClear();
    collection.findOneAndUpdate.mockResolvedValueOnce(makeFinalizingJob(binding, "claim-1"));
    const claim = await claimProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      claimToken: "claim-1",
      now,
      collection,
    });
    expect(claim).toMatchObject({
      ok: true,
      status: "CURRENT",
      claimToken: "claim-1",
      authorization,
      binding,
    });
    const claimFilter = collection.findOneAndUpdate.mock.calls[0]![0];
    expect(JSON.stringify(claimFilter)).toContain('"artifactState":"ACTIVE"');
    expect(JSON.stringify(claimFilter)).toContain(
      `"projectRenderSnapshotBinding.bindingHash":"${binding.bindingHash}"`,
    );
    expect(JSON.stringify(claimFilter)).toContain('"status":"rendering"');

    collection.findOneAndUpdate.mockClear();
    const staleClaim = await claimProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      sourceOutputUrl: FINALIZATION_SOURCE_URL,
      sourceOutputSize: 100,
      collection,
    });
    expect(staleClaim).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(releaseProjectRenderJobFinalizationClaimV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "claim-1",
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const release = collection.updateOne.mock.calls.at(-1)!;
    expect(JSON.stringify(release[0])).toContain(binding.bindingHash);
    expect(release[1]).toEqual({
      $set: { status: "rendering", progress: 0.99 },
      $unset: { finalization: "" },
    });

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(failProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "claim-1",
      error: "finalizer failed",
      now,
      collection,
      session,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const finalizationFailure = collection.updateOne.mock.calls.at(-1)!;
    expect(JSON.stringify(finalizationFailure[0])).toContain(binding.bindingHash);
    expect(finalizationFailure[1].$set).toEqual(expect.objectContaining({
      status: "error",
      "finalization.state": "failed",
    }));
    expect(finalizationFailure[1].$set.status).not.toBe("done");
    expect(finalizationFailure[2]).toEqual({ session });

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const wrongClaim = await failProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "wrong-claim",
      error: "must not write",
      collection,
    });
    expect(wrongClaim).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.updateOne.mock.calls.at(-1)![1].$set.status).not.toBe("done");
  });

  it("binds signed provider failures and failed-finalization retries to the current admission", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const now = new Date("2026-08-31T00:05:00.000Z");

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(failProjectRenderJobFromProviderV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      error: "provider callback failed",
      now,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const [failureFilter, failureUpdate] = collection.updateOne.mock.calls[0]!;
    expect(JSON.stringify(failureFilter)).toContain(binding.bindingHash);
    expect(failureFilter).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
            },
            {
              providerRenderId: "provider-render-1",
              bucketName: "editron-render-output",
            },
          ]),
        }),
      ]),
    }));
    expect(failureUpdate.$set).toEqual(expect.objectContaining({
      status: "error",
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      completedAt: now,
    }));

    collection.updateOne.mockClear();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const partialIdentity = await failProjectRenderJobFromProviderV1({
      authorization,
      currentProjectRevision: REVISION,
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      error: "must not complete a partial identity",
      collection,
    });
    expect(partialIdentity).toMatchObject({
      ok: false,
      reason: "JOB_STATE_NOT_ACTIVE",
    });
    expect(collection.updateOne.mock.calls[0]![0]).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          $or: [
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
            },
            {
              providerRenderId: "provider-render-1",
              bucketName: "editron-render-output",
            },
          ],
        }),
      ]),
    }));

    collection.updateOne.mockClear();
    const staleFailure = await failProjectRenderJobFromProviderV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      providerRenderId: "provider-render-1",
      bucketName: "editron-render-output",
      error: "must not write",
      collection,
    });
    expect(staleFailure).toMatchObject({ ok: false, reason: "PROJECT_REVISION_STALE" });
    expect(collection.updateOne).not.toHaveBeenCalled();

    const failedJob = makeFailedFinalizationJob(binding);
    collection.findOne.mockResolvedValueOnce({
      ...failedJob,
      requestedByUserId: undefined,
    } as RenderJob);
    const malformedRetry = await claimFailedProjectRenderJobFinalizationRetryV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "must-not-claim",
      now,
      collection,
    });
    expect(malformedRetry).toMatchObject({ ok: false, reason: "JOB_NOT_CURRENT" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockResolvedValueOnce(failedJob);
    collection.findOneAndUpdate.mockResolvedValueOnce(RenderJobSchema.parse({
      ...failedJob,
      status: "finalizing",
      completedAt: undefined,
      error: undefined,
      finalization: {
        ...failedJob.finalization!,
        state: "running",
        attempts: 2,
        claimToken: "retry-claim",
        claimedAt: now,
        leaseExpiresAt: new Date("2026-08-31T00:25:00.000Z"),
        completedAt: undefined,
        error: undefined,
      },
    }));
    const retry = await claimFailedProjectRenderJobFinalizationRetryV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "retry-claim",
      now,
      collection,
    });
    expect(retry).toMatchObject({
      ok: true,
      status: "CURRENT",
      jobId: JOB_ID,
      providerRenderId: "provider-render-1",
      claimToken: "retry-claim",
      authorization,
      binding,
    });
    const candidateFilter = collection.findOne.mock.calls.at(-1)![0];
    expect(JSON.stringify(candidateFilter)).toContain(
      '"finalization.attempts":{"$lt":3}',
    );
    const retryFilter = collection.findOneAndUpdate.mock.calls[0]![0];
    expect(JSON.stringify(retryFilter)).toContain(binding.bindingHash);
    expect(JSON.stringify(retryFilter)).toContain('"finalization.attempts":1');
    expect(JSON.stringify(retryFilter)).toContain('"providerRenderId":"provider-render-1"');

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(releaseFailedProjectRenderJobFinalizationRetryClaimV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "retry-claim",
      error: "queue publish failed",
      now,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const retryRelease = collection.updateOne.mock.calls.at(-1)!;
    expect(JSON.stringify(retryRelease[0])).toContain(binding.bindingHash);
    expect(retryRelease[1]).toEqual({
      $set: expect.objectContaining({
        status: "error",
        "finalization.state": "failed",
        completedAt: now,
      }),
      $unset: {
        "finalization.claimToken": "",
        "finalization.claimedAt": "",
        "finalization.leaseExpiresAt": "",
      },
    });
  });

  it("abandons only an exact stale admission before provider dispatch", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const staleRevision = { ...REVISION, value: REVISION.value + 1 };
    const now = new Date("2026-08-31T00:04:00.000Z");
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    await expect(abandonStaleProjectRenderJobAdmissionV1({
      authorization,
      currentProjectRevision: staleRevision,
      error: "project changed before provider dispatch",
      now,
      collection,
    })).resolves.toEqual({ ok: true, status: "STALE" });
    const [filter, update] = collection.updateOne.mock.calls[0]!;
    expect(filter).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          _id: JOB_ID,
          userId: OWNER_ID,
          requestedByUserId: REQUESTER_ID,
          projectId: PROJECT_ID,
          artifactState: "ACTIVE",
          "projectRenderSnapshotBinding.bindingHash": binding.bindingHash,
        }),
        expect.objectContaining({
          status: "pending",
          providerRenderId: { $exists: false },
          bucketName: { $exists: false },
          finalization: { $exists: false },
        }),
      ]),
    }));
    expect(update).toEqual({
      $set: expect.objectContaining({
        status: "error",
        artifactState: "STALE",
        artifactCleanup: { state: "NOT_REQUIRED", pendingArtifactIds: [] },
        artifactInvalidatedAt: now,
        completedAt: now,
      }),
    });

    collection.updateOne.mockClear();
    const current = await abandonStaleProjectRenderJobAdmissionV1({
      authorization,
      currentProjectRevision: REVISION,
      error: "must not close current admission",
      collection,
    });
    expect(current).toMatchObject({ ok: false, reason: "INPUT_INVALID" });
    expect(collection.updateOne).not.toHaveBeenCalled();

    const forged = await abandonStaleProjectRenderJobAdmissionV1({
      authorization: { ...authorization, requestedByUserId: "forged-requester" },
      currentProjectRevision: staleRevision,
      error: "must not close another requester's admission",
      collection,
    });
    expect(forged).toMatchObject({ ok: false, reason: "JOB_STATE_NOT_ACTIVE" });
    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    expect(collection.updateOne.mock.calls[0]![0]).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({ requestedByUserId: "forged-requester" }),
      ]),
    }));
  });

  it("fences only the exact stale running finalization claim", async () => {
    const collection = makeCollection();
    const session = {} as ClientSession;
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const staleRevision = { ...REVISION, value: REVISION.value + 1 };
    const now = new Date("2026-08-31T00:06:00.000Z");
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    await expect(fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: staleRevision,
      claimToken: "claim-bound",
      error: "project changed before finalization",
      now,
      collection,
      session,
    })).resolves.toEqual({ ok: true, status: "STALE" });
    const [filter, update] = collection.updateOne.mock.calls[0]!;
    expect(JSON.stringify(filter)).toContain(binding.bindingHash);
    expect(filter).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        expect.objectContaining({
          status: "finalizing",
          "finalization.state": "running",
          "finalization.claimToken": "claim-bound",
        }),
      ]),
    }));
    expect(update).toEqual({
      $set: expect.objectContaining({
        status: "error",
        artifactState: "STALE",
        artifactCleanup: {
          state: "PENDING",
          pendingArtifactIds: [JOB_ID],
        },
        artifactInvalidatedAt: now,
        "finalization.state": "failed",
      }),
      $unset: {
        "finalization.claimToken": "",
        "finalization.claimedAt": "",
        "finalization.leaseExpiresAt": "",
      },
    });
    expect(JSON.stringify(filter)).toContain('"artifactCleanup":{"$exists":false}');
    expect(collection.updateOne.mock.calls[0]![2]).toEqual({ session });

    collection.updateOne.mockClear();
    const current = await fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: REVISION,
      claimToken: "claim-bound",
      error: "must not fence a current project",
      collection,
    });
    expect(current).toMatchObject({ ok: false, reason: "INPUT_INVALID" });
    expect(collection.updateOne).not.toHaveBeenCalled();

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const wrongClaim = await fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: null,
      claimToken: "wrong-claim",
      error: "deleted project",
      collection,
    });
    expect(wrongClaim).toMatchObject({ ok: false, reason: "JOB_STATE_NOT_ACTIVE" });

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    collection.findOne.mockResolvedValueOnce({
      ...makeFailedFinalizationJob(binding),
      artifactState: "STALE",
      artifactCleanup: {
        state: "PENDING",
        pendingArtifactIds: [JOB_ID],
      },
      artifactInvalidatedAt: now,
    });
    await expect(fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: null,
      claimToken: "claim-bound",
      error: "repeated deleted-project callback",
      collection,
    })).resolves.toEqual({ ok: true, status: "ALREADY_STALE" });

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    collection.findOne.mockResolvedValueOnce(makeFinalizingJob(binding, "replacement-claim"));
    await expect(fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: null,
      claimToken: "claim-bound",
      error: "superseded deleted-project callback",
      collection,
    })).resolves.toEqual({ ok: true, status: "CLAIM_REPLACED" });

    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    collection.findOne.mockResolvedValueOnce({
      ...makeFinalizingJob(binding, "claim-bound"),
      artifactCleanup: {
        state: "PENDING",
        pendingArtifactIds: ["existing-cleanup-artifact"],
      },
    });
    const existingCleanup = await fenceStaleProjectRenderJobFinalizationV1({
      authorization,
      observedProjectRevision: null,
      claimToken: "claim-bound",
      error: "must not replace existing cleanup",
      collection,
    });
    expect(existingCleanup).toMatchObject({ ok: false, reason: "JOB_STATE_NOT_ACTIVE" });
  });

  it("requires a verified exact-duration receipt before bound finalization success", async () => {
    const collection = makeCollection();
    const session = {} as ClientSession;
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const current = makeFinalizingJob(binding, "complete-claim");
    const completed = makeDoneJob(binding);
    const completedAt = new Date("2026-08-31T00:04:00.000Z");
    collection.findOne.mockResolvedValueOnce(current);
    collection.findOneAndUpdate.mockResolvedValueOnce(completed);

    await expect(completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "complete-claim",
      result: FINALIZER_RESULT,
      now: completedAt,
      collection,
      session,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    expect(collection.findOne.mock.calls[0]![1]).toEqual({ session });
    const completionFilter = collection.findOneAndUpdate.mock.calls[0]![0];
    expect(JSON.stringify(completionFilter)).toContain(binding.bindingHash);
    expect(JSON.stringify(completionFilter)).toContain('"expectedDurationMs":5000');
    expect(JSON.stringify(completionFilter)).toContain('"finalization.claimToken":"complete-claim"');
    const completionUpdate = collection.findOneAndUpdate.mock.calls[0]![1];
    expect(collection.findOneAndUpdate.mock.calls[0]![2]).toEqual({
      returnDocument: "after",
      session,
    });
    expect(completionUpdate.$set).toEqual(expect.objectContaining({
      status: "done",
      progress: 1,
      outputUrl: FINALIZER_RESULT.url,
      outputSize: FINALIZER_RESULT.sizeBytes,
      "finalization.state": "done",
      "finalization.receipt": FINALIZER_RESULT.receipt,
    }));
    expect(completionUpdate.$set.deliveryManifest).toEqual(
      completeRenderDeliveryManifest(DELIVERY_MANIFEST, FINALIZER_RESULT.url, completedAt.toISOString()),
    );

    const missingManifestJob = { ...current, deliveryManifest: undefined } as RenderJob;
    collection.findOne.mockClear();
    collection.findOneAndUpdate.mockClear();
    collection.findOne.mockResolvedValueOnce(missingManifestJob);
    const missingManifest = await completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "complete-claim",
      result: FINALIZER_RESULT,
      collection,
    });
    expect(missingManifest).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockClear();
    collection.findOneAndUpdate.mockClear();
    const missingReceipt = await completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "complete-claim",
      result: { ...FINALIZER_RESULT, receipt: undefined },
      collection,
    });
    expect(missingReceipt).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    const mismatchedResult = {
      ...FINALIZER_RESULT,
      expectedDurationMs: 6_000,
      receipt: {
        ...FINALIZER_RESULT.receipt,
        expectedDurationMs: 6_000,
        formatDurationMs: 6_000,
        videoDurationMs: 6_000,
        audioDurationMs: 6_000,
      },
    };
    collection.findOne.mockResolvedValueOnce(current);
    const mismatched = await completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "complete-claim",
      result: mismatchedResult,
      collection,
    });
    expect(mismatched).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockClear();
    const wrongClaim = await completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "wrong-claim",
      result: FINALIZER_RESULT,
      collection,
    });
    expect(wrongClaim).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOne).toHaveBeenCalledTimes(1);
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockClear();
    const stale = await completeProjectRenderJobFinalizationV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      claimToken: "complete-claim",
      result: FINALIZER_RESULT,
      collection,
    });
    expect(stale).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it("gates bound completion effects on the verified receipt and carries identity", async () => {
    const collection = makeCollection();
    const binding = makeBinding();
    const authorization = makeAuthorization(binding);
    const now = new Date("2026-08-31T00:05:00.000Z");

    collection.findOne.mockResolvedValueOnce(makeDoneJobWithoutReceipt(binding));
    const missingReceipt = await claimProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      now,
      collection,
    });
    expect(missingReceipt).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockResolvedValueOnce(makeDoneJob(binding));
    collection.findOneAndUpdate.mockResolvedValueOnce(makeDoneJob(binding, true));
    const claim = await claimProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      now,
      collection,
    });
    expect(claim).toMatchObject({
      ok: true,
      status: "CURRENT",
      authorization,
      binding,
      claimToken: "effects-claim",
      outputUrl: FINALIZER_RESULT.url,
      outputSize: FINALIZER_RESULT.sizeBytes,
    });
    const effectsFilter = collection.findOneAndUpdate.mock.calls[0]![0];
    expect(JSON.stringify(effectsFilter)).toContain(binding.bindingHash);
    expect(JSON.stringify(effectsFilter)).toContain('"finalization.state":"done"');
    expect(JSON.stringify(effectsFilter)).toContain('"finalization.receipt"');
    expect(JSON.stringify(effectsFilter)).toContain('"deliveryManifest"');

    const invalidManifestJob = makeDoneJob(binding, true);
    invalidManifestJob.deliveryManifest = {
      ...invalidManifestJob.deliveryManifest!,
      primaryArtifact: {
        ...invalidManifestJob.deliveryManifest!.primaryArtifact,
        renderId: "different-render-job",
        url: "https://render.example.test/other-output.mp4",
      },
    };
    collection.findOne.mockClear();
    collection.findOneAndUpdate.mockClear();
    collection.findOne.mockResolvedValueOnce(invalidManifestJob);
    const invalidClaimManifest = await claimProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      now,
      collection,
    });
    expect(invalidClaimManifest).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockResolvedValueOnce(invalidManifestJob);
    const invalidCompleteManifest = await completeProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      now,
      collection,
    });
    expect(invalidCompleteManifest).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
    expect(collection.updateOne).not.toHaveBeenCalled();

    collection.findOne.mockResolvedValueOnce(invalidManifestJob);
    const invalidReleaseManifest = await releaseProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      collection,
    });
    expect(invalidReleaseManifest).toMatchObject({
      ok: false,
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "JOB_NOT_CURRENT",
    });
    expect(collection.updateOne).not.toHaveBeenCalled();

    collection.findOne.mockClear();
    collection.findOneAndUpdate.mockClear();
    const stale = await claimProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      now,
      collection,
    });
    expect(stale).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();

    collection.findOne.mockResolvedValueOnce(makeDoneJob(binding, true));
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(completeProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      now,
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const completeEffects = collection.updateOne.mock.calls.at(-1)!;
    expect(JSON.stringify(completeEffects[0])).toContain(binding.bindingHash);
    expect(completeEffects[1]).toEqual({
      $set: expect.objectContaining({ "completionEffects.state": "done" }),
      $unset: {
        "completionEffects.claimToken": "",
        "completionEffects.leaseExpiresAt": "",
      },
    });

    collection.findOne.mockResolvedValueOnce(makeDoneJob(binding, true));
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(releaseProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "effects-claim",
      collection,
    })).resolves.toMatchObject({ ok: true, status: "CURRENT" });
    const releaseEffects = collection.updateOne.mock.calls.at(-1)!;
    expect(JSON.stringify(releaseEffects[0])).toContain(binding.bindingHash);
    expect(releaseEffects[1]).toEqual({ $unset: { completionEffects: "" } });

    collection.findOne.mockResolvedValueOnce(null);
    collection.updateOne.mockClear();
    const wrongClaim = await completeProjectRenderCompletionEffectsV1({
      authorization,
      currentProjectRevision: REVISION,
      claimToken: "wrong-claim",
      collection,
    });
    expect(wrongClaim).toMatchObject({ ok: false, code: "PROJECT_ARTIFACT_NOT_CURRENT" });
    expect(collection.updateOne).not.toHaveBeenCalled();
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
