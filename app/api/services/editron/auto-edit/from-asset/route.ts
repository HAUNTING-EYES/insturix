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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface FromAssetRequest {
  assetId: string;
  title?: string;
  aspectRatio?: string;
  // Item 2: Multi-path entry — all optional, each creates a different flow
  script?: string;           // User-provided narration/script text → used as scene narration
  referenceAssetId?: string; // Reference video → extract EditDNA (style transfer)
  imageAssetIds?: string[];  // Reference images → IP-adapter consistency
  userIntent?: string;       // "gym promo for Instagram" → guides content type + platform detection
  platform?: string;         // Explicit platform override (youtube/instagram/tiktok/linkedin)
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: FromAssetRequest = await request.json();
    const { assetId, title, aspectRatio = '16:9', script, referenceAssetId, imageAssetIds, userIntent, platform } = body;

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

    // 2. Get playable URL for the video overlay (Worker URL for browser)
    const videoUrl = await assetResolver.resolveAssetUrl(assetId, userId);
    if (!videoUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve video URL' }, { status: 500 });
    }

    // 2b. Get server-side URL for AI services (presigned direct R2 — bypasses Cloudflare Worker)
    // Worker URL causes 429 when Gemini, xAI, fal.ai all download simultaneously through the proxy.
    // Presigned GET goes direct to R2 storage — no Worker concurrency limit, no 429.
    let serverVideoUrl = videoUrl; // default: same as browser URL
    try {
      const { isR2Available, getR2PresignedReadUrl } = await import('@/lib/editron/services/r2-service');
      if (isR2Available()) {
        serverVideoUrl = await getR2PresignedReadUrl(assetId, 3600); // 1hr expiry
      }
    } catch {
      // R2 not configured — use Worker URL (existing behavior)
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
    // Use CDN Worker URL for overlay src (never expires, has CORS).
    // resolveAssetUrl can return stale/expiring GCS URLs or Vercel proxy URLs
    // that fail when the browser tries to load the video.
    let overlaySrc = videoUrl;
    try {
      const { isR2Available, getR2PublicUrl } = await import('@/lib/editron/services/r2-service');
      if (isR2Available()) {
        overlaySrc = getR2PublicUrl(assetId);
      }
    } catch {
      // R2 not available — use resolveAssetUrl result
    }

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
      src: overlaySrc,
      assetId,
      // videoStartTime: 0 is explicit — silence removal uses this to calculate
      // source offsets when splitting the overlay into segments.
      // Without it, every segment plays from frame 0 (start of video).
      videoStartTime: 0,
      styles: { opacity: 1, objectFit: 'cover' as const },
    };

    await projectService.saveProject(userId, projectId, {
      overlays: [videoOverlay],
      aspectRatio,
      playerDimensions: { width: w, height: h },
      fps,
      durationInFrames,
    } as Parameters<typeof projectService.saveProject>[2]);

    // 5b. Pre-warm Modal GPU containers (fire-and-forget).
    // V-JEPA + Wav2Vec run at worker Step 3.5, ~150s after QStash dispatch.
    // Cold start takes 60-90s. Warming now gives the containers time to load
    // model weights while the worker is doing transcription + editorial intent.
    try {
      const { warmupVjepa } = await import('@/lib/editron/services/vjepa-service');
      const { warmupWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
      warmupVjepa();
      warmupWav2Vec();
    } catch {
      // Non-fatal — GPU analysis is optional
    }

    // 6. Mark project + dispatch heavy processing to QStash worker.
    // Worker handles: video understanding → SyntheticStoryboard → profile detection → Director.
    // Runs async — from-asset returns immediately with projectId.
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditMode: 'asset',
          autoEditStatus: 'queued',
          sourceAssetId: assetId,
          ...(referenceAssetId && { referenceAssetId }),
          ...(imageAssetIds?.length && { referenceImageAssetIds: imageAssetIds }),
          updatedAt: new Date(),
        },
      },
    );

    // Dispatch to video-analysis worker via QStash
    const qstashToken = process.env.QSTASH_TOKEN;
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const workerUrl = `${baseUrl}/api/internal/workers/video-analysis`;

    if (qstashToken) {
      const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${workerUrl}`;
      console.log(`[auto-edit/from-asset] QStash dispatch: URL=${qstashUrl}, workerUrl=${workerUrl}`);

      const qstashRes = await fetch(qstashUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${qstashToken}`,
          'Content-Type': 'application/json',
          'Upstash-Retries': '1',
        },
        body: JSON.stringify({
          projectId,
          userId,
          assetId,
          videoUrl: serverVideoUrl,
          durationSec,
          title: projectName,
          profileId: 'A-01',
          userIntent,
          referenceAssetId,
          script,
          platform,
        }),
      });

      if (!qstashRes.ok) {
        const errBody = await qstashRes.text().catch(() => 'no body');
        const errMsg = `QStash dispatch failed: HTTP ${qstashRes.status} — ${errBody}`;
        console.error(`[auto-edit/from-asset] ${errMsg}`);
        // Mark project as failed so dashboard shows error instead of infinite polling
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'failed', autoEditError: errMsg } },
        );
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }

      const qstashData = await qstashRes.json().catch(() => ({}));
      console.log(`[auto-edit/from-asset] QStash dispatched: messageId=${qstashData.messageId || 'unknown'}`);
    } else {
      // No QStash → run inline (dev mode)
      console.warn(`[auto-edit/from-asset] No QSTASH_TOKEN — running analysis inline (slow)`);
      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      const ssb = await analyzeVideo(serverVideoUrl, durationSec, userIntent || projectName);
      if (ssb) {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { syntheticStoryboard: ssb, autoEditStatus: 'editing' } },
        );
      }
      const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
      await executeDirectorPlan(projectId, userId, 'A-01');
      await db.collection('projects').updateOne(
        { projectId },
        { $set: { autoEditStatus: 'complete' } },
      );
    }

    const totalMs = Date.now() - startMs;

    return NextResponse.json({
      success: true,
      projectId,
      status: 'processing',
      message: 'Video analysis + AI editing started. Check project for results.',
      totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[auto-edit/from-asset] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
