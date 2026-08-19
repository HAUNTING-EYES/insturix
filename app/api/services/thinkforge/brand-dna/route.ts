import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSession, getUserBrandDNA, updateUserBrandDNA, type BrandDNA } from '@/lib/thinkforge/services/db';
import { BrandDNAPatchSchema } from '@/lib/thinkforge/schemas/route-validation';
import { writeThinkForgeBrandDNAToBrandVault } from '@/lib/thinkforge/services/brand-vault-voice-evidence';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';
import {
  resolveThinkForgeBrandAuthority,
  ThinkForgeBrandAuthorityError,
} from '@/lib/thinkforge/context/brand-authoring-context';
import { brandSignalProfileToBrandDNA } from '@/lib/shared/brand-signal-profile-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BrandDNA API — read/update the user's Identity layer
 *
 * GET  /api/services/thinkforge/brand-dna
 * PATCH /api/services/thinkforge/brand-dna  { voiceLock?, nicheMap?, killList?, ... }
 */

export async function GET(req: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const sessionId = cleanOptionalString(new URL(req.url).searchParams.get('sessionId'));
  if (!sessionId) {
    const dna = await getUserBrandDNA(userId);
    return NextResponse.json({ brandDNA: dna ?? {}, scope: { kind: 'personal' } });
  }

  const session = await getSession(sessionId, userId, orgId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const brandId = resolveProjectMetaBrandId(session.projectMeta);
  if (!brandId) {
    const dna = await getUserBrandDNA(userId);
    return NextResponse.json({ brandDNA: dna ?? {}, scope: { kind: 'personal' } });
  }

  try {
    const authority = await resolveThinkForgeBrandAuthority({
      userId,
      orgId: orgId ?? null,
      isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
      brandId,
    });
    if (!authority) {
      throw new ThinkForgeBrandAuthorityError('brand_profile_unavailable', 'The session brand has no accepted profile.');
    }
    return NextResponse.json({
      brandDNA: brandSignalProfileToBrandDNA<BrandDNA>(authority.profile, {}),
      scope: {
        kind: 'brand',
        brandId: authority.brandId,
        brandName: authority.brandName,
        recordId: authority.recordId,
        profileUpdatedAt: authority.profileUpdatedAt,
      },
    });
  } catch (error) {
    if (error instanceof ThinkForgeBrandAuthorityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === 'brand_scope_unavailable' ? 503 : 404 },
      );
    }
    return NextResponse.json(
      { error: 'Brand Vault could not load this session brand.', code: 'brand_scope_unavailable' },
      { status: 503 },
    );
  }
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
  const {
    voiceLock,
    nicheMap,
    killList,
    hookArchetypes,
    structuralHabits,
    recurringAssets,
    voiceFingerprint,
    voiceExemplars,
    sessionId,
    brandId: explicitBrandId,
  } = parsed.data;

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
