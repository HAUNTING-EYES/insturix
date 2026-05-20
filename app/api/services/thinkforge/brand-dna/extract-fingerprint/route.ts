import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { updateUserBrandDNA } from '@/lib/thinkforge/services/db';
import { extractVoiceFingerprint } from '@/lib/thinkforge/data/voice-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ExtractRequestSchema = z.object({
  referenceTexts: z.array(z.string().max(10000)).min(5).max(100),
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

  const updated = await updateUserBrandDNA(userId, { voiceFingerprint: fingerprint });

  return NextResponse.json({
    voiceFingerprint: fingerprint,
    brandDNA: updated,
  });
}
