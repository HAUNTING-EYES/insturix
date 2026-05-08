import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/services/clickatron/session/:id/upload-image
 *
 * Upload a user image and create/update a variation with it.
 * No credit deduction - uploads are free.
 * When the image is later used for AI edit/variation, normal credit logic applies.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json(
        { error: 'Invalid Session ID' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile || !(imageFile instanceof File)) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ACCEPTED_TYPES.includes(imageFile.type)) {
      return NextResponse.json(
        {
          error: 'Invalid image format',
          details: 'Accepted formats: PNG, JPG, JPEG, WEBP',
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (imageFile.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: 'Image too large',
          details: 'Maximum file size is 5MB',
        },
        { status: 400 }
      );
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    const task = await ClickatronTask.findOne({
      _id: objectId,
      clerkUserId: userId,
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (!task.details?.canvas) {
      task.details.canvas = { variations: [], chatHistory: [] };
    }

    const parentVariationId = formData.get('parentVariationId') as
      | string
      | undefined;
    const updateExistingBlank =
      formData.get('updateExistingBlank') === 'true';
    const aspectRatio =
      (formData.get('aspectRatio') as string) || task.details.aspectRatio;

    // Upload image to R2
    const variationId =
      updateExistingBlank && parentVariationId
        ? parentVariationId
        : `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const r2Url = await ClickatronR2Manager.uploadImageBuffer(
      userId,
      id,
      variationId,
      buffer,
      imageFile.type
    );

    const rawR2Url = r2Url.split('?')[0];

    const now = new Date();
    const newVariation = {
      id: variationId,
      prompt: 'Uploaded image',
      status: 'completed' as const,
      imageRef: rawR2Url,
      thumbnailRef: '',
      aspectRatio,
      fineTuning: {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      createdAt: now,
      updatedAt: now,
      parentVariationId,
      modelId: 'user-upload',
      metadata: { source: 'upload' },
    };

    const currentVariations = task.details.canvas.variations || [];

    if (updateExistingBlank && parentVariationId) {
      const existingIndex = currentVariations.findIndex(
        (v: any) => v.id === parentVariationId
      );
      if (existingIndex !== -1) {
        currentVariations[existingIndex] = newVariation;
      } else {
        currentVariations.unshift(newVariation);
      }
    } else {
      currentVariations.unshift(newVariation);
    }

    task.details.canvas.variations = currentVariations.slice(0, 50);
    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    return NextResponse.json({
      success: true,
      variation: newVariation,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
