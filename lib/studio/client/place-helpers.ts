/**
 * Pure helpers for the four-place shell (Calendar / Library rows).
 * Kept JSX-free so they are trivially unit-testable and shared by both places.
 */

import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

export type ProjectStatusPayload = { state: string; label: string };

/** Bucket an ISO timestamp into a human day label (Today / Yesterday / Mon D). */
export function dayBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const strip = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const days = Math.round((strip(today) - strip(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
