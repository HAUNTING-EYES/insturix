import type { ContentShape, ContentStructureSignature } from './recipe-types';

export type EncodingWireKey =
  | 'literal'
  | 'length'
  | 'sweep'
  | 'slope'
  | 'position'
  | 'valence'
  | 'strike'
  | 'pair'
  | 'emphasis'
  | 'area';

export interface EncodingWireDefinition {
  key: EncodingWireKey;
  visualVariable: 'glyph-text' | 'length-size' | 'angle-sweep' | 'orientation-slope' | 'position' | 'hue' | 'lightness-line' | 'connector-position' | 'size-contrast' | 'area';
  licensingFact: string;
  realizedVia: 'glyph-run' | 'rect' | 'arc' | 'line-polyline' | 'layout-position' | 'tint' | 'line' | 'connector' | 'type-scale' | 'area-mark';
}

export const ENCODING_WIRE_TABLE: readonly EncodingWireDefinition[] = [
  { key: 'literal', visualVariable: 'glyph-text', licensingFact: 'any-value-or-phrase', realizedVia: 'glyph-run' },
  { key: 'length', visualVariable: 'length-size', licensingFact: 'comparable-magnitude', realizedVia: 'rect' },
  { key: 'sweep', visualVariable: 'angle-sweep', licensingFact: 'bounded-proportion', realizedVia: 'arc' },
  { key: 'slope', visualVariable: 'orientation-slope', licensingFact: 'ordered-series', realizedVia: 'line-polyline' },
  { key: 'position', visualVariable: 'position', licensingFact: 'ordering-or-timeline', realizedVia: 'layout-position' },
  { key: 'valence', visualVariable: 'hue', licensingFact: 'polarity', realizedVia: 'tint' },
  { key: 'strike', visualVariable: 'lightness-line', licensingFact: 'negation-or-refutation', realizedVia: 'line' },
  { key: 'pair', visualVariable: 'connector-position', licensingFact: 'directional-transition', realizedVia: 'connector' },
  { key: 'emphasis', visualVariable: 'size-contrast', licensingFact: 'salience-or-hierarchy', realizedVia: 'type-scale' },
  { key: 'area', visualVariable: 'area', licensingFact: 'very-large-comparable-magnitude', realizedVia: 'area-mark' },
] as const;

export type NumericEncodingValueKind =
  | 'integer'
  | 'decimal'
  | 'tiny-decimal'
  | 'percent'
  | 'currency'
  | 'fraction'
  | 'ratio'
  | 'magnitude'
  | 'signed'
  | 'range'
  | 'static';

export interface NumericEncodingInput {
  value: unknown;
  label?: unknown;
  prefix?: unknown;
  suffix?: unknown;
  evidence?: ContentStructureSignature['evidence'] | Record<string, unknown>;
}

export interface NumericEncodingFacts {
  exactText: string;
  valueKind: NumericEncodingValueKind;
  hasMagnitude: boolean;
  boundedProportion: boolean;
  comparableMagnitude: boolean;
  normalizedPercent?: number;
  polarity?: 'positive' | 'negative';
  negated: boolean;
  salience: number;
  canCountUp: boolean;
  licensingFacts: string[];
}

