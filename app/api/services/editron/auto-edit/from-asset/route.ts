/**
 * POST /api/services/editron/auto-edit/from-asset
 *
 * Mode 2: User uploads footage → AI edits it.
 * Accepts an existing media_assets assetId (already uploaded via Asset Library).
 * Creates an Editron project, adds the video as a single overlay, auto-detects
 * the best edit profile, and runs the Director Agent.
 *
 * The Director's 5-Track analysis runs on the REAL video (not storyboard metadata)
 * because isAIProject = false (no sourceStoryboardId). This produces accurate
 * motion, subject, composition, and speech data for the intelligence layer.
 *
 * Cost: ~$0.05-0.15 (Gemini 5-Track + Deepgram transcription). No video generation.
 *
 * Future upgrade: Add video-understanding-service.ts (SyntheticStoryboard) to give
 * the Director richer scene context (narration, mood, edit directions).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface FromAssetRequest {
  assetId: string;
  title?: string;
  aspectRatio?: string;
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: FromAssetRequest = await request.json();
    const { assetId, title, aspectRatio = '16:9' } = body;

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'assetId is required' }, { status: 400 });
    }

    // 1. Resolve asset — validates it exists + belongs to user
    const asset = await assetResolver.getAsset(assetId, userId);
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found or not owned by user' }, { status: 404 });
    }

    if (asset.type !== 'video') {
      return NextResponse.json({ success: false, error: 'Asset must be a video' }, { status: 400 });
    }

    console.log(`[auto-edit/from-asset] Starting for asset ${assetId} (${asset.filename}, ${asset.duration}s)`);

    // 2. Get playable URL for the video overlay
    const videoUrl = await assetResolver.resolveAssetUrl(assetId, userId);
    if (!videoUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve video URL' }, { status: 500 });
    }

    // 3. Compute dimensions from aspect ratio
    const fps = 30;
    const durationSec = asset.duration || 30;
    const durationInFrames = Math.round(durationSec * fps);
    const [w, h] = aspectRatio === '9:16' ? [1080, 1920]
      : aspectRatio === '1:1' ? [1080, 1080]
      : [1920, 1080];

    // 4. Create Editron project
    const projectName = title || `Auto-Edit: ${asset.filename}`;
    const project = await projectService.createProject(userId, projectName);
    const projectId = project.projectId;

    console.log(`[auto-edit/from-asset] Created project ${projectId}`);

    // 5. Add the video as a single overlay spanning the full duration
    const videoOverlay = {
      id: Date.now(),
      type: 'video' as const,
      from: 0,
      durationInFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: w,
      height: h,
      isDragging: false,
      rotation: 0,
      src: videoUrl,
      assetId,
      styles: { opacity: 1, objectFit: 'cover' as const },
    };

    await projectService.saveProject(userId, projectId, {
      overlays: [videoOverlay],
      aspectRatio,
      playerDimensions: { width: w, height: h },
      fps,
      durationInFrames,
    } as Parameters<typeof projectService.saveProject>[2]);

    // 6. Analyze video → SyntheticStoryboard (Gemini Vision)
    // Gives Director scene context: narration, mood, edit directions, content type.
    // Without this, Director runs blind (5-Track only, no story understanding).
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    let syntheticStoryboard: any = null;
    try {
      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      console.log(`[auto-edit/from-asset] Analyzing video for scene understanding...`);
      syntheticStoryboard = await analyzeVideo(videoUrl, durationSec, title);
      if (syntheticStoryboard) {
        console.log(`[auto-edit/from-asset] SyntheticStoryboard: ${syntheticStoryboard.scenes.length} scenes, type=${syntheticStoryboard.contentType}`);
      }
    } catch (analyzeErr: unknown) {
      const msg = analyzeErr instanceof Error ? analyzeErr.message : String(analyzeErr);
      console.warn(`[auto-edit/from-asset] Video analysis failed (Director runs without scene context): ${msg}`);
    }

    // 7. Store project metadata + SyntheticStoryboard
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditMode: 'asset',
          sourceAssetId: assetId,
          ...(syntheticStoryboard && { syntheticStoryboard }),
          updatedAt: new Date(),
        },
      },
    );

    // 8. Auto-detect edit profile — use SyntheticStoryboard for richer signal
    let profileId = 'A-01';
    try {
      const { getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
      const { profile } = getAutoSelectedProfile({
        title: syntheticStoryboard?.title || projectName,
        contentType: syntheticStoryboard?.contentType || 'video',
        platform: syntheticStoryboard?.platform || 'youtube',
        scenes: syntheticStoryboard?.scenes?.map((s: any) => ({
          narration: s.descriptor?.narration,
          visualDescription: s.descriptor?.visualDescription,
          mood: s.descriptor?.mood,
          editDirections: s.descriptor?.editDirections,
        })) || [],
        globalEditDirections: syntheticStoryboard?.globalEditDirections,
        overallMusicPrompt: syntheticStoryboard?.overallMusicPrompt,
      });
      if (profile?.profileId) profileId = profile.profileId;
      console.log(`[auto-edit/from-asset] Profile detected: ${profileId}`);
    } catch (profileErr: unknown) {
      const msg = profileErr instanceof Error ? profileErr.message : String(profileErr);
      console.warn(`[auto-edit/from-asset] Profile detection failed, using default ${profileId}: ${msg}`);
    }

    // 8. Run Director Agent
    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    const directorResult = await executeDirectorPlan(
      projectId,
      userId,
      profileId,
      undefined, // no brief overrides for V1
      (step, total, desc) => {
        console.log(`[auto-edit/from-asset] Director ${step}/${total}: ${desc}`);
      },
    );

    const totalMs = Date.now() - startMs;
    console.log(`[auto-edit/from-asset] Complete: ${projectId} in ${totalMs}ms (${directorResult.actionsExecuted} actions)`);

    return NextResponse.json({
      success: true,
      projectId,
      profileId,
      directorResult: {
        actionsExecuted: directorResult.actionsExecuted,
        overlaysModified: directorResult.overlaysModified,
        warnings: directorResult.warnings,
        executionMs: directorResult.executionMs,
      },
      totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[auto-edit/from-asset] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
