import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";
import CalosBrandReferences from "@/schemas/calos-brand-references";

/**
 * Resolve the reference material the CalOS writers generate FROM (Phase B — the payoff for uploaded
 * references). Pulls BOTH:
 *   - BRAND references (always, by brandId) — the baseline, so references work even with no campaign, and
 *   - CAMPAIGN references (when the card belongs to a campaign) — layered on top.
 * Only `ready` references with IngestorAgent-derived facts contribute; the merged block is appended to
 * the writer's userPrompt so posts/scripts are grounded in the user's actual source material.
 *
 * Best-effort by contract: any miss/error returns "" so generation proceeds reference-less (a missing
 * reference must never fail a write). brandId is trusted from the deliverable; the campaignId match
 * prevents cross-brand bleed.
 */

type RefDoc = { references?: CalosCampaignReference[] } | null;

const readyRefs = (refs: CalosCampaignReference[] | undefined): CalosCampaignReference[] =>
  (refs ?? []).filter((r) => r.status === "ready" && r.ingested);

function formatReference(r: CalosCampaignReference): string {
  const facts = (r.ingested?.atomicFacts ?? []).slice(0, 12).map((f) => `- ${f}`).join("\n");
  const hooks = (r.ingested?.viralHooks ?? []).slice(0, 6).join(" | ");
  const parts = [`Source: ${r.name}`];
  if (r.ingested?.summary) parts.push(r.ingested.summary);
  if (facts) parts.push(`Facts:\n${facts}`);
  if (hooks) parts.push(`Hooks to consider: ${hooks}`);
  return parts.join("\n");
}

export async function resolveReferenceBlock(
  campaignId: string | null | undefined,
  brandId: string,
): Promise<string> {
  if (!brandId) return "";
  try {
    await connectToDatabase();
    const [brandDoc, campaignDoc] = await Promise.all([
      CalosBrandReferences.findOne({ brandId }).select("references").lean<RefDoc>().catch(() => null),
      campaignId
        ? CalosCampaign.findOne({ _id: campaignId, brandId, deletedAt: null }).select("references").lean<RefDoc>().catch(() => null)
        : Promise.resolve<RefDoc>(null),
    ]);

    const refs = [...readyRefs(brandDoc?.references), ...readyRefs(campaignDoc?.references)];
    if (!refs.length) return "";

    return (
      `\n\n<reference_material>\n` +
      `Ground this in the source materials below — prefer their specifics over generic claims, and ` +
      `never invent facts that contradict them:\n\n` +
      `${refs.map(formatReference).join("\n\n")}\n` +
      `</reference_material>`
    );
  } catch {
    return "";
  }
}
