import { deriveContentStructure } from '@/lib/editron/motion-graphics/engine/content-shape-analyzer';

interface EnrichMotionGraphicFactParamsOptions {
  signal: string;
  context: string;
  timestampMs?: number;
  frame?: number;
  source?: string;
}

interface NumericFact {
  exactText: string;
  value: number;
  index: number;
  endIndex: number;
  kind: 'percent' | 'fraction' | 'ratio' | 'currency' | 'rate' | 'magnitude' | 'number';
  unit?: string;
  denominator?: number;
  bounded?: boolean;
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  hundred: 100,
  thousand: 1000,
  million: 1000000,
  billion: 1000000000,
};

const CURRENCY_CLASS = '$\\u20ac\\u00a3\\u00a5\\u20b9';
const NUMERIC_TOKEN_RE = /[$\u20ac\u00a3\u00a5\u20b9]?\s*(?:\d[\d,]*(?:\.\d+)?(?:\s*[KMBTkmbt])?(?:\s*[%xX\u00d7])?|\d+(?:\/|:)\d+)|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion)\b/gi;

export function enrichMotionGraphicFactParams(
  params: Record<string, unknown>,
  options: EnrichMotionGraphicFactParamsOptions,
): void {
  const context = options.context.trim();
  if (!context) return;

  params.text = stringParam(params.text) ?? context;
  params.text_source = 'transcript';
  params.contextPhrase = stringParam(params.contextPhrase) ?? context;
  attachTranscriptSourceProof(params, context, options);

  if (options.signal === 'entity.number') {
    enrichNumericFacts(params, context);
    return;
  }

  if (options.signal === 'entity.name') {
    params.name = stringParam(params.name) ?? context;
    mergeSemanticAtoms(params, {
      identity: { name: context },
      evidencePhrase: context,
    });
    attachStructuredContentIfLicensed(params);
    return;
  }

  attachTextSemanticFacts(params, context);
}

function attachTranscriptSourceProof(
  params: Record<string, unknown>,
  context: string,
  options: EnrichMotionGraphicFactParamsOptions,
): void {
  if (objectParam(params.sourceSpan)) return;
  if (!Number.isFinite(options.timestampMs)) return;

  const timestampMs = options.timestampMs as number;
  params.contextStartMs = numberParam(params.contextStartMs) ?? timestampMs;
  params.targetWordStartMs = numberParam(params.targetWordStartMs) ?? timestampMs;
  if (Number.isFinite(options.frame)) {
    params.sourceFrame = numberParam(params.sourceFrame) ?? options.frame;
  }
  params.sourceSpan = {
    text: context,
    startMs: timestampMs,
    source: options.source ?? 'signal-event',
    ...(Number.isFinite(options.frame) ? { frame: options.frame } : {}),
  };
}

function enrichNumericFacts(params: Record<string, unknown>, context: string): void {
  const facts = extractNumericFacts(context);
  if (facts.length === 0) {
    attachTextSemanticFacts(params, context);
    return;
  }

  const primary = choosePrimaryNumericFact(facts);
  const label = labelForNumericFact(context, primary);

  if (shouldReplacePlaceholder(params.value)) params.value = primary.exactText;
  if (label && shouldReplacePlaceholder(params.label)) params.label = label;
  params.quantityKind = stringParam(params.quantityKind) ?? primary.kind;
  if (primary.unit) params.unit = stringParam(params.unit) ?? primary.unit;
  if (primary.denominator !== undefined && params.denominator == null) params.denominator = primary.denominator;
  if (primary.bounded !== undefined && params.bounded == null) params.bounded = primary.bounded;
  if (primary.kind === 'currency') params.prefix = stringParam(params.prefix) ?? currencyPrefix(primary.exactText);
  if (primary.kind === 'percent' && !String(primary.exactText).includes('%')) params.suffix = stringParam(params.suffix) ?? '%';

  const quantityAtoms: Record<string, unknown> = {
    displayText: primary.exactText,
    value: primary.exactText,
    kind: primary.kind,
    ...(label ? { label } : {}),
    ...(primary.unit ? { unit: primary.unit } : {}),
    ...(primary.denominator !== undefined ? { denominator: primary.denominator } : {}),
    ...(primary.bounded !== undefined ? { bounded: primary.bounded } : {}),
  };

  const atoms: Record<string, unknown> = {
    quantity: quantityAtoms,
    evidencePhrase: context,
  };

  if (facts.length >= 2) {
    const relation = inferNumericRelation(context, facts);
    if (relation) {
      params.from = stringParam(params.from) ?? relation.from;
      params.to = stringParam(params.to) ?? relation.to;
      params.relation = stringParam(params.relation) ?? relation.relation;
      atoms.relation = relation;
    } else {
      const values = facts.map((fact) => fact.value).filter(Number.isFinite);
      if (values.length >= 2) {
        params.values = Array.isArray(params.values) ? params.values : values;
        params.labels = Array.isArray(params.labels) ? params.labels : facts.map((fact) => fact.exactText);
        atoms.series = { values, labels: facts.map((fact) => fact.exactText) };
      }
    }
  }

  const textFacts = semanticStructureFacts(context);
  if (textFacts.polarity) atoms.truth = { polarity: textFacts.polarity };
  if (textFacts.negated || textFacts.refuted) {
    atoms.truth = {
      ...(objectParam(atoms.truth) ?? {}),
      ...(textFacts.negated ? { negated: true } : {}),
      ...(textFacts.refuted ? { refuted: true } : {}),
    };
  }

  mergeSemanticAtoms(params, atoms);
  attachStructuredContentIfLicensed(params);
}

