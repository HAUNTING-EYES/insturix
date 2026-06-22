import { describe, it, expect } from "vitest";
import { parseISO, startOfWeek, addDays } from "date-fns";
import { proposeCadenceCards } from "@/lib/calos/cadence";

describe("proposeCadenceCards", () => {
  // Align `from` to a week boundary so the range covers exactly 3 full weeks.
  const from = startOfWeek(parseISO("2026-06-15"), { weekStartsOn: 0 });
  const to = addDays(from, 20); // Sun..Sat x 3

  it("places perWeek posts per week on preferred days", () => {
    const cards = proposeCadenceCards(
      [{ platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] }],
      { from, to }
    );
    expect(cards).toHaveLength(9); // 3/week x 3 weeks
    expect(cards.every((c) => c.platform === "linkedin")).toBe(true);
    expect(cards.every((c) => c.status === "draft")).toBe(true);
    expect(cards.every((c) => c.plannedDates.length === 1)).toBe(true);
  });

  it("handles multiple rules independently", () => {
    const cards = proposeCadenceCards(
      [
        { platform: "linkedin", perWeek: 2, preferredDays: [1, 3] },
        { platform: "instagram", perWeek: 1, preferredDays: [5] },
      ],
      { from, to }
    );
    expect(cards.filter((c) => c.platform === "linkedin")).toHaveLength(6); // 2 x 3
    expect(cards.filter((c) => c.platform === "instagram")).toHaveLength(3); // 1 x 3
  });

  it("skips zero-cadence rules and empty input", () => {
    expect(proposeCadenceCards([], { from, to })).toHaveLength(0);
    expect(
      proposeCadenceCards([{ platform: "x", perWeek: 0, preferredDays: [1] }], { from, to })
    ).toHaveLength(0);
  });

  it("clamps to the range (no slot before from or after to)", () => {
    const cards = proposeCadenceCards(
      [{ platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] }],
      { from, to }
    );
    expect(
      cards.every((c) => {
        const d = parseISO(c.date);
        return d >= from && d <= to;
      })
    ).toBe(true);
  });

  it("returns nothing when to < from", () => {
    expect(
      proposeCadenceCards([{ platform: "x", perWeek: 3, preferredDays: [1] }], { from: to, to: from })
    ).toHaveLength(0);
  });
});
