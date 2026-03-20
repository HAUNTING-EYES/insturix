import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReferenceImageSet, updateSubjectReference } from '@/lib/pipeline/reference-image-db';
import { generateReferenceImage } from '@/lib/pipeline/reference-image-service';
import { CreditsService } from '@/lib/services/creditsService';

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string; subjectId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId, subjectId } = await params;
    const body = await req.json();
    const { feedback, artStyle } = body;

    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const subject = refSet.subjects.find((s) => s.subjectId === subjectId);
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    // Deduct 1 credit
    const deduct = await CreditsService.deductCredits(userId, 'pipeline', 'reference_image_regen');
    if (!deduct.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Append feedback to visual description if provided
    const subjectWithFeedback = { ...subject };
    if (feedback) {
      subjectWithFeedback.visualDescription = `${subject.visualDescription}. User feedback: ${feedback}`;
    }

    const result = await generateReferenceImage(subjectWithFeedback, userId, { artStyle });

    const history = [...(subject.generationHistory || []), {
      assetId: result.assetId,
      imageUrl: result.imageUrl,
      timestamp: new Date(),
      feedback,
    }];

    await updateSubjectReference(refSetId, subjectId, {
      imageUrl: result.imageUrl,
      imageAssetId: result.assetId,
      imageGcsPath: result.gcsPath,
      status: 'generated',
      generationHistory: history,
    });

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      assetId: result.assetId,
    });
  } catch (error: any) {
    console.error('[regenerate-ref]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
