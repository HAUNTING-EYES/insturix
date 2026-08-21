import { optimizeScriptShotPlans } from './optimize-script-shot-plan';
import {
  parseProductionCapabilityProfile,
  type ProductionCapabilityProfile,
} from './production-capability-profile';
import { resolveSceneShotPlan } from './resolve-scene-shot-plan';
import {
  buildTreatmentCapturePlan,
  type TreatmentCapturePlan,
} from './semantic-capture-plan';
import {
  parseShotPlan,
  SHOT_PLAN_NARRATIVE_STRUCTURE_VERSION,
  type ShotPlan,
} from './shot-plan';
import {
  readScriptSidecar,
  type ScriptSidecarReadResult,
} from '../schemas/script-sidecar-v1-adapter';
import {
  LongFormChapterSceneOwnershipError,
  resolveLongFormChapterSceneOwnership,
  type LongFormChapterSceneOwnership,
} from '../long-form/chapter-scene-ownership';
import { CaptureAcquisitionDecisionError } from './capture-acquisition-decisions';

export const SHOOT_KIT_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const;
export type ShootKitAspectRatio = typeof SHOOT_KIT_ASPECT_RATIOS[number];

export interface ScriptShotPlanIssue {
  code: string;
  message: string;
  sceneId?: string;
  sceneIndex?: number;
  sceneTitle?: string;
  questions: string[];
}

export type ScriptShotPlanBuildResult =
  | { status: 'ready'; plan: ShotPlan; issues: [] }
  | { status: 'capture-projection'; plan: null; capturePlan: TreatmentCapturePlan; issues: [] }
  | { status: 'needs-user-input'; plan: null; issues: ScriptShotPlanIssue[] };

export interface BuildScriptShotPlanInput {
  sidecar: unknown;
  profile?: unknown | null;
  /** Canonical V3 treatment persisted with the same writer output as the sidecar. */
  videoTreatment?: unknown;
  aspectRatio?: ShootKitAspectRatio;
  tier?: ShotPlan['tier'];
  /** Server-owned long-form plan persisted with the bound writer output. */
  chapterPlan?: unknown;
  /** User-confirmed acquisition choices bound to this exact document and treatment. */
  acquisitionDecisions?: unknown;
  /** Exact source document identity required to verify acquisition choices. */
  acquisitionDecisionSourceDocument?: unknown;
}

type ScriptSidecarV2 = Extract<ScriptSidecarReadResult, { sourceVersion: 1 | 2 }>['sidecar'];
type BeatShotIntent = NonNullable<ScriptSidecarV2['acts'][number]['narrativeScenes'][number]['beats'][number]['shotIntent']>;
type LongFormChapterContext = LongFormChapterSceneOwnership;

type LongFormChapterResolution =
  | { status: 'absent' }
  | { status: 'ready'; context: LongFormChapterContext }
  | { status: 'invalid'; issue: ScriptShotPlanIssue };

