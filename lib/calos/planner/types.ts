import type { Trend } from "../trends/types";

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
  /** Campaign goal, optional — steers the batch toward an objective. */
  goal?: string;
  slots: PlannerSlot[];
  trends: Trend[];
}

/** One drafted idea, aligned to a slot by index. Schedule (date/platform) mirrors the slot. */
export interface PlannedIdea {
  index: number; // which slot this fills
  date: string;
  platform: string;
  title: string; // the concrete content idea / hook
  angle: string; // why it fits the brand + which trend it repurposes
  trendTitle: string | null; // exact trend title repurposed, or null if original
}
