import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";
import CalosBrandReferences from "@/schemas/calos-brand-references";
import { calosScope } from "@/lib/calos/scope";
import type { SemanticFact } from "@/lib/thinkforge/context";

type RefDoc = { references?: CalosCampaignReference[] } | null;
type ReferenceScope = "brand" | "campaign";

export interface CalosReferenceEvidenceParams {
  campaignId?: string | null;
  brandId: string;
  ownerUserId: string;
  orgId?: string | null;
}

export const MAX_CALOS_WRITING_REFERENCES = 60;
const MAX_REFERENCE_EVIDENCE_CHARS = 4_000;

function cleanEvidence(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readyReferences(refs: CalosCampaignReference[] | undefined): CalosCampaignReference[] {
  return (refs ?? []).filter((reference) => reference.status === "ready" && reference.ingested);
}

function referenceFact(reference: CalosCampaignReference, scope: ReferenceScope): SemanticFact | null {
  const evidence = Array.from(new Set([
    cleanEvidence(reference.ingested?.summary),
    ...(reference.ingested?.atomicFacts ?? []).map(cleanEvidence),
  ].filter(Boolean)));
  if (evidence.length === 0) return null;

  const summary = evidence.join("\n");
  if (summary.length > MAX_REFERENCE_EVIDENCE_CHARS) {
    throw new Error(
      `CalOS ${scope} reference ${reference.id} exceeds ${MAX_REFERENCE_EVIDENCE_CHARS} evidence characters.`,
    );
  }

  return {
    id: `calos_${scope}_${reference.id}`,
    title: cleanEvidence(reference.name) || `${scope} reference ${reference.id}`,
    summary,
    tags: ["calos-reference", `${scope}-reference`, reference.type],
    ...(cleanEvidence(reference.url) ? { source: cleanEvidence(reference.url) } : {}),
  };
}

/**
 * Return ACL-scoped writing evidence as typed facts. Infrastructure failures are intentionally
 * propagated: silently dropping user-supplied evidence would produce a different document than
 * the one the user authorized.
 */
export async function resolveCalosReferenceFacts(
  { campaignId, brandId, ownerUserId, orgId }: CalosReferenceEvidenceParams,
): Promise<SemanticFact[]> {
  const canonicalBrandId = brandId.trim();
  const canonicalOwnerUserId = ownerUserId.trim();
  if (!canonicalBrandId || !canonicalOwnerUserId) {
    throw new Error("CalOS reference evidence requires an authenticated owner and selected brand.");
  }

  await connectToDatabase();
  const scope = calosScope(
    { userId: canonicalOwnerUserId, orgId },
    canonicalBrandId,
  );
  const [brandDoc, campaignDoc] = await Promise.all([
    CalosBrandReferences.findOne(scope).select("references").lean<RefDoc>(),
    campaignId
      ? CalosCampaign.findOne({ _id: campaignId, ...scope, deletedAt: null })
          .select("references")
          .lean<RefDoc>()
      : Promise.resolve<RefDoc>(null),
  ]);

  const facts = [
    ...readyReferences(brandDoc?.references).map((reference) => referenceFact(reference, "brand")),
    ...readyReferences(campaignDoc?.references).map((reference) => referenceFact(reference, "campaign")),
  ].filter((fact): fact is SemanticFact => fact !== null);

  if (facts.length > MAX_CALOS_WRITING_REFERENCES) {
    throw new Error(
      `CalOS generation supports at most ${MAX_CALOS_WRITING_REFERENCES} ready writing references per deliverable.`,
    );
  }
  return facts;
}
