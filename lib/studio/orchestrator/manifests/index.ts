/**
 * Domain manifest index — the planner-facing surface. Everything that needs
 * tool metadata (planner, plan cards, risk gates, receipts, costs) resolves
 * through here, never by importing engine registries directly. When the
 * backend rewrite changes a tool surface, only the corresponding mount file
 * changes.
 */

import type { StudioCapability } from "@/lib/studio/contracts/objects";
import type { StudioDomainManifest, StudioToolManifest } from "@/lib/studio/contracts/manifest";
import { EDIT_DOMAIN_MANIFEST } from "./edit";
import { DESIGN_DOMAIN_MANIFEST } from "./design";
import { DISTRIBUTE_DOMAIN_MANIFEST } from "./distribute";
import { WRITE_DOMAIN_MANIFEST } from "./write";

const DOMAIN_MANIFESTS: Record<StudioCapability, StudioDomainManifest | null> = {
  write: WRITE_DOMAIN_MANIFEST,
  edit: EDIT_DOMAIN_MANIFEST,
  design: DESIGN_DOMAIN_MANIFEST,
  analyze: null, // Phase 5 — Alyzitron mount
  distribute: DISTRIBUTE_DOMAIN_MANIFEST,
};

export function getDomainManifests(): StudioDomainManifest[] {
  return Object.values(DOMAIN_MANIFESTS).filter((m): m is StudioDomainManifest => m !== null);
}

export function getDomainManifest(capability: StudioCapability): StudioDomainManifest | null {
  return DOMAIN_MANIFESTS[capability];
}

/** Look up one tool across all mounted manifests (planner convenience). */
export function findToolManifest(toolName: string): StudioToolManifest | null {
  for (const manifest of getDomainManifests()) {
    const tool = manifest.tools.find((t) => t.name === toolName);
    if (tool) return tool;
  }
  return null;
}
