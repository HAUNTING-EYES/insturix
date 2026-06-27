/**
 * CalOS access scope (Phase D — shared / team calendar).
 *
 * Before: every CalOS route scoped by the creator (`ownerUserId`), so a teammate never saw a brand's
 * cards. Now: when the signed-in user is in an org, the calendar is SHARED across that org — any member
 * sees and edits the org's cards for a brand. Solo users (no org) stay scoped to themselves, exactly
 * as before. `ownerUserId` is kept on the document as attribution (who created it / whose connected
 * account posts), NOT the access boundary.
 *
 * v1 (this is the deliberately-shallow Phase D): ALL org members can see/edit ALL the org's brands.
 * Per-brand membership gating (assign Client X to user U) is Phase C — not here.
 *
 * ponytail: documents created BEFORE org-stamping (orgId null) won't appear in an org-scoped read — a
 * one-time backfill (set orgId on legacy null-org docs) is the follow-up, mirroring the R5 brand-vault
 * backfill. Acceptable for v1 (new docs are stamped with the creator's session org at creation).
 *
 * SAFETY: orgId comes only from the trusted Clerk session (auth().orgId) — never the request body — so
 * a member can only ever read/write their own org's rows. No cross-org leak.
 */
export interface CalosSessionScope {
  userId: string;
  orgId?: string | null;
}

/** Mongo filter fragment: org-shared when the session has an org, else creator-scoped. Add deletedAt etc. */
export function calosScope(session: CalosSessionScope, brandId: string): Record<string, unknown> {
  return session.orgId
    ? { brandId, orgId: session.orgId }
    : { brandId, ownerUserId: session.userId };
}
