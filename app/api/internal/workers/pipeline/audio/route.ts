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
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { generateSFXForScenes } from '@/lib/pipeline/sfx-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { createPipelineWarnings } from '@/lib/editron/services/pipeline-warnings';
import { DEFAULT_BGM_MIX_LEVELS } from '@/lib/editron/services/bgm-mix-levels';
import { analyzeConditionedMusicBeatGrid } from '@/lib/editron/services/music-beat-grid';
import {
  buildMusicCoverageOverlays,
  resolveRuntimeMusicCoveragePlan,
} from '@/lib/editron/services/music-coverage-runtime';
import {
  projectService,
  type ProjectPipelineAudioDeliveryCommandV1,
  type ProjectPipelineAudioDeliveryResultV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import { projectPipelineAudioTimelineBindingHashV1 } from '@/lib/editron/services/pipeline-audio-project-delivery-v1';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AudioWorkerPayload {
  type: 'bgm' | 'sfx';
  projectId: string;
  userId: string;
  /** Generated before QStash publication; retained unchanged on delivery retry. */
  audioDeliveryId?: string;
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

interface AudioWorkerLegacyProjectFacts {
  musicPreference?: unknown;
  editorialPreferences?: unknown;
  productionBrief?: {
    musicPreference?: unknown;
    editorialPreferences?: unknown;
    output?: { platform?: unknown };
  };
  productionBriefIntake?: {
    musicPreference?: unknown;
    editorialPreferences?: unknown;
  };
  creativeBrief?: {
    musicPreference?: unknown;
    editorialPreferences?: unknown;
  };
  syntheticStoryboard?: { platform?: unknown };
  platform?: unknown;
}

type AudioWorkerType = AudioWorkerPayload['type'];

interface AudioWorkerDeliveryContext {
  userId: string;
  projectId: string;
  deliveryId: string;
  expectedRevision: ProjectRevisionV1;
  planningTimelineBindingHash: string;
}

interface AudioWorkerFinalizationState {
  started: boolean;
}

const AUDIO_DELIVERY_ID_PATTERN = /^audio-delivery_[A-Za-z0-9_-]{18}$/;

function isAudioWorkerType(value: unknown): value is AudioWorkerType {
  return value === 'bgm' || value === 'sfx';
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalWarningValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Audio worker warning contains a non-finite number.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalWarningValue);
  if (!isPlainRecord(value)) {
    throw new Error('Audio worker warning contains a non-JSON value.');
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, canonicalWarningValue(entry)]),
  );
}

function deliveryWarnings(
  warnings: ReturnType<typeof createPipelineWarnings>,
): Record<string, unknown>[] {
  return warnings.getAll().map((warning) => (
    canonicalWarningValue(warning) as Record<string, unknown>
  ));
}

function projectDeliveryKind(type: AudioWorkerType): 'BGM' | 'SFX' {
  return type === 'bgm' ? 'BGM' : 'SFX';
}

async function finalizeAudioWorkerDelivery(
  context: AudioWorkerDeliveryContext,
  finalization: AudioWorkerFinalizationState,
  input: Omit<
    ProjectPipelineAudioDeliveryCommandV1,
    'expectedRevision' | 'planningTimelineBindingHash' | 'deliveryId'
  >,
): Promise<ProjectPipelineAudioDeliveryResultV1> {
  finalization.started = true;
  const result = await projectService.commitPipelineAudioDeliveryV1(
    context.userId,
    context.projectId,
    {
      ...input,
      expectedRevision: context.expectedRevision,
      planningTimelineBindingHash: context.planningTimelineBindingHash,
      deliveryId: context.deliveryId,
    },
  );
  return result;
}

function deliveryResponse(
  result: ProjectPipelineAudioDeliveryResultV1,
): Record<string, unknown> {
  const receipt = result.deliveryReceipt;
  return {
    disposition: result.disposition,
    deliveryId: receipt.deliveryId,
    outcome: receipt.outcome,
    revision: receipt.afterRevision,
    rebase: receipt.rebase,
    proof: receipt.proof,
  };
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown): number {
  switch (errorCode(error)) {
    case 'PROJECT_NOT_FOUND_OR_FORBIDDEN':
      return 404;
    case 'PROJECT_REVISION_CONFLICT':
    case 'PROJECT_PIPELINE_AUDIO_DELIVERY_REBASE_BLOCKED':
      return 409;
    default:
      return 500;
  }
}