export interface NumericEncodingCandidate {
  id: string;
  encodingKey: string;
  wires: EncodingWireKey[];
  primaryWire: 'literal' | 'length' | 'sweep';
  renderKind: 'text' | 'data-viz';
  encodingChannel?: 'length' | 'sweep';
  dataValues?: string;
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface NumericEncodingSelection {
  facts: NumericEncodingFacts;
  licensedWireKeys: EncodingWireKey[];
  candidates: NumericEncodingCandidate[];
  selected: NumericEncodingCandidate;
}

export interface NumericEncodingSelectionOptions {
  signalEnergy?: number;
  visualRisk?: number;
  formality?: number;
  recentEncodingKeys?: string[];
  candidateLayerScores?: Record<string, NumericEncodingCandidateLayerScores>;
}

export interface NumericEncodingCandidateLayerScores {
  legibility?: number | null;
  aesthetic?: number | null;
  composite?: number | null;
  failsLegibilityFloor?: boolean;
}

const CURRENCY_PREFIX_RE = /^[$\u20ac\u00a3\u00a5\u20b9]+/;
const FRACTION_RE = /^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;
const RATIO_RE = /^([+-]?\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
const MAGNITUDE_SUFFIX_RE = /^[$\u20ac\u00a3\u00a5\u20b9]?\d[\d,]*\.?\d*[KMBTkmbtxX]$/;

export function analyzeNumericEncodingFacts(input: NumericEncodingInput): NumericEncodingFacts {
  const raw = String(input.value ?? '').trim();
  const compact = raw.replace(/\s/g, '');
  const evidence = input.evidence ?? {};
  const valueKind = inferNumericValueKind(compact);
  const numericValue = parseNumericScalar(compact);
  const normalizedPercent = parseBoundedPercent(compact, evidence);
  const boundedProportion = normalizedPercent !== undefined || isEvidenceTrue(evidence, 'proportionAffordance');
  const polarity = resolvePolarity(evidence);
  const negated = isEvidenceTrue(evidence, 'negationAffordance')
    || isEvidenceTrue(evidence, 'negated')
    || isEvidenceTrue(evidence, 'refuted');
  const salience = typeof evidence.salience === 'number' && isFinite(evidence.salience)
    ? clamp01(evidence.salience)
    : 0;
  const hasMagnitude = numericValue !== undefined || normalizedPercent !== undefined;
  const comparableMagnitude = boundedProportion && normalizedPercent !== undefined;
  const exactText = `${input.prefix ?? ''}${raw}${input.suffix ?? ''}`;
  const canCountUp = valueKind === 'integer'
    || valueKind === 'decimal'
    || valueKind === 'currency'
    || (valueKind === 'percent' && Math.abs(numericValue ?? 0) >= 1);

  return {
    exactText,
    valueKind,
    hasMagnitude,
    boundedProportion,
    comparableMagnitude,
    normalizedPercent,
    polarity,
    negated,
    salience,
    canCountUp,
    licensingFacts: [
      'any-value-or-phrase',
      ...(boundedProportion ? ['bounded-proportion'] : []),
      ...(comparableMagnitude ? ['comparable-magnitude'] : []),
      ...(polarity ? ['polarity'] : []),
      ...(negated ? ['negation-or-refutation'] : []),
      'salience-or-hierarchy',
    ],
  };
}

export function enumerateNumericEncodingCandidates(
  input: NumericEncodingInput,
  options: NumericEncodingSelectionOptions = {},
): NumericEncodingSelection {
  const facts = analyzeNumericEncodingFacts(input);
  const licensedWireKeys = licensedNumericWires(facts);
  const baseWires = (primaryWire: NumericEncodingCandidate['primaryWire']): EncodingWireKey[] => {
    const wires: EncodingWireKey[] = ['literal'];
    if (primaryWire !== 'literal') wires.push(primaryWire);
    if (facts.polarity) wires.push('valence');
    if (facts.negated) wires.push('strike');
    wires.push('emphasis');
    return wires;
  };

  const candidates: NumericEncodingCandidate[] = [
    makeCandidate({
      primaryWire: 'literal',
      renderKind: 'text',
      wires: baseWires('literal'),
      facts,
      options,
    }),
  ];

  if (licensedWireKeys.includes('sweep') && facts.normalizedPercent !== undefined) {
    candidates.push(makeCandidate({
      primaryWire: 'sweep',
      renderKind: 'data-viz',
      encodingChannel: 'sweep',
      dataValues: formatDatum(facts.normalizedPercent),
      wires: baseWires('sweep'),
      facts,
      options,
    }));
  }

  if (licensedWireKeys.includes('length') && facts.normalizedPercent !== undefined) {
    candidates.push(makeCandidate({
      primaryWire: 'length',
      renderKind: 'data-viz',
      encodingChannel: 'length',
      dataValues: `${formatDatum(facts.normalizedPercent)},100`,
      wires: baseWires('length'),
      facts,
      options,
    }));
  }

  const sorted = candidates.sort((a, b) => b.score - a.score || a.encodingKey.localeCompare(b.encodingKey));

  return {
    facts,
    licensedWireKeys,
    candidates: sorted,
    selected: sorted[0],
  };
}

export function selectNumericEncodingCandidate(
  input: NumericEncodingInput,
  options: NumericEncodingSelectionOptions = {},
): NumericEncodingSelection {
  return enumerateNumericEncodingCandidates(input, options);
}

export function parseNumericEncodingDatum(value: unknown): number | null {
  const compact = String(value ?? '').trim().replace(/\s/g, '');
  if (!compact) return null;

  const fraction = compact.match(FRACTION_RE);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (isFinite(numerator) && isFinite(denominator) && denominator !== 0) {
      return (numerator / denominator) * 100;
    }
  }

  const stripped = compact
    .replace(CURRENCY_PREFIX_RE, '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .replace(/[KMBTkmbtxX]$/, '');
  const parsed = Number(stripped);
  return isFinite(parsed) ? parsed : null;
}

function licensedNumericWires(facts: NumericEncodingFacts): EncodingWireKey[] {
  return [
    'literal',
    ...(facts.comparableMagnitude ? ['length' as const] : []),
    ...(facts.boundedProportion && facts.normalizedPercent !== undefined ? ['sweep' as const] : []),
    ...(facts.polarity ? ['valence' as const] : []),
    ...(facts.negated ? ['strike' as const] : []),
    'emphasis',
  ];
}

function makeCandidate(args: {
  primaryWire: NumericEncodingCandidate['primaryWire'];
  renderKind: NumericEncodingCandidate['renderKind'];
  encodingChannel?: NumericEncodingCandidate['encodingChannel'];
  dataValues?: string;
  wires: EncodingWireKey[];
  facts: NumericEncodingFacts;
  options: NumericEncodingSelectionOptions;
}): NumericEncodingCandidate {
  const encodingKey = args.wires.join('+');
  const scoreBreakdown = scoreNumericCandidate(args.primaryWire, encodingKey, args.facts, args.options);
  const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    id: `numeric:${encodingKey}`,
    encodingKey,
    wires: args.wires,
    primaryWire: args.primaryWire,
    renderKind: args.renderKind,
    encodingChannel: args.encodingChannel,
    dataValues: args.dataValues,
    score: Number(score.toFixed(4)),
    scoreBreakdown,
  };
}

function scoreNumericCandidate(
  primaryWire: NumericEncodingCandidate['primaryWire'],
  encodingKey: string,
  facts: NumericEncodingFacts,
  options: NumericEncodingSelectionOptions,
): Record<string, number> {
  const signalEnergy = clamp01(options.signalEnergy ?? 0);
  const visualRisk = clamp01(options.visualRisk ?? 0);
  const formality = clamp01(options.formality ?? 0);
  const repeated = options.recentEncodingKeys?.includes(encodingKey) === true;
  const effectiveness = primaryWire === 'length' ? 0.82 : primaryWire === 'sweep' ? 0.76 : 0.62;
  const boundedFit = facts.boundedProportion && primaryWire === 'sweep' ? 0.12 : 0;
  const comparableFit = facts.comparableMagnitude && primaryWire === 'length' ? 0.05 : 0;
  const exactness = primaryWire === 'literal' ? 0.2 : facts.valueKind === 'fraction' ? -0.1 : 0;
  const energyFit = signalEnergy > 0.65 && primaryWire !== 'literal' ? 0.08 : 0;
  const calmFit = formality > 0.7 && primaryWire === 'literal' ? 0.04 : 0;
  const riskPenalty = visualRisk > 0.65 && primaryWire !== 'literal' ? -0.12 : 0;
  const repetitionPenalty = repeated && primaryWire !== 'literal' ? -1 : repeated ? -0.35 : 0;
  const layerScores = options.candidateLayerScores?.[encodingKey];
  const legibility = typeof layerScores?.legibility === 'number' && isFinite(layerScores.legibility)
    ? (layerScores.legibility - 0.8) * 0.22
    : 0;
  const aesthetic = typeof layerScores?.aesthetic === 'number' && isFinite(layerScores.aesthetic)
    ? (layerScores.aesthetic - 0.75) * 0.18
    : 0;
  const composite = typeof layerScores?.composite === 'number' && isFinite(layerScores.composite)
    ? (layerScores.composite - 0.8) * 0.2
    : 0;
  const legibilityFloorPenalty = layerScores?.failsLegibilityFloor === true ? -1.5 : 0;

  return {
    effectiveness,
    boundedFit,
    comparableFit,
    exactness,
    energyFit,
    calmFit,
    riskPenalty,
    repetitionPenalty,
    legibility,
    aesthetic,
    composite,
    legibilityFloorPenalty,
  };
}

function inferNumericValueKind(compact: string): NumericEncodingValueKind {
  if (FRACTION_RE.test(compact)) return 'fraction';
  if (RATIO_RE.test(compact)) return 'ratio';
  if (MAGNITUDE_SUFFIX_RE.test(compact)) return 'magnitude';
  if (/%$/.test(compact)) return 'percent';
  if (CURRENCY_PREFIX_RE.test(compact)) return 'currency';
  if (/^[+-]/.test(compact) || /^\(.+\)$/.test(compact)) return 'signed';
  if (/^\d[\d,.]*-\d[\d,.]*$/.test(compact)) return 'range';
  const numeric = Number(compact.replace(/,/g, ''));
  if (isFinite(numeric)) {
    if (String(compact).includes('.') && Math.abs(numeric) < 1) return 'tiny-decimal';
    if (String(compact).includes('.')) return 'decimal';
    return 'integer';
  }
  return 'static';
}

function parseNumericScalar(compact: string): number | undefined {
  const parsed = parseNumericEncodingDatum(compact);
  return parsed === null ? undefined : parsed;
}

function parseBoundedPercent(
  compact: string,
  evidence: NumericEncodingInput['evidence'] = {},
): number | undefined {
  const fraction = compact.match(FRACTION_RE);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (isFinite(numerator) && isFinite(denominator) && denominator !== 0) {
      return clampPercent((numerator / denominator) * 100);
    }
  }

