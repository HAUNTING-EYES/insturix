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
  const { userId } = await auth();
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

  const updated = await updateUserBrandDNA(userId, updates);
  const brandId = explicitBrandId ?? await resolveSessionBrandId(userId, sessionId);
  const vaultSync = await writeThinkForgeBrandDNAToBrandVault({
    userId,
    brandId,
    sessionId,
    updates,
    source: 'manual_brand_dna_edit',
    actorId: userId,
  });

  return NextResponse.json({ brandDNA: updated, vaultSync });
}

async function resolveSessionBrandId(userId: string, sessionId?: string): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const session = await getSession(sessionId, userId);
  return resolveProjectMetaBrandId(session?.projectMeta);
}

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
