import { startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';

/**
 * Generation windows for the directly addressable campaign workspace. Routes clamp the start to
 * "now", so past days are never filled.
 */
export type Period = 'rest_of_month' | 'next_2_weeks' | 'next_30_days' | 'next_month';

export const PERIOD_LABELS: Record<Period, string> = {
  rest_of_month: 'Rest of this month',
  next_2_weeks: 'Next 2 weeks',
  next_30_days: 'Next 30 days',
  next_month: 'Next month',
};

export function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  if (p === 'next_month') {
    const m = addMonths(now, 1);
    return { from: startOfMonth(m).toISOString(), to: endOfMonth(m).toISOString() };
  }
  const to =
    p === 'rest_of_month' ? endOfMonth(now) : p === 'next_2_weeks' ? addDays(now, 14) : addDays(now, 30);
  return { from: now.toISOString(), to: to.toISOString() };
}
