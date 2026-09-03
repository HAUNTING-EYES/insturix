import { describe, expect, it } from "vitest";
import { thinkforgeRedirects } from "@/lib/studio/legacy-redirects";

describe("thinkforge normal-path retirement (plan §10 / Phase 4)", () => {
  it("deep links with a session id land on the studio project page, not the control room", () => {
    const sessionLink = thinkforgeRedirects.find((r) => r.has?.some((h) => h.key === "session"));
    const sessionIdLink = thinkforgeRedirects.find((r) => r.has?.some((h) => h.key === "sessionId"));
    expect(sessionLink?.destination).toBe("/studio/d/:sid");
    expect(sessionIdLink?.destination).toBe("/studio/d/:sid");
    /* the captured id must survive: named group sid referenced in destination */
    expect(sessionLink?.has?.[0]?.value).toContain("(?<sid>");
    expect(sessionIdLink?.has?.[0]?.value).toContain("(?<sid>");
  });

  it("every entry is a temporary redirect off the legacy route — Phase 10 deletes it, nothing caches a promise we haven't verified", () => {
    expect(thinkforgeRedirects.length).toBeGreaterThan(0);
    for (const r of thinkforgeRedirects) {
      expect(r.source).toBe("/dashboard/thinkforge");
      expect(r.permanent).toBe(false);
      expect(r.destination.startsWith("/studio")).toBe(true);
    }
  });

  it("specific (query-carrying) entries come before the bare catch-all, or Next matches the catch-all first", () => {
    const bare = thinkforgeRedirects.findIndex((r) => !r.has);
    const specific = thinkforgeRedirects.findIndex((r) => r.has);
    expect(bare).toBeGreaterThan(-1);
    expect(specific).toBeGreaterThan(-1);
    expect(specific).toBeLessThan(bare);
  });
});