interface ShotPlanningUnit {
  legacyV1: boolean;
  sceneId: string;
  sceneIndex: number;
  sceneTitle: string;
  generationUnitId: string;
  durationSeconds?: number;
  shotIntent?: BeatShotIntent;
  aliases: string[];
  narrativeSceneId?: string;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function canonicalSceneId(index: number): string {
  return `scene_${index + 1}`;
}

function continuityForScene(
  unit: ShotPlanningUnit,
  previousSceneIds: string[],
  sceneIndexByAlias: Map<string, number>,
  sceneIdByIndex: Map<number, string>,
  issues: ScriptShotPlanIssue[],
): string[] {
  const resolved: string[] = [];
  for (const reference of previousSceneIds) {
    const referencedIndex = sceneIndexByAlias.get(reference);
    if (referencedIndex === undefined) {
      issues.push({
        code: 'unknown_continuity_scene',
        message: `Continuity reference "${reference}" does not resolve to a sidecar scene.`,
        sceneId: unit.sceneId,
        sceneIndex: unit.sceneIndex,
        sceneTitle: unit.sceneTitle,
        questions: ['Remove the invalid continuity link or regenerate this scene intent.'],
      });
      continue;
    }
    if (referencedIndex >= unit.sceneIndex) {
      issues.push({
        code: 'forward_continuity_scene',
        message: `Continuity reference "${reference}" must point to an earlier scene.`,
        sceneId: unit.sceneId,
        sceneIndex: unit.sceneIndex,
        sceneTitle: unit.sceneTitle,
        questions: ['Choose an earlier scene as the continuity source.'],
      });
      continue;
    }
    const resolvedSceneId = sceneIdByIndex.get(referencedIndex);
    if (resolvedSceneId) resolved.push(resolvedSceneId);
  }
  return uniqueStrings(resolved);
}

function v1PlanningUnits(
  readResult: Extract<ScriptSidecarReadResult, { sourceVersion: 1 }>,
): ShotPlanningUnit[] {
  return readResult.legacyV1.scenes.map((scene, sceneIndex) => ({
    legacyV1: true,
    sceneId: canonicalSceneId(sceneIndex),
    sceneIndex,
    sceneTitle: scene.title,
    generationUnitId: scene.generationUnitId,
    durationSeconds: scene.durationSeconds,
    shotIntent: scene.shotIntent,
    aliases: [canonicalSceneId(sceneIndex), scene.generationUnitId],
  }));
}

function v2PlanningUnits(sidecar: ScriptSidecarV2): ShotPlanningUnit[] {
  const units: ShotPlanningUnit[] = [];

  sidecar.acts.forEach((act) => {
    act.narrativeScenes.forEach((scene) => {
      const firstUnitIndex = units.length;
      scene.beats.forEach((beat) => {
        const sceneIndex = units.length;
        units.push({
          legacyV1: false,
          sceneId: beat.id,
          sceneIndex,
          sceneTitle: `${scene.title}: ${beat.narrativePurpose}`,
          generationUnitId: beat.id,
          durationSeconds: beat.durationIntentSeconds
            ?? (scene.beats.length === 1 ? scene.durationIntentSeconds : undefined),
          shotIntent: beat.shotIntent,
          aliases: [beat.id],
          narrativeSceneId: scene.id,
        });
      });

      const finalUnit = units[units.length - 1];
      if (finalUnit && units.length > firstUnitIndex) finalUnit.aliases.push(scene.id);
    });
  });

  return units;
}

function longFormChapterPlanIssue(error: LongFormChapterSceneOwnershipError): ScriptShotPlanIssue {
  return {
    code: error.code,
    message: error.message,
    ...(error.sceneId ? { sceneId: error.sceneId } : {}),
    questions: ['Regenerate the long-form script so its chapter plan and production sidecar match.'],
  };
}

function resolveLongFormChapterContext(
  chapterPlanInput: unknown | undefined,
  readResult: ScriptSidecarReadResult,
): LongFormChapterResolution {
  if (chapterPlanInput === undefined) return { status: 'absent' };
  if (readResult.sourceVersion !== 2) {
    return {
      status: 'invalid',
      issue: {
        code: 'long_form_sidecar_version_mismatch',
        message: 'This long-form script must retain its V2 production sidecar before a Shoot Kit can be created.',
        questions: ['Regenerate or restore the current long-form script before creating its Shoot Kit.'],
      },
    };
  }
  try {
    const context = resolveLongFormChapterSceneOwnership({
      chapterPlan: chapterPlanInput,
      acts: readResult.sidecar.acts,
    });
    if (!context) return { status: 'absent' };
    return { status: 'ready', context };
  } catch (error) {
    if (error instanceof LongFormChapterSceneOwnershipError) {
      return { status: 'invalid', issue: longFormChapterPlanIssue(error) };
    }
    throw error;
  }
}

function attachLongFormNarrativeStructure(input: {
  plan: ShotPlan;
  sidecar: ScriptSidecarV2;
  units: ShotPlanningUnit[];
  context: LongFormChapterContext;
}): ShotPlan {
  const sidecarSceneById = new Map(
    input.sidecar.acts.flatMap((act) => act.narrativeScenes.map((scene) => [scene.id, scene] as const)),
  );
  const shootSceneIdsByNarrativeScene = new Map<string, string[]>();
  input.units.forEach((unit) => {
    if (!unit.narrativeSceneId) return;
    const ids = shootSceneIdsByNarrativeScene.get(unit.narrativeSceneId) ?? [];
    ids.push(unit.sceneId);
    shootSceneIdsByNarrativeScene.set(unit.narrativeSceneId, ids);
  });

  return parseShotPlan({
    ...input.plan,
    narrativeStructure: {
      version: SHOT_PLAN_NARRATIVE_STRUCTURE_VERSION,
      acts: input.context.plan.acts.map((act) => ({
        id: act.id,
        title: act.title,
        narrativePurpose: act.narrativePurpose,
        chapters: act.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          narrativePurpose: chapter.narrativePurpose,
          narrativeScenes: chapter.sceneBlueprints.map((blueprint) => {
            const narrativeScene = sidecarSceneById.get(blueprint.id);
            const shootSceneIds = shootSceneIdsByNarrativeScene.get(blueprint.id);
            if (!narrativeScene || !shootSceneIds?.length) {
              throw new Error(`Long-form narrative structure lost scene ${blueprint.id}.`);
            }
            return {
              id: narrativeScene.id,
              title: narrativeScene.title,
              narrativePurpose: narrativeScene.narrativePurpose,
              shootSceneIds,
            };
          }),
        })),
      })),
    },
  });
}

