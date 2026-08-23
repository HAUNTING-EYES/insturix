/**
 * EDIT domain manifest — mounted mechanically from the real Editron
 * chat-tool registry (66 tools). This is the drift-resilience seam: when the
 * backend rewrite changes the tool surface, this mount (or the registry it
 * reads) is the ONLY thing that updates — orchestrator plans, plan-card
 * rendering, risk gates, and receipts all read from here.
 */

import { CHAT_TOOL_REGISTRY } from "@/lib/editron/agent/chat-tool-registry";
import type { StudioDomainManifest, StudioToolManifest } from "@/lib/studio/contracts/manifest";

type EditToolMetadata = {
  name: string;
  label: string;
  shortLabel: string;
  iconCategory: string;
  receiptLabel: string;
  executionType?: "quick" | "generative";
  riskLevel?: "read" | "low" | "medium" | "high";
  loadingMessages?: string[];
  mutatesProject?: boolean;
};

function mountEditTool(meta: EditToolMetadata): StudioToolManifest {
  return {
    name: meta.name,
    label: meta.label,
    shortLabel: meta.shortLabel,
    iconCategory: meta.iconCategory,
    riskLevel: meta.riskLevel ?? "low",
    executionType: meta.executionType ?? "quick",
    receiptLabel: meta.receiptLabel,
    loadingMessages: meta.loadingMessages ?? [],
    // Placeholder routing note — real when-to-use prose lands with the
    // rewritten backend's domain manifest (this mount is the transition).
    whenToUse: `editron · ${meta.label.toLowerCase()}`,
    costRef: null,
    produces: meta.mutatesProject ? ["reel"] : [],
    exposure: "live",
  };
}

export const EDIT_DOMAIN_MANIFEST: StudioDomainManifest = {
  capability: "edit",
  stageView: "reel",
  artifactKinds: ["reel"],
  tools: Object.values(CHAT_TOOL_REGISTRY).map((meta) => mountEditTool(meta as EditToolMetadata)),
};
