/**
 * §12 plan-window parsing (pure): the user's stated window and count,
 * parsed from their words. "next week" = Mon-Sun of next week; anything
 * else = the next 7 days. Count only when explicitly named ("4 posts",
 * "four pieces") - absent or absurd means fill-the-cadence, never a guess.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function parsePlanWindow(text: string, now = new Date()): { from: Date; to: Date; count: number | null } {
  const nextWeek = /\bnext week\b/i.test(text);
  const from = new Date(now);
  if (nextWeek) {
    /* UTC day math — the spine speaks ISO; a user timezone arrives with
     * profile data later, and until then UTC is the honest neutral */
    const daysUntilMonday = ((8 - from.getUTCDay()) % 7) || 7;
    from.setUTCDate(from.getUTCDate() + daysUntilMonday);
    from.setUTCHours(0, 0, 0, 0);
  }
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const digit = text.match(/\b(\d{1,2})\s*(?:posts?|pieces?|items?)\b/i);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:posts?|pieces?|items?)\b/i);
  const count = digit ? Number(digit[1]) : word ? NUMBER_WORDS[word[1].toLowerCase()] : null;
  return { from, to, count: count && count >= 1 && count <= 20 ? count : null };
}
