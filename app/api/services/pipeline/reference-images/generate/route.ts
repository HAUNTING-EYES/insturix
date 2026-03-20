import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateAllReferenceImages } from '@/lib/pipeline/reference-image-service';
import { CreditsService } from '@/lib/services/creditsService';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/services/pipeline/reference-images/generate
 * Generate reference images for extracted subjects.
 * Cost: 1 credit per subject.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subjects, artStyle, sourceScriptId } = await req.json();
    if (!subjects?.length) {
      return NextResponse.json({ error: 'subjects array required' }, { status: 400 });
    }

    // Deduct 1 credit per subject
    for (let i = 0; i < subjects.length; i++) {
      const result = await CreditsService.deductCredits(userId, 'pipeline', 'reference_image');
      if (!result.success) {
        return NextResponse.json({ error: 'Insufficient credits', charged: i }, { status: 402 });
      }
    }

    const refSet = await generateAllReferenceImages(subjects, userId, {
      artStyle,
      sourceScriptId,
    });

    return NextResponse.json({
      success: true,
      refSetId: refSet.refSetId,
      subjects: refSet.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.name,
        category: s.category,
        imageUrl: s.imageUrl,
        status: s.status,
        scenesAppearingIn: s.scenesAppearingIn,
      })),
    });
  } catch (error: any) {
    console.error('[reference-images/generate]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
