import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRenderProgress: vi.fn(),
  getChapterRenderProgress: vi.fn(),
  getCurrentProjectRenderJobV1: vi.fn(),
  getJob: vi.fn(),
  getProjectRenderJobAuthorizationByAdmissionV1: vi.fn(),
  setAWSCredentials: vi.fn(async () => {}),
  updateJobProgress: vi.fn(async () => {}),
  failJob: vi.fn(async () => {}),
  beginRenderFinalization: vi.fn(async () => ({ state: "enqueued" })),
  beginProjectRenderFinalizationV1: vi.fn(async () => ({ state: "enqueued" })),
  claimRenderCompletionEffects: vi.fn(),
  completeRenderCompletionEffects: vi.fn(async () => true),
  releaseRenderCompletionEffects: vi.fn(async () => true),
  addVideoToLink: vi.fn(async () => false),
  emitBrandEvent: vi.fn(async () => "event_1"),
  transitionProjectStatus: vi.fn(async () => {}),
  findProject: vi.fn(),
  loadProjectForRenderSnapshot: vi.fn(),
  updateProjectRenderJobProgressTransactionV1: vi.fn(),
  failProjectRenderJobFromProviderTransactionV1: vi.fn(),
  claimProjectRenderCompletionEffectsTransactionV1: vi.fn(),
  completeProjectRenderCompletionEffectsTransactionV1: vi.fn(),
  releaseProjectRenderCompletionEffectsTransactionV1: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@remotion/lambda/client", () => ({
  getRenderProgress: mocks.getRenderProgress,
}));

vi.mock("@/lib/editron/services/chapter-renderer", () => ({
  getChapterRenderProgress: mocks.getChapterRenderProgress,
}));

vi.mock("@/lib/editron/utils/aws-credentials", () => ({
  setAWSCredentials: mocks.setAWSCredentials,
}));

vi.mock("@/lib/editron/services/render-job-service", () => ({
  updateJobProgress: mocks.updateJobProgress,
  failJob: mocks.failJob,
  getCurrentProjectRenderJobV1: mocks.getCurrentProjectRenderJobV1,
  getJob: mocks.getJob,
  getProjectRenderJobAuthorizationByAdmissionV1:
    mocks.getProjectRenderJobAuthorizationByAdmissionV1,
  claimRenderCompletionEffects: mocks.claimRenderCompletionEffects,
  completeRenderCompletionEffects: mocks.completeRenderCompletionEffects,
  releaseRenderCompletionEffects: mocks.releaseRenderCompletionEffects,
}));

vi.mock("@/lib/editron/services/render-finalization-dispatch", () => ({
  beginRenderFinalization: mocks.beginRenderFinalization,
  beginProjectRenderFinalizationV1: mocks.beginProjectRenderFinalizationV1,
}));

vi.mock("@/lib/editron/services/project-service", () => ({
  projectService: {
    loadProjectForRenderSnapshot: mocks.loadProjectForRenderSnapshot,
    updateProjectRenderJobProgressTransactionV1:
      mocks.updateProjectRenderJobProgressTransactionV1,
    failProjectRenderJobFromProviderTransactionV1:
      mocks.failProjectRenderJobFromProviderTransactionV1,
    claimProjectRenderCompletionEffectsTransactionV1:
      mocks.claimProjectRenderCompletionEffectsTransactionV1,
    completeProjectRenderCompletionEffectsTransactionV1:
      mocks.completeProjectRenderCompletionEffectsTransactionV1,
    releaseProjectRenderCompletionEffectsTransactionV1:
      mocks.releaseProjectRenderCompletionEffectsTransactionV1,
  },
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: vi.fn(async () => ({
    collection: () => ({ findOne: mocks.findProject }),
  })),
}));

vi.mock("@/lib/shared/brand-events", () => ({ emitBrandEvent: mocks.emitBrandEvent }));
vi.mock("@/lib/shared/project-status", () => ({
  transitionProjectStatus: mocks.transitionProjectStatus,
}));

vi.mock("@/lib/shared/project-links", () => ({
  addVideoToLink: mocks.addVideoToLink,
}));

import { GET } from "@/app/api/services/editron/cloudrun/progress/route";

