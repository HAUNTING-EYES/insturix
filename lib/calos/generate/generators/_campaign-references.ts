import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";

/**
 * Resolve a campaign's ingested reference material into a prompt block the CalOS writers generate FROM
 * (Phase B — the payoff for the references captured in Phase A). Only `ready` references that carry
 * IngestorAgent-derived facts contribute; the block is appended to the writer's userPrompt so posts and
 * scripts are grounded in the user's actual source material, not just the brand voice.
 *
 * Best-effort by contract: no campaign, no ready references, or a DB error all return "" so generation
 * proceeds reference-less (a missing reference must never fail a write). Scoped by campaignId + brandId
 * — the campaignId comes from the trusted deliverable, and the brandId match prevents cross-brand bleed.
 */
export async function resolveCampaignReferenceBlock(
  campaignId: string | null | undefined,
  brandId: string,
): Promise<string> {
  if (!campaignId) return "";
  try {
    await connectToDatabase();
    let campaign: { references?: CalosCampaignReference[] } | null = null;
    try {
      campaign = await CalosCampaign.findOne({ _id: campaignId, brandId, deletedAt: null })
        .select("references")
        .lean<{ references?: CalosCampaignReference[] }>();
    } catch {
      return ""; // bad ObjectId etc. — proceed reference-less
    }

    const refs = (campaign?.references ?? []).filter((r) => r.status === "ready" && r.ingested);
    if (!refs.length) return "";

    const blocks = refs.map((r) => {
      const facts = (r.ingested?.atomicFacts ?? []).slice(0, 12).map((f) => `- ${f}`).join("\n");
      const hooks = (r.ingested?.viralHooks ?? []).slice(0, 6).join(" | ");
      const parts = [`Source: ${r.name}`];
      if (r.ingested?.summary) parts.push(r.ingested.summary);
      if (facts) parts.push(`Facts:\n${facts}`);
      if (hooks) parts.push(`Hooks to consider: ${hooks}`);
      return parts.join("\n");
    });

    return (
      `\n\n<reference_material>\n` +
      `Ground this in the campaign's source materials below — prefer their specifics over generic claims, ` +
      `and never invent facts that contradict them:\n\n` +
      `${blocks.join("\n\n")}\n` +
      `</reference_material>`
    );
  } catch {
    return "";
  }
}
