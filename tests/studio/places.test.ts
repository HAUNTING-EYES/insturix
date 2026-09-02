import { describe, expect, it } from "vitest";
import { dayBucket, deliverableState, publishStatusChip, weekGrid } from "@/lib/studio/client/place-helpers";
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

  it("labels FUTURE dates as their own day, never Today", () => {
    expect(dayBucket(isoDaysAgo(-3))).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(dayBucket(isoDaysAgo(-3))).not.toBe("Today");
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

describe("publishStatusChip — CalOS delivery states", () => {
  it("queue rows are post-approval: pending reads scheduled, in-flight reads publishing", () => {
    expect(publishStatusChip("pending").label).toBe("scheduled");
    expect(publishStatusChip("claimed").label).toBe("publishing");
    expect(publishStatusChip("publishing").label).toBe("publishing");
  });

  it("terminal states map honestly: published, failed, replaced", () => {
    expect(publishStatusChip("published")).toEqual({ state: "done", label: "published" });
    expect(publishStatusChip("failed").state).toBe("error");
    expect(publishStatusChip("superseded").label).toBe("replaced");
  });
});

describe("weekGrid — stage ScheduleView layout", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  const row = (dayOffset: number, hour: number, platform = "instagram") => ({
    id: `r_${dayOffset}_${hour}`,
    platform,
    status: "pending",
    publishAt: new Date(Date.UTC(2026, 8, 3 + dayOffset, hour, 0)).toISOString(),
  });

  it("lays rows into the day cells starting today, outside-window rows dropped", () => {
    const grid = weekGrid([row(0, 9), row(0, 17, "youtube"), row(2, 11), row(30, 9)], 7, now);
    expect(grid).toHaveLength(7);
    expect(grid[0].posts.map((p) => p.row.platform)).toEqual(["instagram", "youtube"]);
    expect(grid[2].posts).toHaveLength(1);
    expect(grid.reduce((n, g) => n + g.posts.length, 0)).toBe(3); // the +30d row is out of window
  });

  it("keeps day boundaries honest (UTC day keys, time labels per row)", () => {
    const grid = weekGrid([row(0, 23, "linkedin")], 2, now);
    expect(grid[0].posts[0]?.time).toMatch(/11:00|23:00/);
    expect(grid[1].posts).toHaveLength(0);
  });
});
