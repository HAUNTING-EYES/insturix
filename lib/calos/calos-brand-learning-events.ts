import {
  createBrandSignalLearningEvent,
  type BrandSignalLearningEvent,
} from "@/lib/shared/brand-signal-edit-weighting";

export type CalosDecision = "approved" | "rejected" | "changes_requested";

export interface CalosDecisionLearningInput {
  userId: string;
  brandId: string;
  campaignId?: string | null;
  contentId: string; // the card.id the decision was made on
  title: string; // the idea/hook being judged — the evidence
  decision: CalosDecision;
  observedAt: string; // ISO timestamp
  notes?: string;
}

/**
 * Map a CalOS editorial decision to a brand-signal learning event. Approving a card affirms its
 * idea/hook as on-brand (accepted_output_confirmation / affirm); requesting changes or rejecting
 * marks it a rejected candidate (rejected_candidate / reject — the stronger signal). The card title
 * is the evidence.
 *
 * The event is staged as a DRAFT in the brand vault by the existing brand-learning worker and only
 * sharpens the accepted brand profile after a human reviews it; repeated decisions on similar ideas
 * accrue weight while one-off noise is filtered at that review. CalOS rides ThinkForge's lane.
 *
 * v1 maps to a single signal (voice.hookArchetypes). Richer per-signal extraction (which voice /
 * audience signal a given card teaches) is the next refinement — see the generation+learning plan.
 */
export function createCalosDecisionLearningEvent(
  input: CalosDecisionLearningInput,
): BrandSignalLearningEvent {
  const affirmed = input.decision === "approved";
  return createBrandSignalLearningEvent({
    service: "thinkforge",
    signalPath: "voice.hookArchetypes",
    editType: affirmed ? "accepted_output_confirmation" : "rejected_candidate",
    scope: "project",
    polarity: affirmed ? "affirm" : "reject",
    observedAt: input.observedAt,
    actorId: input.userId,
    context: {
      userId: input.userId,
      brandId: input.brandId,
      campaignId: input.campaignId ?? undefined,
      contentId: input.contentId,
    },
    afterValue: input.title,
    note: input.notes,
  });
}
