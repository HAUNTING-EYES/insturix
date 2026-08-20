import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function brandAccessUnavailable() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'brand_scope_unavailable',
        message: 'Brand Vault cannot verify organization brand access.',
      },
    },
    { status: 503 },
  );
}

/**
 * GET /api/brand-vault/brands/access  ->  { ok, grants: { [brandId]: userIds } }
 *
 * The org's full brand-access map, for the switcher's access chips (#3 — option C). Admin-only data:
 * non-admins and personal accounts get an EMPTY map (200, not 403) — no leak, no error noise, and the
 * chips simply don't render for them.
 */
export async function GET() {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  if (!orgId || !has({ role: 'org:admin' })) return NextResponse.json({ ok: true, grants: {} });

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.getBrandAccessGrants) return brandAccessUnavailable();

  try {
    const grants = await store.getBrandAccessGrants(orgId);
    const out: Record<string, string[]> = {};
    for (const [brandId, userIds] of grants) out[brandId] = [...userIds];
    return NextResponse.json({ ok: true, grants: out });
  } catch {
    return brandAccessUnavailable();
  }
}
