import CalosBrandReferences from "@/schemas/calos-brand-references";
import CalosCampaign, { type CalosCampaignReference } from "@/schemas/calos-campaign";
import { calosScope } from "@/lib/calos/scope";

/**
 * Collect the brand's + (optionally) the card's campaign's IMAGE references as R2 URLs, to pass to
 * Clickatron image generation as visual guides (referenceImageRefs) — brand shots, product photos,
 * style refs. Best-effort (any miss returns fewer/no urls; never throws). Capped so we don't exceed the
 * model's reference-image limit or dilute the prompt. Brand refs first, then campaign refs. A bare
 * brandId is never sufficient: references are read only through the caller's authorized CalOS scope.
 */
export interface CollectImageReferenceParams {
  brandId: string;
  campaignId?: string | null;
  userId: string;
  orgId?: string | null;
  cap?: number;
}

export async function collectImageReferenceUrls(
  { brandId, campaignId, userId, orgId, cap = 4 }: CollectImageReferenceParams,
): Promise<string[]> {
  if (!brandId || !userId) return [];
  const urls: string[] = [];
  const pushImages = (refs: CalosCampaignReference[] | undefined) => {
    for (const r of refs ?? []) {
      if (r.type === "image" && r.status === "ready" && r.url) urls.push(r.url);
    }
  };
  const scope = calosScope({ userId, orgId }, brandId);

  try {
    const brandDoc = await CalosBrandReferences.findOne(scope)
      .select("references")
      .lean<{ references?: CalosCampaignReference[] }>();
    pushImages(brandDoc?.references);
  } catch {
    /* best-effort — proceed without brand image refs */
  }

  if (campaignId) {
    try {
      const camp = await CalosCampaign.findOne({ _id: campaignId, ...scope, deletedAt: null })
        .select("references")
        .lean<{ references?: CalosCampaignReference[] }>();
      pushImages(camp?.references);
    } catch {
      /* best-effort — bad id / miss → skip campaign image refs */
    }
  }

  return urls.slice(0, cap);
}