function planningUnits(readResult: ScriptSidecarReadResult): ShotPlanningUnit[] {
  switch (readResult.sourceVersion) {
    case 1:
      return v1PlanningUnits(readResult);
    case 2:
      return v2PlanningUnits(readResult.sidecar);
    case 3:
      throw new Error('V3 treatment sidecars must use semantic capture projection, not legacy shot planning.');
  }
}

function addPlanningUnitAliases(
  units: ShotPlanningUnit[],
  sceneIndexByAlias: Map<string, number>,
  issues: ScriptShotPlanIssue[],
): void {
  units.forEach((unit) => {
    unit.aliases.forEach((alias) => {
      const existingIndex = sceneIndexByAlias.get(alias);
      if (existingIndex !== undefined && existingIndex !== unit.sceneIndex) {
        issues.push({
          code: 'duplicate_generation_unit_id',
          message: `Generation unit "${alias}" is shared by multiple scenes.`,
          sceneId: unit.sceneId,
          sceneIndex: unit.sceneIndex,
          sceneTitle: unit.sceneTitle,
          questions: [unit.legacyV1
            ? 'Regenerate the script with one unique generation unit per scene.'
            : 'Regenerate the script with unique scene and beat identifiers.'],
        });
        return;
      }
      sceneIndexByAlias.set(alias, unit.sceneIndex);
    });
  });
}

function planWithSourceVersion(plan: ShotPlan, sourceVersion: number): ShotPlan {
  if (plan.sourceSidecarVersion === sourceVersion) return plan;
  return parseShotPlan({ ...plan, sourceSidecarVersion: sourceVersion });
}

function addPlanLimitIssues(
  plan: ShotPlan,
  profile: ProductionCapabilityProfile,
  issues: ScriptShotPlanIssue[],
): void {
  const optimization = plan.optimization;
  if (!optimization) return;

  const maxSetupChanges = profile.constraints.maxSetupChanges;
  if (maxSetupChanges !== undefined && optimization.setupChangeCount > maxSetupChanges) {
    issues.push({
      code: 'setup_change_limit',
      message: `The script needs ${optimization.setupChangeCount} setup changes, above the approved limit of ${maxSetupChanges}.`,
      questions: ['Allow more setup changes or simplify the affected scene intents.'],
    });
  }
  if (optimization.locationChangeCount > profile.constraints.maxLocationChanges) {
    issues.push({
      code: 'location_change_limit',
      message: `The script needs ${optimization.locationChangeCount} location changes, above the approved limit of ${profile.constraints.maxLocationChanges}.`,
      questions: ['Allow more location changes or restage the affected scenes in one space.'],
    });
  }
}

function buildV3CaptureProjection(
  input: BuildScriptShotPlanInput,
  readResult: Extract<ScriptSidecarReadResult, { sourceVersion: 3 }>,
): ScriptShotPlanBuildResult {
  if (input.videoTreatment === undefined) {
    return {
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'missing_video_treatment',
        message: 'This semantic video script is missing its bound treatment contract.',
        questions: ['Regenerate or restore this script before opening its Shoot Kit.'],
      }],
    };
  }

  try {
    return {
      status: 'capture-projection',
      plan: null,
      capturePlan: buildTreatmentCapturePlan({
        sidecar: readResult.sidecar,
        treatment: input.videoTreatment,
        profile: input.profile,
        chapterPlan: input.chapterPlan,
        acquisitionDecisions: input.acquisitionDecisions,
        acquisitionDecisionSourceDocument: input.acquisitionDecisionSourceDocument,
      }),
      issues: [],
    };
  } catch (error) {
    if (error instanceof LongFormChapterSceneOwnershipError) {
      return {
        status: 'needs-user-input',
        plan: null,
        issues: [longFormChapterPlanIssue(error)],
      };
    }
    if (error instanceof CaptureAcquisitionDecisionError) {
      return {
        status: 'needs-user-input',
        plan: null,
        issues: [{
          code: `capture_acquisition_${error.code}`,
          message: error.message,
          questions: ['Review and save the capture acquisition choice for this script.'],
        }],
      };
    }
    return {
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'invalid_video_treatment_binding',
        message: 'This semantic video script no longer matches its saved treatment contract.',
        questions: ['Regenerate or restore this script before opening its Shoot Kit.'],
      }],
    };
  }
}

