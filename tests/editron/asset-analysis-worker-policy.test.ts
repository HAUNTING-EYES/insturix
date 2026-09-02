import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAssetAnalysisClaimFilter,
  buildAssetAnalysisClaimUpdate,
  resolveAssetVideoAnalysisPolicy,
} from "@/lib/editron/services/asset-analysis-worker-policy";
import { buildAssetDeepAnalysisTimeline } from "@/lib/editron/services/asset-deep-analysis";

const workerMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  getTranscription: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@upstash/qstash/nextjs", () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
}));
vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { MEDIA_ASSETS: "mediaAssets" },
  getDatabase: workerMocks.getDatabase,
}));
vi.mock("@/lib/editron/services/media/transcription-service", () => ({
  getTranscription: workerMocks.getTranscription,
}));

function workerRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/internal/workers/asset-transcription", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const repoRoot = resolve(__dirname, "../..");

describe("asset-analysis worker policy", () => {
  it("defers full ingest-time video analysis when video duration is unknown", () => {
    const policy = resolveAssetVideoAnalysisPolicy({
      type: "video",
      env: {},
    });

    expect(policy).toMatchObject({
      shouldRunFullAnalysis: false,
      reason: "unknown-duration-deferred",
      maxDurationSeconds: 120,
      durationSeconds: null,
    });
  });

  it("defers full ingest-time video analysis when duration cannot fit the serverless budget", () => {
    const policy = resolveAssetVideoAnalysisPolicy({
      type: "video",
      durationSeconds: 9 * 60,
      env: {},
    });

    expect(policy).toMatchObject({
      shouldRunFullAnalysis: false,
      reason: "duration-over-serverless-ingest-budget",
      maxDurationSeconds: 120,
      durationSeconds: 540,
    });
  });

  it("allows the serverless full-analysis ceiling to be raised explicitly", () => {
    const policy = resolveAssetVideoAnalysisPolicy({
      type: "video",
      durationSeconds: 9 * 60,
      env: { EDITRON_ASSET_ANALYSIS_FULL_VIDEO_MAX_SECONDS: "900" },
    });

    expect(policy.shouldRunFullAnalysis).toBe(true);
    expect(policy.reason).toBe("within-worker-budget");
  });

  it("claims only queued, failed, missing, or stale analyzing jobs", () => {
    const now = new Date("2026-07-03T10:00:00.000Z");
    const filter = buildAssetAnalysisClaimFilter({
      assetId: "asset_1",
      userId: "user_1",
      now,
      staleMs: 10 * 60 * 1000,
    });

    expect(filter).toMatchObject({
      assetId: "asset_1",
      userId: "user_1",
      $or: expect.arrayContaining([
        { analysisStatus: { $exists: false } },
        { analysisStatus: null },
        { analysisStatus: { $in: ["queued", "failed", "dispatch_failed"] } },
        { analysisStatus: "analyzing", analysisStartedAt: { $lt: new Date("2026-07-03T09:50:00.000Z") } },
      ]),
    });
    expect(JSON.stringify(filter)).not.toContain("complete");
  });

  it("sets an analyzing claim without erasing durable asset metadata", () => {
    const now = new Date("2026-07-03T10:00:00.000Z");
    expect(buildAssetAnalysisClaimUpdate(now)).toEqual({
      $set: {
        analysisStatus: "analyzing",
        analysisStartedAt: now,
        analysisWorker: "asset-analysis",
      },
      $unset: {
        analysisError: "",
      },
    });
  });

  it("queues the asset before QStash publish so a fast worker cannot be stomped back to queued", () => {
    const uploadSource = readFileSync(resolve(repoRoot, "app/api/services/editron/media/upload/route.ts"), "utf8");
    const queueIndex = uploadSource.indexOf("analysisStatus: 'queued'");
    const dispatchIndex = uploadSource.indexOf("/api/internal/workers/asset-transcription");
    const dispatchedLogIndex = uploadSource.indexOf("Dispatched analysis worker");

    expect(queueIndex).toBeGreaterThan(0);
    expect(dispatchIndex).toBeGreaterThan(0);
    expect(queueIndex).toBeLessThan(dispatchIndex);
    expect(uploadSource.indexOf("analysisStatus: 'queued'", dispatchedLogIndex)).toBe(-1);
  });

  it("worker route uses the claim and duration policy before heavy video analysis", () => {
    const workerSource = readFileSync(resolve(repoRoot, "app/api/internal/workers/asset-analysis/route.ts"), "utf8");

    expect(workerSource).toContain("buildAssetAnalysisClaimFilter");
    expect(workerSource).toContain("duplicate-delivery");
    expect(workerSource).not.toContain("request.clone().json");
    expect(workerSource).toContain("resolveAssetVideoAnalysisPolicy");
    expect(workerSource.indexOf("resolveAssetVideoAnalysisPolicy")).toBeLessThan(workerSource.indexOf("runFullAnalysis"));
    expect(workerSource).toContain("'full-analysis-deferred'");
    expect(workerSource).not.toContain("Transcription prerequisite missing");
    expect(workerSource).toContain("Transcription stage incomplete");
    expect(workerSource).toContain("analysisInputMode === 'visual-only'");
    expect(workerSource).toContain("batchTranscriptionSkipReason");
    expect(workerSource).toContain("transcript: transcription?.transcript");
    expect(workerSource).toContain("audioUrl: url");
    expect(workerSource).toContain("words: transcription?.words");
    expect(workerSource).toContain("...(transcription ? { transcription, speechSegments } : {})");
    expect(workerSource).toContain("$unset: { transcription: '', speechSegments: '' }");
  });

  it("keeps video assets unready until the deep multimodal worker finishes", () => {
    const baseWorkerSource = readFileSync(
      resolve(repoRoot, "app/api/internal/workers/asset-analysis/route.ts"),
      "utf8",
    );
    const deepWorkerSource = readFileSync(
      resolve(repoRoot, "app/api/internal/workers/asset-deep-analysis/route.ts"),
      "utf8",
    );
    const queuedIndex = baseWorkerSource.indexOf("deepAnalysisStatus: 'queued'");
    const dispatchIndex = baseWorkerSource.indexOf("/api/internal/workers/asset-deep-analysis");
    const analysisIndex = deepWorkerSource.indexOf("runAssetDeepAnalysis({");
    const readyIndex = deepWorkerSource.indexOf("analysisStatus: 'complete'");

    expect(baseWorkerSource).toContain("analysisStatus: shouldQueueDeepAnalysis ? 'analyzing' : 'complete'");
    expect(queuedIndex).toBeGreaterThan(0);
    expect(dispatchIndex).toBeGreaterThan(queuedIndex);
    expect(deepWorkerSource).toContain("deepAnalysisStatus: result.diagnostics.status");
    expect(analysisIndex).toBeGreaterThan(0);
    expect(readyIndex).toBeGreaterThan(analysisIndex);
  });
});

