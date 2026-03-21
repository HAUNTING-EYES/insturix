import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard } from '@/lib/pipeline/storyboard-db';
import { projectService } from '@/lib/editron/services/project-service';
import { CreditsService } from '@/lib/services/creditsService';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { Storyboard } from '@/lib/pipeline/schemas/storyboard';
import { generateBackgroundMusic, buildMusicPrompt, isBGMAvailable } from '@/lib/pipeline/bgm-service';
import { generateSFXForScenes, isSFXAvailable, type SFXResult } from '@/lib/pipeline/sfx-service';

export const maxDuration = 300; // Increased: BGM + per-scene SFX generation can take several minutes

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

    // Track per-scene frame offsets so we can place SFX overlays later
    const sceneFrameMap: Array<{ sceneIndex: number; fromFrame: number; durationFrames: number; durationSec: number }> = [];

    for (const scene of storyboard.scenes) {
      // Use actual video duration if available, otherwise fall back to script estimate.
      // AI video clips are typically 5-10s, so the script's word-count estimate
      // (which can be 20-40s) would leave huge gaps.
      const videoScene = scene as any;
      const videoDurationSec = videoScene.videoDurationMs
        ? videoScene.videoDurationMs / 1000
        : null;
      const sceneDurationSec = videoDurationSec
        ? Math.max(videoDurationSec, Math.min(scene.descriptor.durationSeconds, videoDurationSec + 2))
        : Math.min(scene.descriptor.durationSeconds, 15); // Cap at 15s when no video
      const durationFrames = Math.round(sceneDurationSec * fps);

      // Scene background: ALWAYS add image as base layer (prevents blank gaps
      // between video clips while the next video loads/buffers).
      // Then layer the video on top if available.
      if (scene.imageUrl) {
        overlays.push({
          id: overlayId++,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 3, // Background row (behind video)
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          content: scene.imageUrl,
          src: scene.imageUrl,
          assetId: scene.imageAssetId,
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        });
      }

      if (scene.videoUrl) {
        // AI-generated video clip on top of the image
        overlays.push({
          id: overlayId++,
          type: 'video',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: 2, // Video layer (in front of image on row 3)
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          content: scene.videoUrl,
          src: scene.videoUrl,
          assetId: scene.videoAssetId,
          posterUrl: scene.imageUrl || undefined, // Storyboard image for timeline thumbnails (avoids CORS)
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        });
      }

      // Narration text overlay (lower-third)
      if (scene.descriptor.narration) {
        // Strip markdown formatting (**bold**, *italic*, ## headers, bullet points)
        const cleanNarration = scene.descriptor.narration
          .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
          .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
          .replace(/^#+\s*/gm, '')            // ## headers → text
          .replace(/^[-*]\s+/gm, '')          // bullet points
          .replace(/`(.+?)`/g, '$1')          // inline code
          .trim();
        const narrationText = cleanNarration.length > 120
          ? cleanNarration.substring(0, 117) + '...'
          : cleanNarration;

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
          assetId: scene.voiceover.audioAssetId, // Needed for URL resolution after save
          styles: { volume: 1 },
        });
      }

      // Scene title (first 3 seconds)
      const cleanTitle = (scene.descriptor.title || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/^#+\s*/gm, '')
        .trim();
      if (cleanTitle) {
        overlays.push({
          id: overlayId++,
          type: 'text',
          from: currentFrame,
          durationInFrames: Math.min(fps * 3, durationFrames),
          row: 1, // Above narration
          left: width * 0.1,
          top: height * 0.08,
          width: width * 0.8,
          height: height * 0.12,
          isDragging: false,
          rotation: 0,
          content: cleanTitle,
          styles: {
            fontSize: '48',
            fontFamily: 'font-sans',
            fontWeight: '700',
            textAlign: 'center',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)',
            fontStyle: 'normal',
            textDecoration: 'none',
            opacity: 1,
            borderRadius: '12px',
            padding: '16px',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            animation: { enter: 'fade', exit: 'fade', duration: 15 },
          },
        });
      }

      // Track frame offset for SFX placement
      sceneFrameMap.push({
        sceneIndex: scene.sceneIndex,
        fromFrame: currentFrame,
        durationFrames,
        durationSec: sceneDurationSec,
      });

      currentFrame += durationFrames;
    }

    // Register all media assets in the mediaAssets collection so the
    // asset resolver can map assetId → URL after saveProject strips URLs.
    const db = await getDatabase();
    for (const scene of storyboard.scenes) {
      if (scene.videoUrl && scene.videoAssetId) {
        const videoScene = scene as any;
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.videoAssetId },
          {
            $setOnInsert: {
              assetId: scene.videoAssetId,
              userId,
              type: 'video',
              filename: `${scene.videoAssetId}.mp4`,
              source: 'user-upload',
              gcsPath: videoScene.videoGcsPath || null,
              cachedUrl: scene.videoUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
      if (scene.imageUrl && scene.imageAssetId) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.imageAssetId },
          {
            $setOnInsert: {
              assetId: scene.imageAssetId,
              userId,
              type: 'image',
              filename: `${scene.imageAssetId}.png`,
              source: 'user-upload',
              gcsPath: (scene as any).imageGcsPath || null,
              cachedUrl: scene.imageUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
      // Register voiceover audio asset
      if (scene.voiceover?.audioUrl && scene.voiceover?.audioAssetId) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.voiceover.audioAssetId },
          {
            $setOnInsert: {
              assetId: scene.voiceover.audioAssetId,
              userId,
              type: 'audio',
              filename: `${scene.voiceover.audioAssetId}.mp3`,
              source: 'user-upload',
              gcsPath: (scene.voiceover as any).gcsPath || null,
              cachedUrl: scene.voiceover.audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
    }

    // Generate background music for the entire video (non-blocking — skip if it fails)
    if (isBGMAvailable() && currentFrame > 0) {
      try {
        const totalDurationSec = Math.round(currentFrame / fps);
        // Prefer LLM-generated music prompt; fall back to building from scene moods
        const musicPrompt = storyboard.overallMusicPrompt
          || buildMusicPrompt(
            storyboard.scenes.map(s => ({
              mood: s.descriptor.mood,
              audioDescription: s.descriptor.audioDescription,
            })),
          );
        console.log('[Finalize] BGM prompt:', musicPrompt, 'Duration:', totalDurationSec, 's');
        const bgm = await generateBackgroundMusic(musicPrompt, userId, totalDurationSec);

        // Add BGM as a sound overlay spanning the entire timeline (row 5)
        overlays.push({
          id: overlayId++,
          type: 'sound',
          from: 0,
          durationInFrames: currentFrame,
          row: 5,
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          isDragging: false,
          rotation: 0,
          content: bgm.audioUrl,
          src: bgm.audioUrl,
          assetId: bgm.audioAssetId,
          styles: { volume: 0.3, opacity: 1 },
        });

        // Register BGM asset
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: bgm.audioAssetId },
          {
            $setOnInsert: {
              assetId: bgm.audioAssetId,
              userId,
              type: 'audio',
              filename: `${bgm.audioAssetId}.mp3`,
              source: 'user-upload',
              gcsPath: bgm.gcsPath,
              cachedUrl: bgm.audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
        console.log('[Finalize] BGM generated successfully:', bgm.audioAssetId, bgm.audioUrl?.substring(0, 80));
      } catch (bgmErr: any) {
        console.error('[Finalize] BGM generation failed, continuing without music:', bgmErr.message, bgmErr.stack?.substring(0, 300));
      }
    }

    // Generate per-scene SFX from audioDescription (non-blocking — skip if it fails)
    if (isSFXAvailable() && currentFrame > 0) {
      try {
        // Collect scenes that have an audioDescription
        const sfxInputs = storyboard.scenes
          .filter(s => s.descriptor.audioDescription && s.descriptor.audioDescription.trim().length > 0)
          .map(s => {
            const frameInfo = sceneFrameMap.find(f => f.sceneIndex === s.sceneIndex);
            return {
              sceneIndex: s.sceneIndex,
              audioDescription: s.descriptor.audioDescription!,
              durationSeconds: frameInfo?.durationSec ?? Math.min(s.descriptor.durationSeconds, 15),
            };
          });

        if (sfxInputs.length > 0) {
          console.log(`[Finalize] Generating SFX for ${sfxInputs.length} scene(s)`);
          const sfxResults = await generateSFXForScenes(sfxInputs, userId);

          // Add each SFX clip as a sound overlay on row 6 (dedicated SFX layer)
          for (const [sceneIndex, sfx] of sfxResults) {
            const frameInfo = sceneFrameMap.find(f => f.sceneIndex === sceneIndex);
            if (!frameInfo) continue;

            overlays.push({
              id: overlayId++,
              type: 'sound',
              from: frameInfo.fromFrame,
              durationInFrames: frameInfo.durationFrames,
              row: 6, // Dedicated SFX layer (row 4 = voiceover, row 5 = BGM)
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              isDragging: false,
              rotation: 0,
              content: sfx.audioUrl,
              src: sfx.audioUrl,
              assetId: sfx.audioAssetId,
              styles: { volume: 0.5, opacity: 1 }, // SFX at 50% so it doesn't overpower voiceover
            });

            // Register SFX asset for URL resolution after save
            await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
              { assetId: sfx.audioAssetId },
              {
                $setOnInsert: {
                  assetId: sfx.audioAssetId,
                  userId,
                  type: 'audio',
                  filename: `${sfx.audioAssetId}.mp3`,
                  source: 'user-upload',
                  gcsPath: sfx.gcsPath,
                  cachedUrl: sfx.audioUrl,
                  urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  size: 0,
                  uploadedAt: new Date(),
                },
              },
              { upsert: true },
            );
          }

          console.log(`[Finalize] SFX: ${sfxResults.size} clip(s) added to timeline`);
        }
      } catch (sfxErr: any) {
        console.error('[Finalize] SFX generation failed, continuing without sound effects:', sfxErr.message, sfxErr.stack?.substring(0, 300));
      }
    }

    // Create Editron project then save overlays + settings
    const projectName = storyboard.title || 'Storyboard Video';
    const project = await projectService.createProject(userId, projectName);

    await projectService.saveProject(userId, project.projectId, {
      overlays,
      aspectRatio: aspectRatio as any,
      playerDimensions: { width, height },
      fps,
      durationInFrames: currentFrame,
    });

    // ─── Link storyboard ↔ project bidirectionally ────────────────
    // Set projectId on the storyboard so regenerate_scene can find it
    // via getStoryboardByProjectId(), and set sourceStoryboardId on the
    // project so the fallback lookup also works.
    await db.collection('storyboards').updateOne(
      { storyboardId: id },
      { $set: { projectId: project.projectId, updatedAt: new Date() } },
    );
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId: project.projectId },
      { $set: { sourceStoryboardId: id, updatedAt: new Date() } },
    );

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: currentFrame,
    });
  } catch (error: any) {
    console.error('[Finalize]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