export function buildScriptShotPlan(input: BuildScriptShotPlanInput): ScriptShotPlanBuildResult {
  let readResult: ScriptSidecarReadResult;
  try {
    readResult = readScriptSidecar(input.sidecar);
  } catch (error) {
    console.error('[ThinkForge:ShootKit] Stored script sidecar is invalid:', error);
    return {
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'invalid_script_sidecar',
        message: 'This script has incomplete or outdated production data.',
        questions: ['Regenerate this script once before creating its Shoot Kit.'],
      }],
    };
  }
  if (readResult.sourceVersion === 3) return buildV3CaptureProjection(input, readResult);

  const aspectRatio = input.aspectRatio;
  if (!aspectRatio) {
    return {
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'missing_shot_settings',
        message: 'Choose an aspect ratio before creating a legacy physical Shot Plan.',
        questions: ['Which aspect ratio should this shoot use?'],
      }],
    };
  }
  const profile = parseProductionCapabilityProfile(input.profile);
  const tier = input.tier ?? profile.preferences.defaultPlanTier;
  const issues: ScriptShotPlanIssue[] = [];
  const longForm = resolveLongFormChapterContext(input.chapterPlan, readResult);
  if (longForm.status === 'invalid') {
    return { status: 'needs-user-input', plan: null, issues: [longForm.issue] };
  }
  const units = planningUnits(readResult);
  const sceneIndexByAlias = new Map<string, number>();
  const sceneIdByIndex = new Map(units.map((unit) => [unit.sceneIndex, unit.sceneId]));

  addPlanningUnitAliases(units, sceneIndexByAlias, issues);

  const scenePlans: ShotPlan[] = [];
  units.forEach((unit) => {
    if (!unit.shotIntent) {
      issues.push({
        code: 'missing_shot_intent',
        message: unit.legacyV1
          ? 'This saved scene predates production-aware script generation.'
          : 'This narrative beat has no authored production shot intent.',
        sceneId: unit.sceneId,
        sceneIndex: unit.sceneIndex,
        sceneTitle: unit.sceneTitle,
        questions: ['Regenerate or revise this script once so ThinkForge can author its shot intent.'],
      });
      return;
    }
    if (!unit.durationSeconds) {
      issues.push({
        code: 'missing_narrative_duration',
        message: 'This narrative beat has no authored duration. Shoot Kit does not derive story timing from render segments.',
        sceneId: unit.sceneId,
        sceneIndex: unit.sceneIndex,
        sceneTitle: unit.sceneTitle,
        questions: ['Set the beat duration, or set the narrative-scene duration when it contains one beat.'],
      });
      return;
    }

    const continuity = {
      ...unit.shotIntent.continuity,
      previousSceneIds: continuityForScene(
        unit,
        unit.shotIntent.continuity.previousSceneIds,
        sceneIndexByAlias,
        sceneIdByIndex,
        issues,
      ),
    };
    const resolution = resolveSceneShotPlan({
      profile,
      tier,
      intent: {
        sceneId: unit.sceneId,
        sidecarSceneIndex: unit.sceneIndex,
        generationUnitId: unit.generationUnitId,
        durationSec: unit.durationSeconds,
        aspectRatio,
        ...unit.shotIntent,
        continuity,
      },
    });

    if (resolution.status === 'needs-user-input') {
      resolution.blockers.forEach((blocker) => issues.push({
        code: blocker.code,
        message: blocker.message,
        sceneId: unit.sceneId,
        sceneIndex: unit.sceneIndex,
        sceneTitle: unit.sceneTitle,
        questions: [...resolution.questions],
      }));
      return;
    }
    scenePlans.push(planWithSourceVersion(resolution.plan, readResult.sourceVersion));
  });

  if (issues.length > 0) return { status: 'needs-user-input', plan: null, issues };

  const optimizedPlan = optimizeScriptShotPlans(scenePlans);
  const plan = longForm.status === 'ready'
    ? attachLongFormNarrativeStructure({
        plan: optimizedPlan,
        sidecar: readResult.sidecar,
        units,
        context: longForm.context,
      })
    : optimizedPlan;
  addPlanLimitIssues(plan, profile, issues);
  return issues.length > 0
    ? { status: 'needs-user-input', plan: null, issues }
    : { status: 'ready', plan, issues: [] };
}
