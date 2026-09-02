import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  uploadFindOne: vi.fn(),
  analysesInsertOne: vi.fn(),
  analysesDeleteOne: vi.fn(),
  publishJSON: vi.fn(),
  resolveTaskBrandId: vi.fn(),
  resolveBrandContext: vi.fn(),
  buildAnalysisContext: vi.fn(),
  validateYouTubeVideo: vi.fn(),
  loadProjectForMutation: vi.fn(),
  saveProjectWithReceipt: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: vi.fn(async () => ({ firstName: "Test", lastName: "User", username: "tester" })),
    },
  })),
}));

vi.mock("@/app/api/services/alyzitron/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app/api/services/alyzitron/utils/youtube", () => ({
  validateYouTubeVideo: mocks.validateYouTubeVideo,
}));

vi.mock("@/lib/services/creditsMiddleware", () => ({
  checkCredits: mocks.checkCredits,
}));

vi.mock("@/app/api/services/alyzitron/utils/mongodb", () => ({
  getCollections: async () => ({
    uploadTracking: {
      findOne: mocks.uploadFindOne,
    },
    analyses: {
      insertOne: mocks.analysesInsertOne,
      deleteOne: mocks.analysesDeleteOne,
    },
  }),
}));

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn(() => ({
    publishJSON: mocks.publishJSON,
  })),
}));

vi.mock("@/lib/editron/services/project-service", () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  ProjectNotFoundOrForbiddenError: class ProjectNotFoundOrForbiddenError extends Error {},
  projectService: {
    loadProjectForMutation: mocks.loadProjectForMutation,
    saveProjectWithReceipt: mocks.saveProjectWithReceipt,
  },
}));

vi.mock("@/lib/alyzitron/services/brand-vault-context", () => ({
  AlyzitronBrandContextError: class AlyzitronBrandContextError extends Error {
    code = "BRAND_CONTEXT_ERROR";
    brandId = "brand_1";
  },
  resolveAlyzitronTaskBrandId: mocks.resolveTaskBrandId,
  resolveAlyzitronBrandContext: mocks.resolveBrandContext,
  buildAlyzitronAnalysisContext: mocks.buildAnalysisContext,
}));

import { POST } from "@/app/api/services/alyzitron/analyze/route";

