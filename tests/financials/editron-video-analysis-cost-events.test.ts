import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("Editron video-analysis provider cost events", () => {
  it("passes auto-edit credit metadata from intake into the video-analysis worker", () => {
    const source = readSource("app/api/services/editron/auto-edit/from-asset/route.ts");

    expect(source).toContain("autoEditCreditTransactionId = deductResult.transactionId");
    expect(source).toContain("autoEditChargedCredits = getCreditCost('editron', 'auto_edit_analysis', autoEditCreditOptions)");
    expect(source).toContain("orgId: orgId || undefined");
    expect(source).toContain("creditTransactionId: autoEditCreditTransactionId");
    expect(source).toContain("chargedCredits: autoEditChargedCredits");
  });

  it("records cost events for the video-analysis hidden-spend stages", () => {
    const source = readSource("app/api/internal/workers/video-analysis/route.ts");

    expect(source).toContain("recordProviderCostEvent");
    expect(source).toContain("editron:video-analysis:${payload.projectId}:${event.stage}:${event.status}");
    expect(source).toContain("stage: 'raw_footage_processing'");
    expect(source).toContain("stage: 'visual_cut_vjepa_modal'");
    expect(source).toContain("stage: 'video_understanding_gemini'");
    expect(source).toContain("stage: 'graph_sync_qstash'");
    expect(source).toContain("stage: 'tribe_qstash'");
    expect(source).toContain("stage: 'director_qstash'");
  });

  it("links revenue once and propagates the credit transaction to TRIBE without double-counting credits", () => {
    const videoSource = readSource("app/api/internal/workers/video-analysis/route.ts");
    const tribeSource = readSource("app/api/internal/workers/tribe-analysis/route.ts");

    expect(videoSource).toContain("includeRevenue: true");
    expect(videoSource).toContain("chargedCredits: event.includeRevenue ? payload.chargedCredits : undefined");
    expect(videoSource).toContain("creditTransactionId: payload.creditTransactionId");
    expect(videoSource).toContain("chargedCredits: payload.chargedCredits");
    expect(tribeSource).toContain("creditTransactionId?: string");
    expect(tribeSource).toContain("creditTransactionId: payload.creditTransactionId");
    expect(tribeSource).not.toContain("chargedCredits: event.includeRevenue");
  });

  it("keeps ledger metadata sanitized", () => {
    const source = readSource("app/api/internal/workers/video-analysis/route.ts");

    expect(source).toContain("metadata: {\n      stage: event.stage,");
    expect(source).not.toContain("metadata: { videoUrl");
    expect(source).not.toContain("metadata: { directorPayload");
    expect(source).not.toContain("metadata: { payload");
  });
});