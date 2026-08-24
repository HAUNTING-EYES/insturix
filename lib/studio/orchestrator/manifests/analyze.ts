/**
 * ANALYZE domain manifest — Alyzitron surface: intent-aware critique,
 * URL/file ingest, chat interrogation over transcription.
 */

import type { StudioDomainManifest } from "@/lib/studio/contracts/manifest";

export const ANALYZE_DOMAIN_MANIFEST: StudioDomainManifest = {
  capability: "analyze",
  stageView: "analyze",
  artifactKinds: ["analysis"],
  tools: [
    {
      name: "alyzitron/analyze",
      label: "Analyzing content",
      shortLabel: "Analyze",
      iconCategory: "search",
      riskLevel: "medium",
      executionType: "generative",
      receiptLabel: "Analysis queued",
      loadingMessages: ["fetching the content…", "transcribing…", "scoring against intent…"],
      whenToUse: "grade your own or a competitor's video/image by URL or upload — scores against what the content is FOR",
      costRef: { service: "alyzitron", action: "analysis" },
      produces: ["analysis"],
      exposure: "live",
    },
    {
      name: "alyzitron/chat",
      label: "Interrogating the report",
      shortLabel: "Ask report",
      iconCategory: "sparkles",
      riskLevel: "low",
      executionType: "quick",
      receiptLabel: "Report answer",
      loadingMessages: [],
      whenToUse: "follow-up questions over a finished analysis (transcription-grounded)",
      costRef: null,
      produces: [],
      exposure: "live",
    },
  ],
};
