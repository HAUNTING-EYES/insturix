/**
 * POST /api/internal/workers/pipeline/audio
 *
 * QStash worker that generates BGM or SFX for a finalized project.
 * Called AFTER finalize creates the project — adds audio overlays
 * to an existing project without blocking project creation.
 *
 * Each worker invocation has its own 300s Vercel timeout.
 * BGM and SFX are dispatched as separate QStash messages so they
 * run in parallel independently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { generateBackgroundMusic } from '@/lib/pipeline/bgm-service';
import {
  assertConditionedBGMResult,
  resolveAudioPlatformEvidence,
  resolveMusicGenerationPolicy,
} from '@/lib/pipeline/bgm-conditioning-contract';
import { ROW, alignCutsToBeats } from '@/lib/pipeline/scene-to-editron';
import { generateSFXForScenes } from '@/lib/pipeline/sfx-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { createPipelineWarnings } from '@/lib/editron/services/pipeline-warnings';
import { DEFAULT_BGM_MIX_LEVELS } from '@/lib/editron/services/bgm-mix-levels';
import { analyzeConditionedMusicBeatGrid } from '@/lib/editron/services/music-beat-grid';
import {
  buildMusicCoverageOverlays,
  resolveRuntimeMusicCoveragePlan,
} from '@/lib/editron/services/music-coverage-runtime';

/**
 * Persist pipeline warnings from this worker run to the project doc.
 * Merges with any existing warnings (from finalize, director, etc.) rather than replacing.
 * Phase A3.5.14 fix: previously the audio worker failed silently — no SFX in the final
 * project but zero warnings surfaced. Now every failure leaves a trail.
 */
