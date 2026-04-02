/**
 * POST /api/services/pipeline/storyboard/[id]/scene/[sceneIndex]/upload-image
 *
 * Upload a real image to replace a scene's AI-generated storyboard image.
 * Useful when the user has an actual product shot, location photo, or
 * specific visual they want as the scene's base image.
 *
 * The uploaded image becomes the storyboard image for that scene.
 * Video generation will then animate THIS image (not an AI-generated one).
 *
 * Accepts: multipart/form-data with 'file' field
 * Returns: { success, imageUrl, assetId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneIndex: string }> },
) {
  try {
    // Reject oversized payloads early (50MB — storyboard images shouldn't be huge)
    const contentLength = parseInt(req.headers.get('content-length') || '0');
    if (contentLength > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large. Maximum size is 50MB.' }, { status: 413 });
    }

    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: storyboardId, sceneIndex: sceneIndexStr } = await params;
    const sceneIndex = parseInt(sceneIndexStr, 10);
    if (isNaN(sceneIndex)) {
      return NextResponse.json({ error: 'Invalid scene index' }, { status: 400 });
    }

    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });

    const scene = storyboard.scenes.find(s => s.sceneIndex === sceneIndex);
    if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Accepted: PNG, JPEG, WebP' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const assetId = `storyboard_upload_${nanoid(8)}`;
    const filename = `${assetId}.${ext}`;

    console.log(`[scene-upload] Uploading image for scene ${sceneIndex} of ${storyboardId} (${file.size} bytes)`);

    const uploadResult = await uploadMedia(buffer, userId, filename, file.type, { customAssetId: assetId });

    // Update the scene's storyboard image
    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: uploadResult.assetId,
      imageUrl: uploadResult.signedUrl,
      imageGcsPath: uploadResult.gcsPath ?? undefined,
      status: 'generated', // Mark as ready (skips AI generation for this scene)
      generationHistory: [
        ...(scene.generationHistory || []),
        {
          assetId: uploadResult.assetId,
          imageUrl: uploadResult.signedUrl,
          timestamp: new Date(),
          modelUsed: 'user-upload',
        },
      ],
    });

    console.log(`[scene-upload] Scene ${sceneIndex} image replaced: ${uploadResult.assetId}`);

    return NextResponse.json({
      success: true,
      imageUrl: uploadResult.signedUrl,
      assetId: uploadResult.assetId,
      scene: {
        sceneIndex,
        imageUrl: uploadResult.signedUrl,
        imageAssetId: uploadResult.assetId,
      },
    });
  } catch (error: any) {
    console.error('[scene-upload] Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