function attachTextSemanticFacts(params: Record<string, unknown>, context: string): void {
  const facts = semanticStructureFacts(context);
  if (!facts.licensed) return;

  const atoms: Record<string, unknown> = {
    evidencePhrase: context,
    text: { primary: context, phrase: context },
  };
  if (facts.polarity || facts.negated || facts.refuted) {
    atoms.truth = {
      ...(facts.polarity ? { polarity: facts.polarity } : {}),
      ...(facts.negated ? { negated: true } : {}),
      ...(facts.refuted ? { refuted: true } : {}),
    };
  }
  if (facts.relation) atoms.relation = facts.relation;

  mergeSemanticAtoms(params, atoms);
  attachStructuredContentIfLicensed(params);
}

function attachStructuredContentIfLicensed(params: Record<string, unknown>): void {
  const structure = deriveContentStructure(params);
  if (!hasLicensedStructure(structure.evidence)) return;
  params.contentStructure = {
    parts: structure.parts,
    relations: structure.relations,
    channels: structure.channels,
    evidence: structure.evidence,
    primaryChannel: structure.primaryChannel,
  };
}

function hasLicensedStructure(evidence: Record<string, unknown>): boolean {
  return evidence.hasScalar === true
    || evidence.hasSeries === true
    || evidence.hasIdentity === true
    || evidence.hasRelation === true
    || evidence.proportionAffordance === true
    || evidence.boundedRange === true
    || evidence.negationAffordance === true
    || evidence.refuted === true
    || typeof evidence.polarity === 'string'
    || evidence.listAffordance === true
    || evidence.processAffordance === true;
}

function semanticStructureFacts(context: string): {
  licensed: boolean;
  polarity?: string;
  negated?: boolean;
  refuted?: boolean;
  relation?: { from: string; to: string; relation: string; kind: string };
} {
  const structure = deriveContentStructure({ text: context, contextPhrase: context });
  const evidence = structure.evidence as Record<string, unknown>;
  const from = stringPartValue(structure.parts, 'compare-from');
  const to = stringPartValue(structure.parts, 'compare-to');
  const relation = from && to ? { from, to, relation: 'arrow', kind: 'comparison' } : undefined;
  return {
    licensed: hasLicensedStructure(evidence),
    polarity: typeof evidence.polarity === 'string' ? evidence.polarity : undefined,
    negated: evidence.negated === true || evidence.negationAffordance === true,
    refuted: evidence.refuted === true,
    relation,
  };
}

function extractNumericFacts(context: string): NumericFact[] {
  const facts: NumericFact[] = [];
  for (const match of context.matchAll(NUMERIC_TOKEN_RE)) {
    const raw = match[0].trim();
    const index = match.index ?? 0;
    const parsed = parseNumericToken(raw, context, index);
    if (parsed) facts.push(parsed);
  }
  return facts;
}