const DELIVERY_MANIFEST = {
  version: "editron-render-delivery-manifest-v1",
  mode: "platform-native",
  createdAt: "2026-07-26T00:00:00.000Z",
  completedAt: null,
  primaryArtifact: {
    kind: "clean-master",
    renderId: "chr_rendering",
    status: "rendering",
    url: null,
  },
  music: {
    embedded: false,
    removedOverlayIds: ["music_1"],
    handoff: {
      version: "editron-platform-native-music-handoff-v1",
      destinationPlatform: "instagram",
      attachmentOwner: "destination-platform",
      track: {
        status: "manual-selection-required",
        provider: null,
        providerTrackId: null,
        title: null,
        artists: [],
        sourceAssetId: null,
        usage: "reference-only",
      },
      timing: {
        timelineStartFrame: 0,
        timelineEndFrame: 300,
        timelineStartMs: 0,
        timelineEndMs: 10_000,
        timelineBeatEntryFrame: null,
        timelineBeatEntryMs: null,
        platformTrackSourceOffsetMs: null,
        cueStatus: "manual-cue-required",
      },
    },
  },
};

const STRICT_REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-09-01T00:00:00.000Z",
};

const STRICT_AUTHORIZATION = {
  schemaVersion: 1 as const,
  jobId: "strict_admission",
  ownerId: "owner_1",
  requestedByUserId: "user_1",
  projectId: "project_1",
  projectRevision: STRICT_REVISION,
  bindingHash: "a".repeat(64),
};

function strictJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: STRICT_AUTHORIZATION.jobId,
    providerRenderId: "strict_provider",
    bucketName: "strict-bucket",
    region: "us-east-1",
    userId: STRICT_AUTHORIZATION.ownerId,
    requestedByUserId: STRICT_AUTHORIZATION.requestedByUserId,
    projectId: STRICT_AUTHORIZATION.projectId,
    status: "rendering",
    artifactState: "ACTIVE",
    projectRenderSnapshotBinding: {
      scope: "PROJECT_SNAPSHOT",
      bindingHash: STRICT_AUTHORIZATION.bindingHash,
    },
    deliveryManifest: DELIVERY_MANIFEST,
    ...overrides,
  };
}

function chapterProgressRequest(renderId: string) {
  return new Request(
    `http://localhost/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=chapter-render&region=us-east-1`,
  );
}

