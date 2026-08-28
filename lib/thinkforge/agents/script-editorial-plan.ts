import type { BriefOutputSpec } from '@/lib/editron/production-brief/production-brief';
import {
  selectTechniques,
  type TechniqueResult,
} from '../data/writing-graph-query';
import {
  resolveThinkForgeSourceLedgerEvidenceBoundary,
  type SourceLedger,
  type ThinkForgeSourceLedgerEvidenceBoundary,
} from '../provenance/source-ledger';
import type { ThinkForgeContentSignalProfile } from '../signals';
import {
  createUnspecifiedAudiovisualIntent,
  type ThinkForgeAudiovisualIntent,
} from '../schemas/audiovisual-intent';

export type ScriptNarrationMode =
  | 'anchor'
  | 'complement'
  | 'counterpoint'
  | 'minimal'
  | 'none'
  | 'standard_voiceover';

export type ScriptEvidenceNarrativeMode =
  | 'creative_without_authorized_evidence'
  | 'source_bounded_inquiry'
  | 'bounded_evidence_argument';

/**
 * The semantic form selected at intake. It intentionally does not describe whether facts are
 * true or evidence is available: source-ledger claim validation owns those decisions.
 */
export type ScriptEvidenceNarrativeIntent = 'creative' | 'record_led';

export type ScriptEvidenceNarrativeSelection = ScriptEvidenceNarrativeIntent | 'legacy_source_derived';

export interface ScriptEvidenceNarrativePlan {
  mode: ScriptEvidenceNarrativeMode;
  selection: ScriptEvidenceNarrativeSelection;
  sourceBoundary: ThinkForgeSourceLedgerEvidenceBoundary;
  requirements: string[];
}

export interface ScriptTechniqueDirective {
  id: string;
  guidance: string;
  avoid: string[];
  sourceLines: [number, number];
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
  audiovisualIntent: ThinkForgeAudiovisualIntent;
  narration: ScriptNarrationPlan;
  evidenceNarrative: ScriptEvidenceNarrativePlan;
  visualVerbal: {
    onScreenTextRole: 'may_replace_narration' | 'selective_complement';
    defaultUsage: 'selective' | 'omit';
    duplicationPolicy: 'forbidden';
    factualTextPolicy: 'source_only';
    doctrineSourceLines: Array<[number, number]>;
  };
  structure: {
    hierarchyPolicy: 'content_led';
    actPolicy: string;
    sceneBoundaryPolicy: string[];
    recommendedTechniques: ScriptTechniqueDirective[];
  };
}

export interface ScriptEditorialPlanInput {
  productionBrief?: {
    output: Pick<BriefOutputSpec, 'targetDurationSec'>;
  } | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
  sourceLedger?: SourceLedger | null;
  /** Supplied by semantic script intake. Omitted legacy callers preserve their existing behavior. */
  evidenceNarrativeIntent?: ScriptEvidenceNarrativeIntent;
  /** Explicit production constraints resolved by semantic intake; never a video-type label. */
  audiovisualIntent?: ThinkForgeAudiovisualIntent;
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
  none: {
    minimumModeDensity: 0,
    target: 0,
    comfortableMaximum: 0,
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
    sourceLines: technique.sourceLines,
  };
}

function selectStructureTechniques(
  signals: ThinkForgeContentSignalProfile['profile']['signals'] | undefined,
  targetDurationSeconds: number,
): ScriptTechniqueDirective[] {
  if (!signals) return [];
  return selectTechniques(
    signals,
    'structure',
    3,
    targetDurationSeconds > 0 ? { wholePieceDurationSeconds: targetDurationSeconds } : undefined,
  )
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

function resolveEvidenceNarrativePlan(
  sourceLedger: SourceLedger | null | undefined,
  evidenceNarrativeIntent?: ScriptEvidenceNarrativeIntent,
): ScriptEvidenceNarrativePlan {
  const sourceBoundary = resolveThinkForgeSourceLedgerEvidenceBoundary(sourceLedger);
  const selection: ScriptEvidenceNarrativeSelection = evidenceNarrativeIntent ?? 'legacy_source_derived';
  if (!sourceLedger || sourceLedger.entries.length === 0) {
    return {
      mode: 'creative_without_authorized_evidence',
      selection,
      sourceBoundary,
      requirements: [
        'Do not present invented facts, proof, statistics, dates, testimonials, or named outcomes as true.',
        'Let the approved creative direction and requested format determine the narrative.',
      ],
    };
  }

  if (sourceBoundary === 'source_only' && selection !== 'creative') {
    return {
      mode: 'source_bounded_inquiry',
      selection,
      sourceBoundary,
      requirements: [
        'Build a record-led inquiry around what the authorised record directly establishes.',
        'Use scope, uncertainty, and unanswered questions as narrative turns without answering those questions with outside knowledge.',
        'Do not fill runtime with generic sector context, technical explanations, challenges, causes, benefits, forecasts, roadmaps, or comparisons absent from the record.',
        'Use supplied concrete evidence for visual progression; do not fabricate unavailable research or footage as fact.',
      ],
    };
  }

  if (sourceBoundary === 'source_only') {
    return {
      mode: 'creative_without_authorized_evidence',
      selection,
      sourceBoundary,
      requirements: [
        'Let the approved creative direction and requested format determine the narrative.',
        'Use source-ledger material only for factual claims it directly supports; creative narrative must not invent proof, outcomes, statistics, dates, testimonials, or named facts.',
        'Do not treat the existence of a brief, date, number, link, or source reference as an instruction to turn the work into a record-led inquiry.',
      ],
    };
  }

  return {
    mode: 'bounded_evidence_argument',
    selection,
    sourceBoundary,
    requirements: [
      'Lead with direct evidence, then make only narrow implications that remain inside the authorised record.',
      'Name the evidence boundary whenever an implication could be mistaken for a universal claim.',
      'Do not use authorised sources as permission for broader unsourced context or conclusions.',
    ],
  };
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
  const audiovisualIntent = input.audiovisualIntent ?? createUnspecifiedAudiovisualIntent();
  const graphNarrationMode = selectedNarration
    ? NARRATION_MODE_BY_TECHNIQUE[selectedNarration.id] ?? 'standard_voiceover'
    : 'standard_voiceover';
  const narrationMode = audiovisualIntent.audibleSpeech === 'forbidden'
    ? 'none'
    : graphNarrationMode;
  const rateGuidance = NARRATION_RATE_GUIDANCE[narrationMode];
  const narrationDirective = narrationMode === 'none' ? undefined : directive(selectedNarration);
  const recommendedStructures = selectStructureTechniques(signals, targetDurationSeconds);
  const evidenceNarrative = resolveEvidenceNarrativePlan(
    input.sourceLedger,
    input.evidenceNarrativeIntent,
  );

  return {
    runtime: hasExactRuntime
      ? {
          policy: 'exact',
          targetDurationSeconds,
          minimumDurationSeconds: targetDurationSeconds,
          maximumDurationSeconds: targetDurationSeconds,
        }
      : { policy: 'open' },
    audiovisualIntent,
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
    evidenceNarrative,
    visualVerbal: {
      onScreenTextRole: narrationMode === 'minimal' || narrationMode === 'none'
        ? 'may_replace_narration'
        : 'selective_complement',
      defaultUsage: narrationMode === 'minimal' || narrationMode === 'none' ? 'selective' : 'omit',
      duplicationPolicy: 'forbidden',
      factualTextPolicy: 'source_only',
      doctrineSourceLines: [[729, 741], [4051, 4060]],
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