function parseNumericToken(raw: string, context: string, index: number): NumericFact | null {
  const token = raw.replace(/\s+/g, '');
  const lower = token.toLowerCase();
  const wordNumber = WORD_NUMBERS[lower];
  if (wordNumber !== undefined) {
    return {
      exactText: raw,
      value: wordNumber,
      index,
      endIndex: index + raw.length,
      kind: wordNumber >= 1000 ? 'magnitude' : 'number',
    };
  }

  const fraction = token.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return {
      exactText: token,
      value: numerator / denominator,
      index,
      endIndex: index + raw.length,
      kind: 'fraction',
      denominator,
      bounded: true,
    };
  }

  const ratio = token.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const left = Number(ratio[1]);
    const right = Number(ratio[2]);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return null;
    return {
      exactText: token,
      value: left / right,
      index,
      endIndex: index + raw.length,
      kind: 'ratio',
    };
  }

  const currency = new RegExp(`^[${CURRENCY_CLASS}]`).test(token);
  const percent = /%$/.test(token);
  const magnitude = token.match(/[KMBTkmbt]$/);
  const multiplier = magnitude ? magnitudeMultiplier(magnitude[0]) : 1;
  const numeric = Number(token.replace(/[$\u20ac\u00a3\u00a5\u20b9,%xX\u00d7KMBTkmbt]/g, '').replace(/,/g, '')) * multiplier;
  if (!Number.isFinite(numeric)) return null;

  const after = context.slice(index + raw.length).toLowerCase();
  const rateUnit = after.match(/\b(?:per|\/)\s+([a-z]+(?:\s+[a-z]+)?)/i)?.[1]?.trim();
  return {
    exactText: token,
    value: numeric,
    index,
    endIndex: index + raw.length,
    kind: percent ? 'percent' : currency ? 'currency' : rateUnit ? 'rate' : magnitude ? 'magnitude' : 'number',
    ...(rateUnit ? { unit: `per ${rateUnit}` } : {}),
    ...(percent ? { bounded: true } : {}),
  };
}

function choosePrimaryNumericFact(facts: NumericFact[]): NumericFact {
  return [...facts].sort((a, b) => {
    const rank = numericKindRank(b.kind) - numericKindRank(a.kind);
    if (rank !== 0) return rank;
    return Math.abs(b.value) - Math.abs(a.value);
  })[0];
}

function numericKindRank(kind: NumericFact['kind']): number {
  switch (kind) {
    case 'percent':
    case 'fraction':
    case 'ratio':
      return 5;
    case 'rate':
      return 4;
    case 'currency':
    case 'magnitude':
      return 3;
    default:
      return 1;
  }
}

function labelForNumericFact(context: string, fact: NumericFact): string | undefined {
  const before = context.slice(0, fact.index).replace(/[$\u20ac\u00a3\u00a5\u20b9]\s*$/, '').trim();
  const after = context.slice(fact.endIndex).replace(/^[%xX\u00d7]/, '').trim();
  const label = [before, after]
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^(is|are|was|were|of|to|from)\s+/i, '')
    .trim();
  return label || undefined;
}

function inferNumericRelation(
  context: string,
  facts: NumericFact[],
): { from: string; to: string; relation: string; kind: string } | null {
  if (facts.length < 2) return null;
  const lower = context.toLowerCase();
  const first = facts[0];
  const second = facts[1];
  const between = lower.slice(first.endIndex, second.index);
  if (/\b(to|into|from)\b/.test(between) || /\bfrom\b/.test(lower)) {
    return { from: first.exactText, to: second.exactText, relation: 'arrow', kind: 'change' };
  }
  if (/\b(vs|versus|compared|than|over|under)\b/.test(between)) {
    return { from: first.exactText, to: second.exactText, relation: 'vs', kind: 'comparison' };
  }
  return null;
}

function mergeSemanticAtoms(params: Record<string, unknown>, atoms: Record<string, unknown>): void {
  params.semanticAtoms = deepMerge(objectParam(params.semanticAtoms) ?? {}, atoms);
}

function deepMerge(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = objectParam(merged[key]);
    const next = objectParam(value);
    merged[key] = current && next ? deepMerge(current, next) : value;
  }
  return merged;
}

function stringPartValue(
  parts: Array<{ role: string; value?: unknown }>,
  role: string,
): string | undefined {
  const value = parts.find((part) => part.role === role)?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function objectParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberParam(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function shouldReplacePlaceholder(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0
    || normalized.includes('exact number')
    || normalized.includes('from transcript')
    || normalized.includes('placeholder');
}

function currencyPrefix(value: string): string | undefined {
  const match = value.trim().match(/^[\u20ac\u00a3\u00a5\u20b9$]/);
  return match?.[0];
}

function magnitudeMultiplier(suffix: string): number {
  switch (suffix.toLowerCase()) {
    case 'k': return 1000;
    case 'm': return 1000000;
    case 'b': return 1000000000;
    case 't': return 1000000000000;
    default: return 1;
  }
}
