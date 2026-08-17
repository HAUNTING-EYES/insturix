import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSession, getUserBrandDNA, updateUserBrandDNA, type BrandDNA } from '@/lib/thinkforge/services/db';
import { BrandDNAPatchSchema } from '@/lib/thinkforge/schemas/route-validation';
import { writeThinkForgeBrandDNAToBrandVault } from '@/lib/thinkforge/services/brand-vault-voice-evidence';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BrandDNA API — read/update the user's Identity layer
 *
 * GET  /api/services/thinkforge/brand-dna
 * PATCH /api/services/thinkforge/brand-dna  { voiceLock?, nicheMap?, killList?, ... }
 */

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const dna = await getUserBrandDNA(userId);
  return NextResponse.json({ brandDNA: dna ?? {} });
}

export async function PATCH(req: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BrandDNAPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { voiceLock, nicheMap, killList, hookArchetypes, structuralHabits, recurringAssets, voiceFingerprint, voiceExemplars } = parsed.data;
  const sessionId = cleanOptionalString((parsed.data as { sessionId?: unknown }).sessionId);
  const explicitBrandId = cleanOptionalString((parsed.data as { brandId?: unknown }).brandId);

  const updates: Partial<BrandDNA> = {
    ...(voiceLock !== undefined && { voiceLock }),
    ...(nicheMap !== undefined && { nicheMap }),
    ...(killList !== undefined && { killList }),
    ...(hookArchetypes !== undefined && { hookArchetypes }),
    ...(structuralHabits !== undefined && { structuralHabits }),
    ...(recurringAssets !== undefined && { recurringAssets }),
    ...(voiceFingerprint !== undefined && { voiceFingerprint: voiceFingerprint as BrandDNA['voiceFingerprint'] }),
    ...(voiceExemplars !== undefined && { voiceExemplars: voiceExemplars as BrandDNA['voiceExemplars'] }),
  };

  const session = sessionId ? await getSession(sessionId, userId, orgId) : null;
  if (sessionId && !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const sessionBrandId = resolveProjectMetaBrandId(session?.projectMeta);
  if (explicitBrandId && sessionBrandId && explicitBrandId !== sessionBrandId) {
    return NextResponse.json(
      { error: 'The selected brand does not match this session.' },
      { status: 409 },
    );
  }
  const brandId = explicitBrandId ?? sessionBrandId;
  const vaultSync = await writeThinkForgeBrandDNAToBrandVault({
    userId,
    orgId: orgId ?? null,
    isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
    brandId,
    sessionId,
    updates,
    source: 'manual_brand_dna_edit',
    actorId: userId,
  });
  if (brandId && !vaultSync.ok) {
    return NextResponse.json(
      { error: vaultSync.error, code: vaultSync.code },
      { status: vaultFailureStatus(vaultSync.code) },
    );
  }

  const updated = brandId
    ? (await getUserBrandDNA(userId)) ?? {}
    : await updateUserBrandDNA(userId, updates);

  return NextResponse.json({
    brandDNA: updated,
    ...(brandId ? { pendingBrandDNA: updates } : {}),
    vaultSync,
  });
}

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function vaultFailureStatus(code: 'brand_not_found' | 'brand_scope_unavailable' | 'write_failed'): 404 | 500 | 503 {
  if (code === 'brand_not_found') return 404;
  if (code === 'brand_scope_unavailable') return 503;
  return 500;
}