describe("deep-analysis transcription parity", () => {
  it("derives speech windows from canonical words and preserves Hinglish language", () => {
    const timeline = buildAssetDeepAnalysisTimeline({
      videoUrl: "https://cdn.test/long-video.mp4",
      durationMs: 600_000,
      sourceAnalysis: {
        durationMs: 600_000,
        speechSegments: [],
        transcription: {
          words: [
            { word: "Namaste", startMs: 1_000, endMs: 1_400, confidence: 0.95 },
            { word: "world.", startMs: 1_500, endMs: 1_900, confidence: 0.94 },
            { word: "Agla", startMs: 5_000, endMs: 5_300, confidence: 0.93 },
          ],
          transcript: "Namaste world. Agla",
          language: "hi-en",
          confidence: 0.94,
        },
      },
    });

    expect(timeline.speechWindows).toEqual([
      { startMs: 1_000, endMs: 1_900 },
      { startMs: 5_000, endMs: 5_300 },
    ]);
    expect(timeline.rawFootageAnalysis.transcription).toMatchObject({
      transcript: "Namaste world. Agla",
      language: "hi-en",
      confidence: 0.94,
      words: expect.arrayContaining([expect.objectContaining({ word: "Namaste", startMs: 1_000 })]),
    });
    expect(timeline.rawFootageAnalysis.segments.some((segment) => segment.words.length > 0)).toBe(true);
  });
});

