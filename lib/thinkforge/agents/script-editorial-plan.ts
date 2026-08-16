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
  minimumModeWordsPerMinute: number;
  targetWordsPerMinute: number;
  comfortableMaximumWordsPerMinute: number;
  pacingConstraint: {
    severity: 'warning';
    overridable: true;
  };
  selectedTechnique?: ScriptTechniqueDirective;
} & (
  | { wordBudgetPolicy: 'open' }
  | {
      wordBudgetPolicy: 'guided';
      fullRuntimeMinimumSpokenWords: number;
      fullRuntimeReferenceSpokenWords: number;
      fullRuntimeComfortableMaximumSpokenWords: number;
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

interface NarrationRateGuidance {
  minimumModeDensity: number;
  target: number;
  comfortableMaximum: number;
}

// These are full-runtime mode boundaries, never per-scene or per-beat quotas. The knowledge
// base defines slow VO at 120 WPM and minimal narration at 0-50 WPM; 51 is therefore the
// lowest density that can still claim a non-minimal visual-verbal relationship.
const NARRATION_RATE_GUIDANCE: Readonly<Record<ScriptNarrationMode, NarrationRateGuidance>> = {
  anchor: {
    minimumModeDensity: 120,
    target: 150,
    comfortableMaximum: 170,
  },
  complement: {
    minimumModeDensity: 51,
    target: 120,
    comfortableMaximum: 170,
  },
  counterpoint: {
    minimumModeDensity: 51,
    target: 100,
    comfortableMaximum: 170,
  },
  minimal: {
    minimumModeDensity: 0,
    target: 25,
    comfortableMaximum: 50,
  },
  standard_voiceover: {
    minimumModeDensity: 120,
    target: 150,
    comfortableMaximum: 170,
  },
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
    ? Math.round(value * 1_000) / 1_000
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

function minimumSpokenWords(targetDurationSeconds: number, wordsPerMinute: number): number {
  return Math.ceil((targetDurationSeconds / 60) * wordsPerMinute);
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
  const rateGuidance = NARRATION_RATE_GUIDANCE[narrationMode];
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
      minimumModeWordsPerMinute: rateGuidance.minimumModeDensity,
      targetWordsPerMinute: rateGuidance.target,
      comfortableMaximumWordsPerMinute: rateGuidance.comfortableMaximum,
      pacingConstraint: {
        severity: 'warning',
        overridable: true,
      },
      ...(hasExactRuntime
        ? {
            wordBudgetPolicy: 'guided' as const,
            fullRuntimeMinimumSpokenWords: minimumSpokenWords(
              targetDurationSeconds,
              rateGuidance.minimumModeDensity,
            ),
            fullRuntimeReferenceSpokenWords: spokenWords(targetDurationSeconds, rateGuidance.target),
            fullRuntimeComfortableMaximumSpokenWords: spokenWords(
              targetDurationSeconds,
              rateGuidance.comfortableMaximum,
            ),
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
