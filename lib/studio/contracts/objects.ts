/**
 * Vibe Content OS — core object contracts (Phase 0)
 *
 * The unified object model: Deliverable → Artifacts + typed Edges + one Thread.
 * These zod schemas are the single source of truth shared by the turn
 * orchestrator, the adapter layer, and the studio UI. They are VERSIONED:
 * bump STUDIO_CONTRACTS_VERSION on any breaking change.
 *
 * Grounding decisions (see docs/contracts/PHASE0_CONTRACTS.md):
 * - Artifact kinds are coarser than ThinkForge's 14 OutputFormats; the
 *   written family maps via `artifactKindForOutputFormat` below.
 * - Artifact status is the 8 designed honesty states. `offline` is
 *   transport-derived (set client-side when the queue is unreachable);
 *   servers never persist it.
 * - Status names intentionally do NOT reuse CalOS editorial stages; the
 *   adapter maps EDITORIAL_STAGE_META statuses into these (mapping in the doc).
 */

import { z } from "zod";

export const STUDIO_CONTRACTS_VERSION = "0.2.0" as const;

/* ─── Artifacts ─── */

/** What an artifact IS. Written family is format-agnostic (see OutputFormat mapping). */
export const StudioArtifactKindSchema = z.enum([
  "script", // written deliverable text (any of the 14 output formats)
  "reel", // editron project (video)
  "storyboard", // scene-by-scene pre-production on the script→reel edge
  "thumbnail", // committed clickatron canvas attached to a reel
  "image_canvas", // clickatron canvas session (standalone or carousel)
  "carousel", // multi-slide image set (partial support today — surfaced honestly)
  "audio", // voiceover / tts / dubbing output
  "music", // musitron task
  "analysis", // alyzitron report
  "schedule", // calos deliverable (publishing plan)
  "avatar_video", // avatar vault render output
  "post", // a published/scheduled platform post
]);
export type StudioArtifactKind = z.infer<typeof StudioArtifactKindSchema>;

/** The 8 designed states — acceptance criteria, the UI never lies. */
export const StudioArtifactStatusSchema = z.enum([
  "empty", // a starting prompt, never a blank canvas
  "queued", // waiting on an upstream artifact or a slot
  "streaming", // live agent output (never a fake percent)
  "running", // durable job with real stage/telemetry
  "done", // has a literal receipt
  "error", // inline message + retry, never error-as-empty
  "stale", // upstream changed; flagged, not hidden
  "offline", // transport state, client-side only, never persisted
]);
export type StudioArtifactStatus = z.infer<typeof StudioArtifactStatusSchema>;

export const StudioCapabilitySchema = z.enum([
  "write",
  "edit",
  "design",
  "analyze",
  "distribute",
]);
export type StudioCapability = z.infer<typeof StudioCapabilitySchema>;

export const StudioArtifactRevisionSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  /** checkpoint id restorable via the engine's checkpoint system, when the engine supports one */
  checkpointRef: z.string().nullable().optional(),
  summary: z.string(),
});
export type StudioArtifactRevision = z.infer<typeof StudioArtifactRevisionSchema>;

