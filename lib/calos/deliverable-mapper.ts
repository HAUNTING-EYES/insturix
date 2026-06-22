import type {
  ContentCard,
  ContentCardStatus,
} from "@/lib/thinkforge/planning/content-card-contract";
import type {
  CalosEditorialStatus,
  ICalosDeliverable,
} from "@/schemas/calos-deliverable";

/**
 * Map the legacy single ContentCard.status onto the CalOS editorial state machine.
 * (Delivery state — scheduled/published — lives in calos_scheduled_publishes, not here,
 * so legacy "scheduled"/"published" map to the editorial terminal "approved".)
 */
export function mapLegacyStatusToEditorial(status?: ContentCardStatus): CalosEditorialStatus {
  switch (status) {
    case "in_production":
      return "generated";
    case "scheduled":
    case "published":
      return "approved";
    case "draft":
    default:
      return "idea";
  }
}

export interface DeliverableScope {
  ownerUserId: string;
  orgId: string;
  brandId: string;
}

/** Persisted CalOS deliverable fields derived from a (validated) ContentCard. */
export function toDeliverableDoc(card: ContentCard, scope: DeliverableScope) {
  return {
    ownerUserId: scope.ownerUserId,
    orgId: scope.orgId,
    brandId: scope.brandId,
    campaignId: card.campaignId ?? null,
    editorialStatus: mapLegacyStatusToEditorial(card.status),
    plannedDates: card.plannedDates ?? (card.date ? [card.date] : []),
    platform: card.platform ?? "generic",
    card,
  };
}

type DeliverableProjection = Pick<
  ICalosDeliverable,
  "card" | "plannedDates" | "platform" | "brandId" | "campaignId"
>;

/**
 * Project a stored deliverable back into the ContentCard shape the calendar consumes.
 * Hoisted columns (plannedDates/platform/brandId/campaignId) are authoritative over the
 * embedded payload, since the API edits them at the top level.
 */
export function toContentCard(doc: DeliverableProjection): ContentCard {
  return {
    ...doc.card,
    plannedDates: doc.plannedDates ?? doc.card.plannedDates,
    platform: doc.platform ?? doc.card.platform,
    brandId: doc.brandId ?? doc.card.brandId,
    campaignId: doc.campaignId ?? doc.card.campaignId,
  };
}
