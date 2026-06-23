import { startOfWeek, addDays, addWeeks } from "date-fns";

export interface CadenceCardProposal {
  title: string;
  date: string; // ISO
  plannedDates: string[]; // [date]
  platform: string;
  status: "draft";
  tags: string[];
  customTags: string[];
}

export interface CadenceRuleInput {
  platform: string;
  perWeek: number;
  preferredDays: number[]; // 0=Sun .. 6=Sat
}

const DEFAULT_DAYS = [1, 3, 5]; // Mon / Wed / Fri

/** Starter cadence used when no brand-specific suggestion applies. Single source of truth —
 *  import this instead of redefining the triple in UI/routes. */
export const DEFAULT_CADENCE: CadenceRuleInput[] = [
  { platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] },
];

// ponytail: hard cap on generated slots. A year of daily posts across ~3 platforms is ~1000, so
// this bounds memory/DB regardless of an absurd date range or perWeek, without truncating any
// realistic plan. value(1000) <- domain estimate.
const MAX_SLOTS = 1000;

/**
 * Deterministically propose draft cards from cadence rules over [from, to].
 *
 * Each rule places `perWeek` posts per week on its preferredDays (cycling through them if
 * perWeek exceeds their count), clamped to [from, to]. Pure + side-effect free — the date
 * range is passed in, so there is no hidden clock/randomness (tests are stable).
 */
export function proposeCadenceCards(
  rules: CadenceRuleInput[],
  range: { from: Date; to: Date }
): CadenceCardProposal[] {
  const { from, to } = range;
  if (to < from) return [];

  const out: CadenceCardProposal[] = [];

  for (const rule of rules) {
    // Distinct posting days: preferred first, then the rest of the week, so perWeek beyond the
    // preferred days spreads onto NEW days instead of doubling up on one (which produced duplicate
    // identical slots). Max 7 distinct days/week — multiple posts/day is a later feature.
    const preferred = rule.preferredDays.length
      ? [...new Set(rule.preferredDays)].sort((a, b) => a - b)
      : DEFAULT_DAYS;
    const weekdays = [...preferred, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => !preferred.includes(d))];
    const count = Math.min(Math.max(0, Math.floor(rule.perWeek)), 7);
    if (count === 0) continue;

    let weekStart = startOfWeek(from, { weekStartsOn: 0 });
    while (weekStart <= to) {
      for (let n = 0; n < count; n++) {
        const slot = addDays(weekStart, weekdays[n]);
        if (slot >= from && slot <= to) {
          const iso = slot.toISOString();
          out.push({
            title: `${rule.platform} post`,
            date: iso,
            plannedDates: [iso],
            platform: rule.platform,
            status: "draft",
            tags: [],
            customTags: [],
          });
          if (out.length >= MAX_SLOTS) return out;
        }
      }
      weekStart = addWeeks(weekStart, 1);
    }
  }

  return out;
}
