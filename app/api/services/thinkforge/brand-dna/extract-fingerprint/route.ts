import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getSession, getUserBrandDNA, updateUserBrandDNA } from '@/lib/thinkforge/services/db';
import { extractVoiceFingerprint } from '@/lib/thinkforge/data/voice-signature';
import { writeThinkForgeBrandDNAToBrandVault } from '@/lib/thinkforge/services/brand-vault-voice-evidence';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ExtractRequestSchema = z.object({
  referenceTexts: z.array(z.string().max(10000)).min(5).max(100),
  brandId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

/**
 * POST /api/services/thinkforge/brand-dna/extract-fingerprint
 *
 * Accepts 5-100 reference texts, extracts a VoiceFingerprint (pure code,
 * zero LLM), and saves it to the user's BrandDNA.
 */
export async function POST(req: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ExtractRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const fingerprint = extractVoiceFingerprint(parsed.data.referenceTexts);

  const updates = { voiceFingerprint: fingerprint };
  const session = parsed.data.sessionId
    ? await getSession(parsed.data.sessionId, userId, orgId)
    : null;
  if (parsed.data.sessionId && !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const sessionBrandId = resolveProjectMetaBrandId(session?.projectMeta);
  if (parsed.data.brandId && sessionBrandId && parsed.data.brandId !== sessionBrandId) {
    return NextResponse.json(
      { error: 'The selected brand does not match this session.' },
      { status: 409 },
    );
  }
  const brandId = parsed.data.brandId ?? sessionBrandId;
  const vaultSync = await writeThinkForgeBrandDNAToBrandVault({
    userId,
    orgId: orgId ?? null,
    isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
    brandId,
    sessionId: parsed.data.sessionId,
    updates,
    source: 'voice_fingerprint_extract',
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
    voiceFingerprint: fingerprint,
    brandDNA: updated,
    ...(brandId ? { pendingBrandDNA: updates } : {}),
    vaultSync,
  });
}

function vaultFailureStatus(code: 'brand_not_found' | 'brand_scope_unavailable' | 'write_failed'): 404 | 500 | 503 {
  if (code === 'brand_not_found') return 404;
  if (code === 'brand_scope_unavailable') return 503;
  return 500;
}
