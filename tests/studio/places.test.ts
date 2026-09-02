import { describe, expect, it } from "vitest";
import { dayBucket, deliverableState } from "@/lib/studio/client/place-helpers";
import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function deliverable(statuses: Array<"empty" | "queued" | "streaming" | "running" | "done" | "error" | "stale">): StudioDeliverable {
  return {
    id: "d_test",
    title: "Test",
    brandId: "br_nike",
    threadId: "th_test",
    artifacts: statuses.map((status, i) => ({
      id: `a_${i}`,
      kind: "script",
      title: "artifact",
      status,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    })),
    edges: [],
    stageFocus: null,
    createdAt: isoDaysAgo(2),
    updatedAt: isoDaysAgo(1),
  } as unknown as StudioDeliverable;
}

describe("dayBucket", () => {
  it("labels today and yesterday", () => {
    expect(dayBucket(isoDaysAgo(0))).toBe("Today");
    expect(dayBucket(isoDaysAgo(1))).toBe("Yesterday");
  });

  it("labels older work as a Mon D bucket", () => {
    const label = dayBucket(isoDaysAgo(4));
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
    expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe("deliverableState — priority chain", () => {
  it("running beats error beats queued", () => {
    expect(deliverableState(deliverable(["running", "error"])).state).toBe("running");
    expect(deliverableState(deliverable(["error", "queued"])).state).toBe("error");
    expect(deliverableState(deliverable(["queued", "done"])).label).toBe("queued");
  });

  it("streams count as working, empty artifacts mean planning", () => {
    expect(deliverableState(deliverable(["streaming"])).state).toBe("running");
    expect(deliverableState(deliverable([])).label).toBe("planning");
    expect(deliverableState(deliverable(["empty"])).label).toBe("planning");
  });

  it("all-done delivers done", () => {
    expect(deliverableState(deliverable(["done", "done"]))).toEqual({ state: "done", label: "done" });
  });
});
