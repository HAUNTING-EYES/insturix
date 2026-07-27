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
  requestedDurationSec?: number | null;
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

function selectedDurationSec(spec: TrendSpec, requestedDurationSec?: number | null): { selected: number; warnings: string[] } {
  const natural = roundSeconds(spec.beatGrid.totalMs);
  const boundaries = durationBoundariesSec(spec);
  const requested = typeof requestedDurationSec === 'number' && Number.isFinite(requestedDurationSec) && requestedDurationSec > 0
    ? requestedDurationSec
    : natural;
  const selected = boundaries.find((boundary) => boundary >= requested) ?? natural;
  const warnings: string[] = [];

  if (requested > natural) {
    warnings.push('requested_duration_exceeds_known_trend_sections');
  } else if (Math.abs(selected - requested) > 0.001) {
    warnings.push('requested_duration_snapped_to_section_boundary');
  }

  return { selected, warnings };
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
  const requestedDuration = input.requestedDurationSec
    ?? (existingConfirmed.has('targetDurationSec') ? input.brief.output.targetDurationSec : null);
  const duration = selectedDurationSec(spec, requestedDuration);
  const naturalDurationSec = roundSeconds(spec.beatGrid.totalMs);
  const inferred = new Set(input.brief.resolution.inferred);

  if (!existingConfirmed.has('targetDurationSec')) inferred.add('targetDurationSec');

  const output = {
    ...input.brief.output,
    targetDurationSec: duration.selected,
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
      naturalDurationSec,
      selectedDurationSec: duration.selected,
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