describe("Editron chapter render progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.getJob.mockResolvedValue({
      _id: "render_job",
      userId: "user_1",
      projectId: "project_1",
      status: "rendering",
      deliveryManifest: DELIVERY_MANIFEST,
    });
    mocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project: {},
      ownerId: STRICT_AUTHORIZATION.ownerId,
      revision: STRICT_REVISION,
    });
    mocks.updateProjectRenderJobProgressTransactionV1.mockResolvedValue({
      ok: true,
      status: "CURRENT",
    });
    mocks.failProjectRenderJobFromProviderTransactionV1.mockResolvedValue({
      ok: true,
      status: "CURRENT",
    });
    mocks.completeProjectRenderCompletionEffectsTransactionV1.mockResolvedValue({
      ok: true,
      status: "CURRENT",
    });
    mocks.releaseProjectRenderCompletionEffectsTransactionV1.mockResolvedValue({
      ok: true,
      status: "CURRENT",
    });
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-render";
  });

  it("rejects a forged strict provider tuple before loading AWS credentials", async () => {
    mocks.getJob.mockResolvedValueOnce(strictJob());

    const response = await GET(new Request(
      "http://localhost/api/services/editron/cloudrun/progress"
      + "?renderId=strict_provider&bucketName=forged-bucket&region=us-east-1",
    ));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("PROJECT_ARTIFACT_NOT_CURRENT");
    expect(mocks.getProjectRenderJobAuthorizationByAdmissionV1).not.toHaveBeenCalled();
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });

  it("polls a current strict render and persists progress through ProjectService", async () => {
    const job = strictJob();
    mocks.getJob.mockResolvedValueOnce(job);
    mocks.getProjectRenderJobAuthorizationByAdmissionV1.mockResolvedValueOnce({
      ok: true,
      status: "BOUND",
      job,
      authorization: STRICT_AUTHORIZATION,
    });
    mocks.getCurrentProjectRenderJobV1.mockResolvedValueOnce({
      ok: true,
      status: "CURRENT",
      job,
    });
    mocks.getRenderProgress.mockResolvedValueOnce({
      done: false,
      overallProgress: 0.42,
      framesRendered: 42,
      lambdasInvoked: 2,
    });

    const response = await GET(new Request(
      "http://localhost/api/services/editron/cloudrun/progress"
      + "?renderId=strict_provider&bucketName=strict-bucket&region=us-east-1",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.progress).toBe(0.42);
    expect(mocks.loadProjectForRenderSnapshot).toHaveBeenCalledWith("user_1", "project_1");
    expect(mocks.updateProjectRenderJobProgressTransactionV1).toHaveBeenCalledWith({
      authorization: STRICT_AUTHORIZATION,
      progress: 0.42,
    });
    expect(mocks.updateJobProgress).not.toHaveBeenCalled();
  });

  it("uses strict finalization for a completed bound provider render", async () => {
    const job = strictJob();
    mocks.getJob.mockResolvedValueOnce(job);
    mocks.getProjectRenderJobAuthorizationByAdmissionV1.mockResolvedValueOnce({
      ok: true,
      status: "BOUND",
      job,
      authorization: STRICT_AUTHORIZATION,
    });
    mocks.getCurrentProjectRenderJobV1.mockResolvedValueOnce({
      ok: true,
      status: "CURRENT",
      job,
    });
    mocks.getRenderProgress.mockResolvedValueOnce({
      done: true,
      outputFile: "https://video.example/strict-raw.mp4",
      outputSizeInBytes: 84_000,
      chunks: 3,
    });

    const response = await GET(new Request(
      "http://localhost/api/services/editron/cloudrun/progress"
      + "?renderId=strict_provider&bucketName=strict-bucket&region=us-east-1",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ done: false, finalizing: true });
    expect(mocks.beginProjectRenderFinalizationV1).toHaveBeenCalledWith({
      authorization: STRICT_AUTHORIZATION,
      providerRenderId: "strict_provider",
      bucketName: "strict-bucket",
      sourceOutputUrl: "https://video.example/strict-raw.mp4",
      sourceOutputSize: 84_000,
    });
    expect(mocks.beginRenderFinalization).not.toHaveBeenCalled();
  });

  it("requires the persisted render owner before invoking AWS", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const unauthorized = await GET(chapterProgressRequest("chr_private"));

    expect(unauthorized.status).toBe(401);
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.getJob.mockResolvedValue({ userId: "user_2", projectId: "project_1" });
    const foreign = await GET(chapterProgressRequest("chr_private"));

    expect(foreign.status).toBe(404);
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();
  });

  it("routes chr renders to the chapter progress service", async () => {
    mocks.getChapterRenderProgress.mockResolvedValue({
      status: "rendering",
      overallProgress: 0.42,
      chapters: [{ index: 0, status: "rendering", progress: 0.42 }],
    });

    const response = await GET(chapterProgressRequest("chr_rendering"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("success");
    expect(body.data.done).toBe(false);
    expect(body.data.progress).toBe(0.42);
    expect(body.data.deliveryManifest).toEqual(DELIVERY_MANIFEST);
    expect(mocks.getChapterRenderProgress).toHaveBeenCalledWith("chr_rendering");
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
    expect(mocks.updateJobProgress).toHaveBeenCalledWith("chr_rendering", 0.42);
  });

  it("queues chapter completion without exposing the concat output", async () => {
    mocks.getJob.mockResolvedValueOnce({
      _id: "chr_done",
      providerRenderId: "chr_done",
      userId: "user_1",
      projectId: "project_1",
      status: "rendering",
      deliveryManifest: DELIVERY_MANIFEST,
    });
    mocks.getChapterRenderProgress.mockResolvedValue({
      status: "completed",
      overallProgress: 1,
      outputUrl: "https://video.example/render.mp4",
      chapters: [
        {
          index: 0,
          status: "completed",
          progress: 1,
          outputUrl: "https://video.example/render.mp4",
        },
      ],
    });

    const response = await GET(chapterProgressRequest("chr_done"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("success");
    expect(body.data.done).toBe(false);
    expect(body.data.finalizing).toBe(true);
    expect(JSON.stringify(body)).not.toContain("https://video.example/render.mp4");
    expect(mocks.beginRenderFinalization).toHaveBeenCalledWith({
      renderId: "chr_done",
      providerRenderId: "chr_done",
      bucketName: "chapter-render",
      sourceOutputUrl: "https://video.example/render.mp4",
      sourceOutputSize: 0,
    });
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });

  it("keeps an active finalizer in progress without polling providers", async () => {
    mocks.getJob.mockResolvedValueOnce({
      _id: "chr_finalizing",
      userId: "user_1",
      projectId: "project_1",
      status: "finalizing",
      deliveryManifest: DELIVERY_MANIFEST,
    });

    const response = await GET(chapterProgressRequest("chr_finalizing"));
    const body = await response.json();

    expect(body.data).toMatchObject({ done: false, progress: 0.99, finalizing: true });
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();
    expect(mocks.getChapterRenderProgress).not.toHaveBeenCalled();
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });

  it("returns only a receipt-verified artifact and leases completion effects", async () => {
    const finalUrl = "https://video.example/finalized.mp4";
    const completedManifest = {
      ...DELIVERY_MANIFEST,
      completedAt: "2026-07-26T00:05:00.000Z",
      primaryArtifact: { ...DELIVERY_MANIFEST.primaryArtifact, status: "ready", url: finalUrl },
    };
    mocks.getJob.mockResolvedValueOnce({
      _id: "chr_done",
      providerRenderId: "chr_provider",
      userId: "user_1",
      projectId: "project_1",
      status: "done",
      outputUrl: finalUrl,
      outputSize: 42_000,
      deliveryManifest: completedManifest,
      finalization: {
        state: "done",
        outputUrl: finalUrl,
        receipt: { expectedDurationMs: 10_000 },
      },
    });
    mocks.claimRenderCompletionEffects.mockResolvedValueOnce({
      jobId: "chr_done",
      providerRenderId: "chr_provider",
      userId: "user_1",
      projectId: "project_1",
      outputUrl: finalUrl,
      outputSize: 42_000,
      claimToken: "rce_1",
    });
    mocks.findProject.mockResolvedValueOnce({ brandId: "brand_1", name: "Project" });

    const response = await GET(chapterProgressRequest("chr_done"));
    const body = await response.json();

    expect(body.data).toMatchObject({ done: true, outputUrl: finalUrl, outputFile: finalUrl });
    expect(mocks.getChapterRenderProgress).not.toHaveBeenCalled();
    expect(mocks.addVideoToLink).toHaveBeenCalledWith("user_1", "project_1", "chr_provider");
    expect(mocks.emitBrandEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "video_rendered",
      payload: expect.objectContaining({ renderId: "chr_provider", outputSize: 42_000 }),
    }));
    expect(mocks.completeRenderCompletionEffects).toHaveBeenCalledWith({
      jobId: "chr_done",
      claimToken: "rce_1",
    });
  });

  it("fails loud instead of returning a legacy raw done artifact", async () => {
    mocks.getJob.mockResolvedValueOnce({
      _id: "chr_legacy",
      userId: "user_1",
      projectId: "project_1",
      status: "done",
      outputUrl: "https://video.example/raw.mp4",
    });

    const response = await GET(chapterProgressRequest("chr_legacy"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("RENDER_FINALIZATION_RECEIPT_MISSING");
    expect(JSON.stringify(body)).not.toContain("https://video.example/raw.mp4");
  });

  it("queues standard Lambda completion without exposing its raw output", async () => {
    mocks.getJob.mockResolvedValueOnce({
      _id: "rnd_admission",
      providerRenderId: "rnd_provider",
      userId: "user_1",
      projectId: "project_1",
      status: "rendering",
      deliveryManifest: DELIVERY_MANIFEST,
    });
    mocks.getRenderProgress.mockResolvedValueOnce({
      done: true,
      outputFile: "https://video.example/lambda-raw.mp4",
      outputSizeInBytes: 84_000,
      chunks: 3,
    });
    const request = new Request(
      "http://localhost/api/services/editron/cloudrun/progress"
      + "?renderId=rnd_provider&bucketName=lambda-bucket&region=us-east-1",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(body.data).toMatchObject({ done: false, progress: 0.99, finalizing: true });
    expect(JSON.stringify(body)).not.toContain("https://video.example/lambda-raw.mp4");
    expect(mocks.beginRenderFinalization).toHaveBeenCalledWith({
      renderId: "rnd_provider",
      providerRenderId: "rnd_provider",
      bucketName: "lambda-bucket",
      sourceOutputUrl: "https://video.example/lambda-raw.mp4",
      sourceOutputSize: 84_000,
    });
  });

  it("does not fall through to Remotion progress when a chapter job is missing", async () => {
    mocks.getChapterRenderProgress.mockResolvedValue(null);

    const response = await GET(chapterProgressRequest("chr_missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      type: "error",
      message: "Chapter render job not found",
    });
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });
});
