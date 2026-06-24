import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getSession, updateUserBrandDNA } from '@/lib/thinkforge/services/db';
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
  const { userId } = await auth();
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
  const updated = await updateUserBrandDNA(userId, updates);
  const brandId = parsed.data.brandId ?? await resolveSessionBrandId(userId, parsed.data.sessionId);
  const vaultSync = await writeThinkForgeBrandDNAToBrandVault({
    userId,
    brandId,
    sessionId: parsed.data.sessionId,
    updates,
    source: 'voice_fingerprint_extract',
    actorId: userId,
  });

  return NextResponse.json({
    voiceFingerprint: fingerprint,
    brandDNA: updated,
    vaultSync,
  });
}

async function resolveSessionBrandId(userId: string, sessionId?: string): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const session = await getSession(sessionId, userId);
  return resolveProjectMetaBrandId(session?.projectMeta);
}
