/**
 * Campaign intent layer. A campaign is driven by its OBJECTIVE, not by trends — the objective sets
 * the funnel emphasis and content mix that the planner balances the month across. A trend is an
 * optional top-of-funnel garnish, never the foundation.
 *
 * Frameworks behind the briefs: the TOFU/MOFU/BOFU funnel, the rule-of-thirds / 5:3:2 content mix,
 * and Hero/Hub/Hygiene (content by function). These are starting guidance the user can override.
 */
export const CALOS_OBJECTIVES = [
  "awareness",
  "engagement",
  "conversion",
  "retention",
  "launch",
] as const;
export type CalosObjective = (typeof CALOS_OBJECTIVES)[number];

export const FUNNEL_STAGES = ["tofu", "mofu", "bofu"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const DEFAULT_OBJECTIVE: CalosObjective = "awareness";

export function isCalosObjective(v: unknown): v is CalosObjective {
  return typeof v === "string" && (CALOS_OBJECTIVES as readonly string[]).includes(v);
}

export function isFunnelStage(v: unknown): v is FunnelStage {
  return typeof v === "string" && (FUNNEL_STAGES as readonly string[]).includes(v);
}

/** Objective -> a short brief the planner follows: funnel emphasis + content mix. */
const BRIEFS: Record<CalosObjective, string> = {
  awareness:
    "Reach new people. Weight the TOP of funnel (mostly tofu). ~70% educational/entertaining (Hero + Hub), ~20% community/conversation, ~10% soft promo. Few hard CTAs.",
  engagement:
    "Deepen the relationship with the existing audience. Weight the MIDDLE (mostly mofu). ~50% interactive/community, ~35% educational, ~15% promo.",
  conversion:
    "Drive action. Weight the BOTTOM of funnel. ~40% educational (tofu/mofu), ~25% proof / case study (mofu), ~25% offers / CTAs (bofu), ~10% community.",
  retention:
    "Keep existing customers. Speak to people who already bought: ~50% education that deepens usage, ~30% community/celebration, ~20% loyalty/upsell.",
  launch:
    "Launch something. Arc the period: tease (tofu) early, reveal in the middle, amplify with proof + CTA (mofu/bofu) late. Favor original Hero content over curated.",
};

export function intentBriefFor(objective: CalosObjective): string {
  return BRIEFS[objective];
}
