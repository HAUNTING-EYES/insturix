/**
 * Director Agent — Deterministic Profile Executor
 *
 * NOT an LLM agent. Executes edit profile action sequences directly
 * by calling tool functions. Fast, cheap, predictable, auditable.
 *
 * LLM is only invoked for tools that inherently need generation
 * (add_captions, add_fancy_captions, generate_html_scene).
 *
 * Execution order (from profiles doc):
 * 1. checkpoint() — always first
 * 2. validate project state
 * 3. apply filters
 * 4. apply pacing
 * 5. insert transitions
 * 6. audio ducking
 * 7. add captions (after pacing is set)
 * 8. add motion graphics (last visual layer)
 * 9. BGM fade-out check
 * 10. quality review (deterministic)
 * 11. quality review (AI vision, if profile requires)
 */

import type { EditProfile, EditProfileAction, DirectorResult, ProjectBrief, ProfileId } from '@/lib/editron/data/edit-profile-types';
import type { GateResult } from '@/lib/editron/services/quality-gate';
import type { ExecutionResult } from '@/lib/editron/services/edl-executor';
import { getProfileById } from '@/lib/editron/data/edit-profiles';
import {
  projectService,
  type ProjectPhase0ProofFactsV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import { advanceDirectorRevisionFromReceiptsV1 } from '@/lib/editron/agent/director-revision-chain-v1';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { getFilterPresetById } from '@/lib/editron/data/filter-presets';
import type { GridPointDecision, OverlayCategory } from '@/lib/editron/engine/utility-types';
import { resolveDirectorBrandScope } from '@/lib/editron/agent/director-brand-scope';
import { resolveAtomicCaptionPresentation } from '@/lib/editron/services/caption-form';
import {
  planUnifiedDecisionBundleFromCandidates,
  type UnifiedDecisionBundle,
  type UnifiedDecisionProducerCandidate,
} from '@/lib/editron/services/unified-decision-bundle';
import { enforceCanonicalDecisionTimeline } from '@/lib/editron/services/decision-timeline-guard';
import { resolveEditorialDecisionPolicy } from '@/lib/editron/services/editorial-decision-policy';
import { resolveMusicGenerationPolicy } from '@/lib/pipeline/bgm-conditioning-contract';
import {
  shouldInjectGlobalCaptionAction,
  shouldRunDirectorScopedEffect,
  shouldRunPostBundleProfileAction,
  shouldRunPostEdlUtilityScoring,
  shouldRunProfileActionWithinExecutionScope,
  shouldRunUtilityLiveProducer,
} from '@/lib/editron/agent/post-edl-action-policy';
import {
  LEGACY_INTELLIGENCE_FALLBACK_ENV,
  formatVjepaCoverageAuditWarning,
  shouldRunLegacyIntelligenceFallback,
} from '@/lib/editron/agent/director-observability';
import {
  buildCanonicalCaptionChoreographyReservations,
  installCanonicalCaptionTrack,
} from '@/lib/editron/services/canonical-caption-track';
import { buildPersistedQualityReview } from '@/lib/editron/services/quality-review-persistence';
import { buildPhase0LiveTruthSnapshot } from '@/lib/editron/services/phase0-live-truth';
import { buildPhase0FixtureManifest } from '@/lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '@/lib/editron/services/phase0-render-artifact-pack';
import { buildStorylineSeamTransitionEdl } from '@/lib/editron/services/storyline-seam-transitions';
import { buildCreativeBriefGroundedContext } from '@/lib/editron/services/creative-brief-grounding';
import {
  dispatchPhase0RenderedEvidenceJob,
  type Phase0RenderedEvidenceDispatchResult,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';

// D-016: Convert genre-parameter-computer's numeric graphic_density (0-8) to EDL budget label.
// ⚠️ thresholds 2 and 5 INVENTED — needs calibration via threshold bandit
function densityFromGenreParams(graphicDensity: number | undefined): 'heavy' | 'moderate' | 'minimal' | undefined {
  if (graphicDensity == null) return undefined;
  if (graphicDensity < 2) return 'minimal';
  if (graphicDensity < 5) return 'moderate';
  return 'heavy';
}

function densityFromSignalsOrNeutral(genreParams: { graphic_density?: number } | undefined | null): 'heavy' | 'moderate' | 'minimal' {
  return densityFromGenreParams(genreParams?.graphic_density) ?? 'moderate';
}

function targetCutsPerMinuteFromGenreParams(genreParams: { pacing_tolerance?: number } | undefined | null): number {
  const pacingToleranceSec = genreParams?.pacing_tolerance;
  if (typeof pacingToleranceSec !== 'number' || !Number.isFinite(pacingToleranceSec) || pacingToleranceSec <= 0) return 6;
  return Math.max(2, Math.min(18, 60 / pacingToleranceSec));
}

function pacingFromRawFootageSignals(rawFootage: any): 'fast' | 'medium' {
  const speechCoverage = typeof rawFootage?.speechCoverage === 'number'
    ? rawFootage.speechCoverage
    : computeSpeechCoverageFromSegments(rawFootage);
  const avgWordGapMs = averageRawFootageSegmentNumber(rawFootage?.segments, 'avgWordGapMs');

  if (speechCoverage >= 0.72 && (avgWordGapMs === undefined || avgWordGapMs < 350)) return 'fast';
  return 'medium';
}

function computeSpeechCoverageFromSegments(rawFootage: any): number {
  const durationMs = typeof rawFootage?.originalDurationMs === 'number' ? rawFootage.originalDurationMs : 0;
  if (!durationMs || !Array.isArray(rawFootage?.segments)) return 0;
  const speechMs = rawFootage.segments.reduce((sum: number, segment: any) => {
    const startMs = typeof segment?.startMs === 'number' ? segment.startMs : 0;
    const endMs = typeof segment?.endMs === 'number' ? segment.endMs : startMs;
    return sum + Math.max(0, endMs - startMs);
  }, 0);
  return Math.max(0, Math.min(1, speechMs / durationMs));
}

function averageRawFootageSegmentNumber(segments: unknown, key: string): number | undefined {
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  let total = 0;
  let count = 0;
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue;
    const value = (segment as Record<string, unknown>)[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    total += value;
    count += 1;
  }
  return count > 0 ? total / count : undefined;
}

function summarizeUnifiedDecisionBundle(bundle: UnifiedDecisionBundle, executionResult?: ExecutionResult) {
  const byType: Record<string, number> = {};
  for (const decision of bundle.edl.decisions) {
    byType[decision.type] = (byType[decision.type] || 0) + 1;
  }

  return {
    version: 1,
    source: bundle.source,
    authority: bundle.authority,
    totalDecisions: bundle.edl.totalDecisions,
    expectedExecuted: bundle.expectedExecuted,
    expectedSkipped: bundle.expectedSkipped,
    graphicsDensity: bundle.graphicsDensity ?? null,
    byType,
    canonicalTimeline: summarizeCanonicalTimelineFromDecisions(bundle.edl.decisions),
    executionTrace: summarizeDecisionExecutionTrace(executionResult),
    evidence: bundle.evidence,
  };
}

function summarizeDecisionExecutionTrace(executionResult?: ExecutionResult) {
  if (!executionResult) return null;
  const entries = executionResult.decisionExecutionTrace ?? [];
  const byOutcome: Record<string, number> = {};
  let createdOverlayLinkCount = 0;
  let modifiedOverlayLinkCount = 0;
  let executedWithoutOverlayLinkCount = 0;
  for (const entry of entries) {
    byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
    createdOverlayLinkCount += entry.createdOverlayIds.length;
    modifiedOverlayLinkCount += entry.modifiedOverlayIds.length;
    if (entry.outcome === 'executed' && entry.createdOverlayIds.length === 0 && entry.modifiedOverlayIds.length === 0) {
      executedWithoutOverlayLinkCount += 1;
    }
  }

  return {
    version: 'decision-output-trace-v1' as const,
    totalObserved: executionResult.decisionExecutionTraceTotal,
    keptEntries: entries.length,
    truncated: executionResult.decisionExecutionTraceTruncated,
    executed: executionResult.decisionsExecuted,
    skipped: executionResult.decisionsSkipped,
    overlaysCreated: executionResult.overlaysCreated,
    overlaysModified: executionResult.overlaysModified,
    byOutcome,
    createdOverlayLinkCount,
    modifiedOverlayLinkCount,
    executedWithoutOverlayLinkCount,
    samples: entries.slice(0, 75).map((entry) => ({
      decisionIndex: entry.decisionIndex,
      type: entry.type,
      frame: entry.frame,
      source: entry.source,
      signal: entry.signal,
      confidence: entry.confidence,
      outcome: entry.outcome,
      reason: entry.reason,
      ruleId: entry.ruleId,
      createdOverlayIds: entry.createdOverlayIds.slice(0, 10),
      modifiedOverlayIds: entry.modifiedOverlayIds.slice(0, 10),
      beforeOverlayCount: entry.beforeOverlayCount,
      afterOverlayCount: entry.afterOverlayCount,
      paramsPreview: entry.paramsPreview,
    })),
  };
}

function summarizeCanonicalTimelineFromDecisions(decisions: UnifiedDecisionBundle['edl']['decisions']) {
  const stamps = decisions
    .map((decision) => decision.params?.canonicalTimeline)
    .filter((stamp): stamp is Record<string, unknown> => typeof stamp === 'object' && stamp !== null);

  if (stamps.length === 0) return null;

  return {
    version: 'canonical-decision-timeline-v1',
    frameSpace: 'cut',
    stampedDecisionCount: stamps.length,
    sourceMappedCount: stamps.filter((stamp) => stamp.sourceMapped === true).length,
    invalidDecisionCount: stamps.filter((stamp) => stamp.status !== 'ok').length,
  };
}

function summarizeSignalDecisionAuditForAuthority(bundle: UnifiedDecisionBundle) {
  const audit = bundle.evidence.signalDecisionAudit;
  return {
    version: 'signal-decision-audit-summary-v1' as const,
    totalCount: audit.totalCount,
    outcomes: audit.outcomes,
    byType: summarizeSignalAuditBucketCounts(audit.byType),
    byFamily: summarizeSignalAuditBucketCounts(audit.byFamily),
    byReason: summarizeSignalAuditBucketCounts(audit.byReason),
    candidateCount: audit.candidates.length,
    sampleCount: audit.samples.length,
  };
}

function summarizeSignalAuditBucketCounts(
  buckets: Record<string, { count: number }>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(buckets)
      .filter(([, bucket]) => bucket.count > 0)
      .map(([key, bucket]) => [key, bucket.count]),
  );
}

async function persistUnifiedDecisionBundleSummary(
  projectId: string,
  summary: ReturnType<typeof summarizeUnifiedDecisionBundle>,
): Promise<void> {
  try {
    const bundleDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
    await bundleDb.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          'intelligence.unifiedDecisionBundle': {
            ...summary,
            persistedAt: new Date().toISOString(),
          },
        },
      },
    );
  } catch (err: unknown) {
    console.warn('[Director] non-fatal unified decision bundle persistence:', err instanceof Error ? err.message : err);
  }
}

type PostBundleProfileActionPolicySummary = {
  version: 'post-bundle-profile-action-policy-v1';
  unifiedDecisionBundleExecuted: true;
  evaluatedAt: string;
  allowedActionCount: number;
  skippedActionCount: number;
  allowedTools: string[];
  skippedActions: Array<{
    tool: string;
    action: string;
    reason: string;
  }>;
};

async function persistPostBundleProfileActionPolicy(
  projectId: string,
  summary: PostBundleProfileActionPolicySummary,
): Promise<void> {
  try {
    const bundleDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
    await bundleDb.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          'intelligence.postBundleProfileActionPolicy': summary,
        },
      },
    );
  } catch (err: unknown) {
    console.warn('[Director] non-fatal post-bundle profile action policy persistence:', err instanceof Error ? err.message : err);
  }
}

async function buildFinalPhase0LiveTruthFacts(options: {
  projectId: string;
  project: any;
  projectDoc: any;
  overlays: any[];
  constraintViolations?: any[];
  genreParams?: any;
}): Promise<{
  snapshot: ReturnType<typeof buildPhase0LiveTruthSnapshot>;
  facts: ProjectPhase0ProofFactsV1;
}> {
  const { runQualityReview } = await import('@/lib/editron/services/quality-review-service');
  const reviewedAt = new Date();
  const fps = options.project?.fps || 30;
  const finalQualityReport = runQualityReview(
    options.overlays,
    fps,
    undefined,
    undefined,
    options.constraintViolations,
    undefined,
    options.genreParams,
  );
  const persistedQualityReview = buildPersistedQualityReview(finalQualityReport, reviewedAt);
  const persistedProjectDoc = options.projectDoc ?? options.project ?? {};

  const truthProject = {
    ...(persistedProjectDoc ?? {}),
    projectId: options.projectId,
    id: persistedProjectDoc?.id ?? options.project?.id,
    durationInFrames: persistedProjectDoc?.durationInFrames ?? options.project?.durationInFrames,
    fps: persistedProjectDoc?.fps ?? options.project?.fps,
    playerDimensions: persistedProjectDoc?.playerDimensions ?? options.project?.playerDimensions,
    aspectRatio: persistedProjectDoc?.aspectRatio ?? options.project?.aspectRatio,
    rawFootageAnalysis: persistedProjectDoc?.rawFootageAnalysis ?? options.projectDoc?.rawFootageAnalysis,
    vjepaAnalysis: persistedProjectDoc?.vjepaAnalysis ?? options.projectDoc?.vjepaAnalysis,
    intelligence: persistedProjectDoc?.intelligence ?? options.projectDoc?.intelligence,
    overlays: options.overlays,
    qualityReview: persistedQualityReview as unknown as Record<string, unknown>,
  };
  const capturedAt = reviewedAt.toISOString();
  const artifactDir = buildLivePhase0ArtifactDir(options.projectId, capturedAt);
  const artifactManifest = buildPhase0FixtureManifest(truthProject, {
    capturedAt,
    source: 'director-final-save',
    artifactDir,
  });
  const artifactPack = buildPhase0RenderArtifactPack(truthProject, artifactManifest, {
    artifactDir,
  });
  const snapshot = buildPhase0LiveTruthSnapshot(truthProject, {
    capturedAt,
    source: 'director-final-save',
    artifactDir,
    artifactPack,
  });

  return {
    snapshot,
    facts: {
      qualityReview: persistedQualityReview as unknown as Record<string, unknown>,
      liveTruth: snapshot as unknown as Record<string, unknown>,
      renderedQualityEvidence: snapshot.qualityEvidence as unknown as Record<string, unknown>,
      fixtureArtifact: buildLivePhase0FixtureArtifact(
        snapshot,
        artifactPack,
      ) as unknown as Record<string, unknown>,
    },
  };
}

function buildLivePhase0ArtifactDir(projectId: string, capturedAt: string): string {
  const safeProjectId = safePhase0PathSegment(projectId || 'unknown-project');
  const safeRunId = safePhase0PathSegment(capturedAt);
  return `.calibration-temp/phase0-live/${safeProjectId}/${safeRunId}`;
}

function safePhase0PathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'unknown';
}

function buildLivePhase0FixtureArtifact(
  snapshot: ReturnType<typeof buildPhase0LiveTruthSnapshot>,
  artifactPack: ReturnType<typeof buildPhase0RenderArtifactPack>,
) {
  return {
    version: 'editron-phase0-live-fixture-artifact-v1' as const,
    persistedAt: snapshot.capturedAt,
    materialization: 'planned-not-rendered' as const,
    artifactDir: artifactPack.artifactDir,
    renderInputPath: artifactPack.paths.renderInput,
    renderedAestheticDir: artifactPack.paths.renderedAestheticDir,
    renderedAestheticJson: artifactPack.paths.renderedAestheticJson,
    renderedAestheticHtml: artifactPack.paths.renderedAestheticHtml,
    renderCommand: artifactPack.renderCommand,
    artifactPackStatus: artifactPack.status,
    artifactPackIssues: artifactPack.issues.slice(0, 20),
    renderArtifactsStatus: snapshot.renderArtifacts.status,
    qualityEvidenceSource: snapshot.qualityEvidence.qualityEvidenceSource,
    sampledFrameCount: artifactPack.samplePlan.sampledFrames.length,
    sampledFrames: artifactPack.samplePlan.sampledFrames.slice(0, 80),
    droppedSampleCount: artifactPack.samplePlan.droppedSampleCount,
    familyCoverage: {
      auditedVisualCount: artifactPack.familyCoverage.auditedVisualCount,
      auditedMotionCount: artifactPack.familyCoverage.auditedMotionCount,
      auditedAudioCount: artifactPack.familyCoverage.auditedAudioCount,
      presentRequiredFamilies: artifactPack.familyCoverage.presentRequiredFamilies,
      missingRequiredFamilies: artifactPack.familyCoverage.missingRequiredFamilies,
      incompleteFamilies: artifactPack.familyCoverage.incompleteFamilies,
    },
  };
}

function isCanonicalDecisionTimelineError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('canonical decision timeline');
}

type DirectorProgressObserverV1 = (
  step: number,
  total: number,
  description: string,
) => void | Promise<void>;

/**
 * Only the QStash Director worker opts into durable progress. Other callers
 * retain their existing observer-only progress behaviour and cannot create a
 * surprise stage write on a manually invoked Director run.
 */
export interface DirectorProgressReporterV1 {
  persistProjectProgress?: boolean;
  onProgress?: DirectorProgressObserverV1;
}


/**
 * Execute a Director Agent plan on a project.
 *
 * @param projectId - Editron project to edit
 * @param userId - Owner
 * @param profileId - Edit profile to execute
 * @param brief - Optional project brief with overrides
 * @param progress - Optional observer; the QStash Director worker may opt into
 * lease-bound durable progress through `persistProjectProgress`.
 */
