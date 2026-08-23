/**
 * Vibe Content OS — pre-flight credit quote contracts (Phase 0)
 *
 * Today credits surface post-failure (402 bubbles). The vibe surface moves
 * economics PRE-FLIGHT: the orchestrator quotes before a generative step,
 * the thread shows a confirm-before-spend card, and only then does the step
 * run. Mirrors lib/config/creditCosts.ts semantics exactly:
 * - 30 credits = 1 USD; pools main | media (MEDIA_POOL_ACTIONS)
 * - modelMultipliers and requestTypeMultipliers multiply baseCost
 * - consumption order: subscription credits first, then top-ups
 * - org wallet pooling when ORG_WALLET_BILLING is on and the deliverable is
 *   org-owned (wallet=auto precedent from useCredits)
 */

import { z } from "zod";

export const STUDIO_CREDIT_POOL_SCHEMA = z.enum(["main", "media"]);
export type StudioCreditPool = z.infer<typeof STUDIO_CREDIT_POOL_SCHEMA>;

export const StudioCostLineSchema = z.object({
  /** service.action key into CREDIT_COSTS */
  service: z.string(),
  action: z.string(),
  pool: STUDIO_CREDIT_POOL_SCHEMA,
  unitCost: z.number(),
  quantity: z.number().int().positive(),
  /** applied model/request-type multiplier, 1 when none */
  multiplier: z.number().default(1),
  subtotal: z.number(),
  /** human line for the confirm card, e.g. "6 variations · flux" */
  display: z.string(),
});
export type StudioCostLine = z.infer<typeof StudioCostLineSchema>;

export const StudioTurnCostQuoteSchema = z.object({
  quoteId: z.string(),
  turnId: z.string(),
  stepId: z.string(),
  lines: z.array(StudioCostLineSchema).min(1),
  totalByPool: z.object({
    main: z.number(),
    media: z.number(),
  }),
  /** quotes expire so stale confirms can't execute old prices */
  expiresAt: z.string().datetime(),
});
export type StudioTurnCostQuote = z.infer<typeof StudioTurnCostQuoteSchema>;

/** Wallet snapshot rendered on the confirm card next to the ask. */
export const StudioWalletSnapshotSchema = z.object({
  main: z.number(),
  media: z.number(),
  /** true when org wallet pooling applies to this deliverable */
  orgScoped: z.boolean().default(false),
  orgName: z.string().nullable().optional(),
});
export type StudioWalletSnapshot = z.infer<typeof StudioWalletSnapshotSchema>;

export const StudioSpendConfirmCardSchema = z.object({
  quote: StudioTurnCostQuoteSchema,
  wallet: StudioWalletSnapshotSchema,
  sufficient: z.boolean(),
  /** when insufficient: the top-up seam (account shell), not a dead end */
  topUpHref: z.string().default("/account/billing"),
});
export type StudioSpendConfirmCard = z.infer<typeof StudioSpendConfirmCardSchema>;
