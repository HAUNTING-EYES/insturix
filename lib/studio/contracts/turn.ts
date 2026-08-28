/**
 * Vibe Content OS — turn protocol contracts (Phase 0)
 *
 * One SSE connection per turn. The orchestrator generalizes Editron's
 * chat/stream event shape (token | tool_start | tool_end | done | error,
 * parsed by ChatSseJsonParser) into a cross-capability protocol:
 *
 *   turn.received → turn.plan → (step.start → step.progress → step.done)*
 *                 → turn.done | turn.needs_clarification | turn.capability_gap
 *                 | turn.error | turn.interrupted
 *   (turn.confirm_required may pause the turn mid-flight; the client answers
 *    via POST /api/studio/turns/:id/confirm — spend/publish/destructive gates.)
 *
 * Honesty rules baked into the shapes:
 * - step.progress.percent is nullable — only real telemetry sets it, never a
 *   fabricated estimate.
 * - Receipts carry the tool's literal receiptLabel from the domain manifest.
 * - Outcomes are typed: done | needs-clarification | capability-gap. A turn
 *   never silently pretends success.
 * - Long steps queue (QStash) and stream progress; no inline serverless
 *   timeouts (the apply_editorial_intent lesson).
 */

import { z } from "zod";
import { StudioArtifactSchema, StudioCapabilitySchema } from "./objects";

/* ─── Request ─── */

