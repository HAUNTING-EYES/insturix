import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  selectTechniques,
  type TechniqueResult,
} from '../data/writing-graph-query';
import type { ThinkForgeContentSignalProfile } from '../signals';

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

export type ScriptRuntimePlan =
  | { policy: 'open' }
  | {
      policy: 'exact';
      targetDurationSeconds: number;
      minimumDurationSeconds: number;
      maximumDurationSeconds: number;
    };

export type ScriptNarrationPlan = {
  mode: ScriptNarrationMode;
  targetWordsPerMinute: number;
  minimumWordsPerMinute: number;
  maximumWordsPerMinute: number;
  selectedTechnique?: ScriptTechniqueDirective;
} & (
  | { wordBudgetPolicy: 'open' }
  | {
      wordBudgetPolicy: 'exact';
      targetSpokenWords: number;
      minimumSpokenWords: number;
      maximumSpokenWords: number;
    }
);

export interface ScriptEditorialPlan {
  runtime: ScriptRuntimePlan;
  narration: ScriptNarrationPlan;
  structure: {
    hierarchyPolicy: 'content_led';
    actPolicy: string;
    sceneBoundaryPolicy: string[];
    recommendedTechniques: ScriptTechniqueDirective[];
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

function directive(technique: TechniqueResult | undefined): ScriptTechniqueDirective | undefined {
  if (!technique?.primary) return undefined;
  return {
    id: technique.id,
    guidance: technique.primary,
    avoid: technique.antiPatterns ?? [],
  };
}

function selectStructureTechniques(
  signals: ThinkForgeContentSignalProfile['profile']['signals'] | undefined,
): ScriptTechniqueDirective[] {
  if (!signals) return [];
  return selectTechniques(signals, 'structure', 3)
    .map(directive)
    .filter((technique): technique is ScriptTechniqueDirective => technique !== undefined);
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
 * Resolve writing form from the accepted brief and content-signal graph. Runtime sets the
 * production envelope; the approved creative direction and material determine hierarchy.
 */
export function buildScriptEditorialPlan(input: ScriptEditorialPlanInput): ScriptEditorialPlan {
  const targetDurationSeconds = normalizedDurationSeconds(input.productionBrief);
  const hasExactRuntime = targetDurationSeconds > 0;
  const signals = input.contentSignalProfile?.profile.signals;
  const selectedNarration = selectNarrationTechnique(signals);
  const narrationMode = selectedNarration
    ? NARRATION_MODE_BY_TECHNIQUE[selectedNarration.id] ?? 'standard_voiceover'
    : 'standard_voiceover';
  const rateBand = NARRATION_RATE_BANDS[narrationMode];
  const narrationDirective = directive(selectedNarration);
  const recommendedStructures = selectStructureTechniques(signals);

  return {
    runtime: hasExactRuntime
      ? {
          policy: 'exact',
          targetDurationSeconds,
          minimumDurationSeconds: targetDurationSeconds,
          maximumDurationSeconds: targetDurationSeconds,
        }
      : { policy: 'open' },
    narration: {
      mode: narrationMode,
      targetWordsPerMinute: rateBand.target,
      minimumWordsPerMinute: rateBand.minimum,
      maximumWordsPerMinute: rateBand.maximum,
      ...(hasExactRuntime
        ? {
            wordBudgetPolicy: 'exact' as const,
            targetSpokenWords: spokenWords(targetDurationSeconds, rateBand.target),
            minimumSpokenWords: spokenWords(targetDurationSeconds, rateBand.minimum),
            maximumSpokenWords: spokenWords(targetDurationSeconds, rateBand.maximum),
          }
        : { wordBudgetPolicy: 'open' as const }),
      ...(narrationDirective ? { selectedTechnique: narrationDirective } : {}),
    },
    structure: {
      hierarchyPolicy: 'content_led',
      actPolicy: 'The user-approved brief and selected idea own the creative direction. Use acts only for genuine macro turns in the argument, story, time, or audience understanding; runtime never creates or forbids acts.',
      sceneBoundaryPolicy: [
        'Start a new scene only when narrative purpose, argument stage, time or place, speaker mode, evidence unit, emotional beat, or visual treatment meaningfully changes.',
        'Never create, split, merge, or pad editorial scenes to satisfy a seconds-per-scene formula.',
        'Use beats for meaningful developments inside one editorial scene; technical render segments are not extra story beats.',
        'Keep provider compatibility and render-job segmentation out of the editorial hierarchy.',
      ],
      recommendedTechniques: recommendedStructures,
    },
  };
}