async function recordAudioWorkerFailure(
  context: AudioWorkerDeliveryContext,
  finalization: AudioWorkerFinalizationState,
  type: AudioWorkerType,
  warnings: ReturnType<typeof createPipelineWarnings>,
): Promise<ProjectPipelineAudioDeliveryResultV1 | null> {
  try {
    return await finalizeAudioWorkerDelivery(context, finalization, {
      kind: projectDeliveryKind(type),
      outcome: 'FAILED',
      overlays: [],
      warnings: deliveryWarnings(warnings),
    });
  } catch (failureRecordError: unknown) {
    console.error(
      '[AudioWorker] Failed to record terminal ProjectService audio outcome:',
      errorMessage(failureRecordError),
    );
    return null;
  }
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  const warnings = createPipelineWarnings();
  let deliveryContext: AudioWorkerDeliveryContext | null = null;
  let workerType: AudioWorkerType | null = null;
  const finalization: AudioWorkerFinalizationState = { started: false };
  try {
    const payload: AudioWorkerPayload = await request.json();
    const { type, projectId, userId, audioDeliveryId } = payload;
    if (
      !isAudioWorkerType(type)
      || !isNonBlankString(projectId)
      || !isNonBlankString(userId)
      || !isNonBlankString(audioDeliveryId)
      || !AUDIO_DELIVERY_ID_PATTERN.test(audioDeliveryId)
    ) {
      return NextResponse.json({ success: false, error: 'Invalid audio worker delivery identity' }, { status: 400 });
    }
    workerType = type;

    console.log(`[AudioWorker] Processing ${type} for project ${projectId}`);

    const snapshot = await projectService.loadProjectForMutation(userId, projectId);
    const project = snapshot.project;
    const legacyProjectFacts = project as typeof project & AudioWorkerLegacyProjectFacts;
    deliveryContext = {
      userId,
      projectId,
      deliveryId: audioDeliveryId,
      expectedRevision: snapshot.revision,
      planningTimelineBindingHash: projectPipelineAudioTimelineBindingHashV1(project),
    };

    if (type === 'bgm') {
      const musicGenerationPolicy = resolveMusicGenerationPolicy({
        musicPreferences: [
          { value: payload.musicPreference, source: 'audio-worker-payload.musicPreference' },
          { value: legacyProjectFacts.musicPreference, source: 'project.musicPreference' },
          { value: legacyProjectFacts.productionBrief?.musicPreference, source: 'project.productionBrief.musicPreference' },
          { value: legacyProjectFacts.productionBriefIntake?.musicPreference, source: 'project.productionBriefIntake.musicPreference' },
          { value: legacyProjectFacts.creativeBrief?.musicPreference, source: 'project.creativeBrief.musicPreference' },
        ],
        editorialPreferences: [
          { value: payload.editorialPreferences, source: 'audio-worker-payload.editorialPreferences' },
          { value: legacyProjectFacts.editorialPreferences, source: 'project.editorialPreferences' },
          { value: legacyProjectFacts.productionBrief?.editorialPreferences, source: 'project.productionBrief.editorialPreferences' },
          { value: legacyProjectFacts.productionBriefIntake?.editorialPreferences, source: 'project.productionBriefIntake.editorialPreferences' },
          { value: legacyProjectFacts.creativeBrief?.editorialPreferences, source: 'project.creativeBrief.editorialPreferences' },
        ],
      });
      if (!musicGenerationPolicy.allowed) {
        console.log(
          `[AudioWorker] BGM skipped by ${musicGenerationPolicy.reason} `
          + `(source=${musicGenerationPolicy.musicPreferenceSource !== 'unresolved'
            ? musicGenerationPolicy.musicPreferenceSource
            : musicGenerationPolicy.editorialPreferencesSource})`,
        );
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'BGM',
          outcome: 'SKIPPED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({
          success: true,
          type: 'bgm',
          skipped: true,
          reason: musicGenerationPolicy.reason,
          musicGenerationPolicy,
          delivery: deliveryResponse(delivery),
        });
      }

      const { musicPrompt, totalDurationSec, totalFrames, fps, bgmBaseVolume, bgmDuckLevel } = payload;
      if (!musicPrompt || !totalDurationSec || !totalFrames || !fps) {
        console.error('[AudioWorker] BGM: missing required fields');
        warnings.add({ severity: 'error', phase: 'bgm', message: 'Missing required fields for BGM generation', details: { hasPrompt: !!musicPrompt, totalDurationSec, totalFrames, fps } });
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'BGM',
          outcome: 'FAILED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({ success: false, error: 'Missing BGM fields', delivery: deliveryResponse(delivery) }, { status: 400 });
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
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'BGM',
          outcome: 'FAILED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({
          success: false,
          error: `Music coverage planning failed: ${coverageErr.message}`,
          delivery: deliveryResponse(delivery),
        }, { status: 400 });
      }

      if (musicCoveragePlan.mode === 'none') {
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'BGM',
          outcome: 'SKIPPED',
          overlays: [],
          musicCoveragePlan,
          warnings: deliveryWarnings(warnings),
        });
        console.log(`[AudioWorker] BGM skipped by coverage plan: ${musicCoveragePlan.reasonCodes.join(',')}`);
        return NextResponse.json({
          success: true,
          type: 'bgm',
          skipped: true,
          reason: 'music-coverage-none',
          musicCoveragePlan,
          delivery: deliveryResponse(delivery),
        });
      }

      const audioPlatformEvidence = resolveAudioPlatformEvidence([
        { value: payload.platform, source: 'audio-worker-payload.platform' },
        { value: legacyProjectFacts.productionBrief?.output?.platform, source: 'project.productionBrief.output.platform' },
        { value: legacyProjectFacts.syntheticStoryboard?.platform, source: 'project.syntheticStoryboard.platform' },
        { value: legacyProjectFacts.platform, source: 'project.platform' },
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
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'BGM',
          outcome: 'FAILED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({ success: false, error: `BGM generation failed: ${bgmErr.message}`, delivery: deliveryResponse(delivery) }, { status: 500 });
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

      const markedBgm = buildMusicCoverageOverlays({
        baseOverlay: bgmOverlayBase,
        plan: musicCoveragePlan,
        totalFrames,
        idFactory: sectionIndex => overlayId + sectionIndex,
      });

      // Media asset registration is deliberately separate from canonical project mutation.
      const db = await getDatabase();
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

      const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
        kind: 'BGM',
        outcome: 'ATTACHED',
        overlays: markedBgm as Overlay[],
        musicCoveragePlan,
        warnings: deliveryWarnings(warnings),
      });
      if (beatEvidence && markedBgm.length > 0) {
        try {
          const beatSync = await projectService.alignCutsToBeatsAtRevisionV1(
            userId,
            projectId,
            {
              expectedRevision: delivery.deliveryReceipt.afterRevision,
              actorKind: 'SYSTEM',
              audioOverlayId: markedBgm[0].id,
              beatFilter: 'all',
              strengthThreshold: 0,
              evidenceSource: 'persisted-beat-grid',
            },
          );
          if (beatSync.disposition !== 'APPLIED') {
            warnings.add({
              severity: 'warning',
              phase: 'bgm',
              message: `Music was attached, but authoritative beat-sync did not change cuts: ${beatSync.reason}.`,
            });
          }
        } catch (beatSyncError: unknown) {
          const message = errorMessage(beatSyncError);
          console.warn(`[AudioWorker] Authoritative beat-sync failed after BGM attachment: ${message}`);
          warnings.add({
            severity: 'warning',
            phase: 'bgm',
            message: `Music was attached, but authoritative beat-sync failed: ${message}.`,
            details: { code: errorCode(beatSyncError) },
          });
        }
      }
      console.log(`[AudioWorker] BGM complete: ${bgm.audioAssetId} (${Date.now() - startMs}ms)`);
      return NextResponse.json({
        success: true,
        type: 'bgm',
        assetId: bgm.audioAssetId,
        musicCoveragePlan,
        warnings: warnings.getAll(),
        delivery: deliveryResponse(delivery),
      });

    } else if (type === 'sfx') {
      const { sfxInputs, sceneFrameMap } = payload;
      if (!sfxInputs || !sceneFrameMap || sfxInputs.length === 0) {
        console.error('[AudioWorker] SFX: missing required fields');
        warnings.add({ severity: 'error', phase: 'sfx', message: 'Missing required fields for SFX generation', details: { hasInputs: !!sfxInputs, hasFrameMap: !!sceneFrameMap, inputCount: sfxInputs?.length ?? 0 } });
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'SFX',
          outcome: 'FAILED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({ success: false, error: 'Missing SFX fields', delivery: deliveryResponse(delivery) }, { status: 400 });
      }

      let sfxResults;
      try {
        sfxResults = await generateSFXForScenes(sfxInputs, userId);
      } catch (sfxErr: any) {
        warnings.errorSwallowed('sfx', sfxErr, `SFX batch generation for ${sfxInputs.length} scenes`);
        const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
          kind: 'SFX',
          outcome: 'FAILED',
          overlays: [],
          warnings: deliveryWarnings(warnings),
        });
        return NextResponse.json({ success: false, error: `SFX batch failed: ${sfxErr.message}`, delivery: deliveryResponse(delivery) }, { status: 500 });
      }

      // Report per-scene SFX failures (scene requested but nothing generated)
      for (const input of sfxInputs) {
        if (!sfxResults.has(input.sceneIndex)) {
          warnings.degraded('sfx', `Scene ${input.sceneIndex}`, `No SFX generated (library miss + mirelo/CassetteAI fallback failed) — requested: "${input.audioDescription.substring(0, 60)}"`);
        }
      }

      let overlayId = Date.now() * 1000 + 500000 + Math.floor(Math.random() * 499999);
      const sfxOverlays: any[] = [];
      const db = await getDatabase();

      for (const [sceneIndex, sfx] of sfxResults) {
        // H8 FIX: Null check on sfx object before accessing sfx.audioUrl
        if (!sfx || !sfx.audioUrl) {
          console.warn(`[AudioWorker] SFX scene ${sceneIndex}: null or missing audioUrl, skipping`);
          warnings.degraded('sfx', `Scene ${sceneIndex}`, 'SFX returned null/empty audioUrl — skipped');
          continue;
        }
        const frameInfo = sceneFrameMap.find(f => f.sceneIndex === sceneIndex);
        if (!frameInfo) {
          warnings.degraded('sfx', `Scene ${sceneIndex}`, 'SFX was generated but has no matching timeline frame range');
          continue;
        }

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

      const delivery = await finalizeAudioWorkerDelivery(deliveryContext, finalization, {
        kind: 'SFX',
        outcome: sfxOverlays.length > 0 ? 'ATTACHED' : 'SKIPPED',
        overlays: sfxOverlays as Overlay[],
        warnings: deliveryWarnings(warnings),
      });

      console.log(`[AudioWorker] SFX complete: ${sfxResults.size} clips (${Date.now() - startMs}ms)`);
      return NextResponse.json({
        success: true,
        type: 'sfx',
        clips: sfxResults.size,
        warnings: warnings.getAll(),
        delivery: deliveryResponse(delivery),
      });
    }

    return NextResponse.json({ success: false, error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error(`[AudioWorker] Error:`, message);
    if (deliveryContext && workerType && !finalization.started) {
      warnings.errorSwallowed(payloadPhaseFallback(warnings), message, 'audio worker top-level handler');
      const delivery = await recordAudioWorkerFailure(
        deliveryContext,
        finalization,
        workerType,
        warnings,
      );
      return NextResponse.json({
        success: false,
        error: message,
        ...(delivery ? { delivery: deliveryResponse(delivery) } : {}),
      }, { status: errorStatus(error) });
    }
    return NextResponse.json({ success: false, error: message }, { status: errorStatus(error) });
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
