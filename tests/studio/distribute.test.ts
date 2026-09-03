import { describe, expect, it } from "vitest";
import { parsePlanWindow } from "@/lib/studio/orchestrator/distribute-plan";

describe("parsePlanWindow — the user's words set the window, never a guess", () => {
  const wednesday = new Date("2026-09-02T15:00:00Z"); // a Wednesday

  it("\"next week\" = Monday–Sunday of next week", () => {
    const w = parsePlanWindow("plan four posts for next week", wednesday);
    expect(w.from.getUTCDay()).toBe(1); // Monday
    expect(w.from.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect((w.to.getTime() - w.from.getTime()) / 86_400_000).toBe(7);
  });

  it("no window named = the next 7 days from today", () => {
    const w = parsePlanWindow("plan my posts", wednesday);
    expect(w.from.toISOString()).toBe("2026-09-02T15:00:00.000Z");
    expect((w.to.getTime() - w.from.getTime()) / 86_400_000).toBe(7);
  });

  it("counts parse from digits and words; absent or absurd counts mean fill-the-cadence", () => {
    expect(parsePlanWindow("4 posts next week", wednesday).count).toBe(4);
    expect(parsePlanWindow("plan four posts", wednesday).count).toBe(4);
    expect(parsePlanWindow("plan my week", wednesday).count).toBeNull();
    expect(parsePlanWindow("99 posts", wednesday).count).toBeNull(); // out of range — not a guess we honor
  });
});

describe("parsePlanWindow — the user's Monday, not UTC's", () => {
  const wednesday = new Date("2026-09-02T15:00:00Z"); // Wednesday

  it("IST users get Monday 00:00 Asia/Kolkata (Sunday 18:30Z)", () => {
    const w = parsePlanWindow("plan four posts next week", wednesday, "Asia/Kolkata");
    expect(w.from.toISOString()).toBe("2026-09-06T18:30:00.000Z"); // their Monday
    expect(w.from.toISOString()).not.toBe("2026-09-07T00:00:00.000Z"); // not UTC Monday
  });

  it("no zone given keeps the UTC-neutral behavior", () => {
    const w = parsePlanWindow("plan four posts next week", wednesday);
    expect(w.from.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
});