export const StudioTurnClientContextSchema = z.object({
  /** which artifact the stage is showing, if any */
  focusedArtifactId: z.string().nullable().optional(),
  selectedArtifactId: z.string().nullable().optional(),
  /** current playback position for reel artifacts */
  timecodeMs: z.number().nullable().optional(),
  /** the spatial cursor — what the user is pointing at (Editron precedent) */
  spatialCursor: z
    .object({
      surface: z.enum(["stage", "timeline"]),
      x: z.number(),
      y: z.number(),
      frame: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type StudioTurnClientContext = z.infer<typeof StudioTurnClientContextSchema>;

export const StudioTurnRequestSchema = z.object({
  deliverableId: z.string(),
  threadId: z.string(),
  text: z.string().min(1),
  mode: z.enum(["ask", "direct"]).default("direct"),
  /** Phase 2: brand scope for server-side session binding (empty = first authorized) */
  brandId: z.string().nullable().optional(),
  clientContext: StudioTurnClientContextSchema.default({}),
  attachments: z.array(z.object({ ref: z.string(), role: z.string() })).default([]),
  mentions: z
    .array(z.object({ type: z.enum(["brand", "asset", "artifact"]), ref: z.string() }))
    .default([]),
  /** idempotency — same contract as Editron chat operations */
  operationId: z.string().uuid(),
  /**
   * Serverless confirm continuation: set when answering a prior turn's
   * turn.confirm_required. The server re-derives the quote deterministically
   * (never trusts a client-echoed price); this field is the YES signal.
   */
  confirmAcceptedQuoteId: z.string().nullable().optional(),
  /** accept-side of quote-less gates (publish): true = the yes signal */
  confirmAccepted: z.boolean().optional(),
});
export type StudioTurnRequest = z.infer<typeof StudioTurnRequestSchema>;

/* ─── Plan ─── */

export const StudioPlannedStepSchema = z.object({
  stepId: z.string(),
  capability: StudioCapabilitySchema,
  toolName: z.string(),
  label: z.string(),
  riskLevel: z.enum(["read", "low", "medium", "high"]),
  /** present when a pre-flight credit quote exists for this step */
  quotedCost: z.number().nullable().optional(),
});
export type StudioPlannedStep = z.infer<typeof StudioPlannedStepSchema>;

/* ─── Receipts ─── */

export const StudioStepReceiptSchema = z.object({
  /** literal receiptLabel from the domain manifest */
  label: z.string(),
  /** the tool's registry riskLevel — high-risk receipts render with undo */
  riskLevel: z.enum(["read", "low", "medium", "high"]).optional(),
  /** human detail line (counts, ranges, ids) — derived from real results */
  detail: z.string().optional(),
  /** artifacts this step created or mutated */
  artifactIds: z.array(z.string()).default([]),
  creditsConsumed: z.number().default(0),
});
export type StudioStepReceipt = z.infer<typeof StudioStepReceiptSchema>;

/* ─── SSE events (discriminated on `type`) ─── */

export const StudioTurnEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("turn.received"),
    turnId: z.string(),
    deliverableId: z.string(),
  }),
  z.object({
    type: z.literal("turn.plan"),
    turnId: z.string(),
    planId: z.string(),
    summary: z.string(),
    steps: z.array(StudioPlannedStepSchema),
  }),
  z.object({
    type: z.literal("step.start"),
    turnId: z.string(),
    stepId: z.string(),
    toolName: z.string(),
    /** first loading message from the manifest's loadingMessages rotation */
    loadingMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal("step.progress"),
    turnId: z.string(),
    stepId: z.string(),
    /** real stage name from telemetry (e.g. "stage 2/4 · variations") */
    stage: z.string().optional(),
    /** NULL unless the engine reports a true percent */
    percent: z.number().nullable().default(null),
  }),
  z.object({
    type: z.literal("step.done"),
    turnId: z.string(),
    stepId: z.string(),
    receipt: StudioStepReceiptSchema,
  }),
  z.object({
    type: z.literal("step.error"),
    turnId: z.string(),
    stepId: z.string(),
    message: z.string(),
    retryable: z.boolean().default(true),
    refundIssued: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("turn.needs_clarification"),
    turnId: z.string(),
    /** exactly one question */
    question: z.string(),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          detail: z.string().optional(),
        }),
      )
      .min(2),
  }),
  z.object({
    type: z.literal("turn.capability_gap"),
    turnId: z.string(),
    /** named reason, never silent */
    reason: z.string(),
    alternative: z
      .object({
        description: z.string(),
        /** optional alternate path the agent CAN run now */
        proposedSteps: z.array(StudioPlannedStepSchema).default([]),
      })
      .nullable()
      .optional(),
  }),
  z.object({
    type: z.literal("turn.confirm_required"),
    turnId: z.string(),
    stepId: z.string(),
    kind: z.enum(["spend", "publish", "destructive"]),
    /** present for kind=spend */
    quote: z.string().nullable().optional(), // TurnCostQuote serialized
    /** present for kind=publish */
    publishTargets: z
      .array(z.object({ platform: z.string(), scheduledAt: z.string().datetime() }))
      .default([]),
  }),
  z.object({
    type: z.literal("turn.done"),
    turnId: z.string(),
    summary: z.string(),
    creditsConsumedTotal: z.number().default(0),
    artifactIds: z.array(z.string()).default([]),
    /** Phase 2: full artifact payload when the turn created/changed one
     *  (written content rides here so the client can render immediately) */
    artifactPayload: StudioArtifactSchema.nullable().optional(),
    /** next stage focus, if the agent moved the stage */
    stageFocus: z
      .object({ artifactId: z.string(), why: z.string() })
      .nullable()
      .optional(),
  }),
  z.object({
    type: z.literal("turn.error"),
    turnId: z.string(),
    message: z.string(),
    retryable: z.boolean().default(true),
    refundIssued: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("turn.interrupted"),
    turnId: z.string(),
    reason: z.enum(["user_cancel", "superseded", "connection_lost"]),
  }),
]);
export type StudioTurnEvent = z.infer<typeof StudioTurnEventSchema>;

/* ─── Confirm answer (pauses the turn until this arrives) ─── */

export const StudioTurnConfirmAnswerSchema = z.object({
  accepted: z.boolean(),
  /** optional adjustment, e.g. "make 3 variations instead of 6" */
  adjustment: z.string().nullable().optional(),
});
export type StudioTurnConfirmAnswer = z.infer<typeof StudioTurnConfirmAnswerSchema>;

/* ─── Interrupt (cooperative cancel; refund semantics per-tool) ─── */

export const StudioTurnInterruptSchema = z.object({
  reason: z.enum(["user_cancel", "superseded"]).default("user_cancel"),
});
export type StudioTurnInterrupt = z.infer<typeof StudioTurnInterruptSchema>;
