import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard } from '@/lib/pipeline/storyboard-db';
import { projectService } from '@/lib/editron/services/project-service';
import { CreditsService } from '@/lib/services/creditsService';
import type { Storyboard } from '@/lib/pipeline/schemas/storyboard';

export const maxDuration = 30;

/**
 * POST /api/services/pipeline/storyboard/[id]/finalize
 * Convert an approved storyboard into an Editron project.
 * Uses scene images as backgrounds, narration as text, voiceover as audio.
 * Cost: 1 credit.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { aspectRatio = '16:9', includeVoiceover = true, includeCaptions = true } = body;

    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

    // Deduct 1 credit
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'storyboard_finalize',
    );
    if (!deductResult.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Determine canvas dimensions
    let width = 1920, height = 1080;
    if (aspectRatio === '9:16') { width = 1080; height = 1920; }
    else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
    else if (aspectRatio === '4:5') { width = 1080; height = 1350; }

    const fps = 30;
    const overlays: any[] = [];
    let currentFrame = 0;
    let overlayId = Date.now();

    for (const scene of storyboard.scenes) {
      const durationFrames = Math.round(scene.descriptor.durationSeconds * fps);

      // Scene background: prefer video clip over static image
      if (scene.videoUrl) {
        // AI-generated video clip
        overlays.push({
          id: overlayId++,
          type: 'video',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 3, // Background row
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          src: scene.videoUrl,
          assetId: scene.videoAssetId,
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        });
      } else if (scene.imageUrl) {
        // Static storyboard image as fallback
        overlays.push({
          id: overlayId++,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 3, // Background row
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          src: scene.imageUrl,
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        });
      }

      // Narration text overlay (lower-third)
      if (scene.descriptor.narration) {
        const narrationText = scene.descriptor.narration.length > 120
          ? scene.descriptor.narration.substring(0, 117) + '...'
          : scene.descriptor.narration;

        overlays.push({
          id: overlayId++,
          type: 'text',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 0, // Foreground
          left: width * 0.05,
          top: height * 0.82,
          width: width * 0.9,
          height: height * 0.14,
          isDragging: false,
          rotation: 0,
          content: narrationText,
          styles: {
            fontSize: '28',
            fontFamily: 'font-sans',
            fontWeight: '400',
            textAlign: 'center',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.6)',
            fontStyle: 'normal',
            textDecoration: 'none',
            opacity: 1,
            borderRadius: '8px',
            padding: '12px',
            animation: { enter: 'fade', exit: 'fade', duration: 10 },
          },
        });
      }

      // Voiceover audio overlay
      if (includeVoiceover && scene.voiceover?.audioUrl) {
        overlays.push({
          id: overlayId++,
          type: 'sound',
          from: currentFrame,
          durationInFrames: Math.round((scene.voiceover.audioDurationMs / 1000) * fps),
          row: 4, // Audio track
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          isDragging: false,
          rotation: 0,
          content: scene.voiceover.audioUrl,
          src: scene.voiceover.audioUrl,
          styles: { volume: 1 },
        });
      }

      // Scene title (first 2 seconds)
      if (scene.descriptor.title) {
        overlays.push({
          id: overlayId++,
          type: 'text',
          from: currentFrame,
          durationInFrames: Math.min(fps * 2, durationFrames),
          row: 1, // Above narration
          left: width * 0.1,
          top: height * 0.12,
          width: width * 0.8,
          height: height * 0.08,
          isDragging: false,
          rotation: 0,
          content: scene.descriptor.title,
          styles: {
            fontSize: '48',
            fontFamily: 'font-sans',
            fontWeight: '700',
            textAlign: 'center',
            color: '#ffffff',
            backgroundColor: 'transparent',
            fontStyle: 'normal',
            textDecoration: 'none',
            opacity: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            animation: { enter: 'fade', exit: 'fade', duration: 15 },
          },
        });
      }

      currentFrame += durationFrames;
    }

    // Create Editron project
    const project = await projectService.createProject(userId, {
      name: storyboard.title || 'Storyboard Video',
      overlays,
      aspectRatio,
      playerDimensions: { width, height },
      fps,
      durationInFrames: currentFrame,
    });

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: project.name,
      overlayCount: overlays.length,
      totalDurationFrames: currentFrame,
    });
  } catch (error: any) {
    console.error('[Finalize]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
