/**
 * Pure helpers for the four-place shell (Calendar / Library rows).
 * Kept JSX-free so they are trivially unit-testable and shared by both places.
 */

import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

export type ProjectStatusPayload = { state: string; label: string };

/** Bucket an ISO timestamp into a human day label (Today / Yesterday / Mon D).
 *  Future dates fall through to their date label — the calendar shows
 *  upcoming publish days, not "Today". */
export function dayBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const strip = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const days = Math.round((strip(today) - strip(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** CalOS delivery-queue status → the row chip. Queue rows only exist AFTER
 *  approval (the decision route creates them), so pending means "scheduled,
 *  waiting for its time" — never "might post on its own". */
export function publishStatusChip(status: string): ProjectStatusPayload {
  switch (status) {
    case "published":
      return { state: "done", label: "published" };
    case "failed":
      return { state: "error", label: "failed" };
    case "superseded":
      return { state: "planning", label: "replaced" };
    case "publishing":
    case "claimed":
      return { state: "running", label: "publishing" };
    default:
      return { state: "running", label: "scheduled" };
  }
}

export type ScheduledRow = { id: string; platform: string; status: string; publishAt: string };

/** Lay the delivery queue onto a day grid starting today (stage ScheduleView).
 *  Pure: no fetches, no clock reads beyond the day boundary math. */
export function weekGrid(rows: ScheduledRow[], days = 7, now = new Date()): Array<{ key: string; dayLabel: string; dateLabel: string; posts: Array<{ row: ScheduledRow; time: string }> }> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const grid: Array<{ key: string; dayLabel: string; dateLabel: string; posts: Array<{ row: ScheduledRow; time: string }> }> = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startOfToday.getTime() + i * 86_400_000);
    grid.push({
      key: d.toISOString().slice(0, 10),
      dayLabel: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      posts: [],
    });
  }
  const byKey = new Map(grid.map((g) => [g.key, g]));
  for (const row of rows) {
    const key = new Date(row.publishAt).toISOString().slice(0, 10);
    const cell = byKey.get(key);
    if (!cell) continue; // outside the window — the calendar place covers the long view
    cell.posts.push({
      row,
      time: new Date(row.publishAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
    });
  }
  return grid;
}

/** Map a deliverable's artifact statuses onto the row chip: running beats
 *  error beats queued; empty means planning; otherwise done. */
export function deliverableState(d: StudioDeliverable): ProjectStatusPayload {
  const s = d.artifacts.map((a) => a.status);
  if (s.includes("running") || s.includes("streaming")) return { state: "running", label: "working" };
  if (s.includes("error")) return { state: "error", label: "failed" };
  if (s.includes("queued")) return { state: "running", label: "queued" };
  if (s.length === 0 || s.every((x) => x === "empty")) return { state: "planning", label: "planning" };
  return { state: "done", label: "done" };
}
