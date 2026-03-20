import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { getReferenceImageSet, addSubjectToRefSet, updateSubjectReference } from '@/lib/pipeline/reference-image-db';
import { generateReferenceImage } from '@/lib/pipeline/reference-image-service';
import { CreditsService } from '@/lib/services/creditsService';
import type { SubjectReference } from '@/lib/pipeline/schemas/reference-image';

export const maxDuration = 60;

/**
 * POST /api/services/pipeline/reference-images/[refSetId]/add-subject
 * Add a new custom subject to the reference set and generate its image.
 * Cost: 1 credit.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId } = await params;
    const body = await req.json();
    const { name, category, visualDescription, scenesAppearingIn, artStyle, modelId } = body;

    if (!name?.trim() || !visualDescription?.trim()) {
      return NextResponse.json(
        { error: 'name and visualDescription are required' },
        { status: 400 },
      );
    }

    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Reference set not found' }, { status: 404 });

    // Deduct 1 credit
    const deduct = await CreditsService.deductCredits(userId, 'pipeline', 'reference_image');
    if (!deduct.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const subjectId = `sub_${nanoid(10)}`;
    const validCategories = ['character', 'product', 'location', 'object', 'vehicle'];
    const resolvedCategory = validCategories.includes(category) ? category : 'object';

    // Create the subject record
    const newSubject: SubjectReference = {
      subjectId,
      name: name.trim(),
      category: resolvedCategory,
      visualDescription: visualDescription.trim(),
      scenesAppearingIn: scenesAppearingIn || [],
      status: 'generating',
      generationHistory: [],
    };

    // Save to DB first (so it exists even if generation fails)
    await addSubjectToRefSet(refSetId, newSubject);

    // Generate the image
    const result = await generateReferenceImage(newSubject, userId, { artStyle, modelId });

    // Update with generated image
    await updateSubjectReference(refSetId, subjectId, {
      imageUrl: result.imageUrl,
      imageAssetId: result.assetId,
      imageGcsPath: result.gcsPath,
      status: 'generated',
      generationHistory: [{
        assetId: result.assetId,
        imageUrl: result.imageUrl,
        timestamp: new Date(),
      }],
    });

    return NextResponse.json({
      success: true,
      subject: {
        subjectId,
        name: name.trim(),
        category: resolvedCategory,
        visualDescription: visualDescription.trim(),
        scenesAppearingIn: scenesAppearingIn || [],
        imageUrl: result.imageUrl,
        imageAssetId: result.assetId,
        status: 'generated',
      },
    });
  } catch (error: any) {
    console.error('[add-subject]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
