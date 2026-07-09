import CalosBrandReferences from "@/schemas/calos-brand-references";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";

/**
 * Collect the brand's + (optionally) the card's campaign's IMAGE references as R2 URLs, to pass to
 * Clickatron image generation as visual guides (referenceImageRefs) — brand shots, product photos,
 * style refs. Best-effort (any miss returns fewer/no urls; never throws). Capped so we don't exceed the
 * model's reference-image limit or dilute the prompt. Brand refs first, then campaign refs.
 */
export async function collectImageReferenceUrls(
  brandId: string,
  campaignId?: string | null,
  cap = 4,
): Promise<string[]> {
  const urls: string[] = [];
  const pushImages = (refs: CalosCampaignReference[] | undefined) => {
    for (const r of refs ?? []) {
      if (r.type === "image" && r.url) urls.push(r.url);
    }
  };

  try {
    const brandDoc = await CalosBrandReferences.findOne({ brandId })
      .select("references")
      .lean<{ references?: CalosCampaignReference[] }>();
    pushImages(brandDoc?.references);
  } catch {
    /* best-effort — proceed without brand image refs */
  }

  if (campaignId) {
    try {
      const camp = await CalosCampaign.findOne({ _id: campaignId, brandId, deletedAt: null })
        .select("references")
        .lean<{ references?: CalosCampaignReference[] }>();
      pushImages(camp?.references);
    } catch {
      /* best-effort — bad id / miss → skip campaign image refs */
    }
  }

  return urls.slice(0, cap);
}
