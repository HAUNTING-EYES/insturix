/**
 * Director Mode lane predicates — PURE and dependency-free, so both the server
 * (assist-lane.ts re-exports these) and client components can import them without
 * dragging the heavy hydration/materializer chain into the browser bundle.
 * One source of truth for the lane's status/gating logic — no drift between the
 * server gate and the client CTA.
 */

export const EDIT_MODES = ['auto', 'assist'] as const;
export type EditMode = (typeof EDIT_MODES)[number];

/** New autoEditStatus values owned by the assist lane (additive; auto values untouched). */
export const ASSIST_STATUS_READY = 'ready_for_chat' as const;
export const ASSIST_STATUS_SCAN_FAILED = 'scan_failed' as const;

export function parseEditMode(value: unknown): EditMode | undefined {
  return value === 'auto' || value === 'assist' ? value : undefined;
}

export function isAssistProject(project: unknown): boolean {
  const editMode = project && typeof project === 'object'
    ? (project as { editMode?: unknown }).editMode
    : undefined;
  return parseEditMode(editMode) === 'assist';
}

/**
 * A refunded assist project (scan_failed) must be inert to EVERY mutation and
 * open surface — the user was refunded because they never received a product.
 */
export function isRefundedAssistProject(project: unknown): boolean {
  if (!isAssistProject(project)) return false;
  const status = project && typeof project === 'object'
    ? (project as { autoEditStatus?: unknown }).autoEditStatus
    : undefined;
  return status === ASSIST_STATUS_SCAN_FAILED;
}

/** Auto-edit statuses from which a failed project can be rescued into Director Mode. */
const RESCUABLE_AUTO_FAILURE_STATUSES = new Set(['failed', 'needs_input']);

/**
 * Can a FAILED auto-edit be reopened in Director Mode? (CEO plan: rescue CTA.)
 * True only when the failure left a usable substrate — a laid-down timeline AND
 * hydrated scan evidence for chat to ground in. That substrate exists exactly for
 * a director-stage failure, which is also when the charge was KEPT (a pre-director
 * failure is refunded and has neither), so a FREE reopen never gives away a
 * refunded edit. Never rescues an already-assist project or a refunded scan_failed.
 */
export function canRescueToDirectorMode(project: unknown): boolean {
  if (!project || typeof project !== 'object') return false;
  const p = project as {
    editMode?: unknown; autoEditStatus?: unknown; overlays?: unknown;
    rawFootageAnalysis?: unknown; segmentAnalysis?: unknown;
  };
  if (parseEditMode(p.editMode) === 'assist') return false; // already Director Mode
  if (typeof p.autoEditStatus !== 'string' || !RESCUABLE_AUTO_FAILURE_STATUSES.has(p.autoEditStatus)) return false;
  const hasTimeline = Array.isArray(p.overlays) && p.overlays.some((o) => {
    const t = o && typeof o === 'object' ? (o as { type?: unknown }).type : undefined;
    return t === 'video' || t === 'image';
  });
  const hasScanEvidence = Boolean(p.rawFootageAnalysis) || Boolean(p.segmentAnalysis);
  return hasTimeline && hasScanEvidence;
}
