import type { ContentCard } from '@/app/dashboard/thinkforge/types';
import { EDITORIAL_STAGE_META } from '@/lib/calos/stages';

/* ═══ CalOS v3 · view model ═══════════════════════════════════════════
   Bridges the real ContentCard deliverable model to the founder's v3
   calendar design (calos-v3.jsx). The prototype used a flat {stage, score,
   day, time, brief, script} shape over a hardcoded March 2026; the real
   model is editorialStatus + aiScore + plannedDates[] (ISO) + details +
   scriptPreview, over real months. `toItem` derives the display shape from
   a card; nothing here invents stage keys — they come from
   EDITORIAL_STAGE_META (lib/calos/stages.ts). */

/** Warm-dark palette — verbatim from the founder's calos-v3.jsx. Gold leads;
    green (approve) and coral (changes/danger) are the semantic accents. */
export const C = {
  bg: '#0B0B0A', raised: '#0F0F0E', surface: '#131312', well: '#1B1A18',
  border: '#1C1B19', bs: '#282724',
  text: '#ECE9E1', soft: '#B8B4A8', muted: '#7A776E', dim: '#5F5E5A', faint: '#454340',
  gold: '#D4A652', goldH: '#C49840', green: '#5EC97E', coral: '#D46A5C',
} as const;

export const EASE = 'cubic-bezier(0.16,1,0.3,1)';
export const MONO = "'JetBrains Mono',ui-monospace,monospace";
export const SANS = "'Plus Jakarta Sans',system-ui,sans-serif";

/** Platforms CalOS can schedule. `generic` is the fallback for cards created
    without a platform (createCard defaults to 'generic'). */
export const PLAT: Record<string, string> = {
  instagram: 'IG', linkedin: 'IN', youtube: 'YT', facebook: 'FB', x: 'X', twitter: 'X', tiktok: 'TT', generic: '••',
};
export const PLABEL: Record<string, string> = {
  instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook', x: 'X', twitter: 'X', tiktok: 'TikTok', generic: 'Unassigned',
};

export const platGlyph = (p: string) => PLAT[p] ?? PLAT.generic;
export const platLabel = (p: string) => PLABEL[p] ?? PLABEL.generic;

/** The natural still-image ratio for a platform — the default when generating an image for a card
    (override-able in the content modal). All values are Clickatron-model-supported. */
export const platformDefaultAspect = (platform: string): string => {
  switch (platform) {
    case 'instagram': return '4:5';
    case 'tiktok': return '9:16';
    case 'youtube':
    case 'x':
    case 'twitter': return '16:9';
    default: return '1:1'; // linkedin, facebook, generic
  }
};

/** Ordered editorial pipeline — matches EDITORIAL_STAGE_META keys (changes_requested
    is a side-state, not a pipeline step, so it's excluded from the ordered rail). */
export const STAGES = ['idea', 'drafting', 'generated', 'in_review', 'approved'] as const;
export type CalStage = (typeof STAGES)[number] | 'changes_requested' | 'published';

/** Stage label — sourced from EDITORIAL_STAGE_META so the calendar and the rest
    of CalOS never drift. Falls back to a title-cased key for unknown values. */
export const stageLabel = (stage?: string | null): string => {
  if (!stage) return 'Idea';
  if (stage === 'published') return 'Published';
  const meta = EDITORIAL_STAGE_META[stage as keyof typeof EDITORIAL_STAGE_META];
  return meta?.label ?? stage.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

/** Accent hex per stage (left-border tick / dot) — the visual language from v3.
    Kept as hex because the calendar is inline-styled; EDITORIAL_STAGE_META ships
    tailwind classes, which don't apply here. */
export const stageTick = (stage?: string | null): string => {
  switch (stage) {
    case 'drafting': return C.muted;
    case 'generated': return C.soft;
    case 'in_review': return C.gold;
    case 'approved':
    case 'published': return C.gold;
    case 'changes_requested': return C.coral;
    default: return C.faint; // idea / unknown
  }
};

/** Display shape the v3 components render. Derived from a ContentCard; `raw`
    is the source of truth for all mutations. */
export interface CalItem {
  id: string;
  title: string;
  platform: string;
  stage: string; // editorialStatus (defaults to 'idea')
  score: number; // aiScore ?? 0
  date: Date; // first planned date, as a local Date (primary — used by the modal)
  dates: Date[]; // every planned date, sorted — a deliverable can be scheduled more than once
  time: string; // "HH:mm" of the first planned date
  tags: string[];
  brief: string; // details
  hasScript: boolean;
  raw: ContentCard;
}

/** All planned dates of a card, parsed + sorted. Falls back to [card.date] then
    [now] so an item always has at least one placement. */
const allPlannedDates = (card: ContentCard): Date[] => {
  const source = card.plannedDates?.length ? card.plannedDates : card.date ? [card.date] : [];
  const parsed = source
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return parsed.length ? parsed : [new Date()];
};

const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** ContentCard → v3 display item. Pure; safe to call in render/useMemo. */
export const toItem = (card: ContentCard): CalItem => {
  const dates = allPlannedDates(card);
  return {
    id: card.id,
    title: card.title || 'Untitled content',
    platform: card.platform || 'generic',
    stage: card.editorialStatus || 'idea',
    score: typeof card.aiScore === 'number' ? card.aiScore : 0,
    date: dates[0],
    dates,
    time: hhmm(dates[0]),
    tags: card.customTags?.length ? card.customTags : card.tags ?? [],
    brief: card.details ?? '',
    hasScript: !!(card.scriptPreview && card.scriptPreview.trim()),
    raw: card,
  };
};

/* ── real-date helpers (replace the prototype's fixed March 2026) ── */

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Local YYYY-MM-DD key (timezone-stable — never uses toISOString, which shifts
    across the UTC boundary). Mirrors the hook's own toLocalDateKey. */
export const dateKey = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const sameDay = (a: Date, b: Date): boolean => dateKey(a) === dateKey(b);

/** 42-cell (6×7) month grid. null = leading/trailing padding cell. */
export const monthCells = (cursor: Date): Array<Date | null> => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstDow + 1;
    cells.push(dayNum >= 1 && dayNum <= daysInMonth ? new Date(year, month, dayNum) : null);
  }
  return cells;
};

/** The 7 days (Sun–Sat) of the week containing `day`. */
export const weekDays = (day: Date): Date[] => {
  const start = new Date(day);
  start.setDate(day.getDate() - day.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

export const monthTitle = (d: Date): string => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
export const dayTitle = (d: Date): string => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

export const addMonths = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const addDays = (d: Date, n: number): Date => {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
};

/** A single scheduled occurrence of an item on one day. A multi-date item
    yields one placement per planned date, so it renders on every day it runs. */
export interface Placement {
  item: CalItem;
  date: Date;
  time: string;
}

/** Expand items into placements — one per planned date. */
export const toPlacements = (items: CalItem[]): Placement[] =>
  items.flatMap((it) => it.dates.map((d) => ({ item: it, date: d, time: hhmm(d) })));

/** Group placements by local date key, each day sorted by time. */
export const groupPlacementsByDay = (placements: Placement[]): Map<string, Placement[]> => {
  const map = new Map<string, Placement[]>();
  for (const pl of placements) {
    const key = dateKey(pl.date);
    const bucket = map.get(key);
    if (bucket) bucket.push(pl);
    else map.set(key, [pl]);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.time.localeCompare(b.time));
  return map;
};
