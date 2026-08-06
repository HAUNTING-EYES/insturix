import { describe, it, expect } from "vitest";
import { parseISO, startOfWeek, addDays } from "date-fns";
import { proposeCadenceCards } from "@/lib/calos/cadence";
import { cadenceContentRequirements, parseCampaignCadenceRules } from "@/lib/calos/campaign-cadence";
import { normalizeContentCardForStorage } from "@/lib/thinkforge/planning/content-card-contract";

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

  it("spreads perWeek beyond preferred days onto distinct days (no duplicate slots)", () => {
    const oneWeek = addDays(from, 6); // a single Sun..Sat week
    const cards = proposeCadenceCards(
      [{ platform: "linkedin", perWeek: 4, preferredDays: [1, 3, 5] }],
      { from, to: oneWeek }
    );
    expect(cards).toHaveLength(4); // 4 distinct days, NOT 3 days + a duplicate
    expect(new Set(cards.map((c) => c.date)).size).toBe(4); // all dates distinct
  });

  it("caps a single week at 7 distinct days even when perWeek exceeds 7", () => {
    const oneWeek = addDays(from, 6);
    const cards = proposeCadenceCards(
      [{ platform: "linkedin", perWeek: 12, preferredDays: [1, 3, 5] }],
      { from, to: oneWeek }
    );
    expect(cards).toHaveLength(7);
    expect(new Set(cards.map((c) => c.date)).size).toBe(7);
  });

  it("preserves an explicit long-form format and duration through card normalization", () => {
    const parsed = parseCampaignCadenceRules([{
      platform: " YouTube ", perWeek: 1, preferredDays: [2], format: "LONG_VIDEO", targetDurationSeconds: 480,
    }]);
    expect(parsed).toEqual({
      ok: true,
      rules: [{ platform: "youtube", perWeek: 1, preferredDays: [2], format: "long_video", targetDurationSeconds: 480 }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const [proposal] = proposeCadenceCards(parsed.rules, { from, to: addDays(from, 6) });
    const card = normalizeContentCardForStorage(
      { ...proposal, ...cadenceContentRequirements(parsed.rules[0]) },
      { userId: "user_1", idFactory: () => "card_1" },
    );
    expect(card).toMatchObject({ platform: "youtube", contentFormat: "long_video", targetDurationSeconds: 480 });
  });

  it("rejects long-form rules without a safe explicit duration", () => {
    expect(parseCampaignCadenceRules([{
      platform: "youtube", perWeek: 1, preferredDays: [2], format: "long_video",
    }])).toEqual({ ok: false, error: "cadenceRules[0].targetDurationSeconds is required for long_video" });
    expect(parseCampaignCadenceRules([{
      platform: "youtube", perWeek: 1, preferredDays: [2], format: "long_video", targetDurationSeconds: 120,
    }])).toEqual({ ok: false, error: "cadenceRules[0].targetDurationSeconds must be between 300 and 3600" });
  });
});
