/**
 * Vibe Content OS — domain manifest contracts (Phase 0)
 *
 * Generalizes lib/editron/agent/chat-tool-registry.ts to all five
 * capabilities. Each capability declares its tools + its canvas (stage view)
 * + the artifact kinds it produces. The orchestrator plans turns against
 * these manifests; the UI renders plan steps, receipts, loading rotations,
 * and risk-driven confirm gates from the same data. One authority: the
 * manifest IS the spec the rewritten backend must fulfill.
 *
 * Registry fields intentionally mirror the Editron contract names so the
 * 67 existing entries can be mounted mechanically (Phase 3).
 */

import { z } from "zod";
import { StudioArtifactKindSchema, StudioCapabilitySchema } from "./objects";

export const STUDIO_STAGE_VIEW_SCHEMA = z.enum([
  "script", // written artifact editor (Tiptap embed) + AV view
  "reel", // editor v2 shell embed: monitor + timeline + transport
  "canvas", // clickatron canvas embed: variations, sketch, fill
  "analyze", // scorecard + timestamped player seek
  "schedule", // calendar + delivery states + review rail
  "audio", // musitron generation + DAW escape hatch
  "storyboard", // scene approve/regenerate cards
  "avatar", // persona render pipeline view
]);
export type StudioStageView = z.infer<typeof STUDIO_STAGE_VIEW_SCHEMA>;

export const StudioToolRiskLevelSchema = z.enum(["read", "low", "medium", "high"]);
export const StudioToolExecutionTypeSchema = z.enum(["quick", "generative"]);

/** One tool as the planner + UI see it. */
export const StudioToolManifestSchema = z.object({
  /** the real tool name — verbatim from the engine (e.g. cut_section, cadence-suggest) */
  name: z.string(),
  label: z.string(),
  shortLabel: z.string(),
  iconCategory: z.string(),
  riskLevel: StudioToolRiskLevelSchema,
  executionType: StudioToolExecutionTypeSchema,
  /** literal receipt string — rendered in thread receipts as-is */
  receiptLabel: z.string(),
  /** rotating loading messages for generative tools */
  loadingMessages: z.array(z.string()).default([]),
  /** one line: when the planner reaches for this */
  whenToUse: z.string(),
  /** credit cost reference into lib/config/creditCosts.ts (service.action) */
  costRef: z
    .object({
      service: z.string(),
      action: z.string(),
    })
    .nullable()
    .optional(),
  /** artifact kinds this tool can create or mutate */
  produces: z.array(StudioArtifactKindSchema).default([]),
  /** tools hidden from live turns (shadow-authority-filtered precedent) */
  exposure: z.enum(["live", "shadow-authority-filtered", "operator-only"]).default("live"),
});
export type StudioToolManifest = z.infer<typeof StudioToolManifestSchema>;

/** One capability domain. Five of these exist; the orchestrator loads all five. */
export const StudioDomainManifestSchema = z.object({
  capability: StudioCapabilitySchema,
  /** the stage view this capability's artifacts render in */
  stageView: STUDIO_STAGE_VIEW_SCHEMA,
  /** artifact kinds this capability owns */
  artifactKinds: z.array(StudioArtifactKindSchema),
  tools: z.array(StudioToolManifestSchema),
});
export type StudioDomainManifest = z.infer<typeof StudioDomainManifestSchema>;

/* ─── Risk policy (drives the confirm gates; single owner) ─── */

/**
 * The planner ranks, licenses, and plans; it MUST NOT duplicate final render
 * form (durations, keyframes, styles) — those belong to engine tools. These
 * policy constants are the ONLY planner-level authority over gating.
 */
export const STUDIO_RISK_POLICY = {
  /** risk levels that ALWAYS require turn.confirm_required before executing */
  alwaysConfirm: ["high"] as const,
  /** generative tools with a costRef require a spend quote + confirm */
  confirmGenerativeSpend: true,
  /** publishing requires its own hard gate regardless of tool risk */
  confirmPublish: true,
} as const;
