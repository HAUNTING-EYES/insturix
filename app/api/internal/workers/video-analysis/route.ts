/**
 * POST /api/internal/workers/video-analysis
 *
 * QStash worker for Mode 2 video processing.
 * Architecture: cuts FIRST, analyze SECOND.
 *
 * Stage 1 of three-stage QStash pipeline:
 *   Stage 1: THIS (transcription, cuts, VU, genre params)
 *   Stage 2: /api/internal/workers/tribe-analysis (V-JEPA, Wav2Vec, Essentia, moment weights)
 *   Stage 3: /api/internal/workers/director (profile detection, Creative Brief, Director execution)
 *
 * Flow:
 * 1.   Transcribe + classify + build cut plan (processRawFootage)
 * 1.55 Fix duration from transcript timestamps
 * 1.6  Execute silence removal (apply cuts to timeline)
 * 2.   Visual Understanding Ã¢â‚¬â€ segment-aware (Gemini Vision Ã¢â€ â€™ SyntheticStoryboard)
 * 3.   Genre parameters + Thompson Sampling bandit
 * 4.   Store Phase 1 results on project doc
 * 4.5  Dispatch TRIBE worker via QStash (or run Steps 3.5-3.7 + Director inline in dev)
 *
 * VU runs AFTER cuts and receives kept-segment context so Gemini
 * focuses on what the viewer will actually see.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED,
  isInternalQStashDispatchConfigured,
  isInternalWorkerInlineFallbackAllowed,
  withInternalQStashWorkerAuth,
} from '@/lib/editron/security/internal-worker-auth';
import { buildProjectAnalysisAssetSet, persistProjectAssetAnalysis } from '@/lib/editron/services/project-analysis-storage';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { ProviderCostBasis, ProviderCostUnits } from '@/lib/financials/provider-cost-estimates';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import {
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';
import type { CanonicalizeReferenceOutput } from '@/lib/editron/reference-video/canonicalize-reference';
import type {
  ProjectAnalysisRunStateV1,
} from '@/lib/editron/services/project-service';
import type { NativeAudioEvidence } from '@/lib/editron/services/native-audio-evidence';

export const runtime = 'nodejs';
export const maxDuration = 800; // Steps 1-3 only (~215s typical). TRIBE Phase 2 runs in separate worker.

type MusicPreference = NonNullable<ProjectBrief['musicPreference']>;

const MUSIC_PREFERENCES = new Set<MusicPreference>([
  'none',
  'subtle_bed',
  'energetic',
  'match_video',
]);

function normalizeMusicPreference(value: unknown): MusicPreference | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase() as MusicPreference;
  return MUSIC_PREFERENCES.has(normalized) ? normalized : undefined;
}

interface VideoAnalysisPayload {
  projectId: string;
  userId: string;
  orgId?: string;
  assetId: string;
  videoUrl: string;
  durationSec: number;
  title: string;
  profileId: string;
  // Optional multi-path inputs
  userIntent?: string;
  referenceAssetId?: string;
  referenceVideoUrl?: string;
  script?: string;
  platform?: string;
  // Creative Brief preferences (Director's Cut architecture)
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
  editorialPreferences?: EditorialPreferences;
  analysisRunId: string;
  creditTransactionId?: string;
  chargedCredits?: number;
}

class AnalysisRunOwnershipLostError extends Error {
  readonly code = 'ANALYSIS_RUN_OWNERSHIP_LOST';

  constructor(message: string) {
    super(message);
    this.name = 'AnalysisRunOwnershipLostError';
  }
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  let trackedScan: Pick<
    VideoAnalysisPayload,
    'projectId' | 'userId' | 'assetId' | 'analysisRunId' | 'creditTransactionId'
  > | undefined;
  let directorDispatched = false;

  try {
    const payload: VideoAnalysisPayload = await request.json();
    const {
      projectId, userId, orgId, assetId, videoUrl, durationSec,
      title, profileId: initialProfileId,
      userIntent, referenceAssetId, referenceVideoUrl, script, platform,
      captionStyle, transitionPreference, zoomBehavior, motionGraphics, pacingFeel, musicPreference,
      editorialPreferences, analysisRunId,
    } = payload;

    let effectiveDurationSec = durationSec;

    if (!projectId || !userId || !assetId || !videoUrl || !analysisRunId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    trackedScan = {
      projectId,
      userId,
      assetId,
      analysisRunId,
      creditTransactionId: payload.creditTransactionId,
    };

    if (!isInternalWorkerInlineFallbackAllowed() && !isInternalQStashDispatchConfigured()) {
      console.error('[VideoAnalysisWorker] Dependent worker dispatch is not configured outside development.');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED,
            routeId: 'video-analysis',
          },
        },
        { status: 503 },
      );
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const normalizedMusicPreference = normalizeMusicPreference(musicPreference);
    const normalizedEditorialPreferences = normalizeEditorialPreferences(editorialPreferences);
    type ActiveAnalysisState = Exclude<ProjectAnalysisRunStateV1, 'failed'>;
    type AnalysisTargetState = Exclude<ProjectAnalysisRunStateV1, 'queued' | 'failed'>;
    let analysisState: ActiveAnalysisState = 'queued';
    const advanceAnalysis = async (toState: AnalysisTargetState): Promise<void> => {
      const { projectService } = await import('@/lib/editron/services/project-service');
      const snapshot = await projectService.loadProjectForMutation(userId, projectId);
      const result = await projectService.advanceProjectAnalysisRunV1(userId, projectId, {
        expectedRevision: snapshot.revision,
        runId: analysisRunId,
        sourceAssetId: assetId,
        fromState: analysisState,
        toState,
      });
      if (result.disposition !== 'ADVANCED' && result.disposition !== 'ALREADY_ADVANCED') {
        throw new AnalysisRunOwnershipLostError(
          `Analysis run lost ${analysisState} → ${toState} ownership (${result.disposition}).`,
        );
      }
      analysisState = toState;
    };

    // Director Mode (assist lane): scans run, but NOTHING is cut. Read the lane
    // once up front so the destructive stage (silence removal) is skipped — the
    // battle lane found this path was trimming footage before the pen was laid
    // down, violating the zero-edit invariant on the primary single-video path.
    const scanLaneDoc = await db.collection('projects').findOne(
      { projectId },
      { projection: { editMode: 1 } },
    );
    const { isAssistProject: isAssistScanLane } = await import('@/lib/editron/services/assist-lane');
    const isAssistScan = isAssistScanLane(scanLaneDoc);

    await advanceAnalysis('analyzing');

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 1: Transcription + Cuts FIRST Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // Architecture: cuts FIRST, analyze SECOND.
    // processRawFootage runs Deepgram transcription (~10-30s, NOT Gemini) then
    // Gemini transcript editor (~10-30s). After cuts are decided, VU runs at
    // Step 2 with segment context so it analyzes what the viewer will see.
    let syntheticStoryboard: any = null;
    let rawFootageAnalysis: any = null;
    let precutVjepaAnalysis: any = null;
    let visualCutIntelligence: any = null;
    let nativeAudioEvidence: NativeAudioEvidence | undefined;

    const rawFootageStartedAt = Date.now();
    await advanceAnalysis('transcribing');
    try {
      const { processRawFootage } = await import('@/lib/editron/services/raw-footage-processor');
      rawFootageAnalysis = await processRawFootage(assetId, userId, durationSec, platform, userIntent);
      await recordVideoAnalysisCostEvent(payload, {
        stage: 'raw_footage_processing',
        status: 'success',
        provider: 'editron-transcription-pipeline',
        model: 'grok-deepgram-gemini-transcript-editor',
        operation: 'transcription_pipeline',
        includeRevenue: true,
        units: {
          requestCount: 1,
          mediaSeconds: durationSec,
          functionMs: Date.now() - rawFootageStartedAt,
        },
        metadata: {
          contentType: rawFootageAnalysis.contentTypeDetection?.contentType,
          wordCount: rawFootageAnalysis.transcription?.words?.length ?? 0,
          segmentCount: rawFootageAnalysis.segments?.length ?? 0,
          silenceRemovalCount: rawFootageAnalysis.silenceRemovalPlan?.length ?? 0,
          editMethod: rawFootageAnalysis.editMethod,
        },
      });
    } catch (rawErr: unknown) {
      const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
      const stack = rawErr instanceof Error ? rawErr.stack : '';
      console.error(`[VideoAnalysisWorker] Raw footage processing FAILED: ${msg}`);
      if (stack) console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
      await recordVideoAnalysisCostEvent(payload, {
        stage: 'raw_footage_processing',
        status: 'failed',
        provider: 'editron-transcription-pipeline',
        model: 'grok-deepgram-gemini-transcript-editor',
        operation: 'transcription_pipeline',
        includeRevenue: true,
        units: {
          requestCount: 1,
          mediaSeconds: durationSec,
          functionMs: Date.now() - rawFootageStartedAt,
        },
        metadata: { errorClass: rawErr instanceof Error ? rawErr.name : 'Error' },
      });
    }

    // Reference style transfer (if provided)
    let editDNA: any = null;
    let referenceVideoAnalysis: any = null;
    if (referenceAssetId || referenceVideoUrl) {
      try {
        const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
        const { resolveReferenceVideoSource } = await import('@/lib/editron/reference-video/reference-video-source');
        const referenceSourceResult = await resolveReferenceVideoSource({
          userId,
          referenceAssetId,
          referenceVideoUrl,
          assetResolver,
        });

        if (!referenceSourceResult.ok) {
          referenceVideoAnalysis = {
            provider: 'glm-saas-reference',
            status: 'rejected',
            sourceKind: referenceSourceResult.sourceKind,
            reason: referenceSourceResult.reason,
            diagnostics: referenceSourceResult.diagnostics,
          };
          console.warn(`[VideoAnalysisWorker] Reference source rejected: ${referenceSourceResult.reason}`);
        } else {
          const referenceSource = referenceSourceResult.source;
          let refUrl = referenceSource.videoUrl;
          let referenceId = referenceSource.referenceId;
          let referenceDurationSec = referenceSource.durationSec;
          let referenceCanonicalKind: string = referenceSource.kind;
          let canonicalReference: CanonicalizeReferenceOutput | null = null;
          const referenceSourceLabel = referenceSource.sourceLabel;
          const referenceSourceFingerprint = referenceSource.sourceFingerprint;

          // Canonicalization is an identity boundary, not metadata-only
          // enrichment. Every resolved source kind must cross it, and every
          // downstream cache/read consumes the returned exact source version.
          try {
            const { canonicalizeReferenceVideo } = await import('@/lib/editron/reference-video/canonicalize-reference');
            const canonical = await canonicalizeReferenceVideo({
              userId,
              ...(orgId ? { orgId } : {}),
              source: referenceSource,
              audioUsageMode: 'preview-waveform-only',
            });
            canonicalReference = canonical;
            refUrl = canonical.videoUrl;
            referenceId = canonical.referenceAssetId;
            referenceDurationSec = canonical.durationSec ?? referenceDurationSec;
            referenceCanonicalKind = canonical.canonicalKind;
            referenceVideoAnalysis = {
              provider: 'canonical-reference',
              status: 'accepted',
              sourceKind: canonical.canonicalKind,
              referenceAssetId: canonical.referenceAssetId,
              sourceLabel: canonical.sourceLabel,
              sourceFingerprint: canonical.sourceFingerprint,
              canonicalKind: canonical.canonicalKind,
            };
            // R2/R3: enrich the canonical reference with measured evidence
            // (audio beats/silence) + soundtrack identity. Env-gated: the AudD
            // recognizer activates only when AUDD_API_TOKEN is set; without it
            // this resolves nothing (soundClass stays unknown). Evidence survives
            // a recognizer outage (warnings[]), so this never breaks the edit.
            try {
              const { enrichReferenceWithMeasuredEvidence } = await import('@/lib/editron/reference-video/enrich-reference-evidence');
              const enriched = await enrichReferenceWithMeasuredEvidence({
                userId,
                referenceAssetId: canonical.referenceAssetId,
                audioArtifact: canonical.audioArtifact ?? null,
              });
              if (enriched.soundtrackIdentity) {
                referenceVideoAnalysis = {
                  ...referenceVideoAnalysis,
                  soundtrackIdentity: enriched.soundtrackIdentity,
                  audioEvidence: enriched.audioEvidence,
                  canonicalFingerprint: enriched.canonicalFingerprint,
                  adaptivePlan: enriched.adaptivePlan,
                  enrichmentWarnings: enriched.warnings,
                };
              } else if (enriched.audioEvidence) {
                referenceVideoAnalysis = {
                  ...referenceVideoAnalysis,
                  audioEvidence: enriched.audioEvidence,
                  canonicalFingerprint: enriched.canonicalFingerprint,
                  adaptivePlan: enriched.adaptivePlan,
                  enrichmentWarnings: enriched.warnings,
                };
              }
            } catch (err) {
              console.warn('[VideoAnalysisWorker] Reference enrichment skipped:',
                err instanceof Error ? err.message : err);
            }
          } catch (canonicalErr) {
            const msg = canonicalErr instanceof Error ? canonicalErr.message : String(canonicalErr);
            console.warn(`[VideoAnalysisWorker] Reference canonicalization failed: ${msg}`);
            throw canonicalErr;
          }

          if (isSaasReferenceGlmEnabled()) {
            try {
              const { sampleReferenceVideoFrames } = await import('@/lib/editron/reference-video/reference-frame-sampler');
              const {
                analyzeSaasReferenceVideo,
                DEFAULT_GLM_ANALYSIS_MODEL,
                DEFAULT_GLM_GATE_MODEL,
              } = await import('@/lib/editron/reference-video/saas-reference-video-analyzer');
              const { mapSaasReferenceAnalysisToEditDNA } = await import('@/lib/editron/reference-video/saas-reference-edit-dna');
              const {
                buildSaasReferenceAnalysisCacheKey,
                readSaasReferenceAnalysisCache,
                writeSaasReferenceAnalysisCache,
              } = await import('@/lib/editron/reference-video/saas-reference-analysis-cache');

              const referenceAnalysisCacheKey = buildSaasReferenceAnalysisCacheKey({
                referenceAssetId: referenceId,
                durationSec: referenceDurationSec,
                sourceFingerprint: referenceSourceFingerprint,
                script,
                brandContext: userIntent,
                gateModel: DEFAULT_GLM_GATE_MODEL,
                analysisModel: DEFAULT_GLM_ANALYSIS_MODEL,
              });
              const cachedSaasResult = await readSaasReferenceAnalysisCache(referenceAnalysisCacheKey);

              if (cachedSaasResult) {
                if (cachedSaasResult.status === 'accepted') {
                  editDNA = mapSaasReferenceAnalysisToEditDNA({
                    analysis: cachedSaasResult.analysis,
                    gate: cachedSaasResult.gate,
                    cacheKey: cachedSaasResult.cacheKey,
                    sourceName: referenceSourceLabel,
                  });
                  referenceVideoAnalysis = {
                    provider: 'glm-saas-reference',
                    status: 'accepted',
                    sourceKind: referenceCanonicalKind,
                    referenceId,
                    sourceLabel: referenceSourceLabel,
                    sourceFingerprint: referenceSourceFingerprint,
                    cacheStatus: 'hit',
                    frameSamples: [],
                    gate: cachedSaasResult.gate,
                    gateDecision: cachedSaasResult.gateDecision,
                    analysis: cachedSaasResult.analysis,
                    evaluationWindowSec: cachedSaasResult.evaluationWindowSec,
                    cacheKey: cachedSaasResult.cacheKey,
                    analyzerCacheKey: cachedSaasResult.analyzerCacheKey,
                    model: cachedSaasResult.model,
                    usage: cachedSaasResult.usage,
                  };
                } else {
                  referenceVideoAnalysis = {
                    provider: 'glm-saas-reference',
                    status: 'rejected',
                    sourceKind: referenceCanonicalKind,
                    referenceId,
                    sourceLabel: referenceSourceLabel,
                    sourceFingerprint: referenceSourceFingerprint,
                    cacheStatus: 'hit',
                    reason: cachedSaasResult.reason,
                    diagnostics: cachedSaasResult.diagnostics,
                    gate: cachedSaasResult.gate,
                    gateDecision: cachedSaasResult.gateDecision,
                    cacheKey: cachedSaasResult.cacheKey,
                    analyzerCacheKey: cachedSaasResult.analyzerCacheKey,
                    frameSamples: [],
                  };
                }
              } else {
                const frameSamples = await sampleReferenceVideoFrames({
                  videoUrl: refUrl,
                  userId,
                  referenceAssetId: referenceId,
                  durationSec: referenceDurationSec,
                });
                const saasResult = await analyzeSaasReferenceVideo({
                  videoUrl: refUrl,
                  frameImageUrls: frameSamples.map((sample) => sample.url),
                  durationSec: referenceDurationSec,
                  sourceLabel: referenceSourceLabel,
                  script,
                  brandContext: userIntent,
                  gateModel: DEFAULT_GLM_GATE_MODEL,
                  analysisModel: DEFAULT_GLM_ANALYSIS_MODEL,
                });

                if (saasResult.ok) {
                  editDNA = mapSaasReferenceAnalysisToEditDNA({
                    analysis: saasResult.analysis,
                    gate: saasResult.gate,
                    cacheKey: referenceAnalysisCacheKey,
                    sourceName: referenceSourceLabel,
                  });
                  referenceVideoAnalysis = {
                    provider: 'glm-saas-reference',
                    status: 'accepted',
                    sourceKind: referenceCanonicalKind,
                    referenceId,
                    sourceLabel: referenceSourceLabel,
                    sourceFingerprint: referenceSourceFingerprint,
                    cacheStatus: 'miss',
                    frameSamples,
                    gate: saasResult.gate,
                    gateDecision: saasResult.gateDecision,
                    analysis: saasResult.analysis,
                    evaluationWindowSec: saasResult.evaluationWindowSec,
                    cacheKey: referenceAnalysisCacheKey,
                    analyzerCacheKey: saasResult.cacheKey,
                    model: saasResult.model,
                    usage: saasResult.usage,
                  };
                  await writeSaasReferenceAnalysisCache({
                    status: 'accepted',
                    cacheKey: referenceAnalysisCacheKey,
                    analyzerCacheKey: saasResult.cacheKey,
                    referenceAssetId: referenceId,
                    sourceFingerprint: referenceSourceFingerprint,
                    gateModel: DEFAULT_GLM_GATE_MODEL,
                    analysisModel: DEFAULT_GLM_ANALYSIS_MODEL,
                    gate: saasResult.gate,
                    gateDecision: saasResult.gateDecision,
                    analysis: saasResult.analysis,
                    evaluationWindowSec: saasResult.evaluationWindowSec,
                    model: saasResult.model,
                    usage: saasResult.usage,
                  });
                } else {
                  referenceVideoAnalysis = {
                    provider: 'glm-saas-reference',
                    status: saasResult.reason === 'not_a_saas_reference_video' ? 'rejected' : 'failed',
                    sourceKind: referenceCanonicalKind,
                    referenceId,
                    sourceLabel: referenceSourceLabel,
                    sourceFingerprint: referenceSourceFingerprint,
                    cacheStatus: 'miss',
                    reason: saasResult.reason,
                    diagnostics: saasResult.diagnostics,
                    gate: saasResult.gate,
                    gateDecision: saasResult.gateDecision,
                    cacheKey: referenceAnalysisCacheKey,
                    analyzerCacheKey: saasResult.cacheKey,
                    raw: saasResult.raw,
                    frameSamples,
                  };
                  if (saasResult.reason === 'not_a_saas_reference_video') {
                    await writeSaasReferenceAnalysisCache({
                      status: 'rejected',
                      reason: 'not_a_saas_reference_video',
                      diagnostics: saasResult.diagnostics,
                      cacheKey: referenceAnalysisCacheKey,
                      analyzerCacheKey: saasResult.cacheKey,
                      referenceAssetId: referenceId,
                      sourceFingerprint: referenceSourceFingerprint,
                      gateModel: DEFAULT_GLM_GATE_MODEL,
                      analysisModel: DEFAULT_GLM_ANALYSIS_MODEL,
                      gate: saasResult.gate,
                      gateDecision: saasResult.gateDecision,
                    });
                  }
                  console.warn(`[VideoAnalysisWorker] GLM SaaS reference not applied: ${saasResult.reason}`);
                }
              }
            } catch (glmRefErr: unknown) {
              const msg = glmRefErr instanceof Error ? glmRefErr.message : String(glmRefErr);
              referenceVideoAnalysis = {
                provider: 'glm-saas-reference',
                status: 'failed',
                sourceKind: referenceCanonicalKind,
                referenceId,
                sourceLabel: referenceSourceLabel,
                sourceFingerprint: referenceSourceFingerprint,
                reason: msg,
              };
              console.warn(`[VideoAnalysisWorker] GLM SaaS reference extraction failed: ${msg}`);
            }
          }

          if (!editDNA && shouldRunLegacyReferenceExtraction(referenceVideoAnalysis)) {
            if (!canonicalReference?.sourceRegistration) {
              throw new Error('Canonical reference registration is required for legacy style extraction');
            }
            const { extractEditDNA } = await import('@/lib/editron/services/style-transfer-service');
            editDNA = await extractEditDNA({
              canonicalSource: canonicalReference,
              sourceName: referenceSourceLabel,
              userId,
              ...(orgId ? { orgId } : {}),
              projectId,
            });
          }
        }
      } catch (refErr: unknown) {
        const msg = refErr instanceof Error ? refErr.message : String(refErr);
        referenceVideoAnalysis = {
          provider: 'canonical-reference',
          status: 'failed',
          sourceKind: referenceAssetId ? 'asset' : 'remote-url',
          reason: msg,
        };
        console.warn(`[VideoAnalysisWorker] Reference extraction failed: ${msg}`);
      }
    }
    // Step 1.55: Fix video duration + register asset if missing.
    // The from-asset route uses asset.duration, which may be missing (defaults to 30s).
    // Transcription timestamps reveal the REAL video length.
    // Also: multipart upload may have failed to register the asset in media_assets.
    // If asset is missing from DB, register it here (fixes "video disappears on refresh"
    // and ensures future lookups find the correct duration).
    if (rawFootageAnalysis?.transcription?.words?.length > 0) {
      const lastWord = rawFootageAnalysis.transcription.words[rawFootageAnalysis.transcription.words.length - 1];
      const transcriptEndSec = lastWord.endMs / 1000;
      // The file CONTAINER is the source of truth for how long the video is; the transcript only marks when the
      // talking stops (it undershoots any trailing footage / outro). Read the real length from the bytes and let
      // the transcript be a fallback only — so a correct duration is never dragged down to end-of-speech.
      const { resolveVideoDurationSec, extractMP4Duration } = await import('@/lib/editron/services/mp4-duration-service');
      const containerSec = await extractMP4Duration(videoUrl).catch(() => null);
      const resolved = resolveVideoDurationSec({ containerSec, transcriptEndSec, reportedSec: durationSec });
      const actualDurationSec = resolved.seconds;
      const actualDurationMs = Math.round(actualDurationSec * 1000);

      if (resolved.corrected) {
        if (resolved.source === 'container' || resolved.source === 'transcript') {
          const {
            projectService,
            selectVideoAnalysisDurationCorrectionTargetV1,
          } = await import('@/lib/editron/services/project-service');
          const snapshot = await projectService.loadProjectForMutation(userId, projectId);
          const target = selectVideoAnalysisDurationCorrectionTargetV1(
            snapshot.project,
            assetId,
          );
          if (!target) {
            console.warn(
              '[VideoAnalysisWorker] Duration evidence did not match one untouched initial source overlay; project timeline unchanged.',
            );
          } else {
            try {
              await projectService.commitVideoAnalysisDurationCorrectionV1(
                userId,
                projectId,
                {
                  expectedRevision: snapshot.revision,
                  assetId,
                  observedDurationMs: actualDurationMs,
                  durationSource: resolved.source,
                  target,
                },
              );
            } catch (durationCorrectionError: unknown) {
              const msg = durationCorrectionError instanceof Error
                ? durationCorrectionError.message
                : String(durationCorrectionError);
              console.warn(
                `[VideoAnalysisWorker] Duration evidence could not safely update the project timeline: ${msg}`,
              );
            }
          }
        }

        // Also fix rawFootageAnalysis.originalDurationMs so silence removal math works
        rawFootageAnalysis.originalDurationMs = actualDurationMs;
        rawFootageAnalysis.estimatedCleanDurationMs = actualDurationMs -
          (rawFootageAnalysis.silenceRemovalPlan || []).reduce((sum: number, a: any) => {
            if (a.action === 'remove') return sum + (a.endMs - a.startMs);
            if (a.action === 'shorten') return sum + (a.endMs - a.startMs) - (a.shortenToMs || 0);
            return sum;
          }, 0);
        effectiveDurationSec = actualDurationSec;
      }

      // Register asset in media_assets if missing (multipart upload may have failed to register)
      try {
        const existingAsset = await db.collection('media_assets').findOne({ assetId });
        if (!existingAsset) {
          await db.collection('media_assets').insertOne({
            assetId,
            userId,
            type: 'video',
            source: 'user-upload',
            filename: `${assetId}.mp4`,
            cachedUrl: videoUrl,
            duration: actualDurationSec,
            uploadedAt: new Date(),
          });
        } else if (!existingAsset.duration && actualDurationSec > 0) {
          // Asset exists but duration missing Ã¢â‚¬â€ update it
          await db.collection('media_assets').updateOne(
            { assetId },
            { $set: { duration: actualDurationSec } },
          );
        }
      } catch (assetErr: unknown) {
        const msg = assetErr instanceof Error ? assetErr.message : String(assetErr);
        console.warn(`[VideoAnalysisWorker] Asset registration failed (non-fatal): ${msg}`);
      }
    }

    if (rawFootageAnalysis) {
      try {
        const { deriveNativeAudioEvidence } = await import('@/lib/editron/services/native-audio-evidence');
        nativeAudioEvidence = deriveNativeAudioEvidence(rawFootageAnalysis, 30);
      } catch (nativeAudioErr: unknown) {
        const msg = nativeAudioErr instanceof Error ? nativeAudioErr.message : String(nativeAudioErr);
        console.warn(`[VideoAnalysisWorker] Native audio evidence persistence failed (non-fatal): ${msg}`);
      }
    }

    // Step 1.58: Visual cut intelligence runs once for every raw-footage plan.
    // Speech-heavy footage remains transcript-led; visual evidence can only protect/refine it.
    // Low/no-speech footage is visual-led and may add visual removals/splits.
    if (rawFootageAnalysis) {
      await advanceAnalysis('analyzing_visual_cuts');
      try {
        const segmentInputs = (rawFootageAnalysis.segments || []).map((seg: any) => ({
          startMs: seg.startMs,
          endMs: seg.endMs,
        }));
        const { analyzeVideoWithVjepa, buildVjepaCoverageSegments } = await import('@/lib/editron/services/vjepa-service');
        const visualSegmentInputs = buildVjepaCoverageSegments(rawFootageAnalysis.originalDurationMs, segmentInputs, {
          maxSegments: 180,
        });

        const visualCutStartedAt = Date.now();
        precutVjepaAnalysis = await analyzeVideoWithVjepa(videoUrl, visualSegmentInputs);
        await recordVideoAnalysisCostEvent(payload, {
          stage: 'visual_cut_vjepa_modal',
          status: precutVjepaAnalysis ? 'success' : 'failed',
          provider: 'modal',
          model: precutVjepaAnalysis?.modelVersion || 'vjepa-2',
          operation: 'gpu_video_analysis',
          units: {
            requestCount: 1,
            mediaSeconds: sumSegmentSeconds(visualSegmentInputs),
            functionMs: Date.now() - visualCutStartedAt,
            gpuSeconds: msToSeconds(precutVjepaAnalysis?.processingTimeMs),
          },
          metadata: {
            requestedSegmentCount: visualSegmentInputs.length,
            analyzedSegmentCount: precutVjepaAnalysis?.segments?.length ?? 0,
            partial: Boolean(precutVjepaAnalysis?.partial),
          },
        });

        const {
          refineCutPlanWithVisualIntelligence,
        } = await import('@/lib/editron/services/visual-cut-intelligence');
        const visualCutResult = refineCutPlanWithVisualIntelligence(rawFootageAnalysis, precutVjepaAnalysis);
        visualCutIntelligence = visualCutResult.report;
        rawFootageAnalysis.visualCutIntelligence = visualCutResult.report;
        rawFootageAnalysis.silenceRemovalPlan = visualCutResult.plan;
        rawFootageAnalysis.estimatedCleanDurationMs = rawFootageAnalysis.originalDurationMs -
          (rawFootageAnalysis.silenceRemovalPlan || []).reduce((sum: number, action: any) => {
            if (action.action === 'remove') return sum + (action.endMs - action.startMs);
            if (action.action === 'shorten') return sum + (action.endMs - action.startMs) - (action.shortenToMs || 0);
            return sum;
          }, 0);
      } catch (visualCutErr: unknown) {
        const msg = visualCutErr instanceof Error ? visualCutErr.message : String(visualCutErr);
        console.warn(`[VideoAnalysisWorker] Visual cut intelligence failed (non-fatal): ${msg}`);
        await recordVideoAnalysisCostEvent(payload, {
          stage: 'visual_cut_vjepa_modal',
          status: 'failed',
          provider: 'modal',
          model: 'vjepa-2',
          operation: 'gpu_video_analysis',
          units: { requestCount: 1, mediaSeconds: durationSec },
          metadata: { errorClass: visualCutErr instanceof Error ? visualCutErr.name : 'Error' },
        });
      }
    }
    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 1.6: Execute Silence Removal (BEFORE Director) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // ZERO-EDIT: assist projects are scanned, never cut. The silence plan is still
    // computed and persisted above (so chat can offer "cut N silences"), but it is
    // NOT executed here — the user directs each cut later.
    if (!isAssistScan && rawFootageAnalysis?.silenceRemovalPlan?.length > 0) {
      await advanceAnalysis('cleaning');
      try {
        const { executeSilenceRemoval } = await import('@/lib/editron/services/silence-removal-executor');
        await executeSilenceRemoval(projectId, userId, rawFootageAnalysis.silenceRemovalPlan);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        console.error(`[VideoAnalysisWorker] Silence removal FAILED: ${msg}`);
        console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 2: Visual Understanding (AFTER cuts, segment-aware) Ã¢â€â‚¬Ã¢â€â‚¬
    // VU runs after cuts so it doesn't compete with transcription for Gemini quota,
    // and receives segment context so Gemini focuses on what the viewer will see.
    // Uses effectiveDurationSec (corrected by Step 1.55).
    // Non-fatal: pipeline continues without syntheticStoryboard if VU fails.
    const videoUnderstandingStartedAt = Date.now();
    try {
      const segmentContext = rawFootageAnalysis ? {
        keptCount: rawFootageAnalysis.segments?.length ?? 0,
        totalKeptSec: Math.max(0, Math.round((rawFootageAnalysis.estimatedCleanDurationMs ?? 0) / 1000)),
        contentType: rawFootageAnalysis.contentTypeDetection?.contentType ?? 'unknown',
        keptRanges: (rawFootageAnalysis.segments || []).slice(0, 15).map((s: any) => ({
          startSec: Math.round((s.startMs ?? 0) / 100) / 10,
          endSec: Math.round((s.endMs ?? 0) / 100) / 10,
        })),
      } : undefined;

      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      syntheticStoryboard = await analyzeVideo(videoUrl, effectiveDurationSec, userIntent || title, segmentContext);
      if (!syntheticStoryboard) {
        console.warn(`[VideoAnalysisWorker] VU returned null. Continuing without visual setup.`);
      }
      await recordVideoAnalysisCostEvent(payload, {
        stage: 'video_understanding_gemini',
        status: syntheticStoryboard ? 'success' : 'failed',
        provider: 'google-gemini',
        model: 'creative-doc-model',
        operation: 'video_understanding',
        units: {
          requestCount: 1,
          mediaSeconds: effectiveDurationSec,
          functionMs: Date.now() - videoUnderstandingStartedAt,
        },
        metadata: {
          keptSegmentCount: segmentContext?.keptCount ?? 0,
          hasGeminiFileUri: Boolean(syntheticStoryboard?.geminiFileUri),
          contentType: syntheticStoryboard?.contentType,
        },
      });
    } catch (vuErr: unknown) {
      const msg = vuErr instanceof Error ? vuErr.message : String(vuErr);
      console.warn(`[VideoAnalysisWorker] VU failed: ${msg}. Continuing without visual setup.`);
      await recordVideoAnalysisCostEvent(payload, {
        stage: 'video_understanding_gemini',
        status: 'failed',
        provider: 'google-gemini',
        model: 'creative-doc-model',
        operation: 'video_understanding',
        units: {
          requestCount: 1,
          mediaSeconds: effectiveDurationSec,
          functionMs: Date.now() - videoUnderstandingStartedAt,
        },
        metadata: { errorClass: vuErr instanceof Error ? vuErr.name : 'Error' },
      });
    }

    // Platform override
    if (platform && syntheticStoryboard) {
      syntheticStoryboard.platform = platform;
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 3: Compute Genre Parameters (signal-driven, no profiles) Ã¢â€â‚¬Ã¢â€â‚¬
    let genreParameters: any = null;
    let genreParametersSignalComputed: any = null;  // Pre-bandit value for reward feedback
    if (rawFootageAnalysis) {
      await advanceAnalysis('computing_params');
      try {
        const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
        const genreOutput = computeGenreParameters({
          rawFootage: rawFootageAnalysis,
          analyses: [],
          videoDurationSec: effectiveDurationSec,
          userPlatform: platform,
          userIntent: userIntent,
        });
        genreParameters = genreOutput.genreParams;
        genreParametersSignalComputed = { ...genreOutput.genreParams };  // Snapshot before bandit

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 3.1: Apply Thompson Sampling bandit adjustments Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Load per-user bandit state from MongoDB. If the user has enough
        // project history (>=5), sample learned adjustments to genre dials.
        // Store BOTH signal-computed and adjusted params so reward feedback
        // can compute the actual adjustment that was applied.
        try {
          const {
            loadBanditState, sampleAdjustments, applyAdjustments,
            averageSignalValue, buildDurationBucket, buildSignalBucket, buildSpeechCoverageBucket,
          } = await import('@/lib/editron/services/genre-parameter-bandit');
          const banditState = await loadBanditState(userId);

          if (banditState && banditState.totalProjects >= 5) {
            // Compute speech coverage for context
            const totalSpeechMs = rawFootageAnalysis.segments?.reduce(
              (sum: number, s: any) => sum + (s.endMs - s.startMs), 0
            ) ?? 0;
            const speechCoverage = rawFootageAnalysis.originalDurationMs
              ? totalSpeechMs / rawFootageAnalysis.originalDurationMs
              : 0;

            const context = {
              signalBucket: buildSignalBucket({
                speechCoverage,
                speechEnergy: averageSignalValue(rawFootageAnalysis.segments, 'energy'),
              }),
              speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
              durationBucket: buildDurationBucket(effectiveDurationSec),
              platform: platform || 'youtube',
            };

            const banditResult = sampleAdjustments(banditState, context);
            if (banditResult.usedBandit && Object.keys(banditResult.adjustments).length > 0) {
              genreParameters = applyAdjustments(genreParameters, banditResult.adjustments);
            }
          }
        } catch (banditErr: unknown) {
          const msg = banditErr instanceof Error ? banditErr.message : String(banditErr);
          console.warn(`[VideoAnalysisWorker] Bandit adjustment failed (non-fatal): ${msg}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] Genre param computation failed (non-fatal): ${msg}`);
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 4: Store Phase 1 results on project Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // Phase 2 fields (vjepaAnalysis, wav2vecAnalysis, momentWeightMap,
    // segmentAnalysis) are written by the TRIBE worker, not here.
    let persistedRawFootageAnalysis: any = null;
    if (rawFootageAnalysis) {
      const { compactRawFootageAnalysisForProject } = await import('@/lib/editron/services/raw-footage-persistence');
      persistedRawFootageAnalysis = compactRawFootageAnalysisForProject(rawFootageAnalysis);
    }

    if (!['transcribing', 'analyzing_visual_cuts', 'cleaning', 'computing_params'].includes(analysisState)) {
      throw new Error(`Analysis run cannot commit Phase 1 from ${analysisState}.`);
    }
    const phase1FromState = analysisState as 'transcribing' | 'analyzing_visual_cuts' | 'cleaning' | 'computing_params';
    const { projectService: phase1ProjectService } = await import('@/lib/editron/services/project-service');
    const phase1Snapshot = await phase1ProjectService.loadProjectForMutation(userId, projectId);
    const phase1Commit = await phase1ProjectService.commitProjectAnalysisPhase1V1(userId, projectId, {
      expectedRevision: phase1Snapshot.revision,
      runId: analysisRunId,
      sourceAssetId: assetId,
      fromState: phase1FromState,
      evidence: {
        ...(nativeAudioEvidence ? { nativeAudioEvidence } : {}),
        ...(normalizedMusicPreference ? { musicPreference: normalizedMusicPreference } : {}),
        ...(normalizedEditorialPreferences
          ? { editorialPreferences: { ...normalizedEditorialPreferences } }
          : {}),
        ...(syntheticStoryboard ? { syntheticStoryboard } : {}),
        ...(syntheticStoryboard?.geminiFileUri ? { geminiFileUri: syntheticStoryboard.geminiFileUri } : {}),
        ...(editDNA ? { referenceEditDNA: editDNA } : {}),
        ...(referenceVideoAnalysis ? { referenceVideoAnalysis } : {}),
        ...(persistedRawFootageAnalysis ? { rawFootageAnalysis: persistedRawFootageAnalysis } : {}),
        ...(precutVjepaAnalysis ? { vjepaAnalysis: precutVjepaAnalysis } : {}),
        ...(visualCutIntelligence ? { visualCutIntelligence } : {}),
        ...(genreParameters ? { genreParameters } : {}),
        ...(genreParametersSignalComputed ? { genreParametersSignalComputed } : {}),
      },
    });
    if (phase1Commit.disposition !== 'ADVANCED' && phase1Commit.disposition !== 'ALREADY_ADVANCED') {
      throw new AnalysisRunOwnershipLostError(
        `Analysis run lost Phase-1 ownership (${phase1Commit.disposition}).`,
      );
    }
    analysisState = 'analysis_complete';
    const phase1UpdatedAt = new Date(
      phase1Commit.disposition === 'ADVANCED'
        ? phase1Commit.receipt.committedAt
        : (phase1Commit.run.phase1EvidenceCommittedAt ?? phase1Commit.run.updatedAt),
    );

    try {
      await persistProjectAssetAnalysis(db, projectId, assetId, {
        rawFootageAnalysis: persistedRawFootageAnalysis,
        vjepaAnalysis: precutVjepaAnalysis,
      }, phase1UpdatedAt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[VideoAnalysisWorker] Per-asset analysis document write failed (non-fatal): ${msg}`);
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 1.7: Dispatch graph-sync with transcript data Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (rawFootageAnalysis) {
      try {
        const qstashToken = process.env.QSTASH_TOKEN;
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        if (qstashToken) {
          const graphRes = await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '2',
            },
            body: JSON.stringify({
              action: 'raw_footage_analyzed',
              data: {
                assetId,
                userId,
                contentType: rawFootageAnalysis.contentTypeDetection.contentType,
                fillerRate: rawFootageAnalysis.fillerWords.length / Math.max(rawFootageAnalysis.transcription.words.length, 1),
                silenceRatio: 1 - (rawFootageAnalysis.estimatedCleanDurationMs / rawFootageAnalysis.originalDurationMs),
                segmentCount: rawFootageAnalysis.segments.length,
                bestTakeCount: rawFootageAnalysis.bestTakeSelections.length,
              },
            }),
          });
          const graphStatus: ProviderCostEventStatus = graphRes.ok ? 'success' : 'failed';
          await recordVideoAnalysisCostEvent(payload, {
            stage: 'graph_sync_qstash',
            status: graphStatus,
            provider: 'upstash-qstash',
            operation: 'queue_message',
            units: { queueMessages: 1, requestCount: 1 },
            metadata: { httpStatus: graphRes.status },
          });
        }
      } catch (err: unknown) {
        // Non-fatal Ã¢â‚¬â€ graph enrichment is best-effort
        console.warn('[VideoAnalysisWorker] graph enrichment dispatch failed:', err instanceof Error ? err.message : err);
        await recordVideoAnalysisCostEvent(payload, {
          stage: 'graph_sync_qstash',
          status: 'failed',
          provider: 'upstash-qstash',
          operation: 'queue_message',
          units: { queueMessages: 1, requestCount: 1 },
          metadata: { errorClass: err instanceof Error ? err.name : 'Error' },
        });
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 4.5: Dispatch TRIBE worker (or Director directly if no segments) Ã¢â€â‚¬Ã¢â€â‚¬
    // TRIBE worker runs Steps 3.5-3.7 (V-JEPA, Wav2Vec, Essentia, moment weights,
    // segment analysis) then dispatches Director. If no segments exist (transcription
    // failed), skip TRIBE and dispatch Director directly.
    const directorPayload = {
      projectId, userId,
      analysisRunId,
      profileId: initialProfileId,
      title, platform, userIntent,
      captionStyle, transitionPreference, zoomBehavior,
      motionGraphics, pacingFeel,
      musicPreference: normalizedMusicPreference,
      editorialPreferences: normalizedEditorialPreferences,
      creditTransactionId: payload.creditTransactionId,
      chargedCredits: payload.chargedCredits,
    };

    const hasSegments = rawFootageAnalysis?.segments?.length > 0;

    if (isInternalQStashDispatchConfigured()) {
      const qstashBaseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

      if (hasSegments) {
        // Dispatch TRIBE worker for deep analysis (Steps 3.5-3.7) Ã¢â€ â€™ it dispatches Director
        const segmentInputs = rawFootageAnalysis.segments.map((seg: any) => ({
          startMs: seg.startMs,
          endMs: seg.endMs,
        }));
        const { buildVjepaCoverageSegments } = await import('@/lib/editron/services/vjepa-service');
        const visualSegmentInputs = buildVjepaCoverageSegments(rawFootageAnalysis.originalDurationMs, segmentInputs);
        const tribePayload = {
          projectId, userId, orgId, assetId, analysisRunId, videoUrl,
          segmentInputs,
          visualSegmentInputs,
          directorPayload,
          creditTransactionId: payload.creditTransactionId,
          chargedCredits: payload.chargedCredits,
        };

        const tribeUrl = `${qstashBaseUrl}/api/internal/workers/tribe-analysis`;
        const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${tribeUrl}`;

        const dispatchRes = await fetch(qstashUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '1',
            'Upstash-Delay': '2s',
            // QStash's default response-wait (~2min) is far shorter than this worker's ~8min
            // (V-JEPA/Wav2Vec GPU analysis runs synchronously). Without this header, QStash
            // times out the still-running worker and fires its retry Ã¢â€ â€™ a SECOND concurrent
            // tribe worker Ã¢â€ â€™ both fight over the Modal GPU Ã¢â€ â€™ V-JEPA/Wav2Vec abort Ã¢â€ â€™ per-moment
            // signals come back empty Ã¢â€ â€™ monotonous graphics. 800s matches this stage's
            // maxDuration (tribe route) and is Ã¢â€°Â¤ the QStash free-plan max (900s/15min). 2026-05-30.
            // NOTE: value MUST carry a unit Ã¢â‚¬â€ QStash parses it as a Go duration; bare '800'
            // returns HTTP 400 "missing unit in duration". Match the 's' suffix used by Upstash-Delay.
            'Upstash-Timeout': '800s',
          },
          body: JSON.stringify(tribePayload),
        });

        const tribeDispatchStatus: ProviderCostEventStatus = dispatchRes.ok ? 'success' : 'failed';
        await recordVideoAnalysisCostEvent(payload, {
          stage: 'tribe_qstash',
          status: tribeDispatchStatus,
          provider: 'upstash-qstash',
          operation: 'queue_message',
          units: { queueMessages: 1, requestCount: 1 },
          metadata: { httpStatus: dispatchRes.status, speechSegmentCount: segmentInputs.length, visualSegmentCount: visualSegmentInputs.length },
        });

        if (!dispatchRes.ok) {
          const errBody = await dispatchRes.text().catch(() => 'no body');
          throw new Error(`TRIBE QStash dispatch failed: HTTP ${dispatchRes.status} Ã¢â‚¬â€ ${errBody}`);
        }

        directorDispatched = true; // TRIBE owns Director dispatch from here
        const totalMs = Date.now() - startMs;
        return NextResponse.json({ success: true, totalMs, stage: 'analysis', nextStage: 'tribe-analysis' });
      } else {
        // No segments Ã¢â‚¬â€ skip TRIBE, dispatch Director directly
        await advanceAnalysis('directing_queued');

        const directorUrl = `${qstashBaseUrl}/api/internal/workers/director`;
        const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${directorUrl}`;

        const dispatchRes = await fetch(qstashUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '0',
            'Upstash-Delay': '3s',
          },
          body: JSON.stringify(directorPayload),
        });

        const directorDispatchStatus: ProviderCostEventStatus = dispatchRes.ok ? 'success' : 'failed';
        await recordVideoAnalysisCostEvent(payload, {
          stage: 'director_qstash',
          status: directorDispatchStatus,
          provider: 'upstash-qstash',
          operation: 'queue_message',
          units: { queueMessages: 1, requestCount: 1 },
          metadata: { httpStatus: dispatchRes.status, reason: 'no_segments' },
        });

        if (!dispatchRes.ok) {
          const errBody = await dispatchRes.text().catch(() => 'no body');
          throw new Error(`Director QStash dispatch failed: HTTP ${dispatchRes.status} Ã¢â‚¬â€ ${errBody}`);
        }

        directorDispatched = true;
        const totalMs = Date.now() - startMs;
        return NextResponse.json({ success: true, totalMs, stage: 'analysis', nextStage: 'director' });
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Dev fallback: no QStash Ã¢â€ â€™ run TRIBE steps + Director inline Ã¢â€â‚¬Ã¢â€â‚¬
    console.warn(`[VideoAnalysisWorker] No QSTASH_TOKEN Ã¢â‚¬â€ running TRIBE + Director inline`);

    // Run Steps 3.5-3.7 inline (V-JEPA + Wav2Vec + Essentia + moment weights + segment analysis)
    let vjepaAnalysis: any = precutVjepaAnalysis;
    let wav2vecAnalysis: any = null;

    if (hasSegments) {
      await advanceAnalysis('analyzing_deep');
      try {
        const segmentInputs = rawFootageAnalysis.segments.map((seg: any) => ({
          startMs: seg.startMs,
          endMs: seg.endMs,
        }));
        const { analyzeVideoWithVjepa, buildVjepaCoverageSegments } = await import('@/lib/editron/services/vjepa-service');
        const visualSegmentInputs = buildVjepaCoverageSegments(rawFootageAnalysis.originalDurationMs, segmentInputs);

        const [vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
          vjepaAnalysis
            ? Promise.resolve(vjepaAnalysis)
            : (async () => {
                return analyzeVideoWithVjepa(videoUrl, visualSegmentInputs);
              })(),
          (async () => {
            const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
            return analyzeAudioWithWav2Vec(videoUrl, segmentInputs);
          })(),
          (async () => {
            const { analyzeMusicContent } = await import('@/lib/editron/services/music-analysis-service');
            return analyzeMusicContent(videoUrl);
          })(),
        ]);

        if (vjepaResult.status === 'fulfilled' && vjepaResult.value) {
          vjepaAnalysis = vjepaResult.value;
        }
        if (wav2vecResult.status === 'fulfilled' && wav2vecResult.value) {
          wav2vecAnalysis = wav2vecResult.value;
        }
        if (musicResult.status === 'fulfilled' && musicResult.value) {
          try {
            await db.collection('projects').updateOne(
              { projectId },
              { $set: { musicAnalysis: musicResult.value } },
            );
          } catch (err: unknown) { console.warn('[VideoAnalysisWorker] music analysis store failed:', err instanceof Error ? err.message : err); }
        }

        // Build moment weight map
        let momentWeightMap: any = null;
        if (vjepaAnalysis || wav2vecAnalysis) {
          try {
            const { buildMomentWeightMap, integrateVjepaScores, integrateWav2vecScores } =
              await import('@/lib/editron/services/moment-weight-service');
            const { toVjepaWeightFormat } = await import('@/lib/editron/services/vjepa-service');
            const { toWav2VecWeightFormat } = await import('@/lib/editron/services/wav2vec-service');
            let weightMap = buildMomentWeightMap(null, rawFootageAnalysis);
            if (vjepaAnalysis) weightMap = integrateVjepaScores(weightMap, toVjepaWeightFormat(vjepaAnalysis));
            if (wav2vecAnalysis) weightMap = integrateWav2vecScores(weightMap, toWav2VecWeightFormat(wav2vecAnalysis));
            momentWeightMap = weightMap;
          } catch (err: unknown) { console.warn('[VideoAnalysisWorker] moment weight map build failed:', err instanceof Error ? err.message : err); }
        }

        // Build segment analysis
        let segmentAnalysis: any = null;
        try {
          const { buildSegmentAnalysis } = await import('@/lib/editron/services/segment-analysis-builder');
          segmentAnalysis = buildSegmentAnalysis(
            rawFootageAnalysis, syntheticStoryboard,
            vjepaAnalysis, wav2vecAnalysis, momentWeightMap,
          );
        } catch (err: unknown) { console.warn('[VideoAnalysisWorker] segment analysis build failed:', err instanceof Error ? err.message : err); }

        // Store Phase 2 data
        const inlinePhase2UpdatedAt = new Date();
        const inlinePhase2PerAssetSet = buildProjectAnalysisAssetSet(assetId, {
          vjepaAnalysis,
          wav2vecAnalysis,
          musicAnalysis: musicResult.status === 'fulfilled' ? musicResult.value : null,
          momentWeightMap,
          segmentAnalysis,
        }, inlinePhase2UpdatedAt);

        await db.collection('projects').updateOne(
          { projectId },
          {
            $set: {
              ...(vjepaAnalysis && { vjepaAnalysis }),
              ...(wav2vecAnalysis && { wav2vecAnalysis }),
              ...(momentWeightMap && { momentWeightMap }),
              ...(segmentAnalysis && { segmentAnalysis }),
              ...inlinePhase2PerAssetSet,
              updatedAt: inlinePhase2UpdatedAt,
            },
          },
        );

        try {
          await persistProjectAssetAnalysis(db, projectId, assetId, {
            vjepaAnalysis,
            wav2vecAnalysis,
            musicAnalysis: musicResult.status === 'fulfilled' ? musicResult.value : null,
            momentWeightMap,
            segmentAnalysis,
          }, inlinePhase2UpdatedAt);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[VideoAnalysisWorker] Inline per-asset analysis document write failed (non-fatal): ${msg}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] TRIBE inline failed (non-fatal): ${msg}`);
      }
    }

    await advanceAnalysis('directing_queued');
    const { runCanonicalDirectorV1 } = await import('@/lib/editron/services/canonical-director-run');
    const directorResult = await runCanonicalDirectorV1(directorPayload, {
      onClaimed: () => { directorDispatched = true; },
    });
    const totalMs = Date.now() - startMs;
    if (directorResult.disposition === 'ASSIST_READY') {
      return NextResponse.json({
        success: true,
        projectId,
        status: directorResult.status,
        directorSkipped: true,
      });
    }
    if (directorResult.disposition === 'ALREADY_PROCESSED' || directorResult.disposition === 'OWNERSHIP_LOST') {
      return NextResponse.json({ success: true, totalMs, skipped: true, reason: 'director-ownership-lost' });
    }
    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const ownershipLost = error instanceof AnalysisRunOwnershipLostError;
    console.error(`[VideoAnalysisWorker] Failed: ${msg}`);

    // Mark project as failed Ã¢â‚¬â€ but only if TRIBE/Director hasn't already been dispatched
    // (if dispatched, the downstream worker owns the final status)
    if (trackedScan && !directorDispatched && !ownershipLost) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const { settleAssistScanFailure } = await import('@/lib/editron/services/assist-lane');
        // Assist lane: atomic scan_failed + refund-where-deducted (handles QStash
        // redelivery + cancel races). Returns 'not-assist' for auto → fall through.
        const settlement = await settleAssistScanFailure(db, {
          projectId: trackedScan.projectId,
          userId: trackedScan.userId,
          reason: msg,
          creditTransactionId: trackedScan.creditTransactionId,
        });
        if (settlement === 'not-assist') {
          const { projectService } = await import('@/lib/editron/services/project-service');
          const snapshot = await projectService.loadProjectForMutation(
            trackedScan.userId,
            trackedScan.projectId,
          );
          const failed = await projectService.failProjectAnalysisRunV1(
            trackedScan.userId,
            trackedScan.projectId,
            {
              expectedRevision: snapshot.revision,
              runId: trackedScan.analysisRunId,
              sourceAssetId: trackedScan.assetId,
              errorMessage: msg,
            },
          );
          if (failed.disposition !== 'RECORDED' && failed.disposition !== 'ALREADY_RECORDED') {
            throw new Error(`Analysis failure lost current run ownership (${failed.disposition}).`);
          }
        }
      } catch (err: unknown) { console.warn('[VideoAnalysisWorker] best-effort status update failed:', err instanceof Error ? err.message : err); }
    }

    return NextResponse.json(
      { success: false, error: msg },
      { status: ownershipLost ? 409 : 500 },
    );
  }
}

async function recordVideoAnalysisCostEvent(
  payload: VideoAnalysisPayload,
  event: {
    stage: string;
    status: ProviderCostEventStatus;
    provider: string;
    operation: string;
    model?: string;
    includeRevenue?: boolean;
    estimatedCostUsd?: number;
    costBasis?: ProviderCostBasis;
    units?: ProviderCostUnits;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordProviderCostEvent({
    idempotencyKey: `editron:video-analysis:${payload.projectId}:${event.stage}:${event.status}`,
    status: event.status,
    userId: payload.userId,
    orgId: payload.orgId,
    projectId: payload.projectId,
    assetId: payload.assetId,
    creditTransactionId: payload.creditTransactionId,
    service: 'editron',
    action: 'auto_edit_analysis',
    route: '/api/internal/workers/video-analysis',
    provider: event.provider,
    model: event.model,
    operation: event.operation,
    chargedCredits: event.includeRevenue ? payload.chargedCredits : undefined,
    estimatedCostUsd: event.estimatedCostUsd,
    costBasis: event.costBasis,
    units: event.units,
    metadata: {
      stage: event.stage,
      durationSec: payload.durationSec,
      ...event.metadata,
    },
  });
}

function sumSegmentSeconds(segments: Array<{ startMs: number; endMs: number }> = []): number | undefined {
  const seconds = segments.reduce((sum, segment) => {
    const durationMs = Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0));
    return sum + durationMs / 1000;
  }, 0);
  return seconds > 0 ? seconds : undefined;
}

function msToSeconds(ms: unknown): number | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
}

function isSaasReferenceGlmEnabled(): boolean {
  const flag = process.env.EDITRON_SAAS_REFERENCE_GLM_ENABLED?.toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function shouldRunLegacyReferenceExtraction(referenceVideoAnalysis: any): boolean {
  if (!isSaasReferenceGlmEnabled()) return true;
  if (referenceVideoAnalysis?.status === 'rejected') return false;
  if (referenceVideoAnalysis?.status === 'failed') return false;
  return process.env.EDITRON_REFERENCE_LEGACY_FALLBACK_ENABLED?.toLowerCase() !== 'false';
}
export const POST = withInternalQStashWorkerAuth(handler, 'video-analysis');
