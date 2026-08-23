/**
 * WRITE domain manifest — Phase 2's hardcoded turn steps, promoted to data.
 * Tools are the real ThinkForge surface; the executor (orchestrator/write.ts)
 * reads labels/risk/receipts from here instead of inlining them.
 */

import type { StudioDomainManifest } from "@/lib/studio/contracts/manifest";

export const WRITE_DOMAIN_MANIFEST: StudioDomainManifest = {
  capability: "write",
  stageView: "script",
  artifactKinds: ["script"],
  tools: [
    {
      name: "inferOutputFormat",
      label: "Resolving the format",
      shortLabel: "Format",
      iconCategory: "script",
      riskLevel: "read",
      executionType: "quick",
      receiptLabel: "Format resolved",
      loadingMessages: [],
      whenToUse: "before any generation — infers the 14-format output type from the ask and brand signals",
      costRef: null,
      produces: [],
      exposure: "live",
    },
    {
      name: "thinkforge/session",
      label: "Opening the document",
      shortLabel: "Session",
      iconCategory: "file",
      riskLevel: "read",
      executionType: "quick",
      receiptLabel: "Session opened",
      loadingMessages: [],
      whenToUse: "first write turn per deliverable — opens/loads the ThinkForge session bound to the brand",
      costRef: null,
      produces: [],
      exposure: "live",
    },
    {
      name: "post-writer-agent",
      label: "Writing the draft",
      shortLabel: "Write",
      iconCategory: "sparkles",
      riskLevel: "medium",
      executionType: "generative",
      receiptLabel: "Draft written",
      loadingMessages: ["reading the brief…", "composing…"],
      whenToUse: "generation and refinement of written artifacts (posts, emails, scripts via the format router)",
      costRef: { service: "thinkforge", action: "chat_message" },
      produces: ["script"],
      exposure: "live",
    },
  ],
};
