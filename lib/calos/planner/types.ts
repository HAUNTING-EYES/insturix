import type { Trend } from "../trends/types";
import type { CalosObjective, FunnelStage } from "../campaign-intent";

/**
 * One scheduled slot the planner must fill with an idea. Produced by the cadence engine
 * (date + platform are the authoritative schedule — the planner never changes them).
 */
export interface PlannerSlot {
  date: string; // ISO date for the post
  platform: string; // e.g. 'linkedin' | 'instagram' | 'youtube'
}

export interface PlannerInput {
  /** Brand context block from buildBrandContextBlock (may be '' when no brand profile). */
  brandContext: string;
  brandName?: string;
  /** The campaign's structured objective — sets the funnel emphasis + content mix. */
  objective: CalosObjective;
  /** The campaign's big idea / through-line every idea ladders up to. */
  theme?: string;
  /** Campaign goal, optional — a specific target (e.g. "500 signups"). */
  goal?: string;
  slots: PlannerSlot[];
  trends: Trend[];
  /** Titles already planned for this brand — the planner must NOT repeat or paraphrase these. */
  existingIdeas?: string[];
}

/** One drafted idea, aligned to a slot by index. Schedule (date/platform) mirrors the slot. */
export interface PlannedIdea {
  index: number; // which slot this fills
  date: string;
  platform: string;
  format: string; // a format valid for the platform (e.g. reel, carousel, long_video, text)
  funnelStage: FunnelStage; // tofu | mofu | bofu — which buyer-journey stage this serves
  title: string; // the concrete content idea / hook
  angle: string; // why it fits the brand + which trend it repurposes
  trendTitle: string | null; // exact trend title repurposed, or null if original
}