function request(body: unknown): Request {
  return new Request("https://app.example.com/api/services/alyzitron/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Alyzitron analyze media source ownership", () => {
  beforeEach(() => {
    vi.stubEnv("CDN_WORKER_URL", "https://cdn.example.com");
    vi.stubEnv("R2_BUCKET_NAME", "editron-cdn");
    vi.stubEnv("QSTASH_TOKEN", "test-qstash-token");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

    mocks.auth.mockResolvedValue({ userId: "user_123", orgId: null });
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: mocks.deduct,
      refund: mocks.refund,
      errorResponse: Response.json({ error: "no credits" }, { status: 402 }),
    });
    mocks.deduct.mockResolvedValue({ transactionId: "txn_alyzitron_test" });
    mocks.refund.mockResolvedValue(undefined);
    mocks.uploadFindOne.mockResolvedValue({ uploadId: "upload_1" });
    mocks.analysesInsertOne.mockResolvedValue({ acknowledged: true });
    mocks.analysesDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.publishJSON.mockResolvedValue(undefined);
    mocks.resolveTaskBrandId.mockResolvedValue(null);
    mocks.resolveBrandContext.mockResolvedValue({ source: "none" });
    mocks.buildAnalysisContext.mockImplementation((context) => context);
    mocks.validateYouTubeVideo.mockResolvedValue({ valid: true, duration: 120 });
    mocks.loadProjectForMutation.mockResolvedValue({
      revision: { schemaVersion: 1, value: 7, compatibilityUpdatedAt: "2026-09-02T00:00:00.000Z" },
      project: {
        projectId: "project_1",
        userId: "user_123",
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 1_800,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects a foreign storage key before checking or deducting credits", async () => {
    const response = await POST(request({
      video_url: "user_other/alyzitron-uploads/clip.mp4",
      storage: "r2",
      metadata: { duration: 60, mimeType: "video/mp4" },
      userId: "user_123",
    }));

    expect(response!.status).toBe(403);
    expect(mocks.uploadFindOne).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.analysesInsertOne).not.toHaveBeenCalled();
  });

  it("rejects an untracked owned upload before deducting credits", async () => {
    mocks.uploadFindOne.mockResolvedValueOnce(null);

    const response = await POST(request({
      video_url: "user_123/alyzitron-uploads/clip.mp4",
      storage: "r2",
      metadata: { duration: 60, mimeType: "video/mp4" },
    }));

    expect(response!.status).toBe(404);
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.analysesInsertOne).not.toHaveBeenCalled();
  });

  it("stores tracked uploaded media using the authenticated owner and server URL", async () => {
    const response = await POST(request({
      video_url: "user_123/alyzitron-uploads/clip.mp4",
      storage: "r2",
      metadata: { duration: 60, mimeType: "video/mp4" },
      userId: "attacker_user",
    }));

    expect(response!.status).toBe(200);
    expect(mocks.checkCredits).toHaveBeenCalledWith("user_123", "alyzitron", "video_analysis", { durationMinutes: 1 });
    expect(mocks.deduct).toHaveBeenCalledTimes(1);
    expect(mocks.analysesInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      clerkUserId: "user_123",
      videoUrl: "https://cdn.example.com/asset/user_123/alyzitron-uploads/clip.mp4",
    }));
    expect(mocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        userId: "user_123",
        videoUrl: "https://cdn.example.com/asset/user_123/alyzitron-uploads/clip.mp4",
      }),
    }));
  });

  it("preflights Brand Vault context in the authenticated organization scope", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_123", orgId: "org_agency" });
    mocks.resolveTaskBrandId.mockResolvedValue("brand_alyzi");

    const response = await POST(request({
      video_url: "user_123/alyzitron-uploads/clip.mp4",
      storage: "r2",
      metadata: { duration: 60, mimeType: "video/mp4" },
    }));

    expect(response!.status).toBe(200);
    expect(mocks.resolveBrandContext).toHaveBeenCalledWith({
      userId: "user_123",
      orgId: "org_agency",
      brandId: "brand_alyzi",
    });
    expect(mocks.analysesInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org_agency",
      brandId: "brand_alyzi",
    }));
  });

  it("binds linked Editron analysis to the authenticated project revision before charging", async () => {
    const response = await POST(request({
      video_url: "user_123/alyzitron-uploads/clip.mp4",
      storage: "r2",
      metadata: { duration: 60, mimeType: "video/mp4" },
      editronProjectId: "project_1",
    }));

    expect(response!.status).toBe(200);
    expect(mocks.loadProjectForMutation).toHaveBeenCalledWith("user_123", "project_1");
    expect(mocks.loadProjectForMutation.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deduct.mock.invocationCallOrder[0]);
    expect(mocks.analysesInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      editronProjectId: "project_1",
      editronProjectBindingV1: expect.objectContaining({
        schemaVersion: 1,
        projectId: "project_1",
        projectRevision: expect.objectContaining({ value: 7 }),
        sourceAccessBasis: "REGISTERED_USER_UPLOAD",
        wholeSourceRangeMs: { startInclusive: 0, endExclusive: 60_000 },
      }),
    }));
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it("rejects unsupported arbitrary external media hosts before credits", async () => {
    const response = await POST(request({
      video_url: "https://evil.example.com/video.mp4",
      metadata: { duration: 60, mimeType: "video/mp4" },
    }));

    expect(response!.status).toBe(400);
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.analysesInsertOne).not.toHaveBeenCalled();
  });
});
