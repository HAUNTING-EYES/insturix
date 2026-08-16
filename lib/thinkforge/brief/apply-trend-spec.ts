import {
  deriveFormat,
  type BriefTrendChoice,
  type BriefTrendConstraint,
  type BriefTrendCopyField,
  type ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';
import { parseTrendSpec, type TrendInvariant, type TrendSpec, type TrendVariable } from '../schemas/trend-spec';

const TREND_DURATION_CONFIDENCE = 0.92;

export interface ApplyTrendSpecToBriefInput {
  brief: ProductionBrief;
  trendSpec: unknown;
}

export class ThinkForgeTrendDurationError extends Error {
  readonly code = 'TREND_DURATION_INCOMPATIBLE';

  constructor(
    readonly requestedDurationSec: number,
    readonly naturalDurationSec: number,
  ) {
    super(
      `The selected trend needs ${naturalDurationSec}s, but the explicitly requested output is `
      + `${requestedDurationSec}s. Increase the duration or choose a shorter trend.`,
    );
    this.name = 'ThinkForgeTrendDurationError';
  }
}

function roundSeconds(ms: number): number {
  return Math.round((ms / 1000) * 1000) / 1000;
}

function idPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function trendSectionEndMs(spec: TrendSpec, sectionEnd: number, maxSlotEnd: number): number {
  if (spec.alignmentFrame === 'beat-space') return sectionEnd;
  if (maxSlotEnd <= 0) return spec.beatGrid.totalMs;
  return (sectionEnd / maxSlotEnd) * spec.beatGrid.totalMs;
}

function durationBoundariesSec(spec: TrendSpec): number[] {
  const maxSlotEnd = Math.max(...spec.beatGrid.sections.map((section) => section.end), 0);
  const boundaries = spec.beatGrid.sections
    .map((section) => trendSectionEndMs(spec, section.end, maxSlotEnd))
    .filter((ms) => Number.isFinite(ms) && ms > 0)
    .map((ms) => Math.min(ms, spec.beatGrid.totalMs))
    .concat(spec.beatGrid.totalMs)
    .map(roundSeconds);

  return Array.from(new Set(boundaries)).sort((a, b) => a - b);
}

function resolveTrendDuration(
  spec: TrendSpec,
  confirmedDurationSec?: number | null,
): {
  outputDurationSec: number;
  selectedDurationSec: number;
  applicationMode: 'full_output' | 'embedded_motif';
  warnings: string[];
} {
  const natural = roundSeconds(spec.beatGrid.totalMs);
  if (confirmedDurationSec === undefined || confirmedDurationSec === null) {
    return {
      outputDurationSec: natural,
      selectedDurationSec: natural,
      applicationMode: 'full_output',
      warnings: [],
    };
  }

  if (!Number.isFinite(confirmedDurationSec) || confirmedDurationSec <= 0) {
    throw new Error('Confirmed targetDurationSec must be a finite positive number');
  }
  if (confirmedDurationSec < natural) {
    throw new ThinkForgeTrendDurationError(confirmedDurationSec, natural);
  }
  if (Math.abs(confirmedDurationSec - natural) <= 0.001) {
    return {
      outputDurationSec: confirmedDurationSec,
      selectedDurationSec: natural,
      applicationMode: 'full_output',
      warnings: [],
    };
  }
  return {
    outputDurationSec: confirmedDurationSec,
    selectedDurationSec: natural,
    applicationMode: 'embedded_motif',
    warnings: ['explicit_duration_preserved_trend_used_as_motif'],
  };
}

function copyField(slot: TrendSpec['copyFormula']['slots'][number]): BriefTrendCopyField {
  return {
    id: slot.id,
    role: slot.role,
    template: slot.template,
    ...(slot.maxChars !== undefined ? { maxChars: slot.maxChars } : {}),
  };
}

function constraintFromInvariant(invariant: TrendInvariant, index: number): BriefTrendConstraint {
  return {
    id: `trend_${index + 1}_${idPart(invariant.layer)}_${idPart(invariant.feature)}`,
    layer: invariant.layer,
    feature: invariant.feature,
    ...(invariant.value !== undefined ? { value: invariant.value } : {}),
    ...(invariant.dist ? { dist: invariant.dist } : {}),
    support: invariant.support,
    ...(invariant.anchor ? { anchor: invariant.anchor } : {}),
  };
}

function choiceFromVariable(variable: TrendVariable, index: number): BriefTrendChoice {
  return {
    id: `trend_choice_${index + 1}_${idPart(variable.layer)}_${idPart(variable.feature)}`,
    layer: variable.layer,
    feature: variable.feature,
    ...(variable.freedomRange ? { freedomRange: variable.freedomRange } : {}),
  };
}

export function applyTrendSpecToBrief(input: ApplyTrendSpecToBriefInput): ProductionBrief {
  const spec = parseTrendSpec(input.trendSpec);
  const existingConfirmed = new Set(input.brief.resolution.confirmed);
  const confirmedDuration = existingConfirmed.has('targetDurationSec')
    ? input.brief.output.targetDurationSec
    : null;
  const duration = resolveTrendDuration(spec, confirmedDuration);
  const naturalDurationSec = roundSeconds(spec.beatGrid.totalMs);
  const inferred = new Set(input.brief.resolution.inferred);

  if (!existingConfirmed.has('targetDurationSec')) inferred.add('targetDurationSec');

  const output = {
    ...input.brief.output,
    targetDurationSec: duration.outputDurationSec,
  };

  return {
    ...input.brief,
    output: {
      ...output,
      format: deriveFormat(output, input.brief.sourceDurationSec),
    },
    resolution: {
      ...input.brief.resolution,
      inferred: Array.from(inferred),
      fieldConfidence: {
        ...input.brief.resolution.fieldConfidence,
        targetDurationSec: existingConfirmed.has('targetDurationSec')
          ? input.brief.resolution.fieldConfidence.targetDurationSec
          : TREND_DURATION_CONFIDENCE,
      },
    },
    trend: {
      trendId: spec.trendId,
      alignmentFrame: spec.alignmentFrame,
      applicationMode: duration.applicationMode,
      naturalDurationSec,
      selectedDurationSec: duration.selectedDurationSec,
      durationBoundariesSec: durationBoundariesSec(spec),
      copyFields: spec.copyFormula.slots.map(copyField),
      constraints: spec.invariants.map(constraintFromInvariant),
      choices: spec.variables.map(choiceFromVariable),
      performanceScript: spec.performanceScript,
      ...(spec.copyFormula.hashtags ? { hashtags: spec.copyFormula.hashtags } : {}),
      ...(duration.warnings.length > 0 ? { warnings: duration.warnings } : {}),
    },
  };
}