export const StudioArtifactSchema = z.object({
  id: z.string(),
  kind: StudioArtifactKindSchema,
  status: StudioArtifactStatusSchema,
  title: z.string(),
  /** engine-native reference — the adapter's key back to the source object */
  sourceRef: z.object({
    engine: z.enum([
      "thinkforge",
      "editron",
      "clickatron",
      "alyzitron",
      "calos",
      "uploaderx",
      "musitron",
      "avatar-vault",
      "pipeline",
    ]),
    /** engine's own id (projectId, sessionId, taskId, deliverableId, …) */
    externalId: z.string(),
    /** deep link for the manual-control escape hatch, if one exists */
    manualHref: z.string().nullable().optional(),
  }),
  /** real telemetry only; null means honestly unknown — never fabricate */
  progress: z
    .object({
      stage: z.string(),
      percent: z.number().nullable(),
    })
    .nullable()
    .optional(),
  revisions: z.array(StudioArtifactRevisionSchema).default([]),
  /** Phase 2: rendered payload for written artifacts (markdown from the engine) */
  contentMarkdown: z.string().optional(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type StudioArtifact = z.infer<typeof StudioArtifactSchema>;

/* ─── Edges ─── */

export const StudioEdgeKindSchema = z.enum([
  "derived_from", // artifact B was produced from artifact A
  "stale_if", // when A changes, B must be flagged stale
  "attaches_to", // B is attached onto A (thumbnail onto reel, post onto schedule)
]);
export type StudioEdgeKind = z.infer<typeof StudioEdgeKindSchema>;

export const StudioEdgeSchema = z.object({
  id: z.string(),
  kind: StudioEdgeKindSchema,
  fromArtifactId: z.string(),
  toArtifactId: z.string(),
  createdAt: z.string().datetime(),
});
export type StudioEdge = z.infer<typeof StudioEdgeSchema>;

/* ─── Stage focus (the auto-following stage) ─── */

export const StudioStageFocusSchema = z.object({
  artifactId: z.string(),
  /** why the stage moved — shown in the "Now showing · why" line */
  reason: z.enum(["agent_working", "user_asked", "artifact_changed"]),
  why: z.string(),
  since: z.string().datetime(),
});
export type StudioStageFocus = z.infer<typeof StudioStageFocusSchema>;

/* ─── Deliverable ─── */

export const StudioDeliverableSchema = z.object({
  id: z.string(),
  title: z.string(),
  brandId: z.string(),
  orgId: z.string().nullable().optional(),
  /** campaigns stay an optional strategic overlay, never a required tier */
  campaignId: z.string().nullable().optional(),
  threadId: z.string(),
  artifacts: z.array(StudioArtifactSchema).default([]),
  edges: z.array(StudioEdgeSchema).default([]),
  stageFocus: StudioStageFocusSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StudioDeliverable = z.infer<typeof StudioDeliverableSchema>;

/* ─── Thread items (what renders in the conversation) ─── */

export const StudioThreadItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user"),
    id: z.string(),
    text: z.string(),
    attachments: z.array(z.object({ ref: z.string(), role: z.string() })).default([]),
    mentions: z.array(z.object({ type: z.enum(["brand", "asset", "artifact"]), ref: z.string() })).default([]),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("prose"),
    id: z.string(),
    text: z.string(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("plan"),
    id: z.string(),
    turnId: z.string(),
    summary: z.string(),
    steps: z.array(
      z.object({
        id: z.string(),
        capability: StudioCapabilitySchema,
        toolName: z.string(), // REAL tool name from the domain manifest
        label: z.string(),
        riskLevel: z.enum(["read", "low", "medium", "high"]),
        state: z.enum(["pending", "running", "done", "error", "skipped"]),
      }),
    ),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("artifact_born"),
    id: z.string(),
    artifactIds: z.array(z.string()),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("receipt"),
    id: z.string(),
    /** the tool's literal receiptLabel — never paraphrased */
    label: z.string(),
    detail: z.string().optional(),
    creditsConsumed: z.number().optional(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("quick_replies"),
    id: z.string(),
    options: z.array(z.string()),
    createdAt: z.string().datetime(),
  }),
]);
export type StudioThreadItem = z.infer<typeof StudioThreadItemSchema>;

/* ─── OutputFormat → artifact kind (written family) ─── */

import type { OutputFormat } from "@/lib/shared/signals/types";

const OUTPUT_FORMAT_TO_ARTIFACT_KIND: Record<OutputFormat, "script"> = {
  video_script: "script",
  social_post: "script",
  blog_article: "script",
  email: "script",
  ad_copy: "script",
  presentation_script: "script",
  podcast_script: "script",
  newsletter: "script",
  product_description: "script",
  case_study: "script",
  press_release: "script",
  landing_page: "script",
  caption: "script",
  whitepaper: "script",
};

/** A written artifact is a `script` artifact whose format lives in its source payload. */
export function artifactKindForOutputFormat(format: OutputFormat): "script" {
  return OUTPUT_FORMAT_TO_ARTIFACT_KIND[format];
}
