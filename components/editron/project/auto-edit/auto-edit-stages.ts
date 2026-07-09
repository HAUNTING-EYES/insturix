/* ═══ Editron · auto-edit stage model ════════════════════════════════
   The 8 named passes the processing screen shows, and a best-effort map
   from the REAL coarse pipeline status (~11 strings) onto them.

   HONESTY NOTE (D3=B): the pipeline today emits only one `autoEditStatus`
   string — no percent, no per-stage events, and the whole cut/punch/caption/
   music/transition/graphics phase collapses into one opaque `directing`
   status. So this map is coarse and the fine stages 1–6 can't be pinpointed
   yet. When the workers emit a structured `{ stage, percent, logLine }`, use
   those directly instead of this map.
   // TODO(backend): emit per-stage {stage,percent,logLine} from
   //   app/api/internal/workers/video-analysis + director, and widen
   //   useFootageAutoEdit to surface them (see use-footage-auto-edit.ts). */

export interface AutoEditStage {
  id: 'analyze' | 'cut' | 'punch' | 'caption' | 'music' | 'transition' | 'graphics' | 'finish';
  word: string; // the big watermark word
  verb: string; // the small "what's happening" label
}

export const AUTO_EDIT_STAGES: readonly AutoEditStage[] = [
  { id: 'analyze', word: 'ANALYSING', verb: 'Reading the footage' },
  { id: 'cut', word: 'CUTTING', verb: 'Making the cuts' },
  { id: 'punch', word: 'PUNCHING IN', verb: 'Finding the beats' },
  { id: 'caption', word: 'CAPTIONING', verb: 'Writing captions' },
  { id: 'music', word: 'SCORING', verb: 'Scoring it' },
  { id: 'transition', word: 'DISSOLVING', verb: 'Smoothing the cuts' },
  { id: 'graphics', word: 'GRAPHICS', verb: 'Adding graphics' },
  { id: 'finish', word: 'FINISHING', verb: 'Finishing' },
] as const;

export const TOTAL_STAGES = AUTO_EDIT_STAGES.length;

/** Coarse best-effort map: real pipeline status → nearest artifact stage index.
    The `directing` phase can't be sub-divided until the backend emits sub-stages. */
const STATUS_TO_STAGE: Record<string, number> = {
  queued: 0,
  analyzing: 0,
  transcribing: 0,
  analyzing_visual_cuts: 1,
  cleaning: 1,
  computing_params: 2,
  analyzing_deep: 2,
  analysis_complete: 2,
  directing_queued: 3,
  directing: 3, // collapses cut/punch/caption/music/transition/graphics
  editing: 3,
  needs_review: TOTAL_STAGES - 1,
  complete: TOTAL_STAGES - 1,
};

export const isTerminalStatus = (status: string): boolean =>
  status === 'complete' || status === 'needs_review' || status === 'failed';

/** Map a raw status to a stage index (0..7). Unknown → 0. */
export function statusToStageIndex(status: string | null | undefined): number {
  if (!status) return 0;
  return STATUS_TO_STAGE[status] ?? 0;
}

/** Coarse percent from stage progress. Used only when the backend hasn't
    emitted a real `autoEditStagePercent`. Terminal = 100. */
export function stagePercent(stageIndex: number, done: boolean): number {
  if (done) return 100;
  return Math.min(99, Math.round(((stageIndex + 0.5) / TOTAL_STAGES) * 100));
}

/** During `directing`, the director emits a live `autoEditStageDesc` (the
    current action). Map its keywords onto the fine stage so the screen shows
    the true stage (cut/punch/caption/music/transition/graphics) instead of the
    collapsed `directing`. Falls back to 'cut' (index 1). */
export function directingDescToStageIndex(desc: string | null | undefined): number {
  if (!desc) return 1;
  const d = desc.toLowerCase();
  if (/caption|subtitle|transcri/.test(d)) return 3;
  if (/music|score|\bbgm\b|duck|audio|sound/.test(d)) return 4;
  if (/transition|dissolve|\bfade\b|wipe/.test(d)) return 5;
  if (/graphic|lower.?third|\btitle\b|sticker|motion|\bstat\b|overlay/.test(d)) return 6;
  if (/zoom|punch|beat|emphas/.test(d)) return 2;
  if (/cut|trim|silence|dead.?air|clip/.test(d)) return 1;
  return 1;
}
