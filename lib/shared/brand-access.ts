/**
 * Per-user -> brand access (agency ACL). #3.
 *
 * Insturix ICP includes agencies that run many CLIENT brands inside one org. By default every org
 * member sees every org brand; this lets an admin scope a brand to specific teammates ("Client X is
 * handled by Alice and Bob").
 *
 * Semantics (Rule 29 — designed so it can't silently lock anyone out):
 *  - DEFAULT OPEN: a brand with no assignment (or an empty one) is visible to EVERY org member. Existing
 *    orgs are unchanged until someone explicitly assigns a brand — restriction is strictly opt-in.
 *  - RESTRICTED: once a brand has a non-empty assignment, only those users — plus org admins — see and
 *    resolve it. Admins always bypass, so an admin can never accidentally lock the whole org (including
 *    themselves) out of a client.
 *
 * This module is the pure decision layer. Persistence (where assignments live) and the admin control
 * surface (API + UI) wire to it separately.
 */

/** brandId -> allowed userIds. ONLY restricted brands appear; an absent or empty entry means "open". */
export type BrandAccessGrants = ReadonlyMap<string, readonly string[]>;

export interface BrandAccessContext {
  /** The user the access decision is being made for. */
  userId?: string;
  /** Org admins manage all client brands and bypass every restriction. */
  isOrgAdmin?: boolean;
}

/** Composite key for storing one org's brand assignments in a flat map. orgIds never contain "::". */
export function brandAccessKey(orgId: string | null | undefined, brandId: string): string {
  return `${orgId ?? ''}::${brandId}`;
}

/**
 * A new brand id. Uses Web Crypto when present, else a timestamp+random fallback — `globalThis.crypto`
 * is NOT guaranteed on every Node runtime (Node 18 without global webcrypto has none), and calling
 * `.randomUUID()` on it would throw and silently break accept/heal. No node:crypto import (client-safe).
 */
export function mintBrandId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `brand_${uuid ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`}`;
}

/** A brand is accessible when it has no (non-empty) assignment, the user is an org admin, or is assigned. */
export function isBrandAccessible(
  brandId: string,
  grants: BrandAccessGrants,
  context: BrandAccessContext,
): boolean {
  const allowed = grants.get(brandId);
  if (!allowed || allowed.length === 0) return true; // open by default
  if (context.isOrgAdmin) return true; // admins manage everything
  return context.userId !== undefined && allowed.includes(context.userId);
}

/** Drop the brands a user may not see. Brands without an assignment pass through untouched. */
export function filterAccessibleBrands<T extends { brandId: string }>(
  brands: readonly T[],
  grants: BrandAccessGrants,
  context: BrandAccessContext,
): T[] {
  return brands.filter((brand) => isBrandAccessible(brand.brandId, grants, context));
}

/**
 * Clean a raw assignment list: drop non-strings/blanks and dedupe. An empty result is meaningful — it
 * REMOVES the restriction (reopens the brand to the whole org), so callers should treat [] as "clear".
 */
export function normalizeBrandAccessUserIds(userIds: unknown): string[] {
  if (!Array.isArray(userIds)) return [];
  return [
    ...new Set(
      userIds
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .map((u) => u.trim()),
    ),
  ];
}