  if (/%$/.test(compact)) {
    const parsed = parseNumericEncodingDatum(compact);
    return parsed === null ? undefined : clampPercent(parsed);
  }

  const quantityKind = String(evidence?.quantityKind ?? '').toLowerCase();
  const denominator = typeof evidence?.denominator === 'number' ? evidence.denominator : undefined;
  const parsed = parseNumericEncodingDatum(compact);
  if ((quantityKind === 'percent' || quantityKind === 'percentage') && parsed !== null) {
    return clampPercent(parsed);
  }
  if ((quantityKind === 'fraction' || quantityKind === 'ratio' || isEvidenceTrue(evidence, 'boundedRange')) && parsed !== null && denominator && denominator !== 0) {
    return clampPercent((parsed / denominator) * 100);
  }
  return undefined;
}

function resolvePolarity(evidence: NumericEncodingInput['evidence'] = {}): NumericEncodingFacts['polarity'] {
  const polarity = String(evidence?.polarity ?? '').toLowerCase();
  if (['positive', 'gain', 'up', 'true'].includes(polarity)) return 'positive';
  if (['negative', 'loss', 'down', 'false'].includes(polarity)) return 'negative';
  return undefined;
}

function isEvidenceTrue(evidence: NumericEncodingInput['evidence'] = {}, key: string): boolean {
  return evidence?.[key] === true;
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatDatum(value: number): string {
  return Number(value.toFixed(3)).toString();
}
