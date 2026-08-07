/**
 * Phase 7 (brief §15): PREFERENCE MEMORY — capture taste-preference events + rebuild user profiles.
 *
 * Rules (§15): `exported` is WEAK behavioral evidence, never approval; deletion/rejection and A/B selection are
 * STRONG; events reference the exact MG/plan/contract/render version; profiles rebuild from raw events; user-level
 * and brand-level evidence stay separate; provenance + confidence always attached; explicit project instructions
 * are NEVER overwritten by historical preference (the rebuild only fills evidence-based traits).
 *
 * Backend-ready schemas + persistence + rebuild. No UI actions exist yet to wire (we don't invent UI events) —
 * wiring to real actions is the flagged follow-on.
 */
import type { TasteConfidence, TasteEvidenceRef, UserTasteProfile } from './taste-schemas';

export const TASTE_PREFERENCE_EVENT_KINDS = [
  'reference_uploaded', 'candidate_selected', 'mg_approved', 'mg_rejected', 'mg_deleted', 'mg_regenerated',
  'motion_reduced', 'motion_increased', 'hierarchy_changed', 'color_changed', 'placement_changed', 'exported',
] as const;
export type TastePreferenceEventKind = (typeof TASTE_PREFERENCE_EVENT_KINDS)[number];

export interface TastePreferenceEvent {
  id: string;
  kind: TastePreferenceEventKind;
  userId: string;
  brandId?: string;
  projectId?: string;
  momentId?: string;
  planHash?: string;
  renderVersion?: string;
  createdAt: string;
  provenance: string;
  metadata?: Record<string, unknown>;
}

export function preferenceMemoryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MG_PREFERENCE_MEMORY_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export async function recordTastePreferenceEvent(
  deps: { save: (event: TastePreferenceEvent) => Promise<void> },
  event: TastePreferenceEvent,
): Promise<void> {
  await deps.save(event);
}

/** Event kind → taste-evidence kind + confidence (§15 strength rules). */
function toEvidenceRef(event: TastePreferenceEvent): TasteEvidenceRef {
  let kind: TasteEvidenceRef['kind'];
  let confidence: TasteConfidence;
  switch (event.kind) {
    case 'reference_uploaded': kind = 'project_reference'; confidence = 'medium'; break;
    case 'candidate_selected': kind = 'user_pairwise_selection'; confidence = 'medium'; break;
    case 'mg_approved': kind = 'user_explicit_approval'; confidence = 'medium'; break;
    case 'mg_rejected':
    case 'mg_deleted': kind = 'user_explicit_rejection'; confidence = 'medium'; break;
    case 'exported': kind = 'user_edit'; confidence = 'low'; break; // §15: exported is WEAK, never approval
    default: kind = 'user_edit'; confidence = 'low'; break; // motion/hierarchy/color/placement changes
  }
  return {
    id: event.id,
    kind,
    sourceEntityId: event.brandId ?? event.projectId ?? event.userId,
    summary: `${event.kind} on ${event.momentId ?? event.renderVersion ?? 'unknown'} (${event.provenance})`,
    confidence,
    createdAt: event.createdAt,
    metadata: event.metadata,
  };
}

/** Rebuild a UserTasteProfile from raw events. Never invents traits — only evidence summaries + confidence. */
export function rebuildUserTasteProfileFromEvents(
  events: TastePreferenceEvent[],
  opts: { userId: string; now?: string },
): UserTasteProfile {
  const evidence = events.map(toEvidenceRef);
  const strongCount = events.filter((e) => e.kind !== 'exported').length;
  return {
    userId: opts.userId,
    version: 'user-taste-v1',
    evidence,
    preferredTraits: [],
    rejectedTraits: [],
    confidence: strongCount > 0 ? 'low' : 'unknown',
    updatedAt: opts.now ?? new Date().toISOString(),
  };
}
