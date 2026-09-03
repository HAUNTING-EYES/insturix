/**
 * §12 plan-window parsing (pure): the user's stated window and count,
 * parsed from their words. "next week" = Mon-Sun of next week; anything
 * else = the next 7 days. Count only when explicitly named ("4 posts",
 * "four pieces") - absent or absurd means fill-the-cadence, never a guess.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Offset (ms) of a timezone at a given instant, via Intl — no tz library. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUTC - instant.getTime();
}

/** Next Monday 00:00 in the USER's zone, as a UTC instant (offset taken at
 *  the target instant — one pass, DST-safe within a week). */
function nextMondayInZone(now: Date, timeZone: string): Date {
  const wall = new Date(now.getTime() + tzOffsetMs(now, timeZone));
  const daysUntilMonday = ((8 - wall.getUTCDay()) % 7) || 7;
  const guess = wall.getTime() + daysUntilMonday * 86_400_000;
  const wallMidnightUtc = guess - (guess % 86_400_000); // wall midnight as pseudo-UTC
  return new Date(wallMidnightUtc - tzOffsetMs(new Date(wallMidnightUtc), timeZone));
}

export function parsePlanWindow(text: string, now = new Date(), timeZone?: string | null): { from: Date; to: Date; count: number | null } {
  const nextWeek = /\bnext week\b/i.test(text);
  const from = new Date(now);
  if (nextWeek) {
    if (timeZone) {
      from.setTime(nextMondayInZone(now, timeZone).getTime());
    } else {
      /* no zone known — UTC is the honest neutral */
      const daysUntilMonday = ((8 - from.getUTCDay()) % 7) || 7;
      from.setUTCDate(from.getUTCDate() + daysUntilMonday);
      from.setUTCHours(0, 0, 0, 0);
    }
  }
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const digit = text.match(/\b(\d{1,2})\s*(?:posts?|pieces?|items?)\b/i);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:posts?|pieces?|items?)\b/i);
  const count = digit ? Number(digit[1]) : word ? NUMBER_WORDS[word[1].toLowerCase()] : null;
  return { from, to, count: count && count >= 1 && count <= 20 ? count : null };
}
