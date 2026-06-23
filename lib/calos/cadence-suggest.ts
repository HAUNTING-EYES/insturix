import type { UnifiedBrand } from "@/lib/shared/brand-registry";
import { DEFAULT_CADENCE, type CadenceRuleInput } from "./cadence";

/**
 * Suggest a starting weekly cadence (how many posts on which platforms) for a brand. The user
 * always confirms or edits it — this is a starting point, not a mandate.
 *
 * ponytail: a niche -> typical-mix table, NOT a research doc or an LLM call. It reads the brand's
 * industry/niche and returns a sensible posting mix. Tune these from real performance later, or
 * upgrade to an LLM suggester if the table proves too generic.
 */
const BY_NICHE: { match: RegExp; rules: CadenceRuleInput[] }[] = [
  {
    // B2B / software / dev tools -> LinkedIn-led, Twitter support
    match: /saas|b2b|software|developer|dev[\s-]?tool|engineering|fintech|api|platform|tech\b/i,
    rules: [
      { platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] },
      { platform: "twitter", perWeek: 2, preferredDays: [2, 4] },
    ],
  },
  {
    // DTC / retail / food / hospitality -> visual-led
    match: /skincare|beauty|fashion|apparel|dtc|e-?commerce|retail|food|cafe|coffee|restaurant|hospitality|cpg/i,
    rules: [
      { platform: "instagram", perWeek: 4, preferredDays: [1, 2, 4, 6] },
      { platform: "tiktok", perWeek: 3, preferredDays: [3, 5, 0] },
    ],
  },
  {
    // creators / coaching / education / wellness -> multi-platform short video
    match: /fitness|coach|wellness|health|creator|education|course|tutorial|nutrition|mindset/i,
    rules: [
      { platform: "instagram", perWeek: 3, preferredDays: [1, 3, 5] },
      { platform: "tiktok", perWeek: 3, preferredDays: [2, 4, 6] },
      { platform: "youtube", perWeek: 1, preferredDays: [0] },
    ],
  },
];

export function suggestCadence(brand: UnifiedBrand | null): {
  rules: CadenceRuleInput[];
  rationale: string;
} {
  const haystack = `${brand?.visual.industry ?? ""} ${brand?.voice.nicheMap ?? ""}`.trim();
  const hit = haystack ? BY_NICHE.find((b) => b.match.test(haystack)) : undefined;

  if (hit) {
    return {
      rules: hit.rules.map((r) => ({ ...r, preferredDays: [...r.preferredDays] })),
      rationale: `Suggested for ${brand?.visual.industry || brand?.voice.nicheMap || "your niche"} — confirm or tweak the mix.`,
    };
  }
  return {
    rules: DEFAULT_CADENCE.map((r) => ({ ...r, preferredDays: [...r.preferredDays] })),
    rationale: "Starter cadence — confirm or tweak the mix.",
  };
}