export async function executeDirectorPlan(
  projectId: string,
  userId: string,
  profileId: string,
  brief?: ProjectBrief,
  progress?: DirectorProgressObserverV1 | DirectorProgressReporterV1,
): Promise<DirectorResult> {
  const startTime = Date.now();
  const profile = getProfileById(profileId);

  // C6 FIX: Validate profile exists before proceeding
  if (!profile) {
    return {
      success: false, profileId: profileId as ProfileId,
      actionsExecuted: 0, actionsSkipped: [{ action: 'all', reason: `Profile "${profileId}" not found` }],
      overlaysModified: 0, checkpointId: '', executionMs: 0,
      warnings: [`Edit profile "${profileId}" not found. Available profiles can be seen in the export dialog.`],
    };
  }

  // Apply brief overrides
  let effectiveProfile = applyBriefOverrides(profile, brief);

  // Phase 2.4: Utility AI profile override (feature-flagged, default OFF)
  // Scoring happens after signal timeline build (Step D.4c) where real signals exist.
  const useUtilityEngine = process.env.USE_UTILITY_ENGINE === 'true';
  const useUtilityLive = process.env.USE_UTILITY_LIVE === 'true';
  const editorialExecutionScope = brief?.executionScope;

  // Pipeline warning collector for structured error visibility
  const { createPipelineWarnings } = await import('@/lib/editron/services/pipeline-warnings');
  const pipelineWarnings = createPipelineWarnings();

  const result: DirectorResult = {
    success: false,
    profileId: effectiveProfile.profileId,
    decisionAuthority: {
      version: 'decision-authority-v1',
      source: 'profile-driven',
      executableProducer: 'creative-brief',
      advisoryProducers: [],
      signalDecisionRole: 'none',
      signalDecisionsCanAddExecutable: false,
      primaryDecisionCount: 0,
      signalDecisionCount: 0,
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 0,
      suppressedSignalDuplicateCount: 0,
      evidenceOnlySignalDecisionCount: 0,
      totalDecisions: 0,
      executedDecisions: 0,
      ...(editorialExecutionScope ? { executionScope: editorialExecutionScope } : {}),
    },
    actionsExecuted: 0,
    actionsSkipped: [],
    overlaysModified: 0,
    checkpointId: '',
    executionMs: 0,
    warnings: [],
  };
  let fatalDirectorError: Error | null = null;
  let directorLeaseId: string | null = null;

  try {
    const kineticSfxPolicy = effectiveProfile.transitionSFXPolicy ?? 'full';
    const directorLease = await projectService.acquireDirectorMutationLease(
      userId,
      projectId,
      {
        kineticSfxPolicy,
        profileId: effectiveProfile.profileId,
      },
    );
    directorLeaseId = directorLease.leaseId;

    // ─── Step 1: Load project state ──────────────────────────
    const { project } = directorLease;
    let directorCurrentRevision: ProjectRevisionV1 = directorLease.revision;
    const progressReporter = typeof progress === 'function' ? undefined : progress;
    const progressObserver = typeof progress === 'function'
      ? progress
      : progressReporter?.onProgress;
    let lastPersistedStagePct = -1;
    let lastPersistedStageDesc = '';
    const reportDirectorProgress = async (
      step: number,
      total: number,
      description: string,
    ): Promise<void> => {
      const stagePercent = total > 0
        ? Math.min(99, Math.max(0, Math.round((step / total) * 100)))
        : 3;
      if (
        progressReporter?.persistProjectProgress === true
        && directorLeaseId !== null
        && (stagePercent !== lastPersistedStagePct || description !== lastPersistedStageDesc)
      ) {
        const receipt = await projectService.recordDirectorProgressV1(
          userId,
          projectId,
          {
            expectedRevision: directorCurrentRevision,
            directorLeaseId,
            stagePercent,
            stageDescription: description,
          },
        );
        directorCurrentRevision = advanceDirectorRevisionFromReceiptsV1({
          projectId,
          currentRevision: directorCurrentRevision,
          receipts: [receipt],
        });
        lastPersistedStagePct = stagePercent;
        lastPersistedStageDesc = description;
      }

      await progressObserver?.(step, total, description);
    };

    const directorProjectRecord = project as any;
    const overlays = project.overlays || [];
    result.checkpointId = `director_${Date.now()}`;

    // ─── Step 1.5: Run 5-Track Analysis → EDL → Execute ──────
    // Intelligence layer with PER-ASSET error isolation.
    // If one asset fails analysis, others still contribute to the EDL.
    // storyboardScenes MUST be in function scope (not block scope) because
    // executeAction at step 3 references it for captions, filters, transitions, quality review.
    // Previously declared inside the { } block below → caused "storyboardScenes is not defined"
    // which silently killed captions, filters, transitions, and quality review.
    let storyboardScenes: any[] = [];
    let storyboardContextSource: 'storyboard' | 'raw-footage-analysis' | 'synthetic-storyboard' | null = null;
    // Fix 24: Hoist per-asset analysis data to function scope so continuity scoring
    // can use real 5-Track visual data (dominant colors, energy) instead of empty arrays.
    const perAssetAnalysis = new Map<string, any>();
    let projectDoc: any = null;
    // Path D: hoisted constraint violations + genre params for quality review step 11
    let pathDConstraintViolations: any[] | undefined;
    let pathDGenreParams: any | undefined;
    let pathEGenreParams: any | undefined;
    let briefCaptionStyle: string | undefined;
    const captionEditorialPolicy = resolveEditorialDecisionPolicy(
      brief?.editorialPreferences,
      'caption',
    );
    const captionExecutionScopePolicy = shouldRunDirectorScopedEffect({
      effect: 'canonical-captions',
      executionScope: editorialExecutionScope,
    });
    const musicGenerationPolicy = resolveMusicGenerationPolicy({
      musicPreferences: [
        { value: brief?.musicPreference, source: 'director-brief.musicPreference' },
        { value: directorProjectRecord.musicPreference, source: 'project.musicPreference' },
        { value: directorProjectRecord.productionBrief?.musicPreference, source: 'project.productionBrief.musicPreference' },
        { value: directorProjectRecord.productionBriefIntake?.musicPreference, source: 'project.productionBriefIntake.musicPreference' },
        { value: directorProjectRecord.creativeBrief?.musicPreference, source: 'project.creativeBrief.musicPreference' },
      ],
      editorialPreferences: [
        { value: brief?.editorialPreferences, source: 'director-brief.editorialPreferences' },
        { value: directorProjectRecord.editorialPreferences, source: 'project.editorialPreferences' },
        { value: directorProjectRecord.productionBrief?.editorialPreferences, source: 'project.productionBrief.editorialPreferences' },
        { value: directorProjectRecord.productionBriefIntake?.editorialPreferences, source: 'project.productionBriefIntake.editorialPreferences' },
        { value: directorProjectRecord.creativeBrief?.editorialPreferences, source: 'project.creativeBrief.editorialPreferences' },
      ],
    });
    const musicEditorialPolicy = musicGenerationPolicy.editorialPolicy;
    let briefPacing: string | undefined;
    let briefSignalContext: Record<string, number> = {};
    let unifiedDecisionBundleExecuted = false;
    let postBundleProfileActionPolicy: PostBundleProfileActionPolicySummary | null = null;

    const edlSummary: {
      totalDecisions: number;
      executed: number;
      skipped: number;
      byType: Record<string, number>;
      cinematicMoments: number;
      assetsAnalyzed: number;
      assetsFailed: number;
      failedAssets: string[];
      skipReason?: 'creative-brief-per-asset-analysis-bypassed' | 'asset-analysis-unavailable';
    } = {
      totalDecisions: 0, executed: 0, skipped: 0, byType: {}, cinematicMoments: 0,
      assetsAnalyzed: 0, assetsFailed: 0, failedAssets: [],
    };
    {
      const { runFullAnalysis, getAnalysis } = await import('@/lib/editron/services/five-track-analysis');
      const { generateEditDecisionList } = await import('@/lib/editron/services/reactive-edit-engine');
      const { executeEDL } = await import('@/lib/editron/services/edl-executor');
      const { detectCinematicMoments } = await import('@/lib/editron/services/cinematic-moment-detector');

      const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      const voiceoverOverlays = overlays.filter(o => o.type === 'sound' && o.row === ROW.VOICEOVER).sort((a, b) => a.from - b.from);
      const analyses: any[] = [];
      try {
        const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
        projectDoc = await db.collection('projects').findOne({ projectId }) as any;
        const { getStoryboardForProjectContext } = await import('@/lib/pipeline/storyboard-db');
        const sb = await getStoryboardForProjectContext({
          projectId,
          sourceStoryboardId: projectDoc?.sourceStoryboardId,
          sourceSessionId: projectDoc?.sourceSessionId,
        }, userId);
        if (sb) {
          // Path A: ThinkForge storyboard (Mode 1: script -> AI video)
          storyboardScenes = sb.scenes.map(s => ({
            sceneIndex: s.sceneIndex,
            sceneType: (s as any).sceneType || 'continuous',
            narration: s.descriptor.narration,
            visualDescription: s.descriptor.visualDescription,
            mood: s.descriptor.mood,
            audioDescription: s.descriptor.audioDescription,
            cameraDirection: s.descriptor.cameraDirection,
            editDirections: s.descriptor.editDirections,
          }));
          storyboardContextSource = 'storyboard';
          console.log(`[Director] Found storyboard with ${storyboardScenes.length} scenes`);
        } else if (projectDoc?.rawFootageAnalysis?.segments?.length > 0) {
          // Path C: Raw Footage Analysis (Mode 2 with transcript intelligence)
          // Built by raw-footage-processor.ts from real transcript data.
          // Preferred over SyntheticStoryboard when available — transcript segments
          // are real topical boundaries, not Gemini Vision's guessed scene breaks.
          const rfa = projectDoc.rawFootageAnalysis;
          storyboardScenes = rfa.segments.map((seg: any, idx: number) => ({
            sceneIndex: idx,
            sceneType: 'talking-head',
            narration: seg.text || '',
            visualDescription: `Transcript segment ${idx + 1}: ${(seg.text || '').substring(0, 80)}`,
            mood: 'neutral',
            audioDescription: seg.fillerCount > 0 ? `speech with ${seg.fillerCount} fillers` : 'clean speech',
            cameraDirection: 'static',
            editDirections: {
              transition: undefined,
              pacing: pacingFromRawFootageSignals(rfa),
              onScreenText: [],
            },
          }));
          storyboardContextSource = 'raw-footage-analysis';
          // Carry Gemini file URI from VU (if VU ran in parallel and produced one)
          // so 5-Track can skip redundant CDN download + Gemini upload (saves ~30s).
          if (projectDoc.syntheticStoryboard?.geminiFileUri) {
            (projectDoc as any)._vuGeminiFileUri = projectDoc.syntheticStoryboard.geminiFileUri;
          }
          console.log(`[Director] Found rawFootageAnalysis with ${storyboardScenes.length} transcript segments (Mode 2 — transcript-driven, vuUri=${!!(projectDoc as any)._vuGeminiFileUri})`);
        } else if (projectDoc?.syntheticStoryboard) {
          // Path B: SyntheticStoryboard (Mode 2 fallback: no transcript available)
          const ssb = projectDoc.syntheticStoryboard;
          storyboardScenes = (ssb.scenes || []).map((s: any) => ({
            sceneIndex: s.sceneIndex ?? 0,
            sceneType: s.sceneType || 'continuous',
            narration: s.descriptor?.narration || '',
            visualDescription: s.descriptor?.visualDescription || '',
            mood: s.descriptor?.mood || 'neutral',
            audioDescription: s.descriptor?.audioDescription || '',
            cameraDirection: s.descriptor?.cameraDirection || 'static',
            editDirections: s.descriptor?.editDirections,
          }));
          storyboardContextSource = 'synthetic-storyboard';
          // Carry Gemini file URI from VideoUnderstanding so 5-Track can skip redundant CDN download
          if (ssb.geminiFileUri) {
            (projectDoc as any)._vuGeminiFileUri = ssb.geminiFileUri;
          }
          console.log(`[Director] Found SyntheticStoryboard with ${storyboardScenes.length} scenes (Mode 2 — vision-based fallback)`);
        }
      } catch (sbErr: any) {
        console.warn(`[Director] Storyboard load failed (non-fatal): ${sbErr.message}`);
      }

      const isAIProject = storyboardScenes.length > 0;
      const hasRawFootage = projectDoc?.rawFootageAnalysis?.segments?.length > 0;

      // ── Per-asset analysis with INDIVIDUAL error isolation ──
      // SKIP only for raw-footage Creative Brief mode — Path E watches that video directly via
      // geminiFileUri. Running 43 per-asset Gemini calls exhausts quota before
      // the Creative Brief can make its ONE call. This was the root cause of
      // proj_FGHYdAd7VkhU producing zero editing decisions.
      // AI storyboard projects do not enter Path E, so they must still run
      // per-asset analysis even when USE_CREATIVE_BRIEF=true.
      const creativeBriefPerAssetBypassActive = process.env.USE_CREATIVE_BRIEF === 'true' && hasRawFootage;
      const skipPerAssetAnalysis = creativeBriefPerAssetBypassActive;
      if (skipPerAssetAnalysis) {
        edlSummary.skipReason = 'creative-brief-per-asset-analysis-bypassed';
        console.log(`[Director] Skipping per-asset 5-Track analysis (USE_CREATIVE_BRIEF=true, raw-footage mode, ${videoOverlays.length} assets). Creative Brief uses geminiFileUri directly.`);
      } else {
        await reportDirectorProgress(0, 0, `Analyzing ${videoOverlays.length} video assets (5-track)...`);
      }

      for (let i = 0; i < videoOverlays.length && !skipPerAssetAnalysis; i++) {
        const vo = videoOverlays[i];
        const assetId = (vo as any).assetId;
        if (!assetId) {
          console.warn(`[Director] Scene ${i}: no assetId, skipping analysis`);
          edlSummary.assetsFailed++;
          edlSummary.failedAssets.push(`scene_${i}:no_assetId`);
          continue;
        }

        try {
          // ── Step 0: Check user's media library for matching footage ──
          // Surfaces existing footage that matches the scene description.
          // Informational only (no auto-replacement) — future: offer swap in AI chat.
          const sceneDescForSearch = storyboardScenes.find((s: any) => s.sceneIndex === (vo as any).metadata?.sceneIndex)?.visualDescription;
          if (sceneDescForSearch) {
            try {
              const { findMatchingFootage } = await import('@/lib/editron/services/asset-search-service');
              const match = await findMatchingFootage(userId, sceneDescForSearch, 0.75);
              if (match) {
                console.log(`[Director] Scene ${i}: matching footage found in library — ${match.assetId} (score=${match.score.toFixed(2)})`);
                result.warnings.push(`Scene ${i}: user footage "${match.filename}" matches this scene (score=${match.score.toFixed(2)}) — consider reusing`);
              }
            } catch (err: unknown) { console.warn('[Director] non-fatal: no media assets or no Gemini key:', err instanceof Error ? err.message : err); }
          }

          // Check cache first
          let analysis = await getAnalysis(assetId);
          if (analysis) {
            console.log(`[Director] Scene ${i} (${assetId}): analysis CACHED`);
            analyses.push(analysis);
            edlSummary.assetsAnalyzed++;
            continue;
          }

          const videoUrl = (vo as any).src || (vo as any).content;
          if (!videoUrl) {
            console.warn(`[Director] Scene ${i} (${assetId}): no video URL, skipping`);
            edlSummary.assetsFailed++;
            edlSummary.failedAssets.push(`${assetId}:no_url`);
            continue;
          }

          const durationMs = (vo.durationInFrames / 30) * 1000;
          const storyboardScene = isAIProject ? storyboardScenes[i] : undefined;
          const narrationText = storyboardScene?.narration || '';

          // Try to get real word timestamps from voiceover TTS (if available).
          // Falls back to proportional estimate (equal time per word), which drifts on long scenes.
          let words: Array<{ word: string; startMs: number; endMs: number }> | undefined;
          if (narrationText) {
            // Check if matching voiceover has Deepgram/Kokoro word timing stored
            const matchingVo = voiceoverOverlays[i];
            const voAssetId = (matchingVo as any)?.assetId;
            if (voAssetId) {
              try {
                const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
                const voAsset = await db.collection('media_assets').findOne({ assetId: voAssetId });
                if (voAsset?.wordTimestamps && Array.isArray(voAsset.wordTimestamps)) {
                  words = voAsset.wordTimestamps;
                  console.log(`[Director] Scene ${i}: using REAL word timestamps (${words.length} words)`);
                }
              } catch (err: unknown) { console.warn('[Director] non-fatal word timestamp lookup:', err instanceof Error ? err.message : err); }
            }

            // Fallback: proportional estimate with variable word-length weighting
            if (!words) {
              const rawWords = narrationText.split(/\s+/).filter(Boolean);
              const totalChars = rawWords.reduce((sum: number, w: string) => sum + w.length, 0);
              let cursor = 0;
              words = rawWords.map((w: string) => {
                // Weight by character count — longer words take more time
                const wordPortion = (w.length / totalChars) * durationMs;
                const startMs = cursor;
                cursor += wordPortion;
                return { word: w, startMs, endMs: cursor };
              });
            }
          }

          await reportDirectorProgress(0, 0, `Analyzing scene ${i + 1}/${videoOverlays.length}...`);

          analysis = await runFullAnalysis(assetId, userId, {
            videoUrl,
            durationMs,
            transcript: narrationText || undefined,
            words,
            storyboardScene,
            sourceType: isAIProject ? 'ai-generated' : 'real-footage',
            geminiFileUri: (projectDoc as any)?._vuGeminiFileUri,
          });

          // Inter-clip delay to avoid Gemini 429 rate limits.
          // 7 back-to-back Gemini Vision calls with zero delay hits the RPM limit by clip 3-4.
          // 2.5s between clips keeps us under the limit. ⚠️ INVENTED delay value.
          if (i < videoOverlays.length - 1) {
            await new Promise(r => setTimeout(r, 2500));
          }

          if (analysis) {
            // Attach timeline offset so Reactive Engine places decisions at correct absolute frames.
            // Without this, all assets' decisions land at frames 0-N (relative to clip start),
            // causing them to overlap and get deduplicated — only first scene's decisions survive.
            (analysis as any)._timelineOffsetFrames = videoOverlays[i].from || 0;
            analyses.push(analysis);
            edlSummary.assetsAnalyzed++;
            console.log(`[Director] Scene ${i} (${assetId}): analysis SUCCESS (offset: ${videoOverlays[i].from})`);
          } else {
            edlSummary.assetsFailed++;
            edlSummary.failedAssets.push(`${assetId}:null_result`);
            console.warn(`[Director] Scene ${i} (${assetId}): analysis returned null`);
          }
        } catch (assetErr: any) {
          edlSummary.assetsFailed++;
          edlSummary.failedAssets.push(`${assetId}:${assetErr.message?.slice(0, 60)}`);
          console.error(`[Director] Scene ${i} (${assetId}): analysis FAILED: ${assetErr.message}`);
          // Continue to next asset — don't abort the whole intelligence layer
        }
      }

      // ── PATH E: Creative Brief (Director's Cut Architecture) ──────────
      // Feature-flagged new path. Gemini produces a holistic Creative Brief
      // (all editing decisions as structured JSON), then the Brief Executor
      // resolves word indices to exact frames deterministically.
      // Enable via env: USE_CREATIVE_BRIEF=true
      let pathDHandled = false;
      let unifiedDecisionBundle: UnifiedDecisionBundle | null = null;
      const unifiedDecisionCandidates: UnifiedDecisionProducerCandidate[] = [];
      let editedTimelineContext: any = null;
      if (hasRawFootage) {
        try {
          const { buildEditedTimelineContext } = await import('@/lib/editron/services/edited-timeline-context');
          editedTimelineContext = buildEditedTimelineContext({
            rawFootage: projectDoc.rawFootageAnalysis,
            overlays,
            fps: project.fps || 30,
            projectDurationFrames: project.durationInFrames,
          });
          console.log(
            `[Director] Edited timeline context: ${editedTimelineContext.evidence.keptWordCount}/${editedTimelineContext.evidence.inputWordCount} words kept, ` +
            `${editedTimelineContext.durationFrames} frames, sourceMap=${editedTimelineContext.evidence.hasSourceMapping}, ` +
            `canonical=${editedTimelineContext.evidence.isCanonicalDecisionTimeline}`
          );
        } catch (timelineErr: any) {
          console.warn(`[Director] Edited timeline context unavailable: ${timelineErr.message}`);
        }
      }
      if (hasRawFootage && !editedTimelineContext) {
        throw new Error('[Director] Canonical edited timeline unavailable; refusing raw-timeline overlay decisions');
      }
      if (editedTimelineContext?.evidence?.requiresSourceMapping && !editedTimelineContext.evidence.isCanonicalDecisionTimeline) {
        throw new Error(
          `[Director] Unsafe canonical edited timeline: ${editedTimelineContext.evidence.missingSourceMappingCount}/` +
          `${editedTimelineContext.evidence.inputClipCount} video clips are missing source mapping`
        );
      }
      const creativeBriefRawFootageActive = process.env.USE_CREATIVE_BRIEF === 'true' && hasRawFootage;
      if (creativeBriefRawFootageActive) {
        try {
          await reportDirectorProgress(0, 0, 'Creative Brief: generating holistic edit plan...');
          console.log('[Director] Path E: Creative Brief architecture (USE_CREATIVE_BRIEF=true)');

          const { generateCreativeBrief, routeContentType, DEFAULT_ROUTING_THRESHOLDS } = await import('@/lib/editron/services/creative-brief');
          const { snapshotDecisions } = await import('@/lib/editron/services/decision-tracker');
          const { executeBrief } = await import('@/lib/editron/services/brief-executor');
          const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
          const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');

          const pathEFps = project.fps || 30;
          const rfa = projectDoc.rawFootageAnalysis;
          const decisionRawFootage = editedTimelineContext?.editedRawFootage ?? rfa;

          // Build transcription from the single persisted word-timing source.
          // Older projects may still have segment.words, so keep a compatibility fallback.
          const transcription: { word: string; startMs: number; endMs: number }[] =
            Array.isArray(editedTimelineContext?.transcription) && editedTimelineContext.transcription.length > 0
              ? editedTimelineContext.transcription.map((w: any) => ({
                word: w.word || w.text || '',
                startMs: w.startMs ?? w.start ?? 0,
                endMs: w.endMs ?? w.end ?? 0,
              }))
              : Array.isArray(rfa.transcription?.words)
              ? rfa.transcription.words.map((w: any) => ({
                word: w.word || w.text || '',
                startMs: w.startMs ?? w.start ?? 0,
                endMs: w.endMs ?? w.end ?? 0,
              }))
              : [];
          if (transcription.length === 0) {
            for (const seg of rfa.segments || []) {
              if (seg.words && Array.isArray(seg.words)) {
                for (const w of seg.words) {
                  transcription.push({ word: w.word || w.text || '', startMs: w.startMs ?? w.start ?? 0, endMs: w.endMs ?? w.end ?? 0 });
                }
              }
            }
          }

          // Build audio energy curve from segments (if available)
          const audioEnergyCurve: number[] = (rfa.segments || []).map((s: any) => s.energy ?? 0.5);

          // Collect user preferences (from brief or defaults)
          const userPrefs = {
            captionStyle: brief?.captionStyle as any,
            transitionPreference: brief?.transitionPreference as any,
            zoomBehavior: brief?.zoomBehavior as any,
            motionGraphics: brief?.motionGraphics as any,
            pacingFeel: brief?.pacingFeel as any,
            musicPreference: brief?.musicPreference as any,
          };

          // Gemini file URI for video watching (from VU if available)
          const geminiFileUri = (projectDoc as any)?._vuGeminiFileUri
            || projectDoc?.geminiFileUri
            || projectDoc?.syntheticStoryboard?.geminiFileUri
            || undefined;

          // Use estimated clean duration (post-transcript-editor), not durationInFrames
          // which may reflect a buggy silence-removal output.
          const cleanDurationSec = (editedTimelineContext?.durationMs || rfa.estimatedCleanDurationMs || rfa.originalDurationMs || (project.durationInFrames || 900) / pathEFps * 1000) / 1000;

          const groundedEditorialContext = buildCreativeBriefGroundedContext({
            userGoal: brief?.intent,
            segmentAnalysis: projectDoc.segmentAnalysis ?? null,
          });
          if (groundedEditorialContext) {
            console.log(
              `[Director] Creative Brief grounding: ${groundedEditorialContext.facts.length}/` +
              `${groundedEditorialContext.coverage.availableFactCount} canonical facts, ` +
              `userGoal=${Boolean(groundedEditorialContext.userGoal)}`,
            );
          }

          // Build video context for Creative Brief
          const videoContext = {
            transcription,
            totalDurationSec: cleanDurationSec,
            segmentCount: decisionRawFootage.segments?.length || 0,
            ...(groundedEditorialContext ? { groundedEditorialContext } : {}),
            audioFeatures: audioEnergyCurve.length > 0 ? {
              rmsEnergyCurve: audioEnergyCurve,
              silenceGaps: (decisionRawFootage.silenceGaps || []).map((g: any) => ({ startMs: g.startMs || g.start || 0, endMs: g.endMs || g.end || 0 })),
            } : undefined,
            vjepaFeatures: projectDoc.vjepaAnalysis?.segments?.length > 0 ? { segments: projectDoc.vjepaAnalysis.segments } : undefined,
            wav2vecFeatures: projectDoc.wav2vecAnalysis?.segments?.length > 0 ? { segments: projectDoc.wav2vecAnalysis.segments } : undefined,
          };

          // Compute per-video genre parameters from signals (no profiles)
          try {
            const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
            const genreResult = computeGenreParameters({
              rawFootage: decisionRawFootage,
              analyses,
              wav2vecAnalysis: projectDoc.wav2vecAnalysis ?? null,
              musicAnalysis: projectDoc.musicAnalysis ?? null,
              videoDurationSec: cleanDurationSec,
            });
            pathEGenreParams = genreResult.genreParams;
            // Surface the signal-driven BGM decision so the quality gate doesn't flag "missing BGM"
            // when the system correctly decided no BGM was needed (e.g. moderate speech / formal / short).
            (pathEGenreParams as any).bgmRecommendation = genreResult.bgmRecommendation;
            console.log(`[Director] Path E: Genre params computed (confidence: ${genreResult.confidence}, zoom_budget=${pathEGenreParams.zoom_budget}, transition_density=${pathEGenreParams.transition_density})`);
          } catch (gpErr: any) {
            console.warn(`[Director] Path E: Genre param computation failed (non-fatal): ${gpErr.message}`);
          }

          // ── Threshold bandit: sample adjusted thresholds for this project ──
          let routingThresholds = DEFAULT_ROUTING_THRESHOLDS;
          try {
            const { loadThresholdBanditState, sampleThresholdAdjustments, getEffectiveThreshold } = await import('@/lib/editron/services/threshold-bandit');
            const { averageSignalValue, buildSignalBucket, buildSpeechCoverageBucket, buildDurationBucket } = await import('@/lib/editron/services/genre-parameter-bandit');
            const banditState = await loadThresholdBanditState(userId);
            if (banditState) {
              const speechCoverage = rfa.speechCoverage ?? 0;
              const banditContext = {
                signalBucket: buildSignalBucket({
                  speechCoverage,
                  speechEnergy: averageSignalValue(projectDoc.wav2vecAnalysis?.segments, 'energy'),
                  motionIntensity: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'motionIntensity'),
                  visualSignificance: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'visualSignificance'),
                  musicEnergy: averageSignalValue(projectDoc.musicAnalysis?.energyCurve, 'energy'),
                  beatStrength: projectDoc.musicAnalysis?.musicPresence,
                }),
                speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
                durationBucket: buildDurationBucket(cleanDurationSec),
                platform: projectDoc.syntheticStoryboard?.platform || 'youtube',
              };
              const adj = sampleThresholdAdjustments(banditState, banditContext);
              if (adj.usedBandit) {
                const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
                routingThresholds = {
                  speechCoverage: clamp01(getEffectiveThreshold(adj, 'speech-coverage-threshold')),
                  musicPresence: clamp01(getEffectiveThreshold(adj, 'music-presence-threshold')),
                  visualChange: clamp01(getEffectiveThreshold(adj, 'visual-change-threshold')),
                  nonSpeechCeiling: clamp01(getEffectiveThreshold(adj, 'non-speech-ceiling')),
                  minBeatDensityBpm: Math.max(0, getEffectiveThreshold(adj, 'min-beat-density-bpm')),
                };
                console.log(`[Director] Path E: Threshold bandit active (${adj.observationCount} obs) — adjusted routing thresholds`);
              }
            }
          } catch (banditErr: any) {
            console.warn(`[Director] Path E: Threshold bandit failed (non-fatal): ${banditErr.message}`);
          }

          // ── Content mode routing (D-004) ──
          // Compute from measured signals. musicPresence from Essentia analysis (Modal endpoint).
          // Falls back to 0 if music analysis hasn't run.
          const speechCoverage = Number.isFinite((decisionRawFootage as any).speechCoverage) ? (decisionRawFootage as any).speechCoverage : 0;
          const musicAnalysis = projectDoc.musicAnalysis;
          let musicPresence = musicAnalysis?.musicPresence ?? 0;
          // Penalize musicPresence when speech is present — speech rhythm creates
          // false-positive beat patterns in Essentia (e.g., 130 WPM → 129 BPM).
          // ⚠️ INVENTED formula: max(0, 1 - speechCoverage). At speech=0.8 → 0.2x. At speech=0.1 → 0.9x.
          // Source: no CRG node. Derived from production tests:
          //   proj_APY5gxzbxZ68: speech=0.82, music=0.90 false positive (original threshold 0.5)
          //   proj_CGeIHVzXHdUs: speech=0.47, music=0.90 (129 BPM), routed to hybrid instead of speech
          // Threshold lowered 0.5 → 0.3: any meaningful speech presence should penalize Essentia beats.
          // At 0.3, pure music (speech<0.3) is unaffected. Documentary (speech=0.47) gets penalty.
          if (speechCoverage > 0.3) {
            musicPresence *= Math.max(0, 1 - speechCoverage);
          }
          const beatDensityBpm = musicAnalysis?.bpm ?? undefined;

          const vjepaSegs = projectDoc.vjepaAnalysis?.segments;
          let visualChangeRate = 0;
          if (vjepaSegs?.length) {
            visualChangeRate = vjepaSegs.reduce((sum: number, s: any) => sum + (s.motionIntensity || 0), 0) / vjepaSegs.length;
          } else if (speechCoverage < routingThresholds.nonSpeechCeiling) {
            const segCount = rfa.segments?.length ?? 0;
            visualChangeRate = cleanDurationSec > 0 ? Math.min(1, segCount / (cleanDurationSec * 0.5)) : 0;
          }

          // Add music features to video context if Essentia analysis available
          if (musicAnalysis?.beats?.length) {
            (videoContext as any).musicFeatures = {
              beats: musicAnalysis.beats,
              sections: musicAnalysis.sections || [],
              bpm: musicAnalysis.bpm,
            };
          }

          const contentMode = routeContentType({ speechCoverage, musicPresence, visualChangeRate, beatDensityBpm }, routingThresholds);
          console.log(`[Director] Path E: Content routing — speech=${speechCoverage.toFixed(2)}, music=${musicPresence.toFixed(2)}${beatDensityBpm ? ` (${beatDensityBpm} BPM)` : ''}, visual=${visualChangeRate.toFixed(2)}${!vjepaSegs?.length && visualChangeRate > 0 ? ' (segment proxy)' : ''} → ${contentMode}`);

          // Generate Creative Brief (Gemini call — context-cached creative doc + decision registry)
          const creativeBrief = await generateCreativeBrief(videoContext, userPrefs, geminiFileUri, pathEGenreParams, contentMode, pipelineWarnings);

          if (creativeBrief && creativeBrief.decisions.length > 0) {
            console.log(`[Director] Path E: Creative Brief generated — ${creativeBrief.decisions.length} decisions, pacing=${creativeBrief.overallPacing}`);

            // Brief Executor: resolve word indices → frame numbers
            // Resolve against the canonical edited timeline when available. The raw source
            // mapping is kept separately for V-JEPA/Wav2Vec lookup; decisions themselves
            // must land on the final cut timeline.
            const totalDurationMs = editedTimelineContext?.durationMs || rfa.originalDurationMs || (project.durationInFrames || 900) / pathEFps * 1000;
            // Brief timestamps are in ORIGINAL-video time (Gemini watches the source clip); the executor
            // resolves against the CUT timeline, so they'd land "out of range" and get dropped (regression
            // from the 2026-06-13 editedTimelineContext switch). Map them onto the cut timeline first.
            let briefDecisionsForExecutor = creativeBrief.decisions;
            if (editedTimelineContext?.evidence.sourceAlreadyCanonical) {
              // Batch analyses are already projected onto the final cut timeline.
            } else if (editedTimelineContext?.sourceClips?.length) {
              const { remapBriefTimestampsToEditedTimeline } = await import('@/lib/editron/services/edited-timeline-context');
              briefDecisionsForExecutor = remapBriefTimestampsToEditedTimeline(creativeBrief.decisions, editedTimelineContext.sourceClips, pathEFps);
            } else if (editedTimelineContext) {
              // FAILLOUD-TEMP: edited timeline exists but no source clips → remap skipped, brief timestamps stay in original time and get dropped as out-of-range.
              console.warn(`[FAILLOUD][Director] editedTimelineContext present but sourceClips empty (${editedTimelineContext.sourceClips?.length ?? 'undef'}) — brief timestamps NOT remapped`);
            }
            const briefResult = executeBrief({
              brief: { ...creativeBrief, decisions: briefDecisionsForExecutor },
              transcription,
              fps: pathEFps,
              audioEnergyCurve: audioEnergyCurve.length > 0 ? audioEnergyCurve : undefined,
              totalDurationMs,
              overlays: editedTimelineContext ? undefined : overlays.filter((o: any) => o.type === 'video').map((o: any) => ({
                from: o.from, durationInFrames: o.durationInFrames,
                sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime, type: 'video',
              })),
            });

            console.log(`[Director] Path E: Brief Executor — ${briefResult.stats.resolvedToFrame} resolved, ${briefResult.stats.snappedToEnergy} snapped to energy`);

            // Humanize pass (organic imperfection)
            const humanizedEdl = humanizeEdl(briefResult.edl, projectId, decisionRawFootage, pathEFps);

            // Constraint enforcement (8-pass safety net)
            const overlayInfos = overlays.map((o: any) => ({
              id: o.id, type: o.type, from: o.from,
              durationInFrames: o.durationInFrames, row: o.row, assetId: o.assetId,
            }));

            let graphIndex: any = null;
            try {
              const { loadGraph } = await import('@/lib/editron/services/graph-query');
              graphIndex = loadGraph();
            } catch (err: unknown) { console.warn('[Director] constraint enforcement optional, graph unavailable:', err instanceof Error ? err.message : err); }

            if (graphIndex) {
              const constraintResult = enforceConstraints(
                humanizedEdl.decisions, overlayInfos, graphIndex, decisionRawFootage, pathEFps
              );
              if (constraintResult.totalViolations > 0) {
                console.log(`[Director] Path E: ${constraintResult.totalViolations} constraint violations (${constraintResult.totalAutoCorrected} auto-corrected)`);
              }
              pathDConstraintViolations = constraintResult.violations;
            }

            // Inject signal context into decisions for MG composition engine.
            // Without this, MG graphics get contentSignals={} → default animations.
            // ── Personality signals for MG composition planner + theme resolver ──
            // Derived from Wav2Vec, V-JEPA, and structural signals when available.
            // Falls back to heuristics when enrichment data is absent.
            const genreFormality = pathEGenreParams?.formality ?? 0.5;

            // Compute averages from Wav2Vec segments (if available)
            const w2vSegs = projectDoc.wav2vecAnalysis?.segments;
            const w2vAvg = w2vSegs?.length ? {
              energy: w2vSegs.reduce((s: number, seg: any) => s + (seg.energy ?? 0), 0) / w2vSegs.length,
              emotionIntensity: w2vSegs.reduce((s: number, seg: any) => s + (seg.emotionIntensity ?? 0), 0) / w2vSegs.length,
              valence: w2vSegs.reduce((s: number, seg: any) => {
                const v = seg.emotionalValence;
                return s + (v === 'positive' ? 0.8 : v === 'negative' ? 0.2 : 0.5);
              }, 0) / w2vSegs.length,
            } : null;

            // Compute face coverage from V-JEPA (if available)
            const vjSegs = projectDoc.vjepaAnalysis?.segments;
            const vjFaceCoverage = vjSegs?.length
              ? vjSegs.filter((s: any) => s.eyeContact > 0.3 || s.faceEmotion).length / vjSegs.length
              : (speechCoverage > 0.3 ? 0.5 : 0.2); // ⚠️ INVENTED fallback

            // ⚠️ ALL derivation formulas are INVENTED — need calibration via Thompson sampling.
            const signalCtx: Record<string, number> = {
              speech_coverage: speechCoverage,
              visual_change_rate: visualChangeRate,
              music_presence: musicPresence,
              formality: genreFormality,
              // enthusiasm ← Wav2Vec speech.energy (vocal energy = speaker excitement)
              // Fallback: speechCoverage proxy (less accurate but always available)
              enthusiasm: w2vAvg ? Math.min(1, w2vAvg.energy * 1.2 + (w2vAvg.emotionIntensity > 0.5 ? 0.15 : 0))
                : (speechCoverage > 0.5 ? Math.min(1, speechCoverage * 1.2) : 0.5),
              // warmth ← Wav2Vec emotional_valence + V-JEPA face coverage
              // Fallback: 0.3 base + 0.4 if speech present
              warmth: w2vAvg ? (0.6 * w2vAvg.valence + 0.4 * vjFaceCoverage)
                : (0.3 + (speechCoverage > 0 ? 0.4 : 0)),
              // emotional_arousal ← Wav2Vec emotion_intensity (direct mapping)
              emotional_arousal: w2vAvg?.emotionIntensity ?? 0.4,
              // pacing_velocity ← normalized from speech rate + visual change (0-1)
              // High speech rate + high visual change = fast pacing
              pacing_velocity: Math.min(1, (speechCoverage * 0.5 + visualChangeRate * 0.5)),
              // visceral_impact ← cinematic moment proxy (energy peaks)
              // High speech energy variance = has impactful moments
              visceral_impact: w2vAvg ? Math.min(1, w2vAvg.energy * 0.6 + w2vAvg.emotionIntensity * 0.4)
                : 0.3,
              // visual_dependency ← how much the video NEEDS graphics to carry information
              // Low face presence + low text = high dependency on MG
              visual_dependency: Math.min(1, Math.max(0, (1 - vjFaceCoverage) * 0.6 + (1 - speechCoverage) * 0.4)),
              // humor ← no source exists. Default 0.1 (low).
              humor: 0.1,
              'speech.coverage': speechCoverage,
              'content.formality': genreFormality,
            };
            // Per-frame signal injection: give each decision the unified facts of the MOMENT it lands on,
            // not one video-level average. V-JEPA/Wav2Vec live on the ORIGINAL timeline, while Path E
            // decisions live on the CUT timeline, so UnifiedMomentContext owns the cut→original mapping
            // and exposes the same atomic packet Path D can consume.
            const { buildSignalTimeline } = await import('@/lib/editron/services/signal-registry');
            const { buildUnifiedMomentContext } = await import('@/lib/editron/services/unified-moment-context');
            const cutToOriginalClips = editedTimelineContext?.sourceClips ?? (overlays as any[])
              .filter((o) => o.type === 'video')
              .map((o) => ({ from: o.from, durationInFrames: o.durationInFrames, sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime }));
            const pathESignalTimeline = buildSignalTimeline(
              analyses,
              rfa,
              overlayInfos,
              pathEFps,
              projectDoc.vjepaAnalysis ?? null,
              projectDoc.wav2vecAnalysis ?? null,
              musicAnalysis ?? null,
            );
            Object.assign(pathESignalTimeline.globalSignals, signalCtx);
            let sigCoverageTotal = 0;
            let sigCoverageMiss = 0;
            const pathEContextAtFrame = (frameNum: number) => buildUnifiedMomentContext({
              timeline: pathESignalTimeline,
              frame: frameNum,
              sourceClips: cutToOriginalClips,
              baseSignals: signalCtx,
              eventWindowMs: 500,
            });
            const signalsFromContext = (context: ReturnType<typeof pathEContextAtFrame>): Record<string, unknown> => {
              return {
                ...context.signals,
                visceral_impact: Math.max(Number(context.signals.visceral_impact ?? 0), Number(context.signals.visual_significance ?? context.signals['visual.significance'] ?? 0)),
              };
            };
            for (const d of briefResult.edl.decisions) {
              const decisionParams = d.params as Record<string, any>;
              const context = pathEContextAtFrame(d.frame);
              sigCoverageTotal++;
              if (!context.evidence.hasSnapshot || (vjepaSegs?.length && !context.evidence.hasScreenPrimitives)) {
                sigCoverageMiss++;
              }
              decisionParams.signals = { ...signalsFromContext(context), ...(decisionParams.signals ?? {}) };
              decisionParams.atomicMomentBundle = context.atomicMomentBundle;
              decisionParams.unifiedMomentEvidence = context.evidence;
            }
            // LOUD FALLBACK (R18N): silent no-segment misses are exactly what hid the timeline bug.
            // Warn if a meaningful fraction of decisions get no exact per-moment coverage even after the
            // cut→original map. Threshold 15% chosen as "more than ~1 in 7 starved" — operational, tunable.
            if (sigCoverageTotal > 0) {
              const missPct = Math.round((sigCoverageMiss / sigCoverageTotal) * 100);
              if (missPct > 15) {
                console.warn(`[Director] Path E: SIGNAL COVERAGE LOW — ${sigCoverageMiss}/${sigCoverageTotal} decisions (${missPct}%) had no unified source snapshot or screen primitives after cut→original mapping. Check segment coverage / the clip mapping.`);
              } else {
                console.log(`[Director] Path E: signal coverage ${sigCoverageTotal - sigCoverageMiss}/${sigCoverageTotal} (${100 - missPct}%) matched unified moment context.`);
              }
            }

            unifiedDecisionCandidates.push({
              source: 'creative-brief',
              editorialPreferences: brief?.editorialPreferences,
              edl: briefResult.edl,
              graphicsDensity: densityFromSignalsOrNeutral(pathEGenreParams),
              expectedExecuted: briefResult.stats.resolvedToFrame,
              expectedSkipped: briefResult.stats.skippedOutOfRange,
            });

            // Snapshot decisions for threshold calibration feedback loop
            try {
              const vjepaLookup = vjepaSegs?.length
                ? (frameNum: number) => {
                    const context = pathEContextAtFrame(frameNum);
                    return {
                      speech_coverage: speechCoverage,
                      visual_change_rate: Number(context.signals.motion_intensity ?? context.signals['visual.motion_intensity'] ?? visualChangeRate),
                      music_presence: musicPresence,
                      visual_significance: Number(context.signals.visual_significance ?? context.signals['visual.significance'] ?? 0),
                    };
                  }
                : { speech_coverage: speechCoverage, visual_change_rate: visualChangeRate, music_presence: musicPresence };

              const decisionLog = snapshotDecisions(
                projectId, userId, humanizedEdl.decisions, contentMode,
                totalDurationMs, vjepaLookup,
              );
              // Persist to MongoDB for render-time outcome capture
              try {
                const snapDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
                await snapDb.collection('projects').updateOne(
                  { projectId },
                  { $set: { 'intelligence.decisionLog': decisionLog } },
                );
              } catch (err: unknown) { console.warn('[Director] persistence is non-fatal:', err instanceof Error ? err.message : err); }
              console.log(`[Director] Path E: Snapshotted ${decisionLog.snapshots.length} decisions for calibration`);
            } catch (snapErr: any) {
              console.warn(`[Director] Path E: Decision snapshot failed (non-fatal): ${snapErr.message}`);
            }

            // Capture brief outputs for downstream action loop (replaces profile-driven values)
            briefCaptionStyle = creativeBrief.captionStyle !== 'none' ? creativeBrief.captionStyle : undefined;
            briefPacing = creativeBrief.overallPacing;
            briefSignalContext = { ...signalCtx };
            console.log(`[Director] Path E: Brief outputs — captionStyle=${briefCaptionStyle || 'none'}, pacing=${briefPacing}`);

            console.log(`[Director] Path E: Creative Brief decision bundle READY — ${humanizedEdl.decisions.length} decisions`);
          } else {
            console.warn('[Director] Path E: Creative Brief returned null or empty — falling through to Path D');
          }
        } catch (pathEErr: any) {
          console.error(`[Director] Path E failed (${pathEErr.message}), falling through to Path D`);
        }
      }

      // ── PATH D: Signal-Driven Execution (Mode 2 + v3 Knowledge Graph) ──
      // Signal executor evaluates 95 mappings from the graph against detected
      // signals to produce EDL decisions. Uses rawFootageAnalysis + segmentAnalysis
      // (transcription, wav2vec, moment weights) — does NOT need 5-Track per-asset
      // analysis. The old `analyses.length > 0` gate caused a dead zone: when
      // USE_CREATIVE_BRIEF=true skipped 5-Track and Path E failed, Path D was
      // also blocked, leaving zero intelligence. Fixed: Mode 2 projects (with
      // rawFootageAnalysis) can run Path D without 5-Track.
      const canRunPathD = hasRawFootage && (analyses.length > 0 || projectDoc?.segmentAnalysis?.version === 1);
      if (canRunPathD) {
        try {
          const { loadGraph } = await import('@/lib/editron/services/graph-query');
          const graphIndex = loadGraph();

          if (graphIndex) {
            await reportDirectorProgress(0, 0, 'Signal-driven editing (v3 knowledge graph)...');
            console.log(`[Director] Path D: Signal-driven execution (${graphIndex.mappings.size} mappings, ${graphIndex.constraints.size} constraints)`);

            const { buildSignalTimeline } = await import('@/lib/editron/services/signal-registry');
            const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
            const { buildMomentWeightMap, integrateVjepaScores, integrateWav2vecScores } = await import('@/lib/editron/services/moment-weight-service');
            const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
            const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
            const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');

            // Use project fps (not hardcoded 30 — real footage may be 24/29.97/60)
            const pathDFps = project.fps || 30;
            const pathDDecisionRawFootage = editedTimelineContext?.editedRawFootage ?? projectDoc.rawFootageAnalysis;

            // Step D.1: Compute genre parameters from signals
            const genreOutput = computeGenreParameters({
              rawFootage: pathDDecisionRawFootage,
              analyses,
              wav2vecAnalysis: projectDoc.wav2vecAnalysis ?? null,
              musicAnalysis: projectDoc.musicAnalysis ?? null,
              videoDurationSec: (editedTimelineContext?.durationMs ?? ((project.durationInFrames || 900) / pathDFps * 1000)) / 1000,
              userPlatform: brief?.platform,
              userIntent: brief?.intent,
            });
            console.log(`[Director] Path D: Genre params computed (confidence: ${genreOutput.confidence}, fps: ${pathDFps})`);

            // Step D.2 + D.3: Moment weights + signal timeline
            const overlayInfos = overlays.map((o: any) => ({
              id: o.id, type: o.type, from: o.from,
              durationInFrames: o.durationInFrames, row: o.row, assetId: o.assetId,
            }));

            let weightMap: any;
            let signalTimeline: any;
            const sa = projectDoc.segmentAnalysis;

            if (sa?.version === 1 && sa.segments?.length > 0) {
              // ── Unified path: read from SegmentAnalysis (one source of truth) ──
              console.log(`[Director] Path D: Using unified SegmentAnalysis (${sa.meta.segmentCount} segments, vjepa=${sa.meta.hasVjepa}, wav2vec=${sa.meta.hasWav2vec}, phase=${sa.meta.momentWeightPhase})`);

              // D.2: Use pre-computed moment weights from worker
              if (projectDoc.momentWeightMap?.computation_phase >= 1) {
                weightMap = projectDoc.momentWeightMap;
              } else {
                weightMap = buildMomentWeightMap(null, projectDoc.rawFootageAnalysis);
              }

              // D.3: Build signal timeline from unified analysis
              const { buildSignalTimelineFromAnalysis } = await import('@/lib/editron/services/signal-registry');
              signalTimeline = buildSignalTimelineFromAnalysis(
                sa, analyses, projectDoc.rawFootageAnalysis, overlayInfos, pathDFps,
                projectDoc.musicAnalysis ?? null,
              );
            } else {
              // ── Legacy path: read from 5 separate fields (backward compat) ──
              console.log(`[Director] Path D: Using legacy 5-field path (no segmentAnalysis)`);

              weightMap = buildMomentWeightMap(null, projectDoc.rawFootageAnalysis);

              if (projectDoc.vjepaAnalysis?.segments?.length > 0) {
                const { toVjepaWeightFormat } = await import('@/lib/editron/services/vjepa-service');
                const vjepaWeights = toVjepaWeightFormat(projectDoc.vjepaAnalysis);
                weightMap = integrateVjepaScores(weightMap, vjepaWeights);
                console.log(`[Director] Path D: V-JEPA weights integrated (${projectDoc.vjepaAnalysis.segments.length} segments)`);
              }

              if (projectDoc.wav2vecAnalysis?.segments?.length > 0) {
                const { toWav2VecWeightFormat } = await import('@/lib/editron/services/wav2vec-service');
                const wav2vecWeights = toWav2VecWeightFormat(projectDoc.wav2vecAnalysis);
                weightMap = integrateWav2vecScores(weightMap, wav2vecWeights);
                console.log(`[Director] Path D: Wav2Vec weights integrated (${projectDoc.wav2vecAnalysis.segments.length} segments)`);
              }

              if (projectDoc.momentWeightMap?.computation_phase >= 1) {
                weightMap = { ...weightMap, ...projectDoc.momentWeightMap };
                console.log(`[Director] Path D: Using pre-computed Phase ${projectDoc.momentWeightMap.computation_phase} weight map`);
              }

              signalTimeline = buildSignalTimeline(
                analyses, projectDoc.rawFootageAnalysis, overlayInfos, pathDFps,
                projectDoc.vjepaAnalysis ?? null,
                projectDoc.wav2vecAnalysis ?? null,
                projectDoc.musicAnalysis ?? null,
              );
            }

            const sourceSignalTimeline = signalTimeline;
            if (editedTimelineContext) {
              const {
                projectMomentWeightMapToEditedTimeline,
                projectSignalTimelineToEditedTimeline,
              } = await import('@/lib/editron/services/edited-timeline-context');
              signalTimeline = projectSignalTimelineToEditedTimeline(signalTimeline, editedTimelineContext);
              weightMap = projectMomentWeightMapToEditedTimeline(weightMap, editedTimelineContext);
              console.log(
                `[Director] Path D: projected signal timeline to edited time ` +
                `(${signalTimeline.gridSignals.size} grid points, ${signalTimeline.eventSignals.length} events)`
              );
            }

            console.log(`[Director] Path D: Moment weights Phase ${weightMap.computation_phase}, ${weightMap.weights.length} segments, avg=${(weightMap.weights.reduce((s: number, w: any) => s + w.final_weight, 0) / Math.max(weightMap.weights.length, 1)).toFixed(2)}`);

            // Step D.3b: Threshold bandit — sample adjusted thresholds for this project
            try {
              const { loadThresholdBanditState, sampleThresholdAdjustments } = await import('@/lib/editron/services/threshold-bandit');
              const { averageSignalValue, buildSignalBucket, buildSpeechCoverageBucket, buildDurationBucket } = await import('@/lib/editron/services/genre-parameter-bandit');
              const banditState = await loadThresholdBanditState(userId);
              if (banditState) {
                const rfa = projectDoc.rawFootageAnalysis;
                const speechCoverage = rfa?.speechCoverage ?? 0;
                const banditContext = {
                  signalBucket: buildSignalBucket({
                    speechCoverage,
                    speechEnergy: averageSignalValue(projectDoc.wav2vecAnalysis?.segments, 'energy'),
                    motionIntensity: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'motionIntensity'),
                    visualSignificance: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'visualSignificance'),
                    musicEnergy: averageSignalValue(projectDoc.musicAnalysis?.energyCurve, 'energy'),
                    beatStrength: projectDoc.musicAnalysis?.musicPresence,
                  }),
                  speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
                  durationBucket: buildDurationBucket((editedTimelineContext?.durationMs ?? ((project.durationInFrames || 900) / pathDFps * 1000)) / 1000),
                  platform: projectDoc.syntheticStoryboard?.platform || 'youtube',
                };
                const adj = sampleThresholdAdjustments(banditState, banditContext);
                if (adj.usedBandit) {
                  console.log(`[Director] Path D: Threshold bandit active (${adj.observationCount} obs) — adjusted thresholds sampled`);
                }
              }
            } catch (banditErr: any) {
              console.warn(`[Director] Path D: Threshold bandit failed (non-fatal): ${banditErr.message}`);
            }

            // Step D.4: Execute signal-driven edit (evaluate 95 mappings)
            let signalEdl = executeSignalDrivenEdit(
              signalTimeline, genreOutput.genreParams, weightMap, graphIndex, overlayInfos
            );
            console.log(`[Director] Path D: ${signalEdl.metadata.totalMappingsFired} mappings fired → ${signalEdl.metadata.totalDecisionsGenerated} decisions (${signalEdl.metadata.totalDecisionsSuppressed} suppressed) in ${signalEdl.metadata.executionTimeMs}ms`);

            // Step D.4b: Utility AI overlay scoring
            // When USE_UTILITY_LIVE=true: produces EditDecisions that REPLACE signal-executor for zoom/transition/graphic/camera/cut
            // When false: shadow scoring only (log, never affects output)
            try {
              const { scoreAllOverlays, selectWinners } = await import('@/lib/editron/engine/utility-scorer');
              const { inspectGridPoint, formatInspectorLog } = await import('@/lib/editron/engine/decision-inspector');
              const { getOverlayDefinitions } = await import('@/lib/editron/engine/overlay-definitions-loader');
              const overlayDefs = getOverlayDefinitions();
              const { projectEventsOntoGrid } = await import('@/lib/editron/services/signal-registry');
              projectEventsOntoGrid(signalTimeline);
              const gridFrames = Array.from(signalTimeline.gridSignals.keys()).map(Number).sort((a, b) => a - b);
              const recentUtilityDecisions = new Map<OverlayCategory, number>();
              let utilityTotal = 0;
              let utilityAboveMin = 0;
              const sampleLogs: string[] = [];
              const gridPointDecisions: GridPointDecision[] = [];
              const utilityLiveProducer = shouldRunUtilityLiveProducer({
                utilityLiveEnabled: useUtilityLive,
                creativeBriefEnabled: process.env.USE_CREATIVE_BRIEF === 'true',
                hasRawFootage,
              });
              if (useUtilityLive && !utilityLiveProducer.run) {
                console.log(`[Director] Utility AI LIVE producer disabled (${utilityLiveProducer.reason}); scoring remains shadow evidence`);
              }
              for (const frame of gridFrames) {
                const snap = signalTimeline.gridSignals.get(frame)!;
                const numericSnap: Record<string, number> = {};
                for (const [k, v] of Object.entries({ ...signalTimeline.globalSignals, ...snap })) {
                  if (typeof v === 'number') numericSnap[k] = v;
                  else if (v === true) numericSnap[k] = 1;
                  else if (v === false) numericSnap[k] = 0;
                }
                const results = scoreAllOverlays(overlayDefs, numericSnap);
                utilityTotal += overlayDefs.length;
                utilityAboveMin += results.length;
                if (utilityLiveProducer.run) {
                  const winners = selectWinners(results, recentUtilityDecisions, frame);
                  for (const [category, winner] of Object.entries(winners) as Array<[OverlayCategory, GridPointDecision['winners'][OverlayCategory]]>) {
                    if (winner) recentUtilityDecisions.set(category, frame);
                  }
                  gridPointDecisions.push({ frame, timestampMs: (snap as any).timestampMs ?? (frame / pathDFps * 1000), winners, allScores: results });
                }
                if (results.length > 0 && sampleLogs.length < 5) {
                  const decision: GridPointDecision = { frame, timestampMs: (snap as any).timestampMs ?? 0, winners: {} as GridPointDecision['winners'], allScores: results };
                  sampleLogs.push(formatInspectorLog(inspectGridPoint(decision)));
                }
              }
              console.log(`[Director] Utility AI ${utilityLiveProducer.run ? 'LIVE' : 'shadow'}: scored ${overlayDefs.length} overlays × ${gridFrames.length} grid points. ${utilityAboveMin} above minScore.`);
              if (sampleLogs.length > 0) {
                console.log(`[Director] Utility AI sample decisions:\n${sampleLogs.slice(0, 3).join('\n')}`);
              }
              if (utilityLiveProducer.run && gridPointDecisions.length > 0) {
                const { overlayResultsToEditDecisions } = await import('@/lib/editron/engine/overlay-bridge');
                const utilityEdl = overlayResultsToEditDecisions(gridPointDecisions, signalTimeline, pathDFps);
                const merged = [...signalEdl.decisions.filter(d => d.type === 'graphic'), ...utilityEdl.decisions.filter(d => d.type !== 'graphic')];
                signalEdl = { decisions: merged, metadata: { ...signalEdl.metadata, totalMappingsFired: merged.length, totalDecisionsGenerated: merged.length } };
                console.log(`[Director] Utility AI LIVE: ${utilityEdl.decisions.length} overlay decisions produced (${utilityEdl.metadata.executionTimeMs}ms). Merged with ${signalEdl.decisions.filter(d => d.type === 'graphic').length} signal-executor graphics.`);
              }
            } catch (utilityErr) {
              const msg = utilityErr instanceof Error ? utilityErr.message : 'unknown error';
              // FAIL LOUD (R18N): this catch silently swallowed a hard crash for ages, making a dead path
              // look "skipped". In dev, surface it so it can't hide again; in prod, log loudly but stay
              // non-fatal — utility scoring is optional/shadow and must not abort the director run.
              if (process.env.NODE_ENV !== 'production') {
                throw new Error(`[Director] Utility AI scoring crashed (failing loud in dev): ${msg}`);
              }
              console.error(`[Director] Utility AI scoring failed (non-fatal): ${msg}`);
            }

            // Step D.4c: Utility AI profile override — real signals (Phase 2.4)
            // Global overlays (filter, caption) score against averaged signals across the
            // entire video, not per-grid-point. This runs AFTER the signal timeline is built
            // so it uses real content analysis instead of the old placeholder 0.5 values.
            if (useUtilityEngine) {
              try {
                const { scoreAllOverlays } = await import('@/lib/editron/engine/utility-scorer');
                const { getOverlayDefinitions } = await import('@/lib/editron/engine/overlay-definitions-loader');
                const overrideDefs = getOverlayDefinitions();
                const overrideFrames = Array.from(signalTimeline.gridSignals.keys());
                if (overrideFrames.length > 0) {
                  const avgSignals: Record<string, number> = {};
                  const avgCounts: Record<string, number> = {};
                  for (const f of overrideFrames) {
                    const snap = signalTimeline.gridSignals.get(f)!;
                    for (const [k, v] of Object.entries(snap)) {
                      if (typeof v === 'number' && isFinite(v)) {
                        avgSignals[k] = (avgSignals[k] ?? 0) + v;
                        avgCounts[k] = (avgCounts[k] ?? 0) + 1;
                      }
                    }
                  }
                  for (const k of Object.keys(avgSignals)) avgSignals[k] /= avgCounts[k];
                  for (const [k, v] of Object.entries(signalTimeline.globalSignals)) {
                    if (typeof v === 'number' && isFinite(v)) avgSignals[k] = v;
                  }
                  // Bridge: personality.* namespace → bare keys for overlay definitions + MG planner.
                  // Personality signals are computed in signal-registry.ts (shared layer).
                  if (avgSignals['content.formality'] !== undefined) avgSignals['formality'] = avgSignals['content.formality'];
                  if (avgSignals['personality.enthusiasm'] !== undefined) avgSignals['enthusiasm'] = avgSignals['personality.enthusiasm'];
                  if (avgSignals['personality.warmth'] !== undefined) avgSignals['warmth'] = avgSignals['personality.warmth'];
                  if (avgSignals['personality.emotional_arousal'] !== undefined) avgSignals['emotional_arousal'] = avgSignals['personality.emotional_arousal'];
                  if (avgSignals['personality.pacing_velocity'] !== undefined) avgSignals['pacing_velocity'] = avgSignals['personality.pacing_velocity'];
                  if (avgSignals['personality.visceral_impact'] !== undefined) avgSignals['visceral_impact'] = avgSignals['personality.visceral_impact'];
                  if (avgSignals['personality.visual_dependency'] !== undefined) avgSignals['visual_dependency'] = avgSignals['personality.visual_dependency'];
                  if (avgSignals['personality.humor'] !== undefined) avgSignals['humor'] = avgSignals['personality.humor'];
                  const overrideResults = scoreAllOverlays(overrideDefs, avgSignals);
                  const filterWin = overrideResults.find(r => r.category === 'filter');
                  const captionWin = overrideResults.find(r => r.category === 'caption');
                  if (filterWin?.outputValues['filterPresetId']) {
                    effectiveProfile = { ...effectiveProfile, filterPresetId: filterWin.outputValues['filterPresetId'] as string };
                    console.log(`[Director] Utility AI override: filter → ${filterWin.outputValues['filterPresetId']} (score: ${filterWin.totalScore.toFixed(3)}, was: ${profile.filterPresetId}, signals: formality=${avgSignals['formality']?.toFixed(2)}, warmth=${avgSignals['warmth']?.toFixed(2)}, enthusiasm=${avgSignals['enthusiasm']?.toFixed(2)})`);
                  }
                  if (captionWin?.outputValues['captionStyle']) {
                    effectiveProfile = { ...effectiveProfile, captionStyle: captionWin.outputValues['captionStyle'] as any };
                    console.log(`[Director] Utility AI override: caption → ${captionWin.outputValues['captionStyle']} (score: ${captionWin.totalScore.toFixed(3)}, was: ${profile.captionStyle}, signals: formality=${avgSignals['formality']?.toFixed(2)}, speech.coverage=${avgSignals['speech.coverage']?.toFixed(2)})`);
                  }
                }
              } catch (overrideErr) {
                console.log(`[Director] Utility AI profile override: skipped (${overrideErr instanceof Error ? overrideErr.message : 'error'})`);
              }
            }

            // Step D.5: Humanize pass (organic imperfection injection)
            const humanizedEdl = humanizeEdl(signalEdl, projectId, pathDDecisionRawFootage, pathDFps);

            // Step D.6: Constraint enforcement (8-pass ordered)
            const constraintResult = enforceConstraints(
              humanizedEdl.decisions, overlayInfos, graphIndex, pathDDecisionRawFootage, pathDFps
            );
            if (constraintResult.totalViolations > 0) {
              console.log(`[Director] Path D: ${constraintResult.totalViolations} constraint violations (${constraintResult.totalAutoCorrected} auto-corrected, ${constraintResult.totalUncorrectable} uncorrectable)`);
            }
            // Hoist for quality review step 11
            pathDConstraintViolations = constraintResult.violations;
            pathDGenreParams = genreOutput.genreParams;
            // Surface the signal-driven BGM decision for the quality gate (see Path E note above).
            (pathDGenreParams as any).bgmRecommendation = genreOutput.bgmRecommendation;

            // Convert to standard EDL format for executeEDL (backward compatible)
            edlSummary.totalDecisions = humanizedEdl.decisions.length;
            const edl = {
              projectId,
              generatedAt: new Date(),
              totalDecisions: humanizedEdl.decisions.length,
              decisions: humanizedEdl.decisions.map(d => ({
                type: d.type,
                frame: d.frame,
                durationFrames: Number(d.params['duration_frames'] ?? (d.params['duration_s'] ? Number(d.params['duration_s']) * pathDFps : pathDFps)),
                priority: d.confidence > 0.8 ? 2 : d.confidence > 0.6 ? 3 : 4,
                source: d.source,
                signal: d.type,
                reason: d.reason ?? '',
                params: d.params,
                confidence: d.confidence,
              })),
              stats: {
                cutsPerMinute: 0,
                transitionCount: humanizedEdl.decisions.filter(d => d.type === 'transition').length,
                graphicCount: humanizedEdl.decisions.filter(d => d.type === 'graphic').length,
                zoomCount: humanizedEdl.decisions.filter(d => d.type === 'zoom').length,
                speedChangeCount: humanizedEdl.decisions.filter(d => d.type === 'speed-change').length,
                averageConfidence: humanizedEdl.decisions.length > 0
                  ? humanizedEdl.decisions.reduce((s, d) => s + d.confidence, 0) / humanizedEdl.decisions.length
                  : 0,
              },
            };

            // Remap decision frames from original-video space to cut-timeline space.
            // Signal executor uses 5-Track data (original frames), but overlays are on the
            // cut timeline after silence removal. Without remapping, decisions in removed gaps
            // are lost (was: 8/31 dropped on Hank Green 1175s video).
            const videoClips = overlays
              .filter(o => o.type === 'video')
              .sort((a, b) => ((a as any).sourceStartFrame || 0) - ((b as any).sourceStartFrame || 0));
            const hasSourceMapping = videoClips.some(c => (c as any).sourceStartFrame !== undefined);
            if (hasSourceMapping && !editedTimelineContext) {
              const { mapOriginalFrameToCutTimeline } = await import('@/lib/editron/services/brief-executor');
              const preCount = edl.decisions.length;
              edl.decisions = edl.decisions.filter(d => {
                const mapped = mapOriginalFrameToCutTimeline(d.frame, videoClips as any, pathDFps);
                if (mapped === null) {
                  console.warn(`[Director] Path D: Decision at frame ${d.frame} (${d.type}) falls in removed gap — SKIPPED`);
                  return false;
                }
                if (mapped.frame !== d.frame) {
                  d.frame = mapped.frame;
                }
                return true;
              });
              edl.totalDecisions = edl.decisions.length;
              const dropped = preCount - edl.decisions.length;
              if (dropped > 0) {
                console.log(`[Director] Path D: Frame remapping complete — ${dropped} decisions in removed gaps dropped, ${edl.decisions.length} remain`);
              }
            }

            // Attach the same unified moment packet shape used by Path E. Path D decisions are now on
            // the cut timeline after the remap above; UnifiedMomentContext maps them back to source
            // frames to read the original-timeline signal snapshot.
            const { buildUnifiedMomentContext } = await import('@/lib/editron/services/unified-moment-context');
            const pathDSourceClips = editedTimelineContext?.sourceClips ?? videoClips.map((clip: any) => ({
              from: clip.from,
              durationInFrames: clip.durationInFrames,
              sourceStartFrame: clip.sourceStartFrame ?? clip.videoStartTime,
            }));
            for (const d of edl.decisions) {
              const context = buildUnifiedMomentContext({
                timeline: sourceSignalTimeline,
                frame: d.frame,
                sourceClips: pathDSourceClips,
                eventWindowMs: 500,
              });
              const decisionParams = d.params as Record<string, any>;
              d.params = {
                ...d.params,
                signals: {
                  ...context.signals,
                  ...(decisionParams.signals ?? {}),
                },
                atomicMomentBundle: context.atomicMomentBundle,
                unifiedMomentEvidence: context.evidence,
              } as any;
            }

            unifiedDecisionCandidates.push({
              source: 'signal-driven',
              editorialPreferences: brief?.editorialPreferences,
              edl,
              graphicsDensity: densityFromSignalsOrNeutral(pathDGenreParams),
              expectedExecuted: edl.totalDecisions,
              expectedSkipped: 0,
            });
            console.log(`[Director] Path D: Signal-driven decision candidate READY - ${edl.totalDecisions} decisions`);
          }
        } catch (pathDErr: any) {
          console.warn(`[Director] Path D failed (${pathDErr.message}), falling through to legacy intelligence fallback gate`);
          // Fall through to existing paths below
        }
      }

      const storylineSeamEdl = buildStorylineSeamTransitionEdl(projectId, overlays, project.fps || 30);
      if (storylineSeamEdl) {
        unifiedDecisionCandidates.push({
          source: 'signal-driven',
          editorialPreferences: brief?.editorialPreferences,
          edl: storylineSeamEdl,
          graphicsDensity: densityFromSignalsOrNeutral(pathDGenreParams ?? pathEGenreParams),
          expectedExecuted: storylineSeamEdl.totalDecisions,
          expectedSkipped: 0,
        });
        console.log(`[Director] Storyline seam hints: ${storylineSeamEdl.totalDecisions} transition candidates`);
      }

      // Narrative MG opportunities belong in the same planner as every other family. Appending them after
      // planning bypassed caption reservations, frequency selection, dedupe, and final decision ownership.
      // They remain offers only: the MG design pre-pass can still decline them without creating an overlay.
      if (editedTimelineContext) {
        try {
          const [{ produceNarrativeBeatDecisions }, { isLiveMgCodegenEnabled }] = await Promise.all([
            import('@/lib/editron/services/narrative-beat-producer'),
            import('@/lib/editron/services/edl-executor'),
          ]);
          if (isLiveMgCodegenEnabled()) {
            const existingGraphicDecisions = unifiedDecisionCandidates
              .flatMap((candidate) => candidate.edl.decisions)
              .filter((decision) => decision.type === 'graphic')
              .map((decision) => ({ type: 'graphic' as const, frame: decision.frame }));
            const narrativeBeatDecisions = produceNarrativeBeatDecisions({
              words: editedTimelineContext.transcription,
              fps: editedTimelineContext.fps,
              existingDecisions: existingGraphicDecisions,
            });
            if (narrativeBeatDecisions.length > 0) {
              unifiedDecisionCandidates.push({
                source: 'signal-driven',
                editorialPreferences: brief?.editorialPreferences,
                edl: {
                  projectId,
                  generatedAt: new Date(),
                  totalDecisions: narrativeBeatDecisions.length,
                  decisions: narrativeBeatDecisions,
                  stats: {
                    cutsPerMinute: 0,
                    transitionCount: 0,
                    graphicCount: narrativeBeatDecisions.length,
                    zoomCount: 0,
                    speedChangeCount: 0,
                    averageConfidence: narrativeBeatDecisions.reduce(
                      (sum, decision) => sum + decision.confidence,
                      0,
                    ) / narrativeBeatDecisions.length,
                  },
                },
                graphicsDensity: densityFromSignalsOrNeutral(pathDGenreParams ?? pathEGenreParams),
                expectedExecuted: narrativeBeatDecisions.length,
                expectedSkipped: 0,
              });
              console.log(
                `[Director] Narrative beat producer (P3.5): ${narrativeBeatDecisions.length} factless ` +
                'opportunities submitted to the unified planner',
              );
            } else {
              console.log('[Director] Narrative beat producer (P3.5): no free beats to submit');
            }
          }
        } catch (narrativeErr: any) {
          console.warn(`[Director] Narrative beat producer failed (non-fatal): ${narrativeErr?.message ?? narrativeErr}`);
        }
      }

      const canonicalCaptionChoreographyReservations = editedTimelineContext
        && captionEditorialPolicy.executionAllowed
        && captionExecutionScopePolicy.run
        ? buildCanonicalCaptionChoreographyReservations({
          overlays,
          editedTimelineContext,
          segmentAnalysis: projectDoc?.segmentAnalysis ?? null,
          playerDimensions: project.playerDimensions || { width: 1920, height: 1080 },
          presentation: resolveAtomicCaptionPresentation({
            requestedStyle: briefCaptionStyle,
            profileStyle: undefined,
            genreParams: pathDGenreParams,
          }),
        })
        : [];
      unifiedDecisionBundle = planUnifiedDecisionBundleFromCandidates(unifiedDecisionCandidates, {
        choreographyReservations: canonicalCaptionChoreographyReservations,
        executionScope: editorialExecutionScope,
      });
      if (unifiedDecisionBundle?.source === 'creative-brief+signal-driven') {
        console.log(
          `[Director] Unified decision planner (mode=${unifiedDecisionBundle.authority.decisionMode ?? 'creative-brief-primary'}) - ` +
          `+${unifiedDecisionBundle.evidence.addedSignalDecisionCount} signal decisions, ` +
          `${unifiedDecisionBundle.evidence.validatedDecisionCount} validated, ` +
          `${unifiedDecisionBundle.edl.totalDecisions} total`
        );
      }

      if (unifiedDecisionBundle) {
        try {
          const canvas = project.playerDimensions || { width: 1920, height: 1080 };
          const analysesMap = new Map<string, any>();
          for (const a of analyses) { if (a.assetId) analysesMap.set(a.assetId, a); }

          if (editedTimelineContext) {
            const canonicalTimelineEvidence = enforceCanonicalDecisionTimeline(
              unifiedDecisionBundle.edl.decisions,
              editedTimelineContext,
            );
            (result as any).canonicalDecisionTimeline = canonicalTimelineEvidence;
            console.log(
              `[Director] Canonical decision timeline: ${canonicalTimelineEvidence.stampedDecisionCount}/` +
              `${canonicalTimelineEvidence.decisionCount} decisions stamped as cut-frame decisions`
            );
          }

          // Install the canonical caption track BEFORE executeEDL so caption-emphasis decisions can
          // find it. applyCaptionLayerEmphasis (edl-executor) searches `overlays` for a caption track;
          // when the track was installed AFTER executeEDL, every caption-emphasis returned null -> 0
          // emphasized words (observed in proj_e4BGPZza2CAl: 0/1739). Installing it here puts the track
          // in `overlays` for the EDL pass so per-word emphasis can be marked.
          if (
            editedTimelineContext
            && captionEditorialPolicy.executionAllowed
            && captionExecutionScopePolicy.run
          ) {
            const captionPresentation = resolveAtomicCaptionPresentation({
              requestedStyle: briefCaptionStyle,
              profileStyle: undefined,
              genreParams: pathDGenreParams,
            });
            const captionTrackResult = installCanonicalCaptionTrack({
              overlays,
              editedTimelineContext,
              segmentAnalysis: projectDoc?.segmentAnalysis ?? null,
              playerDimensions: canvas,
              presentation: captionPresentation,
              choreographyReservationCount: canonicalCaptionChoreographyReservations.length,
            });
            if (captionTrackResult.created > 0) {
              result.overlaysModified += captionTrackResult.created + captionTrackResult.removedGenerated;
              console.log(
                `[Director] Canonical caption track: ${captionTrackResult.captionCount} groups, ` +
                `${captionTrackResult.wordCount} words, style=${captionPresentation.style}, ` +
                `mode=${captionPresentation.displayMode}, removedGenerated=${captionTrackResult.removedGenerated}`,
              );
            } else {
              console.log(
                `[Director] Canonical caption track skipped (${captionTrackResult.skippedReason || 'unknown'}), ` +
                `removedGenerated=${captionTrackResult.removedGenerated}`,
              );
            }
          } else if (editedTimelineContext) {
            console.log(
              `[Director] Canonical caption track skipped (` +
              `${captionEditorialPolicy.executionAllowed
                ? captionExecutionScopePolicy.reason
                : captionEditorialPolicy.reason})`,
            );
          }

          const unifiedExecutionResult = await executeEDL(
            unifiedDecisionBundle.edl,
            projectId,
            userId,
            overlays,
            canvas,
            analysesMap,
            unifiedDecisionBundle.graphicsDensity,
            { deferMgDesign: true },
          );

          edlSummary.totalDecisions = unifiedDecisionBundle.edl.totalDecisions;
          edlSummary.executed = unifiedExecutionResult.decisionsExecuted;
          edlSummary.skipped = unifiedExecutionResult.decisionsSkipped;

          const colorScopeDecision = shouldRunDirectorScopedEffect({
            effect: 'color-normalization',
            executionScope: editorialExecutionScope,
          });
          if (colorScopeDecision.run) {
            try {
              const { applyColorNormalization } = await import('@/lib/editron/services/auto-post-processing');
              const colorResult = applyColorNormalization(overlays, analysesMap, pathDGenreParams ?? pathEGenreParams);
              result.overlaysModified += colorResult.modified;
              if (colorResult.modified > 0) {
                console.log(`[Director] Post-process: ${colorResult.modified} color normalizations applied (C-030)`);
              }
            } catch (colorErr: any) {
              console.warn(`[Director] Color normalization failed (non-fatal): ${colorErr?.message ?? colorErr}`);
            }
          } else {
            console.log(`[Director] Color normalization skipped (${colorScopeDecision.reason})`);
          }

          for (const d of unifiedDecisionBundle.edl.decisions) {
            edlSummary.byType[d.type] = (edlSummary.byType[d.type] || 0) + 1;
          }

          // Provenance guard: summarizeUnifiedDecisionBundle(unifiedDecisionBundle) remains the persisted summary owner;
          // the execution result only adds observed decision-to-overlay trace evidence.
          const unifiedDecisionBundleSummary = summarizeUnifiedDecisionBundle(unifiedDecisionBundle, unifiedExecutionResult);
          (result as any).unifiedDecisionBundle = unifiedDecisionBundleSummary;
          await persistUnifiedDecisionBundleSummary(projectId, unifiedDecisionBundleSummary);
          result.decisionAuthority = {
            version: 'decision-authority-v1',
            source: 'unified-decision-bundle',
            decisionMode: unifiedDecisionBundle.authority.decisionMode,
            executableProducer: unifiedDecisionBundle.authority.executableProducer,
            advisoryProducers: unifiedDecisionBundle.authority.advisoryProducers,
            signalDecisionRole: unifiedDecisionBundle.authority.signalDecisionRole,
            signalDecisionsCanAddExecutable: unifiedDecisionBundle.authority.signalDecisionsCanAddExecutable,
            primaryDecisionCount: unifiedDecisionBundle.evidence.primaryDecisionCount,
            signalDecisionCount: unifiedDecisionBundle.evidence.signalDecisionCount,
            addedSignalDecisionCount: unifiedDecisionBundle.evidence.addedSignalDecisionCount,
            validatedDecisionCount: unifiedDecisionBundle.evidence.validatedDecisionCount,
            suppressedSignalDuplicateCount: unifiedDecisionBundle.evidence.suppressedSignalDuplicateCount,
            evidenceOnlySignalDecisionCount: unifiedDecisionBundle.evidence.evidenceOnlySignalDecisionCount,
            totalDecisions: unifiedDecisionBundle.edl.totalDecisions,
            executedDecisions: unifiedExecutionResult.decisionsExecuted,
            ...(editorialExecutionScope ? { executionScope: editorialExecutionScope } : {}),
            signalAudit: summarizeSignalDecisionAuditForAuthority(unifiedDecisionBundle),
          };

          // ─── Auto-BGM dispatch ────────────────────────────────────────────────
          // The director auto-edit path (raw footage) never enqueued the async BGM worker —
          // only storyboard finalize does (finalize/route.ts:961) — so signal-driven BGM was
          // DECIDED (shouldAddBgm) but never PRODUCED ("we never received a BGM"). Enqueue the
          // same worker here, gated on (a) the signal AND (b) this being a NON-storyboard
          // project: storyboard projects already get BGM from finalize, so dispatching here too
          // would double it. The worker $pushes a _workerAdded BGM overlay that saveProject
          // preserves (project-service.ts:269) — arrives async, no clobber. FAIL-SOFT throughout.
          const bgmGenreParams = pathDGenreParams ?? pathEGenreParams;
          const bgmRec = (bgmGenreParams as any)?.bgmRecommendation;
          const isStoryboardProject = storyboardContextSource === 'storyboard';
          const autoBgmExecutionScopePolicy = shouldRunDirectorScopedEffect({
            effect: 'auto-bgm',
            executionScope: editorialExecutionScope,
          });
          try {
            const {
              buildAutoBgmDecisionEvidence,
              persistAutoBgmDecisionEvidence,
            } = await import('@/lib/editron/services/auto-bgm-decision');
            const bgmFps = project.fps || 30;
            const bgmTotalFrames = overlays.reduce(
              (m: number, o: any) => Math.max(m, (o?.from || 0) + (o?.durationInFrames || 0)),
              0,
            );
            const bgmDurationSec = Math.round(bgmTotalFrames / bgmFps);
            const persistAutoBgmEvidence = async (evidenceInput: Record<string, any>) => {
              const evidence = buildAutoBgmDecisionEvidence({
                recommendation: bgmRec,
                isStoryboardProject,
                durationSec: bgmDurationSec,
                totalFrames: bgmTotalFrames,
                fps: bgmFps,
                editorialPolicy: musicEditorialPolicy,
                musicGenerationPolicy,
                ...evidenceInput,
              });
              await persistAutoBgmDecisionEvidence(projectId, evidence);
              return evidence;
            };

            if (!autoBgmExecutionScopePolicy.run) {
              console.log(`[Director] Auto-BGM skipped (${autoBgmExecutionScopePolicy.reason})`);
            } else if (!musicGenerationPolicy.allowed || bgmRec?.shouldAddBgm !== true || isStoryboardProject) {
              const evidence = await persistAutoBgmEvidence({});
              console.log(`[Director] Auto-BGM evidence: status=${evidence.status}, shouldAdd=${evidence.shouldAddBgm}`);
            } else {
              const { isBGMAvailable, buildMusicPrompt } = await import('@/lib/pipeline/bgm-service');
              const providerAvailable = isBGMAvailable();
              if (providerAvailable && bgmDurationSec >= 10) {
                // No scene descriptors / overallMusicPrompt on the auto-edit path - derive a music
                // mood from genre signals; buildMusicPrompt maps mood+pacing -> BPM tier + key/mode.
                const bgmEnergy = typeof bgmGenreParams?.energy_baseline === 'number' ? bgmGenreParams.energy_baseline : 0.5;
                const bgmFormality = typeof bgmGenreParams?.formality === 'number' ? bgmGenreParams.formality : 0.5;
                const bgmMood = bgmEnergy > 0.6 ? 'energetic'
                  : bgmEnergy < 0.35 ? (bgmFormality > 0.55 ? 'calm' : 'nostalgic')
                  : (bgmFormality > 0.6 ? 'sophisticated' : 'inspirational');
                const bgmPacing = bgmEnergy > 0.6 ? 'fast' : bgmEnergy < 0.35 ? 'slow' : 'medium';
                const signalMusicPrompt = buildMusicPrompt(
                  [{ mood: bgmMood, editDirections: { pacing: bgmPacing }, narration: 'voiceover' }],
                  bgmDurationSec,
                );
                const requestedMusicPrompt = [
                  brief?.editorialPreferences?.musicPrompt,
                  directorProjectRecord.editorialPreferences?.musicPrompt,
                  directorProjectRecord.productionBrief?.editorialPreferences?.musicPrompt,
                  directorProjectRecord.productionBriefIntake?.editorialPreferences?.musicPrompt,
                  directorProjectRecord.creativeBrief?.editorialPreferences?.musicPrompt,
                ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
                const bgmMusicPrompt = requestedMusicPrompt
                  ? `${signalMusicPrompt}. User direction: ${requestedMusicPrompt}`
                  : signalMusicPrompt;
                const { dispatchAudioJob } = await import('@/lib/editron/services/audio-worker-dispatch');
                const { resolveBgmMixLevels } = await import('@/lib/editron/services/bgm-mix-levels');
                // Signal-driven BGM levels, bounded by the CKG solo/under-speech dB ranges, from THIS video's
                // energy_baseline — replaces the fixed 0.75/0.20 literals (music was ~9dB too hot in gaps).
                const bgmMix = resolveBgmMixLevels({ energyBaseline: bgmEnergy });
                const dispatchResult = await dispatchAudioJob({
                  type: 'bgm',
                  projectId,
                  userId,
                  storyboardId: '',
                  musicPrompt: bgmMusicPrompt,
                  totalDurationSec: bgmDurationSec,
                  totalFrames: bgmTotalFrames,
                  fps: bgmFps,
                  bgmBaseVolume: bgmMix.baseVolume,
                  bgmDuckLevel: bgmMix.duckLevel,
                  musicPreference: musicGenerationPolicy.musicPreference,
                  editorialPreferences: musicGenerationPolicy.editorialPreferences,
                }, 'BGM(auto-edit)');
                const evidence = await persistAutoBgmEvidence({
                  providerAvailable,
                  mood: bgmMood,
                  pacing: bgmPacing,
                  musicPrompt: bgmMusicPrompt,
                  dispatchResult,
                });
                console.log(`[Director] Auto-BGM evidence: status=${evidence.status}, mood=${bgmMood}, pacing=${bgmPacing}, durationSec=${bgmDurationSec}`);
              } else {
                const evidence = await persistAutoBgmEvidence({ providerAvailable });
                console.log(`[Director] Auto-BGM evidence: status=${evidence.status}, providerAvailable=${providerAvailable}, durationSec=${bgmDurationSec}`);
              }
            }
          } catch (bgmErr: any) {
            console.warn(`[Director] Auto-BGM dispatch failed (non-fatal): ${bgmErr?.message ?? bgmErr}`);
            try {
              const {
                buildAutoBgmDecisionEvidence,
                persistAutoBgmDecisionEvidence,
              } = await import('@/lib/editron/services/auto-bgm-decision');
              const bgmFps = project.fps || 30;
              const bgmTotalFrames = overlays.reduce(
                (m: number, o: any) => Math.max(m, (o?.from || 0) + (o?.durationInFrames || 0)),
                0,
              );
              const evidence = buildAutoBgmDecisionEvidence({
                recommendation: (bgmGenreParams as any)?.bgmRecommendation,
                isStoryboardProject,
                durationSec: Math.round(bgmTotalFrames / bgmFps),
                totalFrames: bgmTotalFrames,
                fps: bgmFps,
                editorialPolicy: musicEditorialPolicy,
                musicGenerationPolicy,
                error: bgmErr,
              });
              await persistAutoBgmDecisionEvidence(projectId, evidence);
            } catch (persistBgmErr: any) {
              console.warn(`[Director] Auto-BGM evidence persistence failed (non-fatal): ${persistBgmErr?.message ?? persistBgmErr}`);
            }
          }
          pathDHandled = true;
          unifiedDecisionBundleExecuted = true;
          console.log(
            `[Director] Unified decision bundle execution COMPLETE (${unifiedDecisionBundle.source}) — ` +
            `${unifiedDecisionBundle.edl.totalDecisions} decisions applied`
          );
        } catch (bundleErr: any) {
          if (isCanonicalDecisionTimelineError(bundleErr)) {
            result.warnings.push(bundleErr.message);
            throw bundleErr;
          }
          console.error(`[Director] Unified decision bundle execution failed (${bundleErr.message}), falling through to legacy intelligence fallback gate`);
          result.warnings.push(`Unified decision bundle: ${bundleErr.message}`);
          pipelineWarnings.errorSwallowed('director', bundleErr, 'unified decision bundle execution');
        }
      }

      // ── Generate Edit Plan — prefer Unified Intelligence, fallback to old EDL ──
      const legacyFallbackConfigured = shouldRunLegacyIntelligenceFallback();
      const legacyFallbackEnabled = legacyFallbackConfigured && !editorialExecutionScope;
      if (legacyFallbackConfigured && editorialExecutionScope) {
        console.log('[Director] Legacy intelligence fallback disabled for scoped chat execution');
      }
      if (!pathDHandled && analyses.length > 0 && legacyFallbackEnabled) {
        try {
          await reportDirectorProgress(0, 0, `Generating intelligent edit plan from ${analyses.length} assets + script context...`);

          // Build analyses map BEFORE the intelligence call — needed by both
          // the creative intent translator and the EDL executor.
          const analysesMap = new Map<string, any>();
          for (const a of analyses) {
            if (a.assetId) {
              analysesMap.set(a.assetId, a);
              perAssetAnalysis.set(a.assetId, a); // Fix 24: hoist to function scope
            }
          }

          // TRY: Creative Intent Intelligence (3-layer architecture)
          // Layer 1 (LLM): Creative decisions — WHAT + WHY, no frame numbers
          // Layer 2 (Code): Frame resolution — maps intent to exact frames using 5-Track
          // Layer 3 (EDL Executor): Execution — applies decisions to overlays
          let edl: any;
          try {
            const { assembleUnifiedContext, generateCreativeIntentPlan } = await import('@/lib/editron/services/unified-edit-intelligence');
            const { compressAllAnalyses } = await import('@/lib/editron/services/asset-briefing');
            const { translateCreativeIntentToEDL } = await import('@/lib/editron/services/intent-translator');

            const context = await assembleUnifiedContext(projectId, userId);

            // Layer 1a: Compress 5-Track data into ~200-token briefings per clip
            const assetBriefings = compressAllAnalyses(analysesMap);
            const briefingsForPrompt = new Map<string, { promptText: string; slopFlags: Array<{ startFrame: number; endFrame: number; description: string }> }>();
            for (const [id, briefing] of assetBriefings) {
              briefingsForPrompt.set(id, { promptText: briefing.promptText, slopFlags: briefing.slopFlags });
            }

            // ─── Brand context for creative intent ─────────────────
            let brandBlock = '';
            if (project.brandId && userId) {
              try {
                const { resolveEffectiveBrandWithProfile } = await import('@/lib/shared/brand-effective-resolver');
                const { buildBrandContextBlock, buildRichBrandContextBlock } = await import('@/lib/shared/brand-context-block');
                const resolution = await resolveEffectiveBrandWithProfile(userId, project.brandId, {
                  service: 'editron',
                  orgId: project.orgId ?? null,
                });
                // Prefer the RICH brand block (full vault voice/identity/audience — ~40 signals) when
                // an accepted profile exists; fall back to the thin legacy block otherwise. Mirrors the
                // saas-explainer path so the creative-intent LLM writes on-brand copy, not generic.
                brandBlock = resolution.acceptedProfile
                  ? buildRichBrandContextBlock(resolution.acceptedProfile, resolution.brand)
                  : buildBrandContextBlock(resolution.brand);
                if (brandBlock) {
                  console.log(`[Director] Brand context: ${resolution.brand?.name} (${project.brandId}) from ${resolution.source}`);
                }
              } catch (err) {
                console.warn('[Director] Brand lookup failed (non-fatal):', err);
              }
            }

            // Layer 1b: LLM generates creative intent (WHAT + WHY, no frame numbers)
            const intentPlan = await generateCreativeIntentPlan(context, {
              editProfileName: 'signal-owned',
              targetCutsPerMinute: targetCutsPerMinuteFromGenreParams(pathDGenreParams),
              graphicDensity: densityFromSignalsOrNeutral(pathDGenreParams),
              assetBriefings: briefingsForPrompt,
              brandBlock,
            });

            // Layer 2: Translate creative intent → frame-accurate EDL decisions.
            // onScreenText passed through so the translator's safety-net can
            // guarantee every script-authored on-screen text line emits a
            // graphic decision even if the LLM's graphicIntents drops some
            // (see intent-translator.ts for the enforcement logic).
            const sceneContexts = context.scenes.map(s => {
              const sbScene = storyboardScenes.find(sb => sb.sceneIndex === s.sceneIndex);
              const onScreenText = sbScene?.editDirections?.onScreenText;
              return {
                sceneIndex: s.sceneIndex,
                fromFrame: s.fromFrame,
                durationFrames: s.durationFrames,
                voiceoverWords: s.voiceoverWords,
                motionPeaks: s.naturalCutPoints, // These are the frame-level cut points
                onScreenText: Array.isArray(onScreenText) ? onScreenText : undefined,
              };
            });

            const translation = translateCreativeIntentToEDL(
              intentPlan,
              sceneContexts,
              analysesMap,
              overlays,
              context.fps,
              densityFromSignalsOrNeutral(pathDGenreParams),
              pathDGenreParams as Record<string, number> | undefined,
            );

            if (translation.warnings.length > 0) {
              console.warn(`[Director] Intent translation warnings: ${translation.warnings.join('; ')}`);
            }

            // Convert to EDL format for executeEDL (backward compatible)
            edl = {
              projectId,
              generatedAt: intentPlan.generatedAt,
              totalDecisions: translation.decisions.length,
              decisions: translation.decisions.map(d => ({
                type: d.type,
                frame: d.frame,
                durationFrames: d.durationFrames,
                priority: d.confidence > 0.8 ? 2 : d.confidence > 0.6 ? 3 : 4,
                source: d.sources.join('+'),
                signal: d.type,
                reason: d.reason,
                params: d.params,
                confidence: d.confidence,
              })),
              stats: {
                totalDecisions: translation.stats.decisionsGenerated,
                cutsPerMinute: 0, // Computed downstream
                transitionCount: translation.decisions.filter(d => d.type === 'transition').length,
                graphicCount: translation.decisions.filter(d => d.type === 'graphic').length,
                zoomCount: translation.decisions.filter(d => d.type === 'zoom').length,
                averageConfidence: translation.decisions.length > 0
                  ? translation.decisions.reduce((s, d) => s + d.confidence, 0) / translation.decisions.length
                  : 0,
              },
            };

            edlSummary.totalDecisions = translation.stats.decisionsGenerated;
            console.log(`[Director] Creative Intent: ${intentPlan.stats.totalScenes} scenes → ${translation.stats.decisionsGenerated} decisions (${translation.stats.momentsResolved} resolved, ${translation.stats.momentsFallback} fallback)`);
          } catch (unifiedErr: any) {
            // FALLBACK: Old Reactive Edit Engine (video analysis only)
            console.warn(`[Director] Unified Intelligence failed (${unifiedErr.message}), falling back to Reactive Engine`);
            const totalDurationMs = (project.durationInFrames || 900) / 30 * 1000;
            edl = generateEditDecisionList(analyses, totalDurationMs, {
              targetCutsPerMinute: targetCutsPerMinuteFromGenreParams(pathDGenreParams),
              transitionStyle: 'mixed',
              graphicDensity: densityFromSignalsOrNeutral(pathDGenreParams),
              pacing: 'medium',
            });
          }

          const moments = analyses.flatMap(a => detectCinematicMoments(a));
          const canvas = project.playerDimensions || { width: 1920, height: 1080 };
          const edlResult = await executeEDL(
            edl,
            projectId,
            userId,
            overlays,
            canvas,
            analysesMap,
            densityFromSignalsOrNeutral(pathDGenreParams),
            { deferMgDesign: true },
          );

          // Build summary by decision type
          for (const d of edl.decisions) {
            edlSummary.byType[d.type] = (edlSummary.byType[d.type] || 0) + 1;
          }
          edlSummary.totalDecisions = edl.totalDecisions;
          edlSummary.executed = edlResult.decisionsExecuted;
          edlSummary.skipped = edlResult.decisionsSkipped;
          edlSummary.cinematicMoments = moments.length;
          result.decisionAuthority = {
            version: 'decision-authority-v1',
            source: 'fallback-reactive',
            decisionMode: 'signal-primary',
            executableProducer: 'signal-driven',
            advisoryProducers: [],
            signalDecisionRole: 'primary',
            signalDecisionsCanAddExecutable: true,
            primaryDecisionCount: 0,
            signalDecisionCount: edlSummary.totalDecisions,
            addedSignalDecisionCount: edlSummary.executed,
            validatedDecisionCount: 0,
            suppressedSignalDuplicateCount: 0,
            evidenceOnlySignalDecisionCount: 0,
            totalDecisions: edlSummary.totalDecisions,
            executedDecisions: edlSummary.executed,
            ...(editorialExecutionScope ? { executionScope: editorialExecutionScope } : {}),
          };

          result.overlaysModified += edlResult.overlaysModified + edlResult.overlaysCreated;

          if (edlResult.errors.length > 0) {
            result.warnings.push(...edlResult.errors.slice(0, 3));
          }

          // ── Post-processing: auto-behaviors from Knowledge Base ──
          try {
            const { runPostProcessing } = await import('@/lib/editron/services/auto-post-processing');
            const analysisMap = new Map<string, any>();
            for (const a of analyses) {
              analysisMap.set(a.assetId, a);
            }
            // Pass both budget-rejected AND already-zoomed assetIds to prevent drift-zoom conflicts.
            // If EDL already applied a zoom to an asset, drift-zoom should NOT add another.
            const allSkipZoomIds = new Set([
              ...edlResult.budgetRejectedZoomAssetIds,
              ...edlResult.zoomedAssetIds,
            ]);
            const ppResult = runPostProcessing(overlays, canvas, analysisMap, allSkipZoomIds, undefined, pathDGenreParams ?? pathEGenreParams);
            result.overlaysModified += ppResult.totalModified;
            if (ppResult.driftZoomApplied > 0) {
              console.log(`[Director] Post-process: ${ppResult.driftZoomApplied} drift-zooms applied (Z-030)`);
            }
          } catch (ppErr: any) {
            console.warn(`[Director] Post-processing failed (non-fatal): ${ppErr.message}`);
          }

          console.log(`[Director] 5-Track complete: ${edlSummary.assetsAnalyzed}/${videoOverlays.length} analyzed, ${edlSummary.totalDecisions} decisions (${edlSummary.executed} executed), ${moments.length} cinematic moments`);

          // Store intelligence status on project for UI
          try {
            const db2 = await (await import('@/lib/editron/db/mongodb')).getDatabase();
            await db2.collection('projects').updateOne(
              { projectId },
              { $set: {
                'intelligence.status': edlSummary.assetsFailed > 0 ? 'partial' : 'complete',
                'intelligence.assetsAnalyzed': edlSummary.assetsAnalyzed,
                'intelligence.assetsFailed': edlSummary.assetsFailed,
                'intelligence.failedAssets': edlSummary.failedAssets,
                'intelligence.decisionsGenerated': edlSummary.totalDecisions,
                'intelligence.decisionsExecuted': edlSummary.executed,
                'intelligence.cinematicMoments': moments.length,
                'intelligence.lastRun': new Date(),
              }},
            );
          } catch (err: unknown) { console.warn('[Director] non-fatal intelligence persistence:', err instanceof Error ? err.message : err); }
        } catch (edlErr: any) {
          console.error(`[Director] EDL generation/execution failed: ${edlErr.message}`);
          result.warnings.push(`EDL: ${edlErr.message}`);
          pipelineWarnings.errorSwallowed('director', edlErr, 'EDL generation/execution');
        }
      } else if (!pathDHandled && analyses.length > 0) {
        const legacyMsg = `Legacy intelligence fallback disabled (${LEGACY_INTELLIGENCE_FALLBACK_ENV}!=true); skipped Unified Intelligence/Reactive fallback after Path E/D did not handle.`;
        console.warn(`[Director] ${legacyMsg}`);
        result.warnings.push(legacyMsg);
      } else if (!pathDHandled) {
        // C6 FIX: Zero assets analyzed AND Path D didn't run — skip EDL but STILL
        // run profile-based steps (filters, transitions, captions, motion graphics).
        const intelligenceReason = edlSummary.skipReason ?? 'asset-analysis-unavailable';
        const failureDetails = edlSummary.failedAssets.length > 0 ? ` (${edlSummary.failedAssets.join(', ')})` : '';
        const failMsg = intelligenceReason === 'creative-brief-per-asset-analysis-bypassed'
          ? `Intelligence: per-asset analysis bypassed for raw-footage Creative Brief mode; no executable Path E/D decisions were produced. EDL skipped — profile-based steps (filters, transitions, captions) will still run.`
          : `Intelligence: 0/${videoOverlays.length} video assets analyzed${failureDetails}. EDL skipped — profile-based steps (filters, transitions, captions) will still run.`;
        console.warn(`[Director] ${failMsg}`);
        result.warnings.push(failMsg);

        // Store partial state on project for UI to display
        try {
          const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
          await db.collection('projects').updateOne(
            { projectId },
            { $set: {
              'intelligence.status': 'skipped_edl',
              'intelligence.reason': intelligenceReason,
              'intelligence.failedAssets': edlSummary.failedAssets,
              'intelligence.lastAttempt': new Date(),
              'intelligence.message': failMsg,
            }},
          );
        } catch (err: unknown) { console.warn('[Director] non-fatal intelligence failure persistence:', err instanceof Error ? err.message : err); }
      }
    }

    // Attach EDL summary to result for frontend inspection
    (result as any).edlSummary = edlSummary;

    try {
      const hasUploadToEditSignals = Array.isArray(projectDoc?.rawFootageAnalysis?.segments) || Array.isArray(projectDoc?.vjepaAnalysis?.segments);
      if (hasUploadToEditSignals) {
        const { auditVjepaCoverage, summarizeVideoTimelineDurationMs } = await import('@/lib/editron/services/vjepa-coverage-audit');
        const fpsForAudit = project.fps || 30;
        const rawFootageSegments = projectDoc?.rawFootageAnalysis?.segments;
        const isCanonicalMultiAssetTimeline = !!projectDoc?.rawFootageAnalysis?.multiAssetProvenance;
        const vjepaAudit = auditVjepaCoverage({
          fps: fpsForAudit,
          originalDurationMs: projectDoc?.rawFootageAnalysis?.originalDurationMs,
          eligibleDurationMs: isCanonicalMultiAssetTimeline
            ? summarizeVideoTimelineDurationMs(overlays as any[], fpsForAudit)
            : undefined,
          cleanDurationMs: projectDoc?.rawFootageAnalysis?.estimatedCleanDurationMs,
          vjepaSegments: projectDoc?.vjepaAnalysis?.segments ?? [],
          rawFootageSegments: Array.isArray(rawFootageSegments) ? rawFootageSegments : undefined,
          overlays: overlays as any[],
        });
        (result as any).vjepaCoverageAudit = vjepaAudit;
        const auditWarning = formatVjepaCoverageAuditWarning(vjepaAudit);
        if (auditWarning) {
          console.warn(`[Director] ${auditWarning}`);
          result.warnings.push(auditWarning);
        }
        try {
          const auditDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
          await auditDb.collection('projects').updateOne(
            { projectId },
            { $set: { 'intelligence.vjepaCoverageAudit': vjepaAudit } },
          );
        } catch (err: unknown) {
          console.warn('[Director] non-fatal V-JEPA coverage audit persistence:', err instanceof Error ? err.message : err);
        }
      }
    } catch (auditErr: any) {
      console.warn(`[Director] V-JEPA coverage audit failed (non-fatal): ${auditErr.message}`);
    }

    // ─── Step 1.9: Utility AI caption/filter scoring ──
    // This compatibility scorer is allowed only when no unified bundle handled the edit.
    // Once executeEDL applied the bundle, later profile-level scoring must not override it.
    const postEdlUtilityScoring = shouldRunPostEdlUtilityScoring({
      utilityEngineEnabled: useUtilityEngine,
      hasSpeechCoverage: briefSignalContext.speech_coverage !== undefined,
      unifiedDecisionBundleExecuted,
    });
    if (postEdlUtilityScoring.run) {
      try {
        const { scoreAllOverlays } = await import('@/lib/editron/engine/utility-scorer');
        const { getOverlayDefinitions } = await import('@/lib/editron/engine/overlay-definitions-loader');
        const overrideDefs = getOverlayDefinitions().filter(d => d.category === 'caption' || d.category === 'filter');
        if (overrideDefs.length > 0) {
          const signalsForScoring: Record<string, number> = {
            'speech.coverage': briefSignalContext.speech_coverage ?? 0,
            'formality': briefSignalContext.formality ?? briefSignalContext['content.formality'] ?? 0.5,
            'warmth': briefSignalContext.warmth ?? 0.5,
            'enthusiasm': briefSignalContext.enthusiasm ?? 0.5,
          };
          const overrideResults = scoreAllOverlays(overrideDefs, signalsForScoring);
          const captionWin = overrideResults.find(r => r.category === 'caption');
          const filterWin = overrideResults.find(r => r.category === 'filter');
          if (captionWin?.outputValues['captionStyle']) {
            briefCaptionStyle = captionWin.outputValues['captionStyle'] as string;
            console.log(`[Director] Utility AI: caption → ${briefCaptionStyle} (score: ${captionWin.totalScore.toFixed(3)})`);
          }
          if (filterWin?.outputValues['filterPresetId']) {
            effectiveProfile = { ...effectiveProfile, filterPresetId: filterWin.outputValues['filterPresetId'] as string };
            console.log(`[Director] Utility AI: filter → ${filterWin.outputValues['filterPresetId']} (score: ${filterWin.totalScore.toFixed(3)})`);
          }
        }
      } catch (utilErr: any) {
        console.warn(`[Director] Utility AI caption/filter scoring failed (non-fatal): ${utilErr.message}`);
      }
    } else if (postEdlUtilityScoring.reason === 'unified-bundle-already-executed') {
      console.log('[Director] Utility AI caption/filter scoring skipped after unified decision bundle execution');
    }

    // ─── Step 2: Standard action sequence (D-016: signal-driven, not profile-driven) ──────────
    // Filter: runs only when an upstream signal/brief action provides a concrete filter id.
    // Transitions: handled by EDL/signal executor (not an action).
    // MGs: handled by composition engine (not an action).
    // Captions: injected below if resolvedCaptionStyle is set.
    const profileActions: EditProfileAction[] = [
      {
        tool: 'batch_update_overlays',
        params: { targetTypes: ['image', 'video'] },
        description: 'Apply signal-driven filter to all visual overlays',
        order: 1,
        failBehavior: 'warn' as const,
      },
      {
        tool: 'audio_ducking',
        params: {
          duckLevel: DEFAULT_CONFIG.audio.duckLevel,
          rampDownMs: DEFAULT_CONFIG.audio.rampDownMs,
          rampUpMs: DEFAULT_CONFIG.audio.rampUpMs,
          lookAheadMs: DEFAULT_CONFIG.audio.lookAheadMs,
        },
        condition: 'hasBGM' as const,
        description: 'Audio ducking (standard levels)',
        order: 6,
        failBehavior: 'warn' as const,
      },
      {
        tool: 'quality_review',
        params: { deterministic: true, geminiVision: false },
        description: 'Quality review (deterministic)',
        order: 10,
        failBehavior: 'skip' as const,
      },
    ];
    const hasCaptionAction = false; // standard actions never include captions — injection below handles it
    // Brief/utility signal output takes priority; neutral readable captions are the fallback.
    const resolvedCaptionStyle = briefCaptionStyle || 'subtitle';
    const captionVideoOverlays = overlays.filter((overlay: any) => overlay?.type === 'video');
    const mappedCaptionVideoOverlays = captionVideoOverlays.filter((overlay: any) => {
      const sourceStartFrame = overlay?.sourceStartFrame ?? overlay?.videoStartTime;
      return typeof sourceStartFrame === 'number' && Number.isFinite(sourceStartFrame);
    });
    const hasRawFootageForGlobalCaptions = projectDoc?.rawFootageAnalysis?.segments?.length > 0;
    const hasCanonicalEditedTimelineForGlobalCaptions = hasRawFootageForGlobalCaptions
      && captionVideoOverlays.length > 0
      && mappedCaptionVideoOverlays.length === captionVideoOverlays.length;

    const globalCaptionAction = shouldInjectGlobalCaptionAction({
      captionStyle: resolvedCaptionStyle,
      hasRawFootage: hasRawFootageForGlobalCaptions,
      hasCanonicalEditedTimeline: hasCanonicalEditedTimelineForGlobalCaptions,
      editorialExecutionAllowed: captionEditorialPolicy.executionAllowed,
    });

    if (globalCaptionAction.run) {
      const style = resolvedCaptionStyle === 'fancy' ? 'kinetic' : resolvedCaptionStyle;
      const tool = resolvedCaptionStyle === 'fancy' ? 'add_fancy_captions' : 'add_captions';
      profileActions.push({
        tool,
        params: { style },
        condition: 'hasVoiceover' as any,
        description: `Add ${style} captions (signal-driven)`,
        order: 5,
        failBehavior: 'warn' as any,
      });
      console.log(`[Director] Caption injection: ${tool}(${style}) from ${briefCaptionStyle ? 'brief/signals' : 'neutral fallback'}`);
    } else {
      console.log(`[Director] No global caption action (${globalCaptionAction.reason}, resolvedCaptionStyle=${resolvedCaptionStyle || 'unset'})`);
    }

    const actions = profileActions
      .filter(action => checkCondition(action.condition, overlays, projectDoc))
      .sort((a, b) => a.order - b.order);

    // ─── Step 2.5: Continuity analysis (pure, zero-cost) ─────
    // Scores adjacent scene pairs to inform transition selection.
    // Priority: script transition > KB M-002 > continuity > action/brand/neutral evidence.
    let scenePairAnalysis: Array<{ sceneA: number; sceneB: number; score: { overall: number; visualSimilarity: number; energyMatch?: number }; recommendedTransition: string; flagForReview: boolean }> = [];
    const videoOverlaysForContinuity = overlays.filter((o: any) => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
    if (videoOverlaysForContinuity.length > 1 && storyboardScenes.length > 0) {
      try {
        const { analyzeAllScenePairs } = await import('@/lib/editron/services/continuity-service');
        // Fix 24: Wire 5-Track visual data into continuity scoring.
        // OLD: colorPalette was always [] (empty), mood from text-only storyboard.
        // NEW: extract dominantColors + energyLevel from actual 5-Track keyframe analysis.
        const scenesForContinuity = videoOverlaysForContinuity.map((vo: any, idx: number) => {
          const sbScene = storyboardScenes.find((s: any) => s.sceneIndex === (vo.metadata?.sceneIndex ?? idx));
          const assetAnalysis = vo.assetId ? perAssetAnalysis.get(vo.assetId) : null;
          const allKfAnalyses = assetAnalysis?.keyframeAnalyses || [];

          // Filter keyframes to THIS segment's source time range.
          // For Mode 2: all overlays share one assetId but cover different time
          // ranges of the source video. Without filtering, every segment gets the
          // full video's colors → colorMatch = 1.0 for all pairs → continuity
          // can't distinguish a kitchen scene from an outdoor scene in a vlog.
          // For Mode 1: each overlay has a unique assetId, so all keyframes
          // already belong to that overlay — the filter is a harmless no-op.
          const fps = 30;
          const voStartSec = ((vo as any).videoStartTime ?? 0) / fps;
          const voEndSec = voStartSec + ((vo.durationInFrames || 150) / fps);
          let kfForSegment = allKfAnalyses.filter((kf: any) => {
            const kfSec = (kf.timestampMs ?? 0) / 1000;
            return kfSec >= voStartSec && kfSec < voEndSec;
          });
          // Short segments may have zero keyframes in range — use nearest neighbor
          if (kfForSegment.length === 0 && allKfAnalyses.length > 0) {
            const midSec = (voStartSec + voEndSec) / 2;
            kfForSegment = [allKfAnalyses.reduce((best: any, kf: any) => {
              const bestDist = Math.abs(((best.timestampMs ?? 0) / 1000) - midSec);
              const kfDist = Math.abs(((kf.timestampMs ?? 0) / 1000) - midSec);
              return kfDist < bestDist ? kf : best;
            })];
          }

          const dominantColors = [...new Set(
            kfForSegment.flatMap((kf: any) => kf.dominantColors || []).filter(Boolean)
          )] as string[];
          const analysisEnergy = kfForSegment.length > 0
            ? kfForSegment.reduce((sum: number, kf: any) => sum + (kf.energyLevel ?? 0.5), 0) / kfForSegment.length
            : null;

          // Derive mood from per-segment energy when storyboard mood is generic.
          // Mode 2 hardcodes mood='neutral' for all segments (director-agent Path C).
          // With real energy data, we can differentiate calm vs energetic sections
          // so continuity scoring produces meaningful per-boundary variation.
          let effectiveMood = sbScene?.mood;
          if ((!effectiveMood || effectiveMood === 'neutral') && analysisEnergy !== null) {
            if (analysisEnergy > 0.75) effectiveMood = 'energetic';
            else if (analysisEnergy > 0.6) effectiveMood = 'dramatic';
            else if (analysisEnergy > 0.45) effectiveMood = 'neutral';
            else if (analysisEnergy > 0.25) effectiveMood = 'mysterious';
            else effectiveMood = 'calm';
          }

          return {
            sceneIndex: vo.metadata?.sceneIndex ?? idx,
            visualDescription: sbScene?.visualDescription || kfForSegment.map((kf: any) => kf.description || '').join(' '),
            mood: effectiveMood || 'neutral',
            colorPalette: dominantColors,
            durationSeconds: (vo.durationInFrames || 150) / fps,
          };
        });
        scenePairAnalysis = analyzeAllScenePairs(scenesForContinuity);
        const flagged = scenePairAnalysis.filter(p => p.flagForReview).length;
        console.log(`[Director] Continuity: ${scenePairAnalysis.length} pairs analyzed${flagged ? `, ${flagged} flagged for review` : ''}`);
        if (flagged) result.warnings.push(`Continuity: ${flagged} scene pair(s) have low continuity (overall < 0.40)`);
      } catch (contErr: any) {
        console.warn(`[Director] Continuity analysis failed (non-fatal): ${contErr.message}`);
      }
    }

    // Unify captions: ALL caption paths go through add_captions (editable, word-timed).
    // The standard caption system now supports instagram/hormozi display modes with spring
    // animation — no need for separate add_fancy_captions html-scene overlays.
    const scopedActions = actions.filter((action) => {
      const scopedDecision = shouldRunProfileActionWithinExecutionScope({
        tool: action.tool,
        executionScope: editorialExecutionScope,
      });
      if (scopedDecision.run) return true;
      console.log(
        `[Director] Scoped chat execution: skipping profile action '${action.tool}' (${scopedDecision.reason})`,
      );
      result.actionsSkipped.push({
        action: action.description,
        reason: `scoped-chat-execution:${scopedDecision.reason}`,
      });
      return false;
    });
    let filteredActions = scopedActions.map(a => {
      if (a.tool === 'add_fancy_captions') {
        console.log(`[Director] Unified captions: fancy → add_captions (editable + animated)`);
        return { ...a, tool: 'add_captions' as const, description: 'Add captions (unified, animated)' };
      }
      return a;
    });

    // Path D: skip profile actions that the signal executor already handled.
    // Signal executor placed transitions via 95 graph mappings + EDL execution.
    // Running add_transition from the profile creates duplicates / overrides.
    // Keep everything else: filter (only color grade path), captions, audio ducking,
    // motion graphics (LottieFiles templates ≠ signal keyword graphics), beat sync,
    // quality review.
    if (pathDConstraintViolations) {
      const pathDSkipTools = new Set(['add_transition']);
      const beforeCount = filteredActions.length;
      filteredActions = filteredActions.filter(a => {
        if (pathDSkipTools.has(a.tool)) {
          console.log(`[Director] Path D: Skipping profile action '${a.tool}' — signal executor already placed transitions via EDL`);
          return false;
        }
        return true;
      });
      if (beforeCount !== filteredActions.length) {
        console.log(`[Director] Path D: ${beforeCount - filteredActions.length} profile action(s) skipped (handled by signal-driven EDL)`);
      }
    }

    if (unifiedDecisionBundleExecuted) {
      const beforeCount = filteredActions.length;
      const skippedPostBundleActions: PostBundleProfileActionPolicySummary['skippedActions'] = [];
      const allowedPostBundleTools: string[] = [];
      filteredActions = filteredActions.filter(a => {
        const profileActionDecision = shouldRunPostBundleProfileAction({
          tool: a.tool,
          unifiedDecisionBundleExecuted,
        });
        if (!profileActionDecision.run) {
          console.log(
            `[Director] Unified bundle: Skipping legacy profile action '${a.tool}' ` +
            `(${profileActionDecision.reason})`,
          );
          result.actionsSkipped.push({
            action: a.description,
            reason: profileActionDecision.reason,
          });
          skippedPostBundleActions.push({
            tool: a.tool,
            action: a.description,
            reason: profileActionDecision.reason,
          });
          return false;
        }
        allowedPostBundleTools.push(a.tool);
        return true;
      });
      postBundleProfileActionPolicy = {
        version: 'post-bundle-profile-action-policy-v1',
        unifiedDecisionBundleExecuted: true,
        evaluatedAt: new Date().toISOString(),
        allowedActionCount: allowedPostBundleTools.length,
        skippedActionCount: skippedPostBundleActions.length,
        allowedTools: Array.from(new Set(allowedPostBundleTools)).slice(0, 50),
        skippedActions: skippedPostBundleActions.slice(0, 50),
      };
      if (beforeCount !== filteredActions.length) {
        console.log(`[Director] Unified bundle: ${beforeCount - filteredActions.length} legacy profile action(s) skipped after EDL execution`);
      }
    }

    const totalSteps = filteredActions.length;
    await reportDirectorProgress(0, totalSteps, 'Starting Director Agent execution...');

    // ─── QualityGate: per-action measurement (TRIBE Phase 1) ──
    const { takeSnapshot, compareSnapshots, summarizeGateSession } = await import('@/lib/editron/services/quality-gate');
    const gateResults: GateResult[] = [];
    const fps = project.fps || 30;
    const directorBrandScope = resolveDirectorBrandScope(project.brandId, userId);
    const graphitiGroupId = directorBrandScope.graphitiGroupId;

    // ─── Step 3: Execute actions sequentially ────────────────
    for (let i = 0; i < filteredActions.length; i++) {
      const action = filteredActions[i];
      await reportDirectorProgress(i + 1, totalSteps, action.description);

      try {
        const beforeSnapshot = takeSnapshot(overlays as any[], fps);
        const capturedAction = await projectService.captureMutationReceipts(() => (
          executeAction(action, overlays, userId, projectId, effectiveProfile, storyboardScenes, scenePairAnalysis, pathDConstraintViolations, pathDGenreParams, briefCaptionStyle, graphitiGroupId)
        ));
        const modified = capturedAction.value;
        directorCurrentRevision = advanceDirectorRevisionFromReceiptsV1({
          projectId,
          currentRevision: directorCurrentRevision,
          receipts: capturedAction.receipts,
        });
        const afterSnapshot = takeSnapshot(overlays as any[], fps);
        const gateResult = compareSnapshots(beforeSnapshot, afterSnapshot, action.description);
        gateResults.push(gateResult);

        result.overlaysModified += modified;
        result.actionsExecuted++;

        if (!gateResult.passed) {
          console.warn(`[Director] Action ${i + 1}/${totalSteps}: ${action.description} — ${modified} modified, GATE DEGRADATION (${gateResult.degradations.length} issues)`);
          for (const d of gateResult.degradations) {
            result.warnings.push(`[QualityGate] ${d.message}`);
          }
        } else {
          console.log(`[Director] Action ${i + 1}/${totalSteps}: ${action.description} — ${modified} overlays modified`);
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Unknown error';
        console.error(`[Director] Action failed: ${action.description}:`, errMsg);

        if (action.failBehavior === 'abort') {
          throw new Error(`Critical action failed: ${action.description} — ${errMsg}`);
        }

        result.actionsSkipped.push({ action: action.description, reason: errMsg });
        if (action.failBehavior === 'warn') {
          result.warnings.push(`${action.description}: ${errMsg}`);
        }
      }
    }

    // ─── QualityGate session summary ──────────────────────────
    if (gateResults.length > 0) {
      const gateSummary = summarizeGateSession(gateResults);
      console.log(
        `[Director] QualityGate summary: ${gateSummary.passedActions}/${gateSummary.totalActions} passed, ` +
        `${gateSummary.criticalDegradations} critical, trend: ${gateSummary.overallTrend}`,
      );
      result.qualityGate = {
        totalActions: gateSummary.totalActions,
        passedActions: gateSummary.passedActions,
        failedActions: gateSummary.failedActions,
        totalDegradations: gateSummary.totalDegradations,
        criticalDegradations: gateSummary.criticalDegradations,
        overallTrend: gateSummary.overallTrend,
      };
    }

    // ─── Step 3.4: Transition dedup safety net (B3) ──────────────
    // All transition-creating steps are done: edit-direction-applier (disabled),
    // EDL executor (step 3), Director add_transition tool (step 3). Before
    // step 3.5 (beat-sync) and step 3.6 (SFX placer) see the transition set,
    // guarantee at most one transition per (clipAId, clipBId) pair and strip
    // any ghost markers (no source + no transitionStyle) that slipped through.
    // This is the safety net for Root Cause B of the 2026-04-18 regression —
    // see pipeline_investigations.md and dedupTransitionsByClipPair below.
    const transitionDedupScopeDecision = shouldRunDirectorScopedEffect({
      effect: 'transition-dedup',
      executionScope: editorialExecutionScope,
    });
    if (transitionDedupScopeDecision.run) {
      try {
        const dedupResult = dedupTransitionsByClipPair(overlays);
        if (dedupResult.duplicatesRemoved > 0 || dedupResult.ghostsStripped > 0) {
          console.log(
            `[Director] Step 3.4: transition dedup — removed ${dedupResult.duplicatesRemoved} duplicate(s), ` +
            `stripped ${dedupResult.ghostsStripped} ghost(s)`,
          );
          result.overlaysModified += dedupResult.duplicatesRemoved + dedupResult.ghostsStripped;
        }
      } catch (dedupErr: any) {
        const errMsg = dedupErr?.message || 'Unknown error';
        console.error('[Director] Step 3.4 transition dedup failed:', errMsg);
        result.warnings.push(`Transition dedup failed: ${errMsg}`);
        pipelineWarnings.errorSwallowed('director', dedupErr, 'transition dedup (dedupTransitionsByClipPair)');
      }
    } else {
      console.log(`[Director] Step 3.4 transition dedup skipped (${transitionDedupScopeDecision.reason})`);
    }

    // ─── Step 3.5: Beat-sync cut alignment (beatSyncActive projects only) ──
    // If finalize sync-generated BGM with a beat grid, snap montage sub-shot cut
    // points to the nearest beats. Runs BEFORE transition SFX (step 3.6) so the
    // SFX overlays land on the FINAL (beat-aligned) cut frames, not their
    // creative-intent positions.
    //
    // Only activates when BGM overlay has metadata.beatGrid (i.e., finalize went
    // through the sync-beat-sync branch). Non-beat-sync projects have async BGM
    // without beat grid → this step is a silent no-op. See
    // pipeline_investigations.md "Beat-sync design doc (Option C)" 2026-04-17.
    //
    // Creative doc alignment: §11 "Cuts on downbeats (beat 1 of a measure)".
    // alignCutsToBeats() uses a 0.5s snap threshold — cuts further than 15
    // frames from any beat are left creative-intent-placed (no forced snap).
    const beatSyncScopeDecision = shouldRunDirectorScopedEffect({
      effect: 'beat-sync',
      executionScope: editorialExecutionScope,
    });
    if (beatSyncScopeDecision.run) {
      try {
        const bgmOverlay: any = overlays.find(
          (o: any) => o?.type === 'sound' && o?.metadata?.beatGrid?.beats?.length > 0,
        );
        if (bgmOverlay?.metadata?.beatGrid) {
          const beatGrid = bgmOverlay.metadata.beatGrid;
          const fps = project.fps || 30;
          const { alignCutsToBeats } = await import('@/lib/pipeline/scene-to-editron');
          const snapped = alignCutsToBeats(overlays, beatGrid.beats, fps);
          console.log(
            `[Director] Beat-sync step 3.5: ${snapped} cut(s) snapped to beats ` +
            `(grid: ${beatGrid.bpm} BPM, ${beatGrid.beats.length} beats, ` +
            `${beatGrid.downbeats?.length || 0} downbeats, source=${beatGrid.source})`,
          );
          if (snapped > 0) result.overlaysModified += snapped;
        }
      } catch (beatAlignErr: any) {
        const errMsg = beatAlignErr?.message || 'Unknown error';
        console.error('[Director] Beat-sync alignment failed:', errMsg);
        result.warnings.push(`Beat-sync alignment failed: ${errMsg}`);
        pipelineWarnings.errorSwallowed('director', beatAlignErr, 'beat-sync alignment (alignCutsToBeats)');
      }
    } else {
      console.log(`[Director] Beat-sync step 3.5 skipped (${beatSyncScopeDecision.reason})`);
    }

    // ─── Step 3.6: Transition SFX placement ──────────────────
    // Rule-driven SFX placement per DIRECTOR_KNOWLEDGE_BASE.md Part 9
    // (A-001 whoosh on dissolve/wipe, A-002 impact on zoom-punch/flash).
    //
    // Runs AFTER the profile action loop so all transitions from
    // edit-direction-applier, EDL executor, and add_transition tool calls
    // are visible. Runs AFTER step 3.5 beat alignment so SFX overlays land
    // on the aligned (not creative-intent) cut frames. Runs BEFORE step 4
    // merge so SFX overlays are in the saved project state.
    //
    // Deterministic — no LLM dependency (Rule 18N). A sound designer's
    // workflow: look at the cut, place the sound. This mirrors that.
    const transitionSfxScopeDecision = shouldRunDirectorScopedEffect({
      effect: 'transition-sfx',
      executionScope: editorialExecutionScope,
    });
    if (transitionSfxScopeDecision.run) {
      try {
        const { placeTransitionSFX } = await import('@/lib/editron/services/transition-sfx-placer');
        const sfxResult = await placeTransitionSFX(overlays, userId, effectiveProfile, pipelineWarnings);
        if (sfxResult.placed > 0) {
          console.log(
            `[Director] Transition SFX: placed ${sfxResult.placed}, skipped ${sfxResult.skipped} ` +
            `(tokens: ${sfxResult.tokensUsed.join(',')})`
          );
          result.overlaysModified += sfxResult.placed;
        } else if (sfxResult.skipped > 0) {
          console.log(
            `[Director] Transition SFX: 0 placed, ${sfxResult.skipped} skipped ` +
            `(reasons: ${JSON.stringify(sfxResult.skipReasons)})`
          );
        }
      } catch (sfxErr: any) {
        const errMsg = sfxErr?.message || 'Unknown error';
        console.error('[Director] Transition SFX placement failed:', errMsg);
        result.warnings.push(`Transition SFX placement failed: ${errMsg}`);
        pipelineWarnings.errorSwallowed('sfx', sfxErr, 'transition SFX placer');
      }
    } else {
      console.log(`[Director] Transition SFX step 3.6 skipped (${transitionSfxScopeDecision.reason})`);
    }

    // ─── Step 4: Merge and save ───────────────────────────────
    // Re-read the project to pick up any BGM/SFX overlays that async
    // audio workers pushed while the Director was executing (~75s).
    // Without this merge, saveProject() overwrites the array and
    // clobbers the audio overlays.
    const freshProject = await projectService.loadProject(userId, projectId);
    if (freshProject) {
      const directorOverlayIds = new Set(overlays.map(o => o.id));
      const asyncOverlays = (freshProject.overlays || []).filter(
        o => !directorOverlayIds.has(o.id),
      );
      if (asyncOverlays.length > 0) {
        console.log(`[Director] Merging ${asyncOverlays.length} async overlays (BGM/SFX from audio workers)`);
        overlays.push(...asyncOverlays);
      }

      // Merge keyframe tracks from DB into in-memory overlays.
      // The add_transition tool writes keyframeTracks directly to MongoDB
      // via updateOverlay(), but saveProject() at line ~690 overwrites the
      // entire overlays array from the in-memory copy which doesn't have them.
      // Without this merge, dissolve/transition keyframes are silently lost.
      const freshMap = new Map((freshProject.overlays || []).map((o: any) => [o.id, o]));
      let kfMerged = 0;
      for (const overlay of overlays) {
        const fresh = freshMap.get(overlay.id);
        if (fresh?.keyframeTracks?.length > 0 && !(overlay as any).keyframeTracks?.length) {
          (overlay as any).keyframeTracks = fresh.keyframeTracks;
          kfMerged++;
        }
      }
      if (kfMerged > 0) {
        console.log(`[Director] Merged keyframeTracks from DB for ${kfMerged} overlays (transition opacity/zoom)`);
      }
    }

    // ─── Step 4.5: Run BGM-dependent actions that were skipped ───
    // Audio ducking requires BGM. BGM arrives async via QStash worker
    // and is merged above in Step 4. Profile actions ran at Step 3 when
    // BGM wasn't present → hasBGM was false → audio_ducking skipped.
    const hasBGMNow = overlays.some((o: any) => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_')));
    const postMergeDuckScopeDecision = shouldRunDirectorScopedEffect({
      effect: 'audio-ducking',
      executionScope: editorialExecutionScope,
    });
    if (hasBGMNow && postMergeDuckScopeDecision.run) {
      const duckAction = profileActions.find(a => a.tool === 'audio_ducking');
      if (duckAction) {
        try {
          const capturedDuckAction = await projectService.captureMutationReceipts(() => (
            executeAction(duckAction, overlays, userId, projectId, effectiveProfile, storyboardScenes, scenePairAnalysis, undefined, undefined, briefCaptionStyle, graphitiGroupId)
          ));
          const modified = capturedDuckAction.value;
          directorCurrentRevision = advanceDirectorRevisionFromReceiptsV1({
            projectId,
            currentRevision: directorCurrentRevision,
            receipts: capturedDuckAction.receipts,
          });
          result.overlaysModified += modified;
          console.log(`[Director] Step 4.5: audio ducking applied post-merge (BGM arrived async) — ${modified} modified`);
        } catch (duckErr: any) {
          console.warn(`[Director] Step 4.5: audio ducking failed (non-fatal): ${duckErr.message}`);
        }
      }
    } else if (hasBGMNow) {
      console.log(`[Director] Step 4.5 audio ducking skipped (${postMergeDuckScopeDecision.reason})`);
    }

    // Strip in-memory dedup markers before persist. The add_transition loop
    // (line ~945) pushes lightweight sentinel objects with
    // `metadata.inMemoryMarker: true` so subsequent iterations see what the
    // previous one added (invokeAITool writes to MongoDB but doesn't update the
    // in-memory array). Those sentinels must NEVER reach MongoDB — they have
    // no transitionStyle, no source, no content, and would render as "ghost"
    // transitions. See pipeline_investigations.md 2026-04-18 for the regression
    // this protects against.
    const persistableOverlays = overlays.filter(
      (o: any) => !o?.metadata?.inMemoryMarker && (o.durationInFrames > 0),
    );
    const strippedCount = overlays.length - persistableOverlays.length;
    if (strippedCount > 0) {
      const zeroDur = overlays.filter((o: any) => o.durationInFrames <= 0 && !o?.metadata?.inMemoryMarker).length;
      const markers = strippedCount - zeroDur;
      console.log(`[Director] Stripped ${strippedCount} overlay(s) before save (${markers} dedup markers, ${zeroDur} zero-duration)`);
    }

    try {
      const { summarizeFinalOverlayChoreographyBypasses } = await import('@/lib/editron/services/cross-overlay-final-overlays');
      const finalOverlayChoreography = summarizeFinalOverlayChoreographyBypasses(persistableOverlays);
      (result as any).finalOverlayChoreography = finalOverlayChoreography;
      if (finalOverlayChoreography.bypassOverlayCount > 0) {
        console.log(
          `[Director] Final overlay choreography: ${finalOverlayChoreography.bypassOverlayCount} bypass overlay(s) ` +
          `(${JSON.stringify(finalOverlayChoreography.countsByProducer)})`,
        );
      }
    } catch (choreographyErr: unknown) {
      console.warn('[Director] non-fatal final overlay choreography audit:', choreographyErr instanceof Error ? choreographyErr.message : choreographyErr);
    }
    const finalReceipt = await projectService.saveProjectWithReceipt(
      userId,
      projectId,
      {
        overlays: persistableOverlays,
        aspectRatio: project.aspectRatio,
        playerDimensions: project.playerDimensions,
        fps: project.fps,
        durationInFrames: project.durationInFrames,
      },
      {
        expectedRevision: directorCurrentRevision,
        directorLeaseId,
      },
    );
    directorCurrentRevision = finalReceipt.revision;
    directorLeaseId = null;
    if (postBundleProfileActionPolicy) {
      await persistPostBundleProfileActionPolicy(projectId, postBundleProfileActionPolicy);
    }

    try {
      const phase0Proof = await buildFinalPhase0LiveTruthFacts({
        projectId,
        project,
        projectDoc,
        overlays: persistableOverlays,
        constraintViolations: pathDConstraintViolations,
        genreParams: pathDGenreParams,
      });
      const phase0ProofReceipt = await projectService.recordPhase0ProofFacts(
        userId,
        projectId,
        {
          expectedRevision: finalReceipt.revision,
          targetReceipt: finalReceipt,
          facts: phase0Proof.facts,
        },
      );
      directorCurrentRevision = phase0ProofReceipt.revision;
      const phase0Truth = phase0Proof.snapshot;
      (result as any).phase0LiveTruth = {
        version: phase0Truth.version,
        status: phase0Truth.status,
        summary: phase0Truth.summary,
        qualityEvidence: phase0Truth.qualityEvidence,
      };
      (result as any).phase0ProofReceipt = phase0ProofReceipt;
      console.log(
        `[Director] Phase0 live truth: status=${phase0Truth.status}, ` +
        `fail=${phase0Truth.summary.fail}, warn=${phase0Truth.summary.warn}, ` +
        `qualityEvidence=${phase0Truth.qualityEvidence.qualityEvidenceSource}/${phase0Truth.qualityEvidence.renderedAestheticStatus}`,
      );
      const renderedEvidenceRequestedAt = new Date().toISOString();
      let renderedEvidenceDispatch: Phase0RenderedEvidenceDispatchResult;
      try {
        renderedEvidenceDispatch = await dispatchPhase0RenderedEvidenceJob({
          projectId,
          userId,
          requestedAt: renderedEvidenceRequestedAt,
          targetReceipt: phase0ProofReceipt,
        });
      } catch (dispatchErr: unknown) {
        const reason = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        renderedEvidenceDispatch = {
          dispatched: false,
          reason: `dispatch_error:${reason}`,
        };
      }
      if (renderedEvidenceDispatch.dispatched) {
        console.log(
          `[Director] Phase0 rendered evidence dispatched` +
          `${renderedEvidenceDispatch.messageId ? ` (messageId=${renderedEvidenceDispatch.messageId})` : ''}`,
        );
      } else {
        result.warnings.push(
          `Phase0 rendered evidence was not dispatched: ${renderedEvidenceDispatch.reason ?? 'unknown'}`,
        );
        console.log(`[Director] Phase0 rendered evidence not dispatched: ${renderedEvidenceDispatch.reason}`);
      }
    } catch (truthErr: unknown) {
      const message = truthErr instanceof Error ? truthErr.message : String(truthErr);
      result.warnings.push(`Phase0 proof facts were not bound to the final edit: ${message}`);
      console.warn('[Director] non-fatal Phase0 live truth persistence:', message);
    }
    result.success = true;
    await reportDirectorProgress(totalSteps, totalSteps, 'Director Agent execution complete');

    // ─── Brand Intelligence: emit director_completed + transition status ───
    try {
      const { emitBrandEvent } = await import('@/lib/shared/brand-events');
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');

      await transitionProjectStatus(projectId, userId, 'editing', 'director_completed');

      // Read actual quality score from project doc (persisted by quality_review step above)
      const { getDatabase: getBrandDb } = await import('@/lib/editron/db/mongodb');
      const brandDb = await getBrandDb();
      const projectDoc = await brandDb.collection('projects').findOne({ projectId });
      const actualQualityReview = projectDoc?.qualityReview;
      const actualQualityScore = actualQualityReview?.overallScore;
      const actualCriticalCount = actualQualityReview?.criticalCount;

      emitBrandEvent({
        userId,
        projectId,
        brandId: directorBrandScope.brandId,
        service: 'editron',
        type: 'director_completed',
        payload: {
          profileId: effectiveProfile.profileId,
          actionsExecuted: result.actionsExecuted,
          actionsSkipped: result.actionsSkipped.length,
          sceneCount: storyboardScenes.length,
          durationSec: Math.round((project.durationInFrames || 0) / (project.fps || 30)),
          hasQualityReview: !!actualQualityReview,
          ...(typeof actualQualityScore === 'number' && { qualityScore: actualQualityScore }),
          ...(typeof actualCriticalCount === 'number' && { criticalCount: actualCriticalCount }),
        },
      }).catch((e) => console.warn('[Director] Brand event failed:', e));
    } catch (brandErr: unknown) {
      const msg = brandErr instanceof Error ? brandErr.message : String(brandErr);
      console.warn(`[Director] Brand intelligence wiring failed: ${msg}`);
    }

    // ─── Project Graph Record: send outcome to Graphiti for learning ───
    try {
      const { dispatchProjectGraphRecord, buildProjectGraphRecord } = await import(
        '@/lib/editron/services/project-graph-writer'
      );
      const { getDatabase: getGraphDb } = await import('@/lib/editron/db/mongodb');
      const graphDb = await getGraphDb();
      const graphProjectDoc = await graphDb.collection('projects').findOne({ projectId });

      if (graphProjectDoc?.genreParameters) {
        const durationSec = Math.round((project.durationInFrames || 0) / (project.fps || 30));
        const graphRecord = buildProjectGraphRecord({
          projectId,
          userId,
          brandId: graphProjectDoc.brandId,
          profileId: effectiveProfile.profileId,
          videoDurationSec: durationSec,
          speechCoverage: 0, // AI-generated video — no speech coverage metric at Director time
          genreParameters: graphProjectDoc.genreParameters,
          momentWeights: [], // Not tracked during Director execution
          decisions: [], // Director actions are step-based, not decision-format
          qualityScore: graphProjectDoc.qualityReview?.overallScore ?? 0,
          constraintViolations: [], // Available in quality review but not threaded here
          captionMode: 'auto',
          segmentsRemoved: 0, // Mode 1 doesn't remove segments
          userRendered: false,
          userPublished: false,
        });
        await dispatchProjectGraphRecord(graphRecord);
        console.log(`[Director] Project graph record dispatched for ${projectId}`);
      }
    } catch (graphWriterErr: unknown) {
      const msg = graphWriterErr instanceof Error ? graphWriterErr.message : String(graphWriterErr);
      console.warn(`[Director] Project graph record dispatch failed: ${msg}`);
    }

    // ─── Graph sync: update Project + Scene nodes after Director ───
    try {
      const qstashToken = process.env.QSTASH_TOKEN;
      if (qstashToken) {
        const graphSyncUrl = (() => {
          const base = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
          return `${base}/api/internal/workers/graph-sync`;
        })();

        const { Client } = await import('@upstash/qstash');
        const qstash = new Client({ token: qstashToken, baseUrl: process.env.QSTASH_URL || undefined });

        const currentVersion = ((project as any).directorVersion || 0) + 1;

        await qstash.publishJSON({
          url: graphSyncUrl,
          body: {
            action: 'project_director_complete',
            data: {
              projectId,
              update: {
                profileUsed: effectiveProfile.profileId,
                profileOverridden: profile.profileId !== effectiveProfile.profileId,
                overriddenTo: profile.profileId !== effectiveProfile.profileId ? effectiveProfile.profileId : undefined,
                qualityScore: 0,
                sceneCount: storyboardScenes.length,
                durationSec: (project.durationInFrames || 0) / (project.fps || 30),
                currentVersion,
              },
            },
          },
          retries: 3,
        });

        console.log(`[Director] Graph sync dispatched: project_director_complete v${currentVersion}`);

        // Graphiti episode: project outcome for learning
        const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
        const sceneDescriptions = storyboardScenes
          .map((s: any, i: number) => `scene ${i}: ${s.mood || 'neutral'} ${s.sceneType || 'continuous'}`)
          .join(', ');

        await addGraphitiEpisode({
          type: 'project_outcome',
          name: `director_complete_${projectId}_v${currentVersion}`,
          body: `Director completed project ${projectId} using profile ${effectiveProfile.profileId} (${effectiveProfile.name}). `
            + `${result.actionsExecuted} actions executed, ${result.actionsSkipped.length} skipped. `
            + `${storyboardScenes.length} scenes: ${sceneDescriptions}. `
            + `Duration: ${Math.round((project.durationInFrames || 0) / (project.fps || 30))}s. `
            + `Profile was ${profile.profileId !== effectiveProfile.profileId ? `overridden from ${profile.profileId} to ${effectiveProfile.profileId}` : 'auto-detected'}.`,
          sourceDescription: 'director_completion',
          groupId: graphitiGroupId,
        });
      }
    } catch (graphErr: any) {
      console.warn(`[Director] Graph sync dispatch failed: ${graphErr.message}`);
    }
  } catch (err: any) {
    fatalDirectorError = err instanceof Error ? err : new Error(String(err));
    result.success = false;
    result.warnings.push(`Director Agent failed: ${fatalDirectorError.message}`);
    console.error('[Director] Execution failed:', fatalDirectorError.message);

    try {
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');
      await transitionProjectStatus(
        projectId, userId, 'failed', 'director_error',
        { message: fatalDirectorError.message, service: 'editron' },
      );
    } catch (err: unknown) { console.warn('[Director] best-effort status transition failed:', err instanceof Error ? err.message : err); }
  }

  if (directorLeaseId) {
    try {
      await projectService.releaseDirectorMutationLease(userId, projectId, directorLeaseId);
    } catch (err: unknown) { console.warn('[Director] lock release failed:', err instanceof Error ? err.message : err); }
  }

  result.executionMs = Date.now() - startTime;
  const pwAll = pipelineWarnings.getAll();
  if (pwAll.length > 0) {
    result.pipelineWarnings = pwAll;
    console.log(`[Director] ${pipelineWarnings.getSummary()}`);
  }
  if (fatalDirectorError) {
    console.error(`[Director] Failed after ${result.executionMs}ms; propagating fatal error to caller`);
    throw fatalDirectorError;
  }

  console.log(`[Director] Complete: ${result.actionsExecuted} actions, ${result.actionsSkipped.length} skipped, ${result.executionMs}ms`);

  return result;
}

// ─── Action Executor ─────────────────────────────────────────────

async function executeAction(
  action: EditProfileAction,
  overlays: any[],
  userId: string,
  projectId: string,
  profile: EditProfile,
  storyboardScenes: any[] = [],
  scenePairAnalysis: Array<{ sceneA: number; sceneB: number; score: { overall: number; visualSimilarity: number; energyMatch?: number }; recommendedTransition: string; flagForReview: boolean }> = [],
  /** Path D: constraint violations for quality review scoring */
  constraintViolations?: any[],
  /** Path D: computed genre params for pacing validation */
  genreParams?: any,
  /** Caption style from creative brief or utility AI (was out of scope — ReferenceError fix) */
  captionStyleOverride?: string,
  graphitiGroupId?: string,
): Promise<number> {
  let modified = 0;

  // Explicit logging to confirm storyboardScenes is received
  console.log(`[Director] executeAction: "${action.tool}" — storyboardScenes=${Array.isArray(storyboardScenes) ? storyboardScenes.length : 'NOT_ARRAY'}, overlays=${overlays.length}`);

  switch (action.tool) {
    case 'batch_update_overlays': {
      // Apply filter to visual overlays.
      // GUARD: If edit-direction-applier (finalize) already set a filter from the script,
      // DON'T overwrite it — explicit script/signal intent beats generic filter actions.
      const filterPresetId = action.params.filterPresetId;
      if (!filterPresetId) break;
      const preset = getFilterPresetById(filterPresetId);
      if (preset.id === 'none') break;

      // Apply the explicit filter to visual overlays. Profile defaults are not allowed
      // to choose a filter in the upload-to-edit path.
      const targetTypes = action.params.targetTypes || ['image', 'video'];
      let overwritten = 0;
      for (const overlay of overlays) {
        if (targetTypes.includes(overlay.type)) {
          if ((overlay as any).styles?.filter && (overlay as any).styles.filter !== 'none') {
            overwritten++;
          }
          overlay.styles = { ...overlay.styles, filter: preset.filter };
          modified++;
        }
      }
      if (overwritten > 0) {
        console.log(`[Director] batch_update_overlays: applied ${preset.id} to ${modified} overlays (overwrote ${overwritten} pre-set filters — profile is source of truth)`);
      }
      break;
    }

    case 'audio_ducking': {
      // Configure ducking on BGM overlays (row 1)
      for (const overlay of overlays) {
        if (overlay.type === 'sound' && overlay.row === ROW.BGM) {
          overlay.styles = {
            ...overlay.styles,
            duckingConfig: {
              enabled: true,
              duckLevel: action.params.duckLevel ?? DEFAULT_CONFIG.audio.duckLevel,
              rampDownMs: action.params.rampDownMs ?? DEFAULT_CONFIG.audio.rampDownMs,
              rampUpMs: action.params.rampUpMs ?? DEFAULT_CONFIG.audio.rampUpMs,
              lookAheadMs: action.params.lookAheadMs ?? DEFAULT_CONFIG.audio.lookAheadMs,
            },
          };
          modified++;
        }
      }
      break;
    }

    case 'split_clips': {
      // Split video clips at anchor points (analysis-informed sub-cuts).
      // This allows the Director to restructure the timeline AFTER video generation.
      // Example: A single 5s clip can be split into 2x 2.5s clips with different treatments.
      //
      // GUARDRAILS (prevent going rogue like the zoom bounce incident):
      // - Max 3 splits per clip (no clip gets shredded into 10 micro-fragments)
      // - Max 8 total splits per project (not 50)
      // - Minimum resulting segment: 1.5s (45 frames at 30fps) — shorter = flicker
      // - Only split clips > 3s (90 frames) — short clips don't benefit from splitting
      // - Each split MUST have a reason string — no blind splitting

      const fps = 30;
      const MIN_SEGMENT_FRAMES = 45;  // 1.5s minimum
      const MIN_CLIP_TO_SPLIT_FRAMES = 90;  // Only split clips > 3s
      const MAX_SPLITS_PER_CLIP = 3;
      const MAX_TOTAL_SPLITS = 8;

      const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      const splitPoints = action.params.splitPoints as Array<{ overlayId: number; atFrame: number; reason: string }> | undefined;

      if (!splitPoints || splitPoints.length === 0) {
        console.log(`[Director] split_clips: no split points provided, skipping`);
        break;
      }

      // GUARDRAIL: Cap total splits
      if (splitPoints.length > MAX_TOTAL_SPLITS) {
        console.warn(`[Director] split_clips: ${splitPoints.length} splits requested, capping at ${MAX_TOTAL_SPLITS}`);
      }

      // GUARDRAIL: Filter out invalid split points BEFORE executing
      const splitsPerClip = new Map<number, number>();
      const validSplits = splitPoints
        .slice(0, MAX_TOTAL_SPLITS) // Hard cap
        .filter(sp => {
          // Must have a reason
          if (!sp.reason) {
            console.warn(`[Director] split_clips: rejected split at frame ${sp.atFrame} — no reason provided`);
            return false;
          }

          // Find the target overlay
          const overlay = videoOverlays.find(o => o.id === sp.overlayId);
          if (!overlay) return false;

          // Only split clips > 3s
          if (overlay.durationInFrames < MIN_CLIP_TO_SPLIT_FRAMES) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} — too short (${overlay.durationInFrames} frames < ${MIN_CLIP_TO_SPLIT_FRAMES})`);
            return false;
          }

          // Check resulting segments would be >= 1.5s each
          const localFrame = sp.atFrame - overlay.from;
          const firstSegment = localFrame;
          const secondSegment = overlay.durationInFrames - localFrame;
          if (firstSegment < MIN_SEGMENT_FRAMES || secondSegment < MIN_SEGMENT_FRAMES) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} at frame ${sp.atFrame} — would create segment < 1.5s (${firstSegment}f + ${secondSegment}f)`);
            return false;
          }

          // Max 3 splits per clip
          const count = splitsPerClip.get(sp.overlayId) || 0;
          if (count >= MAX_SPLITS_PER_CLIP) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} — already split ${MAX_SPLITS_PER_CLIP} times`);
            return false;
          }
          splitsPerClip.set(sp.overlayId, count + 1);

          return true;
        });

      if (validSplits.length === 0) {
        console.log(`[Director] split_clips: no valid split points after guardrails, skipping`);
        break;
      }

      console.log(`[Director] split_clips: ${validSplits.length} valid splits (from ${splitPoints.length} requested)`);

      // Use the existing split_overlay tool
      const { createTools } = await import('@/lib/editron/agent/tools');
      const tools = createTools(userId, projectId);
      const splitTool: any = tools.find((t: any) => t.name === 'split_overlay');
      if (!splitTool) {
        console.warn(`[Director] split_clips: split_overlay tool not found`);
        break;
      }

      // Sort by frame DESCENDING so later splits don't invalidate earlier frame positions
      const sortedSplits = [...validSplits].sort((a, b) => b.atFrame - a.atFrame);
      let splitCount = 0;

      for (const sp of sortedSplits) {
        try {
          const resultStr = await splitTool.invoke({ id: sp.overlayId, atFrame: sp.atFrame });
          const result = JSON.parse(resultStr);
          if (result.status === 'success') {
            splitCount++;
            console.log(`[Director] split_clips: overlay ${sp.overlayId} split at frame ${sp.atFrame} — ${sp.reason}`);
            // Refresh overlays since split_overlay modifies DB directly
            const refreshed = await projectService.loadProject(userId, projectId);
            if (refreshed) {
              overlays.length = 0;
              overlays.push(...(refreshed.overlays || []));
            }
          } else {
            console.warn(`[Director] split_clips: failed to split overlay ${sp.overlayId}: ${result.message}`);
          }
        } catch (err: any) {
          console.error(`[Director] split_clips: exception splitting overlay ${sp.overlayId}: ${err.message}`);
        }
      }

      console.log(`[Director] split_clips: ${splitCount}/${validSplits.length} splits applied`);
      modified = splitCount;
      break;
    }

    case 'add_captions':
    case 'add_fancy_captions':
    case 'sync_cuts_to_beats': {
      // Signal-driven caption style + display mode selection
      // Signals determine both the visual style AND the display mode (word grouping + animation)
      if (action.tool === 'add_captions') {
        const captionPresentation = resolveAtomicCaptionPresentation({
          requestedStyle: action.params?.style,
          profileStyle: captionStyleOverride,
          displayMode: action.params?.displayMode,
          wordsPerGroup: action.params?.wordsPerGroup,
          genreParams,
        });

        console.log(
          `[Director] Caption form: source=${captionPresentation.source}, formality=${captionPresentation.signals.formality.toFixed(2)}, energy=${captionPresentation.signals.energy.toFixed(2)}, rate~${Math.round(captionPresentation.signals.speakingRate)}WPM -> style="${captionPresentation.style}", mode="${captionPresentation.displayMode}", words=${captionPresentation.wordsPerGroup}`,
        );
        action = {
          ...action,
          params: {
            ...action.params,
            style: captionPresentation.style,
            displayMode: captionPresentation.displayMode,
            wordsPerGroup: captionPresentation.wordsPerGroup,
            captionPresentation,
          },
        };
      }
      // These are AI tools — delegate to invokeAITool which handles per-video iteration
      modified = await invokeAITool(action, userId, projectId, profile, overlays, captionStyleOverride, genreParams);
      break;
    }

    case 'add_transition': {
      // RULE: Script transitions ALWAYS win over generic transition actions.
      // Finalize applies script transitions (from editDirections) BEFORE Director runs.
      // Director should only add transitions where none exist yet (gaps between scenes).
      //
      // Phase A3.5.1/A3.5.2 fix: previous check was
      //   `o.type === 'html-scene' && (o.row === 1 || metadata.isTransition)`
      // which missed real TransitionOverlay tiles (type === 'transition' on row 5)
      // that the EDL executor had already placed. Result: Director thought the timeline
      // had no transitions and spammed generic dip-to-black between every clip pair
      // (10 redundant overlays on top of the EDL's 4). See editron_master_remaining.md
      // Phase A3 for full disaster inventory from the 2026-04-08 McDonald's test.
      //
      // NEW check: any overlay of type 'transition' OR any overlay whose metadata flags it as
      // a transition (covers legacy html-scene transitions + EDL TransitionOverlays + tool transitions).
      const existingTransitions = overlays.filter(
        o => o.type === 'transition' || (o as any).metadata?.isTransition,
      );

      if (existingTransitions.length > 0) {
        console.log(`[Director] add_transition: ${existingTransitions.length} script transitions already exist, respecting user's script intent`);
        // Check if there are gaps (scenes without transitions between them)
        const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
        let gapCount = 0;
        for (let i = 0; i < videoOverlays.length - 1; i++) {
          const clipA = videoOverlays[i];
          const clipB = videoOverlays[i + 1];
          const boundaryFrame = clipA.from + clipA.durationInFrames;
          // Authoritative: clipA/clipB identity match (single boundary per pair).
          // Fallback: frame proximity for legacy overlays without clipAId/clipBId.
          // See pipeline_investigations.md 2026-04-18 (Dual transition regression).
          const hasTransition = existingTransitions.some(t => {
            if ((t as any).clipAId === clipA.id && (t as any).clipBId === clipB.id) return true;
            if ((t as any).clipAId == null || (t as any).clipBId == null) {
              return Math.abs(t.from - boundaryFrame) < 30 || Math.abs((t.from + t.durationInFrames) - boundaryFrame) < 30;
            }
            return false;
          });
          if (!hasTransition) gapCount++;
        }
        if (gapCount === 0) {
          console.log('[Director] add_transition: all scene boundaries have transitions, skipping');
          break;
        }
        console.log(`[Director] add_transition: ${gapCount} gaps without transitions, filling from action/brand/neutral evidence`);
      }

      // Get transition type: script/action param → Graphiti brand preference → neutral default
      let transType: string = action.params.type || 'soft-cut';

      if (!action.params.type) {
        try {
          const { searchGraphitiFacts } = await import('@/lib/editron/services/graph-service');
          const brandFacts = await searchGraphitiFacts(
            `What transitions fit this cut boundary, motion evidence, and brand taste?`,
            graphitiGroupId || userId,
            3,
          );
          if (brandFacts.length > 0) {
            const validTypes = ['dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut', 'zoom-punch', 'whip-pan', 'glitch',
              'flash', 'film-burn', 'iris-wipe', 'blur-transition', 'wipe-left', 'wipe-right', 'slide-up', 'slide-down',
              'match-cut', 'smash-cut'];
            const preferred = validTypes.find(t => brandFacts.some(f => f.toLowerCase().includes(t)));
            if (preferred) {
              console.log(`[Director] Graphiti suggests transition: ${preferred} (from ${brandFacts.length} facts)`);
              transType = preferred;
            }
          }
        } catch (err: unknown) { console.warn('[Director] Graphiti unavailable, using neutral transition default:', err instanceof Error ? err.message : err); }
      }

      // 'hard-cut' means no transition overlay — skip entirely
      if (transType === 'hard-cut' || transType === 'none') {
        console.log('[Director] add_transition: hard-cut = no transition needed, skipping');
        break;
      }

      // Validate against the enum the tool accepts
      // Canonical TransitionStyle types (from types.ts). Ghost types removed 2026-05-15:
      // cutaway, iris (→iris-wipe), light-leak, slide-left (→wipe-left), slide-right (→wipe-right),
      // morph, pixelate, color-flash — had zero rendering, zero SFX mapping, zero system definition.
      const validTypes = ['dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut', 'zoom-punch', 'whip-pan', 'glitch',
        'flash', 'film-burn', 'iris-wipe', 'blur-transition', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
        'slide-up', 'slide-down', 'match-cut', 'smash-cut'];
      if (!validTypes.includes(transType)) {
        console.warn(`[Director] add_transition: "${transType}" not in valid types, defaulting to soft-cut`);
        transType = 'soft-cut';
      }

      // ─── Per-scene transition from script editDirections ──────
      // The storyboard stores per-scene transition types (from script parsing).
      // Use those where specified, otherwise fall back to action/brand/neutral transition evidence.
      // This respects the script author's intent (e.g., "hard cut" vs "dissolve").
      const videoOverlaysForTrans = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      let transModified = 0;

      for (let i = 0; i < videoOverlaysForTrans.length - 1; i++) {
        const clipA = videoOverlaysForTrans[i];
        const clipB = videoOverlaysForTrans[i + 1];

        // Check if a transition already exists for this clip pair.
        // Authoritative: clipA/clipB identity match. Fallback: frame proximity
        // for legacy overlays without clipAId/clipBId. This matches the EDL
        // executor's dedup logic so both systems can see each other's work
        // even when their frame references differ (EDL uses decision.frame,
        // Director uses boundaryFrame). See pipeline_investigations.md
        // 2026-04-18 (Dual transition regression) for the failure case.
        const boundaryFrame = clipA.from + clipA.durationInFrames;
        const existingTrans = overlays.find(o => {
          if (o.type !== 'transition' && !(o as any).metadata?.isTransition) return false;
          if ((o as any).clipAId === clipA.id && (o as any).clipBId === clipB.id) return true;
          if ((o as any).clipAId == null || (o as any).clipBId == null) {
            return Math.abs(o.from - boundaryFrame) < 30;
          }
          return false;
        });
        if (existingTrans) continue; // Already has a transition, skip

        // Check storyboard's per-scene transition for the NEXT scene (B).
        // Use clipB's metadata.sceneIndex — NOT the overlay array index (i+1).
        // Overlay index ≠ scene index because montage scenes produce multiple
        // sub-shot overlays. E.g. 6 scenes with 4 sub-shots each = 24 overlays
        // but only 6 scene indices. Using i+1 looked up sceneIndex 7+ which
        // doesn't exist → fell to generic default instead of script transition.
        const clipBSceneIndex = (clipB as any).metadata?.sceneIndex;
        const clipASceneIndex = (clipA as any).metadata?.sceneIndex;

        // ── KB M-002: Montage transition consistency ──────────────────
        // Same scene (montage sub-shots) → hard-cut, no overlay.
        // Montage entry/exit → dissolve or dip-to-black.
        // Different non-montage scenes → script transition or boundary/brand/neutral evidence.
        const sameScene = clipASceneIndex !== undefined
          && clipBSceneIndex !== undefined
          && clipASceneIndex === clipBSceneIndex;

        if (sameScene) {
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: same scene ${clipASceneIndex}, hard-cut per KB M-002`);
          continue;
        }

        // Different scenes — look up both for montage detection
        const sceneAData = clipASceneIndex !== undefined
          ? storyboardScenes.find((s: any) => s.sceneIndex === clipASceneIndex)
          : undefined;
        const sceneBData = clipBSceneIndex !== undefined
          ? storyboardScenes.find((s: any) => s.sceneIndex === clipBSceneIndex)
          : undefined;

        const sceneAType = sceneAData?.sceneType || (clipA as any).metadata?.sceneType || 'continuous';
        const sceneBType = sceneBData?.sceneType || (clipB as any).metadata?.sceneType || 'continuous';
        const isMontageEdge = sceneAType === 'montage' || sceneBType === 'montage';

        // Use clipB's scene transition (entering that scene)
        let sceneTransType = sceneBData?.editDirections?.transition?.type;
        let sceneTransDuration = sceneBData?.editDirections?.transition?.durationMs;

        // Skip if script says "hard-cut" — no transition overlay needed
        if (sceneTransType === 'hard-cut' || sceneTransType === 'none') {
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: script says ${sceneTransType}, skipping`);
          continue;
        }

        // KB M-002: montage entry/exit defaults to dissolve
        // KB T-022 (WEIGHT 10 override): NEVER dip-to-black in montage sequences
        let effectiveType: string;
        let effectiveDuration: number;
        let effectiveSource = 'action/brand/neutral';
        if (isMontageEdge) {
          const montageTransType = sceneTransType || 'dissolve';
          // T-022 hard override: dip-to-black kills montage momentum → force dissolve
          effectiveType = montageTransType === 'dip-to-black' ? 'dissolve' : montageTransType;
          effectiveDuration = sceneTransDuration || 600;
          effectiveSource = sceneTransType ? 'script' : 'montage-boundary';
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: montage edge (${sceneAType}→${sceneBType}), ${effectiveType} per KB M-002/T-022`);
        } else {
          // Priority: script transition > continuity recommendation > action/brand/neutral default
          const pairAnalysis = scenePairAnalysis.find(
            p => p.sceneA === clipASceneIndex && p.sceneB === clipBSceneIndex
          );
          if (sceneTransType) {
            effectiveType = sceneTransType;
            effectiveDuration = sceneTransDuration || action.params.durationMs || 500;
            effectiveSource = 'script';
          } else if (pairAnalysis) {
            let contType = pairAnalysis.recommendedTransition;
            // KB T-012 (WEIGHT 9): NEVER dissolve between contrasting moods.
            // soft-cut IS a dissolve variant. If energy match is low (<0.4),
            // moods are contrasting → force hard-cut instead of soft-cut/dissolve.
            const contrastingMoods = pairAnalysis.score.energyMatch !== undefined
              && pairAnalysis.score.energyMatch < 0.4;
            if (contrastingMoods && (contType === 'soft-cut' || contType === 'dissolve')) {
              contType = 'hard-cut';
              console.log(`[Director] add_transition: boundary ${i}→${i+1}: T-012 override, contrasting moods → hard-cut`);
            }
            effectiveType = contType;
            effectiveDuration = action.params.durationMs || 500;
            effectiveSource = 'continuity';
            console.log(`[Director] add_transition: boundary ${i}→${i+1}: continuity-informed ${effectiveType} (score=${pairAnalysis.score.overall.toFixed(2)})`);
          } else {
            effectiveType = transType;
            effectiveDuration = action.params.durationMs || 500;
          }
        }

        try {
          // Target ONE specific pair (clipA → adjacent next clip, which is clipB).
          //
          // Passing `afterOverlayId` routes the add_transition tool to its
          // single-pair branch at tools.ts:3857-3864, which calls
          // `applyBetween(videoOverlays[targetIdx], videoOverlays[targetIdx+1])`
          // exactly once.
          //
          // ⚠️ DO NOT replace with `clipAId`/`clipBId` — those fields do NOT
          // exist in `addTransitionSchema` (tools.ts:3732-3744). Zod silently
          // strips them. The tool then sees no afterOverlayId and no
          // applyToAll flag, and at tools.ts:3852 falls through to the
          // applyToAll loop — iterating EVERY pair and, for each, running
          // the delete-existing logic at tools.ts:3802-3808 that obliterates
          // pre-existing EDL transitions on OTHER pairs.
          //
          // Witnessed regression 2026-04-19 in proj_L7c43ghg7Rt3:
          // EDL placed 5 transitions (dissolve, film-burn, dip-to-white,
          // 2 dissolves); Director identified 5 gap boundaries and called
          // add_transition 5 times intending to fill only those gaps; each
          // call silently ran applyToAll and left the project with 10 dissolves
          // (all 5 EDL styles wiped). proj_3jE3Q8mx5fB5 was "fine" only
          // because its EDL saturated all 10 boundaries — Director's gap
          // check broke out of this loop before ever invoking the tool.
          //
          // See pipeline_investigations.md entry 2026-04-19 for the full
          // investigation and the confirmed single-caller blast radius
          // (Director-layer params are the only broken call site; profile
          // action params with `applyToAll: true` and UI panel calls are
          // correct).
          const singleTransAction = {
            ...action,
            params: {
              type: effectiveType,
              durationMs: effectiveDuration,
              afterOverlayId: clipA.id,
            },
          };
          const result = await invokeAITool(singleTransAction, userId, projectId, profile, overlays);
          transModified += result;
          // Push marker to in-memory overlays so the dedup check at line 821 sees
          // transitions added by PREVIOUS iterations of this loop. invokeAITool
          // writes to MongoDB but doesn't update the in-memory array — without this
          // marker, subsequent iterations create duplicates at adjacent boundaries.
          //
          // ⚠️ IN-MEMORY ONLY — must NOT reach MongoDB. The `inMemoryMarker: true`
          // flag is the signal for the step-4 save to strip these before persist.
          // Witnessed regression: proj_3ETiKQF69nRd had 3 ghost transitions (no
          // source, no transitionStyle) at frames 250/404/678 because step-4
          // `saveProject(overlays)` persisted the in-memory array including these
          // markers. See pipeline_investigations.md 2026-04-18 "Dual transition
          // system regression (A3.5.1/A3.5.2 returned)".
          if (result > 0) {
            const transDurFrames = Math.max(1, Math.round((effectiveDuration / 1000) * 30));
            overlays.push({
              id: Date.now() + i,
              type: 'transition',
              from: boundaryFrame - Math.floor(transDurFrames / 2),
              durationInFrames: transDurFrames,
              row: ROW.VIDEO,
              metadata: { isTransition: true, inMemoryMarker: true },
            } as any);
          }
          console.log(`[Director] add_transition: ${i}→${i+1}: ${effectiveType} (${effectiveSource})`);
        } catch (err: any) {
          console.warn(`[Director] add_transition: boundary ${i}→${i+1} failed: ${err.message}`);
        }
      }
      modified = transModified;
      break;
    }

    case 'add_motion_graphic':
    case 'generate_html_scene': {
      // Invoke the actual tool via createTools — these are fully functional
      modified = await invokeAITool(action, userId, projectId, profile, overlays, undefined, genreParams);
      break;
    }

    case 'quality_review': {
      // Run deterministic quality checks (zero AI cost)
      try {
        const { runQualityReview } = await import('@/lib/editron/services/quality-review-service');
        const fps = 30; // Standard
        const report = runQualityReview(overlays, fps, undefined, undefined, constraintViolations, undefined, genreParams);
        console.log(`[Director] Quality review: score=${report.overallScore}/100, issues=${report.issues.length}`);
        if (report.issues.length > 0) {
          const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
          const warnCount = report.issues.filter(i => i.severity === 'warning').length;
          console.log(`[Director] Quality: ${criticalCount} critical, ${warnCount} warnings, ${report.autoFixable.length} auto-fixable`);
        }
        if (report.suggestions.length > 0) {
          report.suggestions.forEach(s => console.log(`[Director] Suggestion: ${s}`));
        }

        // Persist quality review to project doc — consumed by bandit reward feedback
        // (video-analysis worker Step 7.1 reads qualityReview.overallScore)
        try {
          const qrDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
          const persistedQualityReview = buildPersistedQualityReview(report);
          await qrDb.collection('projects').updateOne(
            { projectId },
            {
              $set: {
                qualityReview: persistedQualityReview as unknown as Record<string, unknown>,
              },
            },
          );
        } catch (err: unknown) {
          console.warn('[Director] non-fatal quality review storage:', err instanceof Error ? err.message : err);
        }
      } catch (qrErr: any) {
        console.error(`[Director] Quality review failed: ${qrErr.message}`);
      }
      break;
    }

    default:
      console.warn(`[Director] Unknown tool: ${action.tool}`);
      break;
  }

  return modified;
}

// ─── AI Tool Invocation ──────────────────────────────────────────
// Calls functional LangChain tools from tools.ts directly with profile params.
// Each tool handles its own project loading/saving.

async function invokeAITool(
  action: EditProfileAction,
  userId: string,
  projectId: string,
  profile: EditProfile,
  overlays: any[],
  captionStyleOverride?: string,
  genreParams?: { graphic_density?: number } | null,
): Promise<number> {
  const { createTools } = await import('@/lib/editron/agent/tools');
  const tools = createTools(userId, projectId);

  // Find the matching tool by name
  const toolName = action.tool;
  const tool: any = tools.find((t: any) => t.name === toolName);
  if (!tool) {
    console.warn(`[Director] Tool not found: ${toolName}`);
    return 0;
  }

  // Build params from profile + action params
  const params: Record<string, any> = { ...action.params };

  // Tool-specific param mapping from profile
  switch (toolName) {
    case 'add_captions': {
      // GUARD: If finalize already created captions WITH CONTENT, don't duplicate them.
      // Finalize creates basic captions from narration text. Director's job is to
      // ENHANCE existing captions (styling, emphasis), not create duplicates.
      // BUT: finalize sometimes creates empty placeholder captions (captions: [] or
      // no words). In that case, let Director replace them with real captions.
      const existingCaptions = overlays.filter(o => o.type === 'caption');
      const populatedCaptions = existingCaptions.filter(o =>
        (o as any).captions?.length > 0 || (o as any).content?.length > 10
      );
      if (populatedCaptions.length > 0) {
        console.log(`[Director] add_captions: ${populatedCaptions.length} populated captions already exist (from finalize). Skipping to avoid duplicates.`);
        return 0;
      }
      // Remove empty placeholder captions so Director can create real ones
      if (existingCaptions.length > 0 && populatedCaptions.length === 0) {
        console.log(`[Director] add_captions: ${existingCaptions.length} empty caption placeholders found — removing so Director can create real captions`);
        for (let i = overlays.length - 1; i >= 0; i--) {
          if (overlays[i].type === 'caption') overlays.splice(i, 1);
        }
      }

      // Caption ALL video overlays sequentially
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) {
        console.log(`[Director] add_captions: no video overlays found, skipping`);
        return 0;
      }
      // Caption style: already computed by executeAction from signals (if Path D active)
      // or from a neutral fallback. params.style is set upstream. Map any remaining invalid values.
      const CAPTION_STYLE_MAP: Record<string, string> = {
        'creator': 'bold', 'fancy': 'bold', 'word-by-word': 'bold',
        'kinetic': 'bold', 'none': 'subtitle',
      };
      // params.style is resolved upstream from caption atoms/signals; subtitle is the neutral compatibility fallback.
      const rawCaptionStyle = params.style || captionStyleOverride || 'subtitle';
      const captionStyle = CAPTION_STYLE_MAP[rawCaptionStyle] || rawCaptionStyle;
      const captionDisplayMode = params.displayMode;
      const captionWordsPerGroup = typeof params.wordsPerGroup === 'number' ? params.wordsPerGroup : undefined;

      // ── Mode 2 FIX: Seed transcription cache from rawFootageAnalysis ──
      // In Mode 2, Grok STT transcription is stored on the PROJECT doc
      // (rawFootageAnalysis.transcription) but the add_captions tool looks for
      // it in MEDIA_ASSETS (per-asset cache). Without seeding, the tool tries
      // on-demand re-transcription of the full video → times out on long videos.
      // Fix: copy the existing transcription to the asset's cache before captioning.
      try {
        const captionDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
        const projDoc = await captionDb.collection('projects').findOne(
          { projectId },
          { projection: { 'rawFootageAnalysis.transcription': 1 } },
        );
        const rfaTranscription = projDoc?.rawFootageAnalysis?.transcription;
        if (rfaTranscription?.words?.length > 0) {
          const videoAssetIds = [...new Set(videoOverlays.map((v: any) => v.assetId).filter(Boolean))];
          for (const vid of videoAssetIds) {
            const existing = await captionDb.collection('media_assets').findOne(
              { assetId: vid },
              { projection: { 'transcription.words': { $slice: 1 } } },
            );
            if (!existing?.transcription?.words?.length) {
              await captionDb.collection('media_assets').updateOne(
                { assetId: vid },
                { $set: { transcription: rfaTranscription } },
              );
              console.log(`[Director] add_captions: seeded transcription cache for ${vid} from rawFootageAnalysis (${rfaTranscription.words.length} words)`);
            } else {
              console.log(`[Director] add_captions: transcription already cached for ${vid}`);
            }
          }
        }
      } catch (seedErr: any) {
        console.warn(`[Director] add_captions: transcription seed failed (non-fatal): ${seedErr.message}`);
      }

      // Pre-warm transcription cache for voiceover assets (Mode 1 path).
      // In Mode 2, there are no voiceover overlays — this block is a no-op.
      try {
        const { getTranscription } = await import('@/lib/editron/services/media/transcription-service');
        const voiceoverOverlays = overlays.filter(o =>
          o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === ROW.VOICEOVER)
        );
        if (voiceoverOverlays.length > 0) {
          console.log(`[Director] add_captions: pre-warming transcriptions for ${voiceoverOverlays.length} voiceovers`);
          for (const vo of voiceoverOverlays) {
            if (!vo.assetId) continue;
            try {
              await getTranscription(vo.assetId, userId);
              console.log(`[Director] add_captions: transcription ready for ${vo.assetId}`);
            } catch (tErr: any) {
              console.warn(`[Director] add_captions: transcription warm-up failed for ${vo.assetId}: ${tErr.message}`);
            }
          }
        }
      } catch (warmErr: any) {
        console.warn(`[Director] add_captions: transcription warm-up error: ${warmErr.message}`);
      }
      console.log(`[Director] add_captions: ${videoOverlays.length} videos, style=${captionStyle}, mode=${captionDisplayMode || 'default'}, words=${captionWordsPerGroup || 'default'}`);

      // Caption each video sequentially — tool.invoke handles transcription + caption creation.
      // Track which voiceover assetIds already produced captions → prevent duplicates.
      // Without this, 3 videos overlapping the same VO → 3 identical caption blocks.
      let captionCount = 0;
      const captionedVoiceoverIds = new Set<string>();
      for (const vo of videoOverlays) {
        try {
          // Dedup: check if this video's overlapping voiceover was already captioned
          const voFrom = vo.from;
          const voEnd = voFrom + (vo.durationInFrames || 0);
          const overlappingVO = overlays.find((o: any) => {
            if (o.type !== 'sound') return false;
            const isVO = o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_');
            if (!isVO) return false;
            const oEnd = o.from + (o.durationInFrames || 0);
            return !(oEnd <= voFrom || o.from >= voEnd);
          });
          if (overlappingVO?.assetId && captionedVoiceoverIds.has(overlappingVO.assetId)) {
            console.log(`[Director] add_captions: video ${vo.id} skipped — voiceover ${overlappingVO.assetId} already captioned`);
            continue;
          }

          const captionParams = {
            videoOverlayId: vo.id,
            style: captionStyle,
            position: 'bottom',
            overwrite: true,
            ...(captionDisplayMode ? { displayMode: captionDisplayMode } : {}),
            ...(captionWordsPerGroup ? { wordsPerGroup: captionWordsPerGroup } : {}),
          };
          console.log(`[Director] add_captions: video ${vo.id} (${captionCount + 1}/${videoOverlays.length}), type=${vo.type}, assetId=${vo.assetId}, from=${vo.from}`);
          const resultStr = await tool.invoke(captionParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') {
            captionCount++;
            // Mark VO as captioned → prevent duplicate captions from other videos overlapping same VO
            if (overlappingVO?.assetId) captionedVoiceoverIds.add(overlappingVO.assetId);
            console.log(`[Director] add_captions: video ${vo.id} SUCCESS — ${result.captionCount || 0} segments, row=${result.row || '?'}`);
          } else if (result.status === 'skipped') {
            // Expected: AI-gen video with no voiceover in range — not an error
            console.log(`[Director] add_captions: video ${vo.id} skipped — ${result.message || 'no voiceover overlap'}`);
          } else {
            console.error(`[Director] add_captions: video ${vo.id} FAILED — ${result.message || JSON.stringify(result)}`);
          }
        } catch (err: any) {
          console.error(`[Director] add_captions: video ${vo.id} EXCEPTION — ${err.message}\n${err.stack?.split('\n').slice(0, 3).join('\n')}`);
        }
      }
      console.log(`[Director] add_captions: ${captionCount}/${videoOverlays.length} videos captioned`);
      return captionCount;
    }
    case 'add_fancy_captions': {
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) return 0;
      // Map profile caption styles to valid fancy_captions enum values
      // Valid: bento | scattered | minimal | static | kinetic
      const FANCY_STYLE_MAP: Record<string, string> = {
        'creator': 'kinetic', 'word-by-word': 'kinetic', 'fancy': 'kinetic',
        'hormozi': 'bento', 'mrbeast': 'scattered', 'corporate': 'minimal',
      };
      const rawStyle = params.style || 'kinetic';
      const fancyStyle = FANCY_STYLE_MAP[rawStyle] || rawStyle;
      console.log(`[Director] add_fancy_captions: ${videoOverlays.length} videos, style=${fancyStyle}${rawStyle !== fancyStyle ? ` (mapped from "${rawStyle}")` : ''}`);

      let fancyCaptionCount = 0;
      for (const vo of videoOverlays) {
        try {
          const fancyParams = { videoOverlayId: vo.id, style: fancyStyle, intensity: params.intensity || 'medium', overwrite: true };
          console.log(`[Director] add_fancy_captions: video ${vo.id} (${fancyCaptionCount + 1}/${videoOverlays.length})`);
          const resultStr = await tool.invoke(fancyParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') fancyCaptionCount++;
          else console.warn(`[Director] add_fancy_captions video ${vo.id}: ${result.error?.message}`);
        } catch (err: any) {
          console.warn(`[Director] add_fancy_captions failed for video ${vo.id}: ${err.message}`);
        }
      }
      return fancyCaptionCount;
    }
    case 'sync_cuts_to_beats': {
      // Find audio (BGM) and video overlays
      const bgmOverlay = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
      const videoOverlay = overlays.find(o => o.type === 'video');
      if (!bgmOverlay || !videoOverlay) {
        console.log(`[Director] sync_cuts_to_beats: missing BGM or video overlay`);
        return 0;
      }
      params.audioOverlayId = params.audioOverlayId || bgmOverlay.id;
      params.videoOverlayId = params.videoOverlayId || videoOverlay.id;
      params.beatFilter = params.beatFilter || 'downbeats';
      break;
    }
    case 'add_motion_graphic': {
      // ── Option C: Structured fields preferred, category/description as fallback ──
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;

      // Map legacy category → graphicType for backward compat
      const CATEGORY_TO_GRAPHIC_TYPE: Record<string, string> = {
        'lower-third': 'lower-third',
        'lower_third': 'lower-third',
        'stat-counter': 'stat-counter',
        'stat_counter': 'stat-counter',
        'callout': 'callout',
        'quote': 'quote-card',
        'quote-card': 'quote-card',
        'logo': 'logo-reveal',
        'logo-reveal': 'logo-reveal',
      };
      if (!params.graphicType && params.category) {
        params.graphicType = CATEGORY_TO_GRAPHIC_TYPE[params.category] || undefined;
      }

      // Fallback description for old template path (when no structured fields)
      const CATEGORY_DESCRIPTIONS: Record<string, string> = {
        'lower-third': 'clean lower third with name and title',
        'lower_third': 'clean lower third with name and title',
        'callout': 'callout box with accent',
        'title-card': 'title card centered',
        'title_card': 'title card centered',
        'stat-counter': 'animated stat counter',
        'stat_counter': 'animated stat counter',
        'subscribe': 'subscribe button animated',
        'quote': 'quote card',
        'list': 'step by step list',
        'comparison': 'comparison layout',
        'notification': 'notification popup',
      };
      if (!params.description || (params.description as string).length <= 10) {
        const cat = params.category || params.graphicType || 'lower-third';
        params.description = CATEGORY_DESCRIPTIONS[cat] || 'lower third';
      }

      // Dedup: skip if EDL or another system already placed the same graphic fact here.
      // Distinct graphic jobs near each other are allowed; duplicate same-fact clutter is not.
      const currentGraphicKey = directorGraphicDedupeKeyFromParams(params);
      const existingAtFrame = overlays.find((o: any) =>
        (o.type === 'html-scene' || o.type === 'sticker' || o.type === 'motion-graphic')
        && Math.abs(o.from - (params.start || 0)) <= 30
        && directorGraphicDedupeKeyFromOverlay(o) === currentGraphicKey
      );
      if (existingAtFrame) {
        console.log(`[Director] add_motion_graphic: SKIPPED — duplicate ${currentGraphicKey} at frame ${existingAtFrame.from} (within 30 frames of ${params.start})`);
        return 0;
      }

      console.log(`[Director] add_motion_graphic: type="${params.graphicType || params.category || 'auto'}", desc="${(params.description as string).substring(0, 60)}" at frame ${params.start}`);
      break;
    }
    case 'generate_html_scene': {
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;

      // Validate description quality — reject placeholder/filler text.
      // The description drives Gemini HTML generation: garbage in = garbage out.
      // A motion designer given "minimal text here" would ask for clarification.
      const rawDesc = (params.description || '').trim();
      const PLACEHOLDER_PATTERNS = /^(minimal|sample|placeholder|default|test|example|some|basic|simple)\b.{0,20}$/i;
      const isPlaceholder = !rawDesc || rawDesc.length < 20 || PLACEHOLDER_PATTERNS.test(rawDesc);

      if (isPlaceholder) {
        const density = densityFromSignalsOrNeutral(genreParams);
        const style = density === 'heavy' ? 'bold animated'
          : density === 'moderate' ? 'clean professional'
          : 'minimal elegant';
        const contextualDesc = rawDesc && rawDesc.length >= 10
          ? `${style} ${rawDesc} for this moment`
          : `${style} title card with subtle gradient animation for this video moment`;
        params.description = contextualDesc;
        console.warn(`[Director] generate_html_scene: description too vague ("${rawDesc.substring(0, 30)}") — enriched to: "${contextualDesc.substring(0, 60)}"`);
      } else {
        params.description = rawDesc;
      }
      break;
    }
  }

  console.log(`[Director] Invoking tool: ${toolName} with params:`, Object.keys(params).join(', '));

  try {
    const resultStr = await tool.invoke(params);
    const result = JSON.parse(resultStr);

    if (result.status === 'success') {
      console.log(`[Director] Tool ${toolName} succeeded`);
      return result.data?.overlaysModified || result.data?.overlaysCreated || 1;
    } else {
      console.error(`[Director] Tool ${toolName} failed: ${result.error?.message}`);
      return 0;
    }
  } catch (err: any) {
    console.error(`[Director] Tool ${toolName} threw: ${err.message}`);
    throw err; // Let the outer handler decide (skip/abort/warn)
  }
}

// ─── Condition Checker ───────────────────────────────────────────

function checkCondition(condition: string | undefined, overlays: any[], projectDoc?: any): boolean {
  if (!condition) return true;

  // Mode 2: raw footage has speech IN the video, not as separate voiceover overlay
  const isRawFootage = !!(projectDoc?.rawFootageAnalysis?.segments?.length > 0);

  switch (condition) {
    case 'hasVideoOverlays':
      return overlays.some(o => o.type === 'video');
    case 'hasSpeech':
    case 'hasVoiceover':
      // Mode 2: video itself contains speech — treat as having voiceover
      if (isRawFootage) return true;
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_')));
    case 'hasMultipleScenes':
      // Mode 2: transcript segments count as multiple scenes even with 1 video clip
      if (isRawFootage && (projectDoc.rawFootageAnalysis.segments.length > 1)) return true;
      return overlays.filter(o => o.type === 'image' || o.type === 'video').length > 1;
    case 'hasBGM':
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_')));
    default:
      return true;
  }
}

// ─── Brief Override Application ──────────────────────────────────

function applyBriefOverrides(profile: EditProfile, brief?: ProjectBrief): EditProfile {
  if (!brief?.overrides) return profile;

  const next: EditProfile = { ...profile };
  if (brief.overrides.filterPresetId !== undefined) next.filterPresetId = brief.overrides.filterPresetId;
  if (brief.overrides.pacing !== undefined) next.pacing = brief.overrides.pacing;
  if (brief.overrides.captionStyle !== undefined) next.captionStyle = brief.overrides.captionStyle;
  if (brief.overrides.bgmDuckLevel !== undefined) next.bgmDuckLevel = brief.overrides.bgmDuckLevel;
  if (brief.overrides.graphicsDensity !== undefined) next.graphicsDensity = brief.overrides.graphicsDensity;
  if (brief.overrides.defaultTransition !== undefined) next.defaultTransition = brief.overrides.defaultTransition;
  return next;
}

// ─── Transition Dedup Safety Net (B3) ────────────────────────────
//
// Post-composition sweep that guarantees at most ONE transition per (clipAId,
// clipBId) pair in the project, regardless of which code path produced them.
// Runs at the end of the profile action loop, BEFORE step 3.5 (beat-sync) and
// step 3.6 (SFX placer) — so those downstream steps see a clean set.
//
// WHY THIS EXISTS
// Root Cause B of the dual-transition regression (pipeline_investigations.md
// 2026-04-18): the EDL executor and the Director's add_transition tool each
// have their own dedup check, but they use different reference frames to
// measure proximity. When the numbers drift, one system doesn't see the
// other's work. The per-site B1 fixes (clip-pair identity in both dedup
// checks) prevent most cases. THIS function is the safety net that also
// catches:
//   - Future code paths that add transitions without going through the
//     checked sites
//   - Pre-existing project state from before the B1 fixes landed
//   - Legacy overlays without clipAId/clipBId (treated as ghosts)
//
// PRIORITY ORDER (higher = keep)
//   edl                       100  — LLM creative intent, authoritative
//   tool                       80  — Director/AI-chat add_transition tool
//   unknown with transitionStyle 10 — something legitimate we don't recognize
//   ghost (inMemoryMarker OR no source AND no style)  -1 — always lose
//
// INVARIANTS
//   - Only operates on overlays where type === 'transition' OR
//     metadata.isTransition is true. All other overlays pass through untouched.
//   - Stable sort within a group: ties broken by original array index (first
//     wins), so behavior is deterministic across runs.
//   - Mutates the overlays array in place via length=0 + push, matching the
//     convention used by split_clips at line ~797.
//   - Idempotent: running twice on the same clean array removes nothing.
//   - Returns counts for logging and result.overlaysModified tracking.
//
// FAILURE MODES GUARDED AGAINST
//   - clipAId === 0 or '' as valid IDs → use `== null` (catches null+undefined
//     only, not 0 or '').
//   - Ghost transitions without clipAId/clipBId → go to the "unknown pair"
//     bucket and get stripped if they have no source AND no transitionStyle.
//   - A legit transition with no source but a real transitionStyle → kept as
//     last-resort priority 10, not stripped.
//   - Mutation-during-iteration → collect removal indices into a Set first,
//     then filter once.
const TRANSITION_SOURCE_PRIORITY: Record<string, number> = {
  edl: 100,
  tool: 80,
  // 'transition-sfx-placer' produces type:'sound' overlays, not transitions,
  // so it should never appear in this dedup. Included defensively anyway.
  'transition-sfx-placer': 60,
};

function transitionPriority(o: any): number {
  // Tagged in-memory sentinel → always lose (A1 filter should already strip
  // these before save; this is belt-and-suspenders for step-3.5/3.6 consumers).
  if (o?.metadata?.inMemoryMarker) return -1;
  const src = o?.metadata?.source;
  if (src && TRANSITION_SOURCE_PRIORITY[src] !== undefined) {
    return TRANSITION_SOURCE_PRIORITY[src];
  }
  // No recognized source but has a real transitionStyle → legit but unknown
  // (e.g., an external tool added a transition). Keep as last-resort winner.
  if (o?.transitionStyle) return 10;
  // No source, no style → shaped like a ghost. Strip.
  return -1;
}

function directorGraphicDedupeKeyFromOverlay(overlay: any): string {
  const metadata = overlay?.metadata || {};
  const content = overlay?.content && typeof overlay.content === 'object' ? overlay.content : {};
  return directorGraphicDedupeKey(
    metadata.creativeDecisionType ?? metadata.graphicType ?? overlay?.graphicType ?? overlay?.type,
    { ...content, ...metadata },
  );
}

function directorGraphicDedupeKeyFromParams(params: Record<string, any>): string {
  return directorGraphicDedupeKey(params.creativeDecisionType ?? params.graphicType ?? params.category ?? 'graphic', params);
}

function directorGraphicDedupeKey(kindValue: unknown, values: Record<string, any>): string {
  const semanticAtoms = values.semanticAtoms && typeof values.semanticAtoms === 'object' ? values.semanticAtoms : {};
  const quantity = semanticAtoms.quantity && typeof semanticAtoms.quantity === 'object' ? semanticAtoms.quantity : {};
  const textAtom = semanticAtoms.text && typeof semanticAtoms.text === 'object' ? semanticAtoms.text : {};
  const identity = semanticAtoms.identity && typeof semanticAtoms.identity === 'object' ? semanticAtoms.identity : {};
  const quote = semanticAtoms.quote && typeof semanticAtoms.quote === 'object' ? semanticAtoms.quote : {};
  const relation = semanticAtoms.relation && typeof semanticAtoms.relation === 'object' ? semanticAtoms.relation : {};
  const kind = directorNormalizeGraphicToken(kindValue);
  const body = [
    quantity.displayText,
    quantity.label,
    textAtom.primary,
    textAtom.keyword,
    semanticAtoms.concept,
    semanticAtoms.claim,
    semanticAtoms.evidencePhrase,
    identity.name,
    identity.role,
    quote.text,
    relation.from,
    relation.to,
    values.value,
    values.label,
    values.title,
    values.body,
    values.name,
    values.text,
    values.quote,
    values.description,
  ]
    .map(directorNormalizeGraphicToken)
    .filter(Boolean)
    .join('|');
  return `${kind}:${body || 'unknown'}`;
}

function directorNormalizeGraphicToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}
function dedupTransitionsByClipPair(
  overlays: any[],
): { ghostsStripped: number; duplicatesRemoved: number } {
  if (overlays.length === 0) return { ghostsStripped: 0, duplicatesRemoved: 0 };

  // Collect transition indices with their overlays
  const transitionEntries: Array<{ idx: number; overlay: any }> = [];
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i];
    if (o?.type === 'transition' || o?.metadata?.isTransition) {
      transitionEntries.push({ idx: i, overlay: o });
    }
  }
  if (transitionEntries.length === 0) {
    return { ghostsStripped: 0, duplicatesRemoved: 0 };
  }

  // Group by clip-pair identity. Entries missing clipAId/clipBId go to the
  // "unknown pair" bucket for ghost detection.
  const pairGroups = new Map<string, Array<{ idx: number; overlay: any }>>();
  const unknownPair: Array<{ idx: number; overlay: any }> = [];

  for (const entry of transitionEntries) {
    const a = entry.overlay.clipAId;
    const b = entry.overlay.clipBId;
    if (a == null || b == null) {
      unknownPair.push(entry);
    } else {
      const key = `${a}_${b}`;
      const arr = pairGroups.get(key);
      if (arr) arr.push(entry);
      else pairGroups.set(key, [entry]);
    }
  }

  const toRemove = new Set<number>();
  let duplicatesRemoved = 0;
  let ghostsStripped = 0;

  // Per-pair: keep highest-priority winner, remove rest
  for (const [key, members] of pairGroups) {
    if (members.length <= 1) continue;
    // Sort descending by priority; original array index as tiebreaker (stable)
    const sorted = [...members].sort((a, b) => {
      const diff = transitionPriority(b.overlay) - transitionPriority(a.overlay);
      return diff !== 0 ? diff : a.idx - b.idx;
    });
    const winner = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      toRemove.add(sorted[i].idx);
      duplicatesRemoved++;
    }
    const winnerSrc = winner.overlay?.metadata?.source || 'unknown';
    const winnerStyle = winner.overlay?.transitionStyle || 'unknown';
    console.log(
      `[Director] Transition dedup: pair ${key} had ${members.length} entries, ` +
      `kept ${winnerSrc}/${winnerStyle} @ frame ${winner.overlay.from}, ` +
      `removed ${members.length - 1} duplicate(s)`,
    );
  }

  // Unknown-pair bucket: strip ghosts only. Keep legit transitions even
  // without clipIds (e.g., legacy overlays) — those still have a transitionStyle.
  for (const entry of unknownPair) {
    const o = entry.overlay;
    const isGhost = o?.metadata?.inMemoryMarker ||
      (!o?.metadata?.source && !o?.transitionStyle);
    if (isGhost) {
      toRemove.add(entry.idx);
      ghostsStripped++;
    }
  }
  if (ghostsStripped > 0) {
    console.log(`[Director] Transition dedup: stripped ${ghostsStripped} ghost transition(s) (no source + no transitionStyle)`);
  }

  if (toRemove.size > 0) {
    const kept = overlays.filter((_, idx) => !toRemove.has(idx));
    overlays.length = 0;
    overlays.push(...kept);
  }

  return { ghostsStripped, duplicatesRemoved };
}
