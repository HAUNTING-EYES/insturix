import { createHash } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateReferenceVideoUrlForAutoEditIntake } from '@/lib/editron/reference-video/reference-video-source';
import {
  TREND_CANDIDATE_VERSION,
  TREND_EVIDENCE_VERSION,
  TrendCandidateSchema,
  TrendPlatformSchema,
} from '@/lib/thinkforge/trends/trend-evidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DirectTrendReferenceRequestSchema = z.object({
  referenceVideoUrl: z.string().url().max(2_000),
  platform: TrendPlatformSchema.optional(),
}).strict();

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const input = DirectTrendReferenceRequestSchema.parse(body);
    const validation = validateReferenceVideoUrlForAutoEditIntake(input.referenceVideoUrl);
    if (!validation.ok) {
      return NextResponse.json({
        error: validation.diagnostics[0] ?? 'Provide a supported YouTube or direct public video URL.',
      }, { status: 422 });
    }

    const canonicalUrl = validation.url.toString();
    const fingerprint = createHash('sha256').update(canonicalUrl).digest('hex');
    const sourcePlatform = validation.sourceKind === 'youtube-url' ? 'youtube' : 'unknown';
    const platform = input.platform ?? sourcePlatform;
    const title = sourcePlatform === 'youtube' ? 'YouTube trend reference' : 'Video trend reference';
    const candidate = TrendCandidateSchema.parse({
      candidateId: `candidate_user_${fingerprint.slice(0, 24)}`,
      candidateVersion: TREND_CANDIDATE_VERSION,
      title,
      summary: 'User-submitted reference for structural trend analysis.',
      platform,
      evidence: [{
        evidenceId: `evidence_user_${fingerprint.slice(0, 24)}`,
        evidenceVersion: TREND_EVIDENCE_VERSION,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: sourcePlatform,
        title,
        sourceUrl: canonicalUrl,
        provenance: {
          purpose: 'public_trend_discovery',
          queryFingerprint: `user_reference_${fingerprint}`,
        },
      }],
      evidenceCompleteness: 0.75,
      freshness: 'unknown',
      trendSpecEligible: false,
      nextAction: 'analyze_reference_video',
    });

    return NextResponse.json({ candidate }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid trend reference.' }, { status: 400 });
    }
    console.error('[ThinkForge:TrendReference] Reference intake failed:', error);
    return NextResponse.json({ error: 'Trend reference could not be prepared.' }, { status: 500 });
  }
}
