import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAssetAnalysisClaimFilter,
  buildAssetAnalysisClaimUpdate,
  resolveAssetVideoAnalysisPolicy,
} from "@/lib/editron/services/asset-analysis-worker-policy";

const repoRoot = resolve(__dirname, "../..");

describe("asset-analysis worker policy", () => {
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
    const dispatchIndex = uploadSource.indexOf("/api/internal/workers/asset-analysis");
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
    expect(workerSource).toContain("resolveAssetVideoAnalysisPolicy");
    expect(workerSource.indexOf("resolveAssetVideoAnalysisPolicy")).toBeLessThan(workerSource.indexOf("runFullAnalysis"));
    expect(workerSource).toContain("'full-analysis-deferred'");
  });
});
