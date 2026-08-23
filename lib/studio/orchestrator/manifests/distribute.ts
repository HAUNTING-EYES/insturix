/**
 * DISTRIBUTE domain manifest — CalOS + UploaderX surface. Publishing is a
 * hard gate by policy; every tool here is planning/read/queue only.
 */

import type { StudioDomainManifest } from "@/lib/studio/contracts/manifest";

export const DISTRIBUTE_DOMAIN_MANIFEST: StudioDomainManifest = {
  capability: "distribute",
  stageView: "schedule",
  artifactKinds: ["schedule", "post"],
  tools: [
    {
      name: "cadence-suggest",
      label: "Suggesting the cadence",
      shortLabel: "Cadence",
      iconCategory: "file",
      riskLevel: "read",
      executionType: "quick",
      receiptLabel: "Cadence suggested",
      loadingMessages: [],
      whenToUse: "propose a weekly platform mix + rationale for the brand — always confirm or tweak",
      costRef: null,
      produces: [],
      exposure: "live",
    },
    {
      name: "persist-deliverables",
      label: "Queueing posts",
      shortLabel: "Queue",
      iconCategory: "file",
      riskLevel: "high",
      executionType: "quick",
      receiptLabel: "Deliverables persisted",
      loadingMessages: [],
      whenToUse: "queue scheduled posts — requires the confirm-before-publish hard gate",
      costRef: { service: "calos", action: "generate_deliverable" },
      produces: ["schedule"],
      exposure: "live",
    },
    {
      name: "publish-status",
      label: "Checking publish health",
      shortLabel: "Health",
      iconCategory: "search",
      riskLevel: "read",
      executionType: "quick",
      receiptLabel: "Publish status read",
      loadingMessages: [],
      whenToUse: "delivery state per post; surfaces reconnect-before-queue",
      costRef: null,
      produces: [],
      exposure: "live",
    },
    {
      name: "connect",
      label: "Connecting a platform",
      shortLabel: "Connect",
      iconCategory: "file",
      riskLevel: "low",
      executionType: "quick",
      receiptLabel: "Connection updated",
      loadingMessages: [],
      whenToUse: "OAuth connect/assign per brand — account-shell seam, agent-invokable for rescans",
      costRef: null,
      produces: [],
      exposure: "live",
    },
  ],
};