async function persistWarnings(
  db: any,
  projectId: string,
  warnings: ReturnType<typeof createPipelineWarnings>,
): Promise<void> {
  const all = warnings.getAll();
  if (all.length === 0) return;
  try {
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId },
      {
        $push: { pipelineWarnings: { $each: all } as any },
        $set: { updatedAt: new Date() },
      },
    );
  } catch (err: any) {
    console.error('[AudioWorker] Failed to persist pipeline warnings:', err.message);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AudioWorkerPayload {
  type: 'bgm' | 'sfx';
  projectId: string;
  userId: string;
  // BGM fields
  musicPrompt?: string;
  totalDurationSec?: number;
  totalFrames?: number;
  fps?: number;
  platform?: string | null;
  musicPreference?: string | null;
  editorialPreferences?: unknown;
  musicCoveragePlan?: unknown;
  // Signal-driven BGM mix levels (bgm-mix-levels.ts, CKG-bounded). Absent → DEFAULT_BGM_MIX_LEVELS.
  bgmBaseVolume?: number;
  bgmDuckLevel?: number;
  // SFX fields
  sfxInputs?: Array<{
    sceneIndex: number;
    audioDescription: string;
    durationSeconds: number;
    videoUrl?: string;
  }>;
  sceneFrameMap?: Array<{
    sceneIndex: number;
    fromFrame: number;
    durationFrames: number;
    durationSec: number;
  }>;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  const warnings = createPipelineWarnings();
  let projectIdForWarnings: string | null = null;
  try {
    const payload: AudioWorkerPayload = await request.json();
    const { type, projectId, userId } = payload;
    projectIdForWarnings = projectId;

    console.log(`[AudioWorker] Processing ${type} for project ${projectId}`);

    const db = await getDatabase();

    // C7 FIX: Validate userId owns the project
    const project = await db.collection('projects').findOne({ projectId }) as any;
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    if (project.userId !== userId) {
      console.error(`[AudioWorker] SECURITY: userId mismatch. Payload: ${userId}, Project: ${project.userId}`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (type === 'bgm') {
      const musicGenerationPolicy = resolveMusicGenerationPolicy({
        musicPreferences: [
          { value: payload.musicPreference, source: 'audio-worker-payload.musicPreference' },
          { value: project.musicPreference, source: 'project.musicPreference' },
          { value: project.productionBrief?.musicPreference, source: 'project.productionBrief.musicPreference' },
          { value: project.productionBriefIntake?.musicPreference, source: 'project.productionBriefIntake.musicPreference' },
          { value: project.creativeBrief?.musicPreference, source: 'project.creativeBrief.musicPreference' },
        ],
        editorialPreferences: [
          { value: payload.editorialPreferences, source: 'audio-worker-payload.editorialPreferences' },
          { value: project.editorialPreferences, source: 'project.editorialPreferences' },
          { value: project.productionBrief?.editorialPreferences, source: 'project.productionBrief.editorialPreferences' },
          { value: project.productionBriefIntake?.editorialPreferences, source: 'project.productionBriefIntake.editorialPreferences' },
          { value: project.creativeBrief?.editorialPreferences, source: 'project.creativeBrief.editorialPreferences' },
        ],
      });
      if (!musicGenerationPolicy.allowed) {
        console.log(
          `[AudioWorker] BGM skipped by ${musicGenerationPolicy.reason} `
          + `(source=${musicGenerationPolicy.musicPreferenceSource !== 'unresolved'
            ? musicGenerationPolicy.musicPreferenceSource
            : musicGenerationPolicy.editorialPreferencesSource})`,
        );
        return NextResponse.json({
          success: true,
          type: 'bgm',
          skipped: true,
          reason: musicGenerationPolicy.reason,
          musicGenerationPolicy,
        });
      }

      const { musicPrompt, totalDurationSec, totalFrames, fps, bgmBaseVolume, bgmDuckLevel } = payload;
      if (!musicPrompt || !totalDurationSec || !totalFrames || !fps) {
        console.error('[AudioWorker] BGM: missing required fields');
        warnings.add({ severity: 'error', phase: 'bgm', message: 'Missing required fields for BGM generation', details: { hasPrompt: !!musicPrompt, totalDurationSec, totalFrames, fps } });
        await persistWarnings(db, projectId, warnings);
        return NextResponse.json({ success: false, error: 'Missing BGM fields' }, { status: 400 });
      }

      let musicCoveragePlan;
      try {
        musicCoveragePlan = resolveRuntimeMusicCoveragePlan({
          totalFrames,
          fps,
          project,
          musicPreference: musicGenerationPolicy.musicPreference,
          precomputedPlan: payload.musicCoveragePlan,
        });
      } catch (coverageErr: any) {
        warnings.add({
          severity: 'error',
          phase: 'bgm',
          message: `Invalid music coverage evidence: ${coverageErr.message}`,
          details: { code: coverageErr.code },
        });
        await persistWarnings(db, projectId, warnings);
        return NextResponse.json({
          success: false,
          error: `Music coverage planning failed: ${coverageErr.message}`,
        }, { status: 400 });
      }

      if (musicCoveragePlan.mode === 'none') {
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId },
          {
            $set: {
              musicCoveragePlan,
              'intelligence.audio.musicCoveragePlan': musicCoveragePlan,
              updatedAt: new Date(),
            },
          },
        );
        console.log(`[AudioWorker] BGM skipped by coverage plan: ${musicCoveragePlan.reasonCodes.join(',')}`);
        return NextResponse.json({
          success: true,
          type: 'bgm',
          skipped: true,
          reason: 'music-coverage-none',
          musicCoveragePlan,
        });
      }

      const audioPlatformEvidence = resolveAudioPlatformEvidence([
        { value: payload.platform, source: 'audio-worker-payload.platform' },
        { value: project.productionBrief?.output?.platform, source: 'project.productionBrief.output.platform' },
        { value: project.syntheticStoryboard?.platform, source: 'project.syntheticStoryboard.platform' },
        { value: project.platform, source: 'project.platform' },
      ]);

      let bgm;
      try {
        bgm = await generateBackgroundMusic(musicPrompt, userId, totalDurationSec, {
          conditioning: {
            targetFrames: totalFrames,
            fps,
            platform: audioPlatformEvidence.platform,
          },
        });
        assertConditionedBGMResult(bgm, totalFrames, audioPlatformEvidence.platform);
      } catch (bgmErr: any) {
        warnings.errorSwallowed('bgm', bgmErr, `CassetteAI BGM generation for "${musicPrompt.substring(0, 60)}"`);
        await persistWarnings(db, projectId, warnings);
        return NextResponse.json({ success: false, error: `BGM generation failed: ${bgmErr.message}` }, { status: 500 });
      }

      let beatEvidence: Awaited<ReturnType<typeof analyzeConditionedMusicBeatGrid>> | null = null;
      try {
        beatEvidence = await analyzeConditionedMusicBeatGrid({
          buffer: bgm.buffer,
          fps,
          totalFrames,
        });
        console.log(
          `[AudioWorker] Beat grid analyzed: ${beatEvidence.beatGrid.bpm} BPM, `
          + `${beatEvidence.beatGrid.beats.length} beats`,
        );
      } catch (beatErr: any) {
        console.error(`[AudioWorker] Beat analysis failed: ${beatErr.message}`);
        warnings.add({
          severity: 'warning',
          phase: 'bgm',
          message: `Beat analysis failed: ${beatErr.message}. Music was preserved, but cuts were not realigned.`,
          details: {
            code: beatErr.code,
            stack: beatErr.stack?.split('\n').slice(0, 3).join(' -> '),
          },
        });
      }

      // A5 FIX: Use timestamp + crypto random for guaranteed unique IDs across concurrent workers
      const overlayId = Date.now() * 1000 + Math.floor(Math.random() * 999999);
      const bgmOverlayBase = {
        id: overlayId,
        type: 'sound',
        from: 0,
        durationInFrames: totalFrames,
        row: ROW.BGM,
        left: 0, top: 0, width: 0, height: 0,
        isDragging: false, rotation: 0,
        content: bgm.audioUrl,
        src: bgm.audioUrl,
        assetId: bgm.audioAssetId,
        musicRights: bgm.musicRights,
        styles: {
          // Signal-driven levels from the director (CKG solo/under-speech dB ranges); CKG-compliant default when
          // dispatched without them (finalize/storyboard). Replaces the old fixed 0.75/0.20 (music too loud in gaps).
          volume: typeof bgmBaseVolume === 'number' ? bgmBaseVolume : DEFAULT_BGM_MIX_LEVELS.baseVolume,
          opacity: 1,
          animation: { exit: 'fade', duration: 1 },
          duckingConfig: {
            enabled: true,
            duckLevel: typeof bgmDuckLevel === 'number' ? bgmDuckLevel : DEFAULT_BGM_MIX_LEVELS.duckLevel,
            rampDownMs: 300,
            rampUpMs: 600,
            lookAheadMs: 200,
          },
        },
        metadata: {
          source: 'audio-worker',
          audioConditioning: {
            requestedPlatform: audioPlatformEvidence.platform,
            platformEvidenceSource: audioPlatformEvidence.source,
            ...bgm.conditioning,
          },
          ...(beatEvidence ? { beatGrid: beatEvidence.beatGrid } : {}),
        },
        _workerAdded: true,
      };

      // F6.6 FIX: Push to overlays AND mark as worker-added.
      // The _workerAdded flag tells saveProject to preserve these overlays
      // even when the user saves (browser autosave would otherwise clobber them).
      const markedBgm = buildMusicCoverageOverlays({
        baseOverlay: bgmOverlayBase,
        plan: musicCoveragePlan,
        totalFrames,
        idFactory: sectionIndex => overlayId + sectionIndex,
      });
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId },
        {
          $push: { overlays: { $each: markedBgm } } as any,
          $set: {
            musicCoveragePlan,
            'intelligence.audio.musicCoveragePlan': musicCoveragePlan,
            updatedAt: new Date(),
          },
        },
      );

      // Register asset
      await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: bgm.audioAssetId },
        {
          $set: {
            cachedUrl: bgm.audioUrl,
            lastUsedAt: new Date(),
            musicRights: bgm.musicRights,
            ...(beatEvidence ? {
              beatAnalysis: beatEvidence.beatAnalysis,
              beatGrid: beatEvidence.beatGrid,
            } : {}),
          },
          $setOnInsert: {
            assetId: bgm.audioAssetId, userId, type: 'audio',
            filename: bgm.filename, contentType: bgm.contentType, source: 'generated',
            gcsPath: bgm.gcsPath,
            urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            size: bgm.buffer.length, durationMs: bgm.durationMs,
            metadata: {
              audioConditioning: {
                requestedPlatform: audioPlatformEvidence.platform,
                platformEvidenceSource: audioPlatformEvidence.source,
                ...bgm.conditioning,
              },
            },
            uploadedAt: new Date(),
          },
        },
        { upsert: true },
      );

      console.log(`[AudioWorker] BGM complete: ${bgm.audioAssetId} (${Date.now() - startMs}ms)`);
      
      if (beatEvidence) {
        try {
          console.log('[AudioWorker] Starting automatic cut alignment to analyzed beats...');
          const updatedProject = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId }) as any;
          if (updatedProject && updatedProject.overlays) {
            const snappedCount = alignCutsToBeats(
              updatedProject.overlays,
              beatEvidence.beatGrid.beats,
              fps,
            );
            if (snappedCount > 0) {
              await db.collection(COLLECTIONS.PROJECTS).updateOne(
                { projectId },
                {
                  $set: {
                    overlays: updatedProject.overlays,
                    updatedAt: new Date(),
                  },
                },
              );
              console.log(`[AudioWorker] Pipeline Flow: Aligned ${snappedCount} cuts to BGM beats`);
            } else {
              console.log('[AudioWorker] Pipeline Flow: No cuts required alignment');
            }
          }
        } catch (alignErr: any) {
          console.error(`[AudioWorker] Beat alignment enhancement failed: ${alignErr.message}`);
          warnings.add({
            severity: 'warning',
            phase: 'bgm',
            message: `Beat alignment failed: ${alignErr.message}. Cuts may not sync to music beats.`,
            details: { stack: alignErr.stack?.split('\n').slice(0, 3).join(' -> ') },
          });
        }
      }

      await persistWarnings(db, projectId, warnings);
      return NextResponse.json({
        success: true,
        type: 'bgm',
        assetId: bgm.audioAssetId,
        musicCoveragePlan,
        warnings: warnings.getAll(),
      });

    } else if (type === 'sfx') {
      const { sfxInputs, sceneFrameMap } = payload;
      if (!sfxInputs || !sceneFrameMap || sfxInputs.length === 0) {
        console.error('[AudioWorker] SFX: missing required fields');
        warnings.add({ severity: 'error', phase: 'sfx', message: 'Missing required fields for SFX generation', details: { hasInputs: !!sfxInputs, hasFrameMap: !!sceneFrameMap, inputCount: sfxInputs?.length ?? 0 } });
        await persistWarnings(db, projectId, warnings);
        return NextResponse.json({ success: false, error: 'Missing SFX fields' }, { status: 400 });
      }

      let sfxResults;
      try {
        sfxResults = await generateSFXForScenes(sfxInputs, userId);
      } catch (sfxErr: any) {
        warnings.errorSwallowed('sfx', sfxErr, `SFX batch generation for ${sfxInputs.length} scenes`);
        await persistWarnings(db, projectId, warnings);
        return NextResponse.json({ success: false, error: `SFX batch failed: ${sfxErr.message}` }, { status: 500 });
      }

      // Report per-scene SFX failures (scene requested but nothing generated)
      for (const input of sfxInputs) {
        if (!sfxResults.has(input.sceneIndex)) {
          warnings.degraded('sfx', `Scene ${input.sceneIndex}`, `No SFX generated (library miss + mirelo/CassetteAI fallback failed) — requested: "${input.audioDescription.substring(0, 60)}"`);
        }
      }

      let overlayId = Date.now() * 1000 + 500000 + Math.floor(Math.random() * 499999);
      const sfxOverlays: any[] = [];

      for (const [sceneIndex, sfx] of sfxResults) {
        // H8 FIX: Null check on sfx object before accessing sfx.audioUrl
        if (!sfx || !sfx.audioUrl) {
          console.warn(`[AudioWorker] SFX scene ${sceneIndex}: null or missing audioUrl, skipping`);
          warnings.degraded('sfx', `Scene ${sceneIndex}`, 'SFX returned null/empty audioUrl — skipped');
          continue;
        }
        const frameInfo = sceneFrameMap.find(f => f.sceneIndex === sceneIndex);
        if (!frameInfo) continue;

        sfxOverlays.push({
          id: overlayId++,
          type: 'sound',
          from: frameInfo.fromFrame,
          durationInFrames: frameInfo.durationFrames,
          row: ROW.SFX,
          left: 0, top: 0, width: 0, height: 0,
          isDragging: false, rotation: 0,
          content: sfx.audioUrl,
          src: sfx.audioUrl,
          assetId: sfx.audioAssetId,
          audioRights: sfx.audioRights,
          styles: { volume: 0.3, opacity: 1 }, // 30% — SFX should complement, not overpower narration
        });

        // Register asset
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: sfx.audioAssetId },
          {
            $set: {
              audioRights: sfx.audioRights,
              cachedUrl: sfx.audioUrl,
              lastUsedAt: new Date(),
            },
            $setOnInsert: {
              assetId: sfx.audioAssetId, userId, type: 'audio',
              filename: `${sfx.audioAssetId}.mp3`, source: sfx.audioRights.source,
              gcsPath: sfx.gcsPath, cachedUrl: sfx.audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0, uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }

      // F6.6 FIX: Push SFX with _workerAdded flag
      if (sfxOverlays.length > 0) {
        const markedSfx = sfxOverlays.map(o => ({ ...o, _workerAdded: true }));
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId },
          {
            $push: { 'overlays': { $each: markedSfx } } as any,
            $set: { updatedAt: new Date() },
          },
        );
      }

      console.log(`[AudioWorker] SFX complete: ${sfxResults.size} clips (${Date.now() - startMs}ms)`);
      await persistWarnings(db, projectId, warnings);
      return NextResponse.json({ success: true, type: 'sfx', clips: sfxResults.size, warnings: warnings.getAll() });
    }

    return NextResponse.json({ success: false, error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error: any) {
    console.error(`[AudioWorker] Error:`, error.message);
    // Best-effort: persist the top-level error so the user sees SOMETHING instead of a silent empty project.
    if (projectIdForWarnings) {
      try {
        const db = await getDatabase();
        warnings.errorSwallowed(payloadPhaseFallback(warnings), error, 'audio worker top-level handler');
        await persistWarnings(db, projectIdForWarnings, warnings);
      } catch { /* don't mask the original error */ }
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** Pick a reasonable phase for the top-level error — prefer whatever phase the
 * collector already has entries for, default to 'sfx' (most common failure site). */
function payloadPhaseFallback(warnings: ReturnType<typeof createPipelineWarnings>): 'bgm' | 'sfx' {
  const all = warnings.getAll();
  if (all.some(w => w.phase === 'bgm')) return 'bgm';
  return 'sfx';
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[AudioWorker] SECURITY: QSTASH signing keys not set in production. Rejecting.');
    return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