describe("durable asset transcription worker", () => {
  const oldEnv = { ...process.env };
  const payload = {
    assetId: "asset_1",
    userId: "user_1",
    type: "video",
    url: "https://cdn.test/video.mp4",
    duration: 90,
    filename: "video.mp4",
  };

  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(workerMocks)) mock.mockReset();
    process.env = {
      ...oldEnv,
      QSTASH_TOKEN: "qstash_token",
      QSTASH_URL: "https://qstash.test",
      QSTASH_CURRENT_SIGNING_KEY: "current-signing-key",
      QSTASH_NEXT_SIGNING_KEY: "next-signing-key",
      NEXT_PUBLIC_APP_URL: "https://app.test",
    };
    workerMocks.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 });
    workerMocks.findOne.mockResolvedValue({ batchTranscriptionStatus: "complete", analysisStatus: "queued" });
    workerMocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({ updateOne: workerMocks.updateOne, findOne: workerMocks.findOne })),
    });
    workerMocks.getTranscription.mockResolvedValue({
      words: [{ word: "Namaste", startMs: 100, endMs: 500, confidence: 0.96 }],
      transcript: "Namaste world",
      language: "hi-en",
      confidence: 0.96,
      generatedAt: new Date(),
    });
    workerMocks.fetch.mockImplementation(async () =>
      new Response(JSON.stringify({ messageId: "msg_analysis" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", workerMocks.fetch);
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.unstubAllGlobals();
  });

  it("persists words and language before dispatching asset analysis", async () => {
    const { POST } = await import("@/app/api/internal/workers/asset-transcription/route");
    const response = await POST(workerRequest(payload) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      success: true,
      assetId: "asset_1",
      wordCount: 1,
      language: "hi-en",
      messageId: "msg_analysis",
    }));
    expect(workerMocks.getTranscription).toHaveBeenCalledWith(
      "asset_1",
      "user_1",
      { preferWordLevel: true },
    );
    expect(workerMocks.fetch).toHaveBeenCalledWith(
      "https://qstash.test/v2/publish/https://app.test/api/internal/workers/asset-analysis",
      expect.objectContaining({ method: "POST" }),
    );
    expect(workerMocks.updateOne.mock.invocationCallOrder.at(-1)).toBeLessThan(
      workerMocks.fetch.mock.invocationCallOrder[0],
    );
    expect(workerMocks.updateOne).toHaveBeenLastCalledWith(
      { assetId: "asset_1", userId: "user_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          batchTranscriptionStatus: "complete",
          batchTranscriptionWordCount: 1,
          batchTranscriptionLanguage: "hi-en",
          analysisStatus: "queued",
        }),
        $unset: { batchTranscriptionError: "" },
      }),
    );
  });

  it("does no provider or dispatch work for a duplicate completed delivery", async () => {
    workerMocks.updateOne.mockResolvedValueOnce({ acknowledged: true, matchedCount: 0 });
    const { POST } = await import("@/app/api/internal/workers/asset-transcription/route");
    const response = await POST(workerRequest(payload) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ skipped: "already-complete" }));
    expect(workerMocks.getTranscription).not.toHaveBeenCalled();
    expect(workerMocks.fetch).not.toHaveBeenCalled();
  });

  it("treats missing video duration as visual-only and still dispatches analysis", async () => {
    const { POST } = await import("@/app/api/internal/workers/asset-transcription/route");
    const response = await POST(workerRequest({ ...payload, duration: undefined }) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ success: true, wordCount: 0, skipReason: "missing-duration" }));
    expect(workerMocks.getTranscription).not.toHaveBeenCalled();
    expect(workerMocks.fetch).toHaveBeenCalledOnce();
    expect(workerMocks.updateOne).toHaveBeenLastCalledWith(
      { assetId: "asset_1", userId: "user_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          batchTranscriptionStatus: "complete",
          batchTranscriptionWordCount: 0,
          batchTranscriptionSkipReason: "missing-duration",
          analysisStatus: "queued",
        }),
      }),
    );
  });

  it("treats ASR failure as visual-only and still dispatches analysis", async () => {
    workerMocks.getTranscription.mockRejectedValueOnce(new Error("ASR unavailable"));
    const { POST } = await import("@/app/api/internal/workers/asset-transcription/route");
    const response = await POST(workerRequest(payload) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ success: true, wordCount: 0, skipReason: "no-speech" }));
    expect(workerMocks.fetch).toHaveBeenCalledOnce();
    expect(workerMocks.updateOne).toHaveBeenLastCalledWith(
      { assetId: "asset_1", userId: "user_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          batchTranscriptionStatus: "complete",
          batchTranscriptionWordCount: 0,
          batchTranscriptionSkipReason: "no-speech",
          analysisStatus: "queued",
        }),
      }),
    );
  });
});
