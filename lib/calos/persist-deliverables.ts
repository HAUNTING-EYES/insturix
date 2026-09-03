import CalosDeliverable from "@/schemas/calos-deliverable";
import { toDeliverableDoc } from "./deliverable-mapper";
import {
  normalizeContentCardForStorage,
  contentCardClientView,
  type ContentCard,
} from "@/lib/thinkforge/planning/content-card-contract";

/** Normalize + persist draft ContentCards as CalOS deliverables (editorial 'idea'). Single write
 * path for auto-fill + ai-plan, so the scoping/normalize contract lives in one place (add orgId,
 * change validation, etc. once instead of twice). Returns the inserted deliverable ids — callers
 * that only need the count use `.length`. */
export async function persistDraftDeliverables(
  partials: Partial<ContentCard>[],
  scope: { userId: string; brandId: string; orgId?: string | null },
): Promise<string[]> {
  if (partials.length === 0) return [];
  const docs = partials.map((p) => {
    const normalized = normalizeContentCardForStorage(p, { userId: scope.userId });
    const card = contentCardClientView(normalized);
    return toDeliverableDoc(card, {
      ownerUserId: scope.userId,
      brandId: scope.brandId,
      // Phase D: stamp the creator's session org so teammates see auto-filled / AI-planned drafts.
      orgId: scope.orgId ?? null,
    });
  });
  const inserted = await CalosDeliverable.insertMany(docs);
  return inserted.map((d) => String(d._id));
}
