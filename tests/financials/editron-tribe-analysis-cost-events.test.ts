import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("Editron tribe-analysis provider cost events", () => {
  it("records Modal and QStash provider cost stages with idempotency", () => {
    const source = readSource("app/api/internal/workers/tribe-analysis/route.ts");

    expect(source).toContain("recordProviderCostEvent");
    expect(source).toContain("editron:tribe-analysis:${payload.projectId}:${event.stage}:${event.status}");
    expect(source).toContain("stage: 'vjepa_modal'");
    expect(source).toContain("stage: 'wav2vec_modal'");
    expect(source).toContain("stage: 'essentia_modal'");
    expect(source).toContain("stage: 'director_qstash'");
    expect(source).toContain("provider: 'modal'");
    expect(source).toContain("provider: 'upstash-qstash'");
  });

  it("captures provider units without leaking media URLs or payload bodies into ledger metadata", () => {
    const source = readSource("app/api/internal/workers/tribe-analysis/route.ts");

    expect(source).toContain("gpuSeconds: msToSeconds");
    expect(source).toContain("functionMs:");
    expect(source).toContain("queueMessages: 1");
    expect(source).toContain("metadata: {\n      stage: event.stage,");
    expect(source).not.toContain("metadata: { videoUrl");
    expect(source).not.toContain("metadata: { directorPayload");
    expect(source).not.toContain("metadata: { payload");
  });

  it("keeps Modal pricing unresolved until real invoice-backed rates are added", () => {
    const source = readSource("app/api/internal/workers/tribe-analysis/route.ts");

    expect(source).toContain("provider: 'modal'");
    expect(source).toContain("operation: 'gpu_video_analysis'");
    expect(source).toContain("operation: 'gpu_audio_analysis'");
    expect(source).toContain("operation: 'music_analysis'");
    expect(source).toContain("costBasis: 'provider_usage'");
  });
});