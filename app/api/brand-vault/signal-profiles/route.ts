import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/brand-vault/signal-profiles
 *
 * Returns the id of the signed-in user's latest accepted brand profile (or null), so the
 * Brand Vault tab can reload the saved vault on mount via the existing [id] load path instead
 * of re-showing the "build" screen on every visit.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const record = await getDefaultBrandVaultRefineryStore().getLatestAcceptedRecord({ userId });
  return NextResponse.json({ ok: true, recordId: record?.id ?? null });
}
