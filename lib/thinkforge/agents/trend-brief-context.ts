import type {
  BriefTrendChoice,
  BriefTrendConstraint,
  BriefTrendCopyField,
  ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';

function formatSeconds(value: number): string {
  return Number.isInteger(value) ? `${value}s` : `${Number(value.toFixed(3))}s`;
}

function formatBoundaries(boundaries: number[]): string {
  return boundaries.length > 0 ? boundaries.map(formatSeconds).join(', ') : 'none supplied';
}

function formatCopyField(field: BriefTrendCopyField): string {
  const max = typeof field.maxChars === 'number' ? `, max ${field.maxChars} chars` : '';
  return `- ${field.id} (${field.role}${max}): ${field.template}`;
}

function formatConstraint(constraint: BriefTrendConstraint): string {
  const value = constraint.value !== undefined ? ` value=${String(constraint.value)}` : '';
  const dist = constraint.dist ? ` dist(mean=${constraint.dist.mean}, sd=${constraint.dist.sd})` : '';
  const anchor = constraint.anchor
    ? ` anchor=${[constraint.anchor.sectionId, constraint.anchor.beat !== undefined ? `beat ${constraint.anchor.beat}` : undefined]
      .filter(Boolean)
      .join('/')}`
    : '';
  return `- ${constraint.id}: ${constraint.layer}.${constraint.feature}${value}${dist}; support=${constraint.support}${anchor}`;
}

function formatChoice(choice: BriefTrendChoice): string {
  const range = Array.isArray(choice.freedomRange)
    ? choice.freedomRange.join(', ')
    : choice.freedomRange && typeof choice.freedomRange === 'object'
      ? `min=${choice.freedomRange.min ?? 'open'}, max=${choice.freedomRange.max ?? 'open'}`
      : 'open';
  return `- ${choice.id}: ${choice.layer}.${choice.feature}; allowed range/options: ${range}`;
}

export function formatTrendBriefForPrompt(productionBrief?: ProductionBrief | null): string {
  const trend = productionBrief?.trend;
  if (!trend) return '';
  const outputDuration = productionBrief.output.targetDurationSec;
  const timingRule = trend.applicationMode === 'embedded_motif'
    ? `- Apply the ${formatSeconds(trend.selectedDurationSec)} trend timing once as a bounded motif inside the `
      + `${outputDuration === null || outputDuration === undefined ? 'larger output' : `${formatSeconds(outputDuration)} output`}. `
      + 'Do not repeat, stretch, or pad the motif to fill the full runtime.'
    : '- The TrendSpec timing owns the full output. Preserve its whole-section boundaries exactly.';

  const lines = [
    '<trend_brief source="production_brief">',
    `Trend ID: ${trend.trendId}`,
    `Alignment frame: ${trend.alignmentFrame}`,
    `Timing application: ${trend.applicationMode}.`,
    `Duration: natural ${formatSeconds(trend.naturalDurationSec)}, selected ${formatSeconds(trend.selectedDurationSec)}.`,
    `Whole-section duration boundaries: ${formatBoundaries(trend.durationBoundariesSec)}.`,
    '',
    'Authoring rules:',
    '- Treat copy slots as required semantic beats, not visible labels.',
    '- Preserve invariants as creative constraints; do not invent unsupported trend metrics.',
    '- Use variables as the safe user-choice surface, not as final render instructions.',
    '- Never change the final output runtime to match the trend.',
    timingRule,
  ];

  if (trend.copyFields.length > 0) {
    lines.push('', 'Copy slots:', ...trend.copyFields.map(formatCopyField));
  }

  if (trend.constraints.length > 0) {
    lines.push('', 'Invariants:', ...trend.constraints.map(formatConstraint));
  }

  if (trend.choices.length > 0) {
    lines.push('', 'User choices to preserve/surface:', ...trend.choices.map(formatChoice));
  }

  if (trend.performanceScript.trim()) {
    lines.push('', 'Performance script:', trend.performanceScript.trim());
  }

  if (trend.hashtags?.length) {
    lines.push('', `Suggested trend hashtags: ${trend.hashtags.join(' ')}`);
  }

  if (trend.warnings?.length) {
    lines.push('', `Trend warnings: ${trend.warnings.join(', ')}`);
  }

  lines.push('</trend_brief>');
  return lines.join('\n');
}
