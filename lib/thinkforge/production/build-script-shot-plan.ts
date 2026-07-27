import { optimizeScriptShotPlans } from './optimize-script-shot-plan';
import {
  parseProductionCapabilityProfile,
  type ProductionCapabilityProfile,
} from './production-capability-profile';
import { resolveSceneShotPlan } from './resolve-scene-shot-plan';
import type { ShotPlan } from './shot-plan';
import { parseScriptSidecar } from '../schemas/script-sidecar';

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
  | { status: 'needs-user-input'; plan: null; issues: ScriptShotPlanIssue[] };

export interface BuildScriptShotPlanInput {
  sidecar: unknown;
  profile: unknown;
  aspectRatio: ShootKitAspectRatio;
  tier?: ShotPlan['tier'];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function canonicalSceneId(index: number): string {
  return `scene_${index + 1}`;
}

function continuityForScene(
  sceneIndex: number,
  previousSceneIds: string[],
  sceneIndexByAlias: Map<string, number>,
  issues: ScriptShotPlanIssue[],
): string[] {
  const resolved: string[] = [];
  for (const reference of previousSceneIds) {
    const referencedIndex = sceneIndexByAlias.get(reference);
    if (referencedIndex === undefined) {
      issues.push({
        code: 'unknown_continuity_scene',
        message: `Continuity reference "${reference}" does not resolve to a sidecar scene.`,
        sceneId: canonicalSceneId(sceneIndex),
        sceneIndex,
        questions: ['Remove the invalid continuity link or regenerate this scene intent.'],
      });
      continue;
    }
    if (referencedIndex >= sceneIndex) {
      issues.push({
        code: 'forward_continuity_scene',
        message: `Continuity reference "${reference}" must point to an earlier scene.`,
        sceneId: canonicalSceneId(sceneIndex),
        sceneIndex,
        questions: ['Choose an earlier scene as the continuity source.'],
      });
      continue;
    }
    resolved.push(canonicalSceneId(referencedIndex));
  }
  return uniqueStrings(resolved);
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

export function buildScriptShotPlan(input: BuildScriptShotPlanInput): ScriptShotPlanBuildResult {
  const sidecar = parseScriptSidecar(input.sidecar);
  const profile = parseProductionCapabilityProfile(input.profile);
  const tier = input.tier ?? profile.preferences.defaultPlanTier;
  const issues: ScriptShotPlanIssue[] = [];
  const sceneIndexByAlias = new Map<string, number>();

  sidecar.scenes.forEach((scene, sceneIndex) => {
    const sceneId = canonicalSceneId(sceneIndex);
    sceneIndexByAlias.set(sceneId, sceneIndex);
    const existingIndex = sceneIndexByAlias.get(scene.generationUnitId);
    if (existingIndex !== undefined && existingIndex !== sceneIndex) {
      issues.push({
        code: 'duplicate_generation_unit_id',
        message: `Generation unit "${scene.generationUnitId}" is shared by multiple scenes.`,
        sceneId,
        sceneIndex,
        sceneTitle: scene.title,
        questions: ['Regenerate the script with one unique generation unit per scene.'],
      });
    } else {
      sceneIndexByAlias.set(scene.generationUnitId, sceneIndex);
    }
  });

  const scenePlans: ShotPlan[] = [];
  sidecar.scenes.forEach((scene, sceneIndex) => {
    const sceneId = canonicalSceneId(sceneIndex);
    if (!scene.shotIntent) {
      issues.push({
        code: 'missing_shot_intent',
        message: 'This saved scene predates production-aware script generation.',
        sceneId,
        sceneIndex,
        sceneTitle: scene.title,
        questions: ['Regenerate or revise this script once so ThinkForge can author its shot intent.'],
      });
      return;
    }

    const continuity = {
      ...scene.shotIntent.continuity,
      previousSceneIds: continuityForScene(
        sceneIndex,
        scene.shotIntent.continuity.previousSceneIds,
        sceneIndexByAlias,
        issues,
      ),
    };
    const resolution = resolveSceneShotPlan({
      profile,
      tier,
      intent: {
        sceneId,
        sidecarSceneIndex: sceneIndex,
        generationUnitId: scene.generationUnitId,
        durationSec: scene.durationSeconds,
        aspectRatio: input.aspectRatio,
        ...scene.shotIntent,
        continuity,
      },
    });

    if (resolution.status === 'needs-user-input') {
      resolution.blockers.forEach((blocker) => issues.push({
        code: blocker.code,
        message: blocker.message,
        sceneId,
        sceneIndex,
        sceneTitle: scene.title,
        questions: [...resolution.questions],
      }));
      return;
    }
    scenePlans.push(resolution.plan);
  });

  if (issues.length > 0) return { status: 'needs-user-input', plan: null, issues };

  const plan = optimizeScriptShotPlans(scenePlans);
  addPlanLimitIssues(plan, profile, issues);
  return issues.length > 0
    ? { status: 'needs-user-input', plan: null, issues }
    : { status: 'ready', plan, issues: [] };
}
