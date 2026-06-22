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
    const perWeek = Math.max(0, Math.floor(rule.perWeek));
    if (perWeek === 0) continue;
    const days = rule.preferredDays.length
      ? [...rule.preferredDays].sort((a, b) => a - b)
      : DEFAULT_DAYS;

    let weekStart = startOfWeek(from, { weekStartsOn: 0 });
    while (weekStart <= to) {
      for (let n = 0; n < perWeek; n++) {
        const slot = addDays(weekStart, days[n % days.length]);
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
        }
      }
      weekStart = addWeeks(weekStart, 1);
    }
  }

  return out;
}
