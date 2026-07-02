import type { CalosEditorialStatus } from "@/schemas/calos-deliverable";

/** UI metadata for the CalOS editorial stages — the calendar's status board reads from this. */
export interface StageMeta {
  label: string;
  chip: string; // tailwind classes for a chip/badge background+border+text
  dot: string; // tailwind bg for a small status dot
}

export const EDITORIAL_STAGE_META: Record<CalosEditorialStatus, StageMeta> = {
  idea: { label: "Idea", chip: "bg-[#1C1B19]/60 border-neutral-700/70 text-neutral-300", dot: "bg-neutral-500" },
  drafting: { label: "Drafting", chip: "bg-[#D4A652]/15 border-[#D4A652]/40 text-[#D4A652]", dot: "bg-[#D4A652]" },
  generated: { label: "Generated", chip: "bg-sky-600/15 border-sky-500/40 text-sky-200", dot: "bg-sky-400" },
  in_review: { label: "In review", chip: "bg-violet-600/15 border-violet-500/40 text-violet-200", dot: "bg-violet-400" },
  approved: { label: "Approved", chip: "bg-emerald-600/15 border-emerald-500/40 text-emerald-200", dot: "bg-emerald-400" },
  changes_requested: { label: "Changes", chip: "bg-red-600/15 border-red-500/40 text-red-200", dot: "bg-red-400" },
};

/** Stage metadata for a deliverable's editorialStatus, or null for non-CalOS cards. */
export function stageMeta(status?: string | null): StageMeta | null {
  if (!status) return null;
  return EDITORIAL_STAGE_META[status as CalosEditorialStatus] ?? null;
}
