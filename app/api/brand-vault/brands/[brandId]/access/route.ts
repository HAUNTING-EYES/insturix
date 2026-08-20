import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { normalizeBrandAccessUserIds } from '@/lib/shared/brand-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Agency ACL admin endpoint (#3). Org admins assign a brand to specific teammates.
 *
 * GET  /api/brand-vault/brands/[brandId]/access  -> { ok, brandId, userIds }   (current assignment)
 * PUT  /api/brand-vault/brands/[brandId]/access  body { userIds: string[] }    (assign; [] reopens)
 *
 * Admin-only by design: a brand restriction controls who across the org sees a client, so only an org
 * admin may set it. Org context is required (personal accounts have no cross-user ACL).
 */

type Params = { params: Promise<{ brandId: string }> };

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

function invalidAccessAssignment() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'userIds must be an array. Send [] only to intentionally reopen a brand to the organization.',
      },
    },
    { status: 400 },
  );
}

async function requireOrgAdmin(): Promise<
  | { ok: true; orgId: string }
  | { ok: false; response: NextResponse }
> {
  const { userId, orgId, has } = await auth();
  if (!userId) return { ok: false, response: new NextResponse('Unauthorized', { status: 401 }) };
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: { code: 'org_required', message: 'Brand access is an org feature.' } },
        { status: 400 },
      ),
    };
  }
  if (!has({ role: 'org:admin' })) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: { code: 'forbidden', message: 'Only an org admin can manage brand access.' } },
        { status: 403 },
      ),
    };
  }
  return { ok: true, orgId };
}

export async function GET(_req: Request, { params }: Params) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) return gate.response;
  const { brandId } = await params;

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.getBrandAccessGrants) return brandAccessUnavailable();
  try {
    const grants = await store.getBrandAccessGrants(gate.orgId);
    return NextResponse.json({ ok: true, brandId, userIds: [...(grants.get(brandId) ?? [])] });
  } catch {
    return brandAccessUnavailable();
  }
}

export async function PUT(req: Request, { params }: Params) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) return gate.response;
  const { brandId } = await params;

  const body = await req.json().catch(() => null) as { userIds?: unknown } | null;
  if (!body || !Array.isArray(body.userIds)) return invalidAccessAssignment();
  const userIds = normalizeBrandAccessUserIds(body?.userIds);

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.setBrandAccess) return brandAccessUnavailable();
  try {
    await store.setBrandAccess({ orgId: gate.orgId, brandId, userIds });
    return NextResponse.json({ ok: true, brandId, userIds });
  } catch {
    return brandAccessUnavailable();
  }
}
