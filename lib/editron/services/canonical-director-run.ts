import type { DirectorResult, ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import { normalizeEditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import {
  resolveDirectorCompletionHealth,
  type DirectorCompletionHealth,
} from '@/lib/editron/services/editron-learning-gate';
import { projectService } from '@/lib/editron/services/project-service';

export interface CanonicalDirectorRunInputV1 {
  projectId: string;
  userId: string;
  profileId: string;
  platform?: string;
  userIntent?: string;
  captionStyle?: unknown;
  transitionPreference?: unknown;
  zoomBehavior?: unknown;
  motionGraphics?: unknown;
  pacingFeel?: unknown;
  musicPreference?: unknown;
  editorialPreferences?: unknown;
  pipelineDirectorDispatchToken?: string;
  analysisRunId?: string;
  analysisDirectorDispatchId?: string;
}

export type CanonicalDirectorRunResultV1 =
  | { disposition: 'ALREADY_PROCESSED' }
  | { disposition: 'DISPATCH_PENDING'; projectId: string }
  | { disposition: 'ASSIST_READY'; projectId: string; status: 'ready_for_chat' }
  | { disposition: 'OWNERSHIP_LOST'; projectId: string }
  | {
      disposition: 'COMPLETED';
      projectId: string;
      directorMs: number;
      actionsExecuted: number;
      decisionAuthority: DirectorResult['decisionAuthority'];
      completionHealth: DirectorCompletionHealth;
    };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function validProjectStartMs(value: unknown): number | null {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
  const milliseconds = date?.getTime();
  return milliseconds !== undefined && Number.isFinite(milliseconds)
    ? milliseconds
    : null;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === 'string' && values.includes(value as T) ? value as T : undefined;
}

function boundedString(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function buildDirectorBriefV1(
  input: CanonicalDirectorRunInputV1,
  projectDoc: UnknownRecord,
): ProjectBrief | undefined {
  const productionBrief = asRecord(projectDoc.productionBrief);
  const editorialPreferences = normalizeEditorialPreferences(input.editorialPreferences)
    ?? normalizeEditorialPreferences(projectDoc.editorialPreferences)
    ?? normalizeEditorialPreferences(productionBrief?.editorialPreferences);
  const captionStyle = enumValue(input.captionStyle, ['word_by_word', 'sentence', 'key_phrases', 'none']);
  const transitionPreference = enumValue(input.transitionPreference, ['minimal', 'subtle', 'dynamic', 'energetic']);
  const zoomBehavior = enumValue(input.zoomBehavior, ['none', 'subtle', 'moderate', 'aggressive']);
  const motionGraphics = enumValue(input.motionGraphics, ['none', 'stats_only', 'full']);
  const pacingFeel = enumValue(input.pacingFeel, ['calm', 'balanced', 'energetic', 'fast']);
  const musicPreference = enumValue(input.musicPreference, ['none', 'subtle_bed', 'energetic', 'match_video']);
  const userPrefs: Omit<ProjectBrief, 'modifiers' | 'overrides'> = {
    ...(captionStyle && { captionStyle }),
    ...(transitionPreference && { transitionPreference }),
    ...(zoomBehavior && { zoomBehavior }),
    ...(motionGraphics && { motionGraphics }),
    ...(pacingFeel && { pacingFeel }),
    ...(musicPreference && { musicPreference }),
    ...(boundedString(input.platform) && { platform: boundedString(input.platform) }),
    ...(boundedString(input.userIntent, 2_000) && { intent: boundedString(input.userIntent, 2_000) }),
    ...(editorialPreferences && { editorialPreferences }),
  };

  const editDNA = asRecord(projectDoc.referenceEditDNA);
  if (!editDNA) {
    return Object.keys(userPrefs).length > 0
      ? { ...userPrefs, modifiers: [] }
      : undefined;
  }

  const editDnaPacing = asRecord(editDNA.pacing);
  const editDnaTransitions = asRecord(editDNA.transitions);
  const pacing = enumValue(editDnaPacing?.overall, ['fast', 'medium', 'slow', 'variable', 'beat-synced']);
  const defaultTransition = boundedString(editDnaTransitions?.dominant);
  const graphicsDensity = enumValue(editDNA.graphicsDensity, ['heavy', 'moderate', 'minimal']);
  const overrides: ProjectBrief['overrides'] = {
    ...(pacing && { pacing }),
    ...(defaultTransition && { defaultTransition }),
    ...(graphicsDensity && { graphicsDensity }),
  };
  return {
    ...userPrefs,
    modifiers: [],
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

function assertCanonicalDirectorRunInputV1(input: CanonicalDirectorRunInputV1): void {
  if (
    !boundedString(input.projectId, 500)
    || !boundedString(input.userId, 500)
    || !boundedString(input.profileId, 100)
  ) {
    throw new Error('Canonical Director execution requires projectId, userId and profileId.');
  }
}

export async function runCanonicalDirectorV1(
  input: CanonicalDirectorRunInputV1,
  observer?: { onClaimed?(): void },
): Promise<CanonicalDirectorRunResultV1> {
  assertCanonicalDirectorRunInputV1(input);
  const startedAtMs = Date.now();
  let trackedDirectorRun: { projectId: string; userId: string; runToken: string } | undefined;

  try {
    const runClaim = await projectService.claimDirectorRunV1(
      input.userId,
      input.projectId,
      {
        ...(input.pipelineDirectorDispatchToken && { pipelineDirectorDispatchToken: input.pipelineDirectorDispatchToken }),
        ...(input.analysisRunId && { analysisRunId: input.analysisRunId }),
        ...(input.analysisDirectorDispatchId && { analysisDirectorDispatchId: input.analysisDirectorDispatchId }),
      },
    );
    if (runClaim.disposition === 'DISPATCH_PENDING') {
      return { disposition: 'DISPATCH_PENDING', projectId: input.projectId };
    }
    if (runClaim.disposition === 'PROJECT_NOT_FOUND' || runClaim.disposition === 'NOT_ELIGIBLE') {
      return { disposition: 'ALREADY_PROCESSED' };
    }

    const { isAssistProject, ASSIST_STATUS_READY } = await import('@/lib/editron/services/assist-lane');
    if (runClaim.disposition === 'ASSIST_PROJECT') {
      const projectRecord = asRecord(runClaim.project);
      if (
        !isAssistProject(runClaim.project)
        || projectRecord?.autoEditStatus !== ASSIST_STATUS_READY
        || runClaim.receipt.projectId !== input.projectId
        || !Number.isSafeInteger(runClaim.receipt.revision.value)
      ) {
        throw new Error(`ProjectService returned an uncommitted assist Director claim for ${input.projectId}.`);
      }
      return {
        disposition: 'ASSIST_READY',
        projectId: input.projectId,
        status: ASSIST_STATUS_READY,
      };
    }

    const projectDoc = asRecord(runClaim.project);
    if (!projectDoc) {
      throw new Error(`ProjectService returned an invalid claimed Director project for ${input.projectId}.`);
    }
    trackedDirectorRun = { projectId: input.projectId, userId: input.userId, runToken: runClaim.runToken };
    observer?.onClaimed?.();
    if (!asRecord(projectDoc.rawFootageAnalysis)) {
      console.warn(
        `[CanonicalDirector] rawFootageAnalysis is unavailable for ${input.projectId}; `
        + 'Director will run with degraded profile detection.',
      );
    }

    const brief = buildDirectorBriefV1(input, projectDoc);
    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    const directorResult = await executeDirectorPlan(input.projectId, input.userId, input.profileId, brief, {
      persistProjectProgress: true,
      deferProjectStatusTransitions: true,
    });
    if (!directorResult.success || !directorResult.terminalProjectReceipt) {
      throw new Error('Director completed without a terminal ProjectService receipt.');
    }

    const directorMs = Date.now() - startedAtMs;
    const pipelineStartedAtMs = validProjectStartMs(projectDoc.autoEditStartedAt);
    const totalPipelineMs = pipelineStartedAtMs === null
      ? directorMs
      : Math.max(directorMs, Date.now() - pipelineStartedAtMs);
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const projectAfterDirector = await db.collection('projects').findOne(
      { projectId: input.projectId, userId: input.userId },
      { projection: {
        'qualityReview.overallScore': 1,
        'qualityReview.criticalCount': 1,
        'intelligence.renderedQualityEvidence': 1,
      },
      },
    );
    const renderedQualityEvidence = projectAfterDirector?.intelligence?.renderedQualityEvidence;
    const completionHealth = resolveDirectorCompletionHealth(
      projectAfterDirector?.qualityReview,
      renderedQualityEvidence,
    );
    const completion = await projectService.completeDirectorRunV1(input.userId, input.projectId, {
      directorRunToken: trackedDirectorRun.runToken,
      expectedRevision: directorResult.terminalProjectReceipt.revision,
      terminalReceipt: directorResult.terminalProjectReceipt,
      totalPipelineMs,
      directorMs,
      profileId: input.profileId,
      autoEditStatus: completionHealth.autoEditStatus,
      needsQualityAttention: completionHealth.needsQualityAttention,
      ...(completionHealth.warning ? { autoEditWarning: completionHealth.warning } : {}),
      ...(directorResult.decisionAuthority
        ? { decisionAuthority: directorResult.decisionAuthority }
        : {}),
    });
    if (completion.disposition !== 'RECORDED') {
      return { disposition: 'OWNERSHIP_LOST', projectId: input.projectId };
    }
    trackedDirectorRun = undefined;

    if (completionHealth.needsQualityAttention) {
      console.warn(
        `[CanonicalDirector] ${input.projectId} needs quality attention: `
        + `score=${completionHealth.qualityScore}, critical=${completionHealth.criticalCount}.`,
      );
    } else {
      try {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(
          input.userId,
          input.projectId,
          completionHealth.qualityScore,
          false,
          false,
          {
            evidenceSource: renderedQualityEvidence?.qualityEvidenceSource,
            renderedAestheticStatus:
              renderedQualityEvidence?.renderedAestheticStatus
              ?? renderedQualityEvidence?.renderedQualityStatus
              ?? renderedQualityEvidence?.artifactStatus,
          },
        );
      } catch (error: unknown) {
        console.warn(
          '[CanonicalDirector] Bandit outcome recording failed (non-fatal):',
          error instanceof Error ? error.message : error,
        );
      }
    }

    return {
      disposition: 'COMPLETED',
      projectId: input.projectId,
      directorMs,
      actionsExecuted: directorResult.actionsExecuted,
      decisionAuthority: directorResult.decisionAuthority,
      completionHealth,
    };
  } catch (error: unknown) {
    if (trackedDirectorRun) {
      try {
        const message = error instanceof Error ? error.message : String(error);
        const failure = await projectService.failDirectorRunV1(
          trackedDirectorRun.userId,
          trackedDirectorRun.projectId,
          { directorRunToken: trackedDirectorRun.runToken, errorMessage: `Director: ${message}` },
        );
        if (failure.disposition !== 'RECORDED') {
          console.warn(
            `[CanonicalDirector] ${trackedDirectorRun.projectId} failure terminalization skipped: `
            + failure.disposition,
          );
        }
      } catch (terminalError: unknown) {
        console.warn(
          '[CanonicalDirector] ProjectService failure terminalization failed:',
          terminalError instanceof Error ? terminalError.message : terminalError,
        );
      }
    }
    throw error;
  }
}
