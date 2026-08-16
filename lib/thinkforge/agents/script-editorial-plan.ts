import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  selectTechniques,
  type TechniqueResult,
} from '../data/writing-graph-query';
import type { ThinkForgeContentSignalProfile } from '../signals';

export type ScriptDurationScope =
  | 'scene_only'
  | 'scene_transitions'
  | 'act_scene'
  | 'full_act_scene';

export type ScriptNarrationMode =
  | 'anchor'
  | 'complement'
  | 'counterpoint'
  | 'minimal'
  | 'standard_voiceover';

export interface ScriptTechniqueDirective {
  id: string;
  guidance: string;
  avoid: string[];
}

export interface ScriptEditorialPlan {
  runtime: {
    targetDurationSeconds: number;
    minimumDurationSeconds: number;
    maximumDurationSeconds: number;
  };
  narration: {
    mode: ScriptNarrationMode;
    targetWordsPerMinute: number;
    minimumWordsPerMinute: number;
    maximumWordsPerMinute: number;
    targetSpokenWords: number;
    minimumSpokenWords: number;
    maximumSpokenWords: number;
    selectedTechnique?: ScriptTechniqueDirective;
  };
  structure: {
    scope: ScriptDurationScope;
    actPolicy: string;
    sceneBoundaryPolicy: string[];
    selectedTechnique?: ScriptTechniqueDirective;
  };
}

export interface ScriptEditorialPlanInput {
  productionBrief?: Pick<ProductionBrief, 'output'> | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
}

interface NarrationRateBand {
  target: number;
  minimum: number;
  maximum: number;
}

const NARRATION_RATE_BANDS: Readonly<Record<ScriptNarrationMode, NarrationRateBand>> = {
  anchor: { target: 150, minimum: 130, maximum: 170 },
  complement: { target: 120, minimum: 100, maximum: 140 },
  counterpoint: { target: 100, minimum: 80, maximum: 120 },
  minimal: { target: 25, minimum: 0, maximum: 50 },
  standard_voiceover: { target: 150, minimum: 120, maximum: 170 },
};

const NARRATION_MODE_BY_TECHNIQUE: Readonly<Record<string, ScriptNarrationMode>> = {
  narration_anchor: 'anchor',
  narration_complement: 'complement',
  narration_counterpoint: 'counterpoint',
  narration_minimal: 'minimal',
};

function normalizedDurationSeconds(brief: ScriptEditorialPlanInput['productionBrief']): number {
  const value = brief?.output.targetDurationSec;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function durationScope(targetDurationSeconds: number): ScriptDurationScope {
  if (targetDurationSeconds >= 300) return 'full_act_scene';
  if (targetDurationSeconds >= 90) return 'act_scene';
  if (targetDurationSeconds >= 30) return 'scene_transitions';
  return 'scene_only';
}

function actPolicy(scope: ScriptDurationScope): string {
  switch (scope) {
    case 'full_act_scene':
      return 'Use explicit acts or sections with distinct narrative jobs. Their count follows the argument or story, never elapsed-time buckets.';
    case 'act_scene':
      return 'Group scenes into acts only at meaningful macro turns in the argument, story, or audience understanding.';
    case 'scene_transitions':
      return 'Plan transitions between adjacent scenes; do not add acts unless the material contains a genuine macro turn.';
    default:
      return 'Use scenes only. The duration does not justify an act hierarchy by itself.';
  }
}

function directive(technique: TechniqueResult | undefined): ScriptTechniqueDirective | undefined {
  if (!technique?.primary) return undefined;
  return {
    id: technique.id,
    guidance: technique.primary,
    avoid: technique.antiPatterns ?? [],
  };
}

function structureTechniqueFitsDuration(techniqueId: string, targetDurationSeconds: number): boolean {
  if (targetDurationSeconds <= 0) return true;
  if (techniqueId === 'problem_agitate_solve') return targetDurationSeconds <= 60;
  return true;
}

function selectStructureTechnique(
  signals: ThinkForgeContentSignalProfile['profile']['signals'] | undefined,
  targetDurationSeconds: number,
): TechniqueResult | undefined {
  if (!signals) return undefined;
  return selectTechniques(signals, 'structure', 5)
    .find((technique) => structureTechniqueFitsDuration(technique.id, targetDurationSeconds));
}

function selectNarrationTechnique(
  signals: ThinkForgeContentSignalProfile['profile']['signals'] | undefined,
): TechniqueResult | undefined {
  return signals ? selectTechniques(signals, 'narration_mode', 4)[0] : undefined;
}

function spokenWords(targetDurationSeconds: number, wordsPerMinute: number): number {
  return Math.round((targetDurationSeconds / 60) * wordsPerMinute);
}

/**
 * Resolve writing form from the accepted brief and content-signal graph. Duration activates
 * hierarchy and a total word envelope; it never decides how many editorial scenes exist.
 */
export function buildScriptEditorialPlan(input: ScriptEditorialPlanInput): ScriptEditorialPlan {
  const targetDurationSeconds = normalizedDurationSeconds(input.productionBrief);
  const signals = input.contentSignalProfile?.profile.signals;
  const selectedNarration = selectNarrationTechnique(signals);
  const narrationMode = selectedNarration
    ? NARRATION_MODE_BY_TECHNIQUE[selectedNarration.id] ?? 'standard_voiceover'
    : 'standard_voiceover';
  const rateBand = NARRATION_RATE_BANDS[narrationMode];
  const scope = durationScope(targetDurationSeconds);
  const selectedStructure = selectStructureTechnique(signals, targetDurationSeconds);
  const narrationDirective = directive(selectedNarration);
  const structureDirective = directive(selectedStructure);

  return {
    runtime: {
      targetDurationSeconds,
      minimumDurationSeconds: targetDurationSeconds,
      maximumDurationSeconds: targetDurationSeconds,
    },
    narration: {
      mode: narrationMode,
      targetWordsPerMinute: rateBand.target,
      minimumWordsPerMinute: rateBand.minimum,
      maximumWordsPerMinute: rateBand.maximum,
      targetSpokenWords: spokenWords(targetDurationSeconds, rateBand.target),
      minimumSpokenWords: spokenWords(targetDurationSeconds, rateBand.minimum),
      maximumSpokenWords: spokenWords(targetDurationSeconds, rateBand.maximum),
      ...(narrationDirective ? { selectedTechnique: narrationDirective } : {}),
    },
    structure: {
      scope,
      actPolicy: actPolicy(scope),
      sceneBoundaryPolicy: [
        'Start a new scene only when narrative purpose, argument stage, time or place, speaker mode, evidence unit, emotional beat, or visual treatment meaningfully changes.',
        'Never create, split, merge, or pad editorial scenes to satisfy a seconds-per-scene formula.',
        'Use beats for meaningful developments inside one editorial scene; technical render segments are not extra story beats.',
        'Keep provider compatibility and render-job segmentation out of the editorial hierarchy.',
      ],
      ...(structureDirective ? { selectedTechnique: structureDirective } : {}),
    },
  };
}
