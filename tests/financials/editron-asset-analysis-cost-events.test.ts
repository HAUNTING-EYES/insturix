import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("Editron asset-analysis provider cost events", () => {
  it("passes credit transaction, charged credits, and org to the background worker", () => {
    const source = readSource("app/api/services/editron/media/upload/route.ts");

    expect(source).toContain("analysisCreditTransactionId = deductResult.transactionId");
    expect(source).toContain("analysisChargedCredits = getCreditCost('editron', 'asset_analysis', analysisCreditOptions)");
    expect(source).toContain("orgId: orgId || undefined");
    expect(source).toContain("creditTransactionId: analysisCreditTransactionId");
    expect(source).toContain("chargedCredits: analysisChargedCredits");
  });

  it("records provider cost events for asset-analysis stages with idempotency", () => {
    const source = readSource("app/api/internal/workers/asset-analysis/route.ts");

    expect(source).toContain("recordProviderCostEvent");
    expect(source).toContain("editron:asset-analysis:${payload.assetId}:${event.stage}:${event.status}");
    expect(source).toContain("stage: 'video_5_track'");
    expect(source).toContain("stage: 'image_gemini_vision'");
    expect(source).toContain("stage: 'gemini_embedding'");
    expect(source).toContain("stage: 'audio_metadata'");
    expect(source).toContain("stage: 'graph_sync_qstash'");
  });

  it("removes the unused extra Gemini image call and keeps ledger metadata sanitized", () => {
    const source = readSource("app/api/internal/workers/asset-analysis/route.ts");

    expect(source).not.toContain("inlineData: { mimeType: 'image/jpeg', data: '' }");
    expect(source).toContain("metadata: {\n      stage: event.stage,\n      assetType: payload.type,");
    expect(source).not.toContain("metadata: { filename");
    expect(source).not.toContain("metadata: { url");
  });
});