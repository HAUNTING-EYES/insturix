import { deriveContentStructure } from './content-shape-analyzer';
import type { ContentPartRole, ContentStructureSignature } from './recipe-types';

export type SemanticMgFactKind =
  | 'weak-stat'
  | 'bounded-stat'
  | 'magnitude-stat'
  | 'series'
  | 'comparison'
  | 'quote'
  | 'identity'
  | 'concept'
  | 'refutation'
  | 'list'
  /** P3.5 door (2026-07-18): a plain transcript beat with no extracted fact — licensed by the DESIGNER within
   *  the density budget, never by this ledger. Carries no data props; data-lane guards ignore it by design. */
  | 'narrative';

export type SemanticMgLicense =
  | 'bounded-proportion'
  | 'magnitude'
  | 'series-values'
  | 'comparison-relation'
  | 'named-entity'
  | 'quote-proof'
  | 'concept-context'
  | 'truth-negation'
  | 'ordered-list'
  | 'salience'
  | 'source-span';

export interface SemanticMgSourceSpan {
  text: string;
  startMs?: number;
  endMs?: number;
  wordStart?: number;
  wordEnd?: number;
  source?: string;
}

export interface SemanticMgGateResult {
  passed: boolean;
  reasons: string[];
  blockedBy: string[];
}

export interface SemanticMgCandidate {
  id: string;
  factKind: SemanticMgFactKind;
  sourceSpan: SemanticMgSourceSpan;
  content: Record<string, unknown>;
  evidenceKeys: string[];
  licenses: SemanticMgLicense[];
  salience: number;
  rhetoricalRole?: 'literal' | 'claim' | 'proof' | 'identity' | 'concept' | 'refutation';
  hardGate: SemanticMgGateResult;
  scoreInputs: {
    structuralStrength: number;
    salience: number;
    evidenceStrength: number;
    renderRisk: number;
  };
}

export interface SemanticMgCandidateLedger {
  version: 'semantic-mg-candidate-ledger-v1';
  candidates: SemanticMgCandidate[];
  suppressed: SemanticMgCandidate[];
  summary: {
    totalCandidates: number;
    selectedReadyCount: number;
    suppressedCount: number;
    factKinds: Partial<Record<SemanticMgFactKind, number>>;
    suppressReasons: Record<string, number>;
  };
}

export interface SemanticMgLedgerGate {
  allow: boolean;
  reasons: string[];
  readyCandidateIds: string[];
  suppressedCandidateIds: string[];
}

export interface SemanticMgCandidateSelection {
  selectedCandidate?: SemanticMgCandidate;
  reasons: string[];
  rankedCandidateIds: string[];
}

export interface BuildSemanticMgCandidateLedgerInput {
  content: Record<string, unknown>;
  structure?: ContentStructureSignature;
  semanticAtoms?: Record<string, unknown>;
  sourceText?: string;
  sourceSpan?: Partial<SemanticMgSourceSpan>;
}

interface CandidateDraft {
  factKind: SemanticMgFactKind;
  content: Record<string, unknown>;
  roles: ContentPartRole[];
  evidenceKeys: string[];
  licenses: SemanticMgLicense[];
  salience: number;
  rhetoricalRole?: SemanticMgCandidate['rhetoricalRole'];
}

export function buildSemanticMgCandidateLedger(
  input: BuildSemanticMgCandidateLedgerInput,
): SemanticMgCandidateLedger {
  const content = { ...input.content };
  const atoms = objectValue(input.semanticAtoms) ?? objectValue(content.semanticAtoms);
  const structure = input.structure ?? deriveContentStructure(content);
  const sourceSpan = resolveSourceSpan(input, content, atoms);
  const drafts = buildDrafts(content, atoms, structure);
  const allCandidates = drafts.map((draft) => finalizeCandidate(draft, sourceSpan, structure));
  const candidates = allCandidates.filter((candidate) => candidate.hardGate.passed);
  const suppressed = allCandidates.filter((candidate) => !candidate.hardGate.passed);

  return {
    version: 'semantic-mg-candidate-ledger-v1',
    candidates,
    suppressed,
    summary: {
      totalCandidates: allCandidates.length,
      selectedReadyCount: candidates.length,
      suppressedCount: suppressed.length,
      factKinds: countFactKinds(allCandidates),
      suppressReasons: countSuppressReasons(suppressed),
    },
  };
}

export function resolveSemanticMgLedgerGate(ledger: SemanticMgCandidateLedger): SemanticMgLedgerGate {
  const readyCandidateIds = ledger.candidates.map((candidate) => candidate.id);
  const suppressedCandidateIds = ledger.suppressed.map((candidate) => candidate.id);
  if (ledger.summary.totalCandidates === 0) {
    return {
      allow: false,
      reasons: ['semantic-ledger:no-candidate-facts'],
      readyCandidateIds,
      suppressedCandidateIds,
    };
  }
  if (ledger.candidates.length > 0) {
    return {
      allow: true,
      reasons: ['semantic-ledger:licensed-candidate'],
      readyCandidateIds,
      suppressedCandidateIds,
    };
  }
  return {
    allow: false,
    reasons: unique([
      'semantic-ledger:no-licensed-candidate',
      ...ledger.suppressed.flatMap((candidate) => (
        candidate.hardGate.blockedBy.map((reason) => `semantic-ledger:${reason}`)
      )),
    ]),
    readyCandidateIds,
    suppressedCandidateIds,
  };
}

export function selectSemanticMgCandidate(ledger: SemanticMgCandidateLedger): SemanticMgCandidateSelection {
  const rankedCandidates = [...ledger.candidates].sort(compareSemanticCandidates);
  const selectedCandidate = rankedCandidates[0];
  return {
    ...(selectedCandidate ? { selectedCandidate } : {}),
    reasons: selectedCandidate
      ? [
        `semantic-candidate:selected:${selectedCandidate.factKind}`,
        ...selectedCandidate.licenses.map((license) => `semantic-license:${license}`),
      ]
      : ['semantic-candidate:none'],
    rankedCandidateIds: rankedCandidates.map((candidate) => candidate.id),
  };
}

function buildDrafts(
  content: Record<string, unknown>,
  atoms: Record<string, unknown> | null,
  structure: ContentStructureSignature,
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  const salience = readSalience(content, atoms);
  const hasPrimaryValue = hasRole(structure, 'primary-value');
  const bounded = hasBoundedEvidence(content, atoms, structure);
  const magnitude = hasMagnitudeEvidence(content, atoms, structure);

  if (hasPrimaryValue || atoms?.quantity || content.value != null || content.number != null) {
    const factKind: SemanticMgFactKind = bounded
      ? 'bounded-stat'
      : magnitude
        ? 'magnitude-stat'
        : 'weak-stat';
    drafts.push({
      factKind,
      content: pickContent(content, [
        'value',
        'number',
        'label',
        'quantityKind',
        'denominator',
        'bounded',
        'unit',
      ]),
      roles: ['primary-value', 'supporting-label', 'quantity-kind', 'quantity-unit', 'quantity-bounds', 'salience-score'],
      evidenceKeys: evidenceKeysForRoles(structure, [
        'primary-value',
        'supporting-label',
        'quantity-kind',
        'quantity-unit',
        'quantity-bounds',
        'salience-score',
      ]),
      licenses: statLicenses(factKind, salience),
      salience,
      rhetoricalRole: 'claim',
    });
  }

  if (hasRole(structure, 'series-values')) {
    drafts.push({
      factKind: 'series',
      content: pickContent(content, ['values', 'labels', 'title', 'label']),
      roles: ['series-values', 'series-labels', 'title', 'supporting-label'],
      evidenceKeys: evidenceKeysForRoles(structure, ['series-values', 'series-labels', 'title', 'supporting-label']),
      licenses: withSourceLicense(['series-values'], salience),
      salience,
      rhetoricalRole: 'claim',
    });
  }

  if (hasRelation(structure, 'compares')) {
    drafts.push({
      factKind: 'comparison',
      content: pickContent(content, ['from', 'to', 'fromLabel', 'toLabel', 'relation']),
      roles: ['compare-from', 'compare-to'],
      evidenceKeys: [
        ...evidenceKeysForRoles(structure, ['compare-from', 'compare-to']),
        ...relationKeys(structure, 'compares'),
      ],
      licenses: withSourceLicense(['comparison-relation'], salience),
      salience,
      rhetoricalRole: 'claim',
    });
  }

  if (hasRelation(structure, 'refutes') || hasRole(structure, 'truth-negation')) {
    drafts.push({
      factKind: 'refutation',
      content: pickContent(content, ['text', 'truth', 'negated', 'refuted', 'polarity']),
      roles: ['truth-negation', 'truth-polarity', 'context-phrase'],
      evidenceKeys: [
        ...evidenceKeysForRoles(structure, ['truth-negation', 'truth-polarity', 'context-phrase']),
        ...relationKeys(structure, 'refutes'),
      ],
      licenses: withSourceLicense(['truth-negation'], salience),
      salience,
      rhetoricalRole: 'refutation',
    });
  }

  if (hasRole(structure, 'quote')) {
    drafts.push({
      factKind: 'quote',
      content: pickContent(content, ['quote', 'author']),
      roles: ['quote', 'author'],
      evidenceKeys: evidenceKeysForRoles(structure, ['quote', 'author']),
      licenses: withSourceLicense(['quote-proof'], salience),
      salience,
      rhetoricalRole: 'proof',
    });
  }

  if (hasRole(structure, 'name') && hasRole(structure, 'title')) {
    drafts.push({
      factKind: 'identity',
      content: pickContent(content, ['name', 'title', 'avatar']),
      roles: ['name', 'title', 'avatar'],
      evidenceKeys: evidenceKeysForRoles(structure, ['name', 'title', 'avatar']),
      licenses: withSourceLicense(['named-entity'], salience),
      salience,
      rhetoricalRole: 'identity',
    });
  }

  if (hasRelation(structure, 'context-for') && hasRole(structure, 'keyword')) {
    drafts.push({
      factKind: 'concept',
      content: pickContent(content, ['keyword', 'title', 'body', 'contextPhrase', 'text']),
      roles: ['keyword', 'title', 'body', 'context-phrase'],
      evidenceKeys: [
        ...evidenceKeysForRoles(structure, ['keyword', 'title', 'body', 'context-phrase']),
        ...relationKeys(structure, 'context-for'),
      ],
      licenses: withSourceLicense(['concept-context'], salience),
      salience,
      rhetoricalRole: 'concept',
    });
  }

  if (hasRole(structure, 'list-items')) {
    drafts.push({
      factKind: 'list',
      content: pickContent(content, ['title', 'body', 'items', 'steps']),
      roles: ['title', 'body', 'list-items'],
      evidenceKeys: evidenceKeysForRoles(structure, ['title', 'body', 'list-items']),
      licenses: withSourceLicense(['ordered-list'], salience),
      salience,
      rhetoricalRole: 'literal',
    });
  }

  return drafts;
}

function finalizeCandidate(
  draft: CandidateDraft,
  sourceSpan: SemanticMgSourceSpan,
  structure: ContentStructureSignature,
): SemanticMgCandidate {
  const evidenceKeys = unique(draft.evidenceKeys);
  const licenses = unique(draft.licenses);
  const blockedBy = gateBlocks(draft, sourceSpan, evidenceKeys);
  const reasons = blockedBy.length === 0
    ? ['licensed-by-content-facts']
    : blockedBy.map((reason) => `blocked:${reason}`);
  const structuralStrength = structuralStrengthForDraft(draft, structure);
  const evidenceStrength = Math.min(1, evidenceKeys.length / 3);
  const renderRisk = draft.factKind === 'weak-stat' ? 0.72 : Math.max(0.08, 0.32 - evidenceStrength * 0.18);

  return {
    id: stableCandidateId(draft.factKind, evidenceKeys, sourceSpan.text, draft.content),
    factKind: draft.factKind,
    sourceSpan,
    content: draft.content,
    evidenceKeys,
    licenses,
    salience: round4(draft.salience),
    ...(draft.rhetoricalRole ? { rhetoricalRole: draft.rhetoricalRole } : {}),
    hardGate: {
      passed: blockedBy.length === 0,
      reasons,
      blockedBy,
    },
    scoreInputs: {
      structuralStrength: round4(structuralStrength),
      salience: round4(draft.salience),
      evidenceStrength: round4(evidenceStrength),
      renderRisk: round4(renderRisk),
    },
  };
}

function gateBlocks(
  draft: CandidateDraft,
  sourceSpan: SemanticMgSourceSpan,
  evidenceKeys: string[],
): string[] {
  const blocks: string[] = [];
  if (!sourceSpan.text.trim()) blocks.push('missing-source-span');
  if (evidenceKeys.length === 0) blocks.push('missing-evidence-key');
  if (
    draft.factKind === 'weak-stat'
    && draft.salience < 0.66
    && !draft.licenses.includes('comparison-relation')
    && !draft.licenses.includes('bounded-proportion')
    && !draft.licenses.includes('truth-negation')
  ) {
    blocks.push('weak-stat-needs-salience-or-relation');
  }
  return unique(blocks);
}

function resolveSourceSpan(
  input: BuildSemanticMgCandidateLedgerInput,
  content: Record<string, unknown>,
  _atoms: Record<string, unknown> | null,
): SemanticMgSourceSpan {
  const contentSpan = objectValue(content.sourceSpan);
  const explicitSpan = input.sourceSpan ?? contentSpan ?? undefined;
  const explicitText = stringValue(explicitSpan?.text)?.trim();
  if (explicitText) return sourceSpanFrom(explicitText, explicitSpan, stringValue(explicitSpan?.source));

  const sourceText = stringValue(input.sourceText)?.trim();
  if (sourceText) return sourceSpanFrom(sourceText, undefined, 'source-text');

  const transcriptContext = verifiedTranscriptContext(content);
  if (transcriptContext) return transcriptContext;

  return { text: '' };
}

function sourceSpanFrom(
  text: string,
  span?: Record<string, unknown>,
  source?: string,
): SemanticMgSourceSpan {
  return {
    text,
    ...(numberValue(span?.startMs) != null ? { startMs: numberValue(span?.startMs) } : {}),
    ...(numberValue(span?.endMs) != null ? { endMs: numberValue(span?.endMs) } : {}),
    ...(numberValue(span?.wordStart) != null ? { wordStart: numberValue(span?.wordStart) } : {}),
    ...(numberValue(span?.wordEnd) != null ? { wordEnd: numberValue(span?.wordEnd) } : {}),
    ...(source ? { source } : {}),
  };
}

function verifiedTranscriptContext(content: Record<string, unknown>): SemanticMgSourceSpan | null {
  const text = stringValue(content.contextPhrase)?.trim();
  if (!text) return null;

  const startMs = numberValue(content.contextStartMs) ?? numberValue(content.targetWordStartMs);
  const endMs = numberValue(content.contextEndMs) ?? numberValue(content.targetWordEndMs);
  if (startMs == null && endMs == null) return null;

  return {
    text,
    ...(startMs != null ? { startMs } : {}),
    ...(endMs != null ? { endMs } : {}),
    source: 'transcript-context',
  };
}

function statLicenses(factKind: SemanticMgFactKind, salience: number): SemanticMgLicense[] {
  if (factKind === 'bounded-stat') return withSourceLicense(['bounded-proportion'], salience);
  if (factKind === 'magnitude-stat') return withSourceLicense(['magnitude'], salience);
  return withSourceLicense([], salience);
}

function withSourceLicense(licenses: SemanticMgLicense[], salience: number): SemanticMgLicense[] {
  return unique([
    ...licenses,
    ...(salience >= 0.66 ? ['salience' as const] : []),
    'source-span',
  ]);
}

function hasBoundedEvidence(
  content: Record<string, unknown>,
  atoms: Record<string, unknown> | null,
  structure: ContentStructureSignature,
): boolean {
  const quantity = objectValue(atoms?.quantity);
  const quantityKind = stringValue(content.quantityKind) ?? stringValue(quantity?.kind);
  return booleanValue(content.bounded) === true
    || booleanValue(quantity?.bounded) === true
    || numberValue(content.denominator) != null
    || numberValue(quantity?.denominator) != null
    || structure.evidence.boundedRange === true
    || structure.evidence.proportionAffordance === true
    || quantityKind === 'percent'
    || quantityKind === 'percentage'
    || quantityKind === 'fraction'
    || quantityKind === 'ratio';
}

function hasMagnitudeEvidence(
  content: Record<string, unknown>,
  atoms: Record<string, unknown> | null,
  structure: ContentStructureSignature,
): boolean {
  const quantity = objectValue(atoms?.quantity);
  const quantityKind = stringValue(content.quantityKind) ?? stringValue(quantity?.kind);
  const rawValue = stringValue(content.value)
    ?? stringValue(content.number)
    ?? stringValue(quantity?.displayText)
    ?? String(content.value ?? content.number ?? '');
  const numeric = numberValue(content.value)
    ?? numberValue(content.number)
    ?? numberValue(quantity?.value);
  return quantityKind === 'magnitude'
    || quantityKind === 'currency'
    || /\b(?:k|m|b|t|million|billion|thousand)\b/i.test(rawValue)
    || (numeric != null && Math.abs(numeric) >= 1000)
    || structure.evidence.magnitudeAffordance === true;
}

function readSalience(content: Record<string, unknown>, atoms: Record<string, unknown> | null): number {
  return clamp01(
    numberValue(content.salience)
      ?? numberValue(content.importance)
      ?? numberValue(content.weight)
      ?? numberValue(atoms?.salience)
      ?? 0.5,
  );
}

function structuralStrengthForDraft(
  draft: CandidateDraft,
  structure: ContentStructureSignature,
): number {
  const roleCoverage = draft.roles.filter((role) => hasRole(structure, role)).length / Math.max(1, draft.roles.length);
  const licenseStrength = Math.min(1, draft.licenses.length / 3);
  const base = draft.factKind === 'weak-stat' ? 0.38 : 0.64;
  return clamp01(base + roleCoverage * 0.2 + licenseStrength * 0.16);
}

function compareSemanticCandidates(a: SemanticMgCandidate, b: SemanticMgCandidate): number {
  const scoreDelta = semanticCandidateScore(b) - semanticCandidateScore(a);
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  const priorityDelta = factKindPriority(a.factKind) - factKindPriority(b.factKind);
  if (priorityDelta !== 0) return priorityDelta;
  return a.id.localeCompare(b.id);
}

function semanticCandidateScore(candidate: SemanticMgCandidate): number {
  return round4(clamp01(
    candidate.scoreInputs.structuralStrength * 0.45
      + candidate.scoreInputs.salience * 0.25
      + candidate.scoreInputs.evidenceStrength * 0.25
      - candidate.scoreInputs.renderRisk * 0.15,
  ));
}

function factKindPriority(factKind: SemanticMgFactKind): number {
  switch (factKind) {
    case 'bounded-stat':
      return 0;
    case 'series':
      return 1;
    case 'comparison':
      return 2;
    case 'magnitude-stat':
      return 3;
    case 'quote':
      return 4;
    case 'identity':
      return 5;
    case 'concept':
      return 6;
    case 'refutation':
      return 7;
    case 'list':
      return 8;
    case 'weak-stat':
      return 9;
    default:
      return 10;
  }
}

function evidenceKeysForRoles(structure: ContentStructureSignature, roles: ContentPartRole[]): string[] {
  return structure.parts
    .filter((part) => roles.includes(part.role))
    .map((part) => `part:${part.sourceKey}:${part.role}`);
}

function relationKeys(structure: ContentStructureSignature, type: ContentStructureSignature['relations'][number]['type']): string[] {
  return structure.relations
    .filter((relation) => relation.type === type)
    .map((relation) => `relation:${relation.type}:${relation.fromRole}->${relation.toRole}`);
}

function hasRole(structure: ContentStructureSignature, role: ContentPartRole): boolean {
  return structure.parts.some((part) => part.role === role && part.confidence > 0);
}

function hasRelation(structure: ContentStructureSignature, type: ContentStructureSignature['relations'][number]['type']): boolean {
  return structure.relations.some((relation) => relation.type === type);
}

function pickContent(content: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (content[key] != null) picked[key] = content[key];
  }
  return picked;
}

function countFactKinds(candidates: SemanticMgCandidate[]): Partial<Record<SemanticMgFactKind, number>> {
  const counts: Partial<Record<SemanticMgFactKind, number>> = {};
  for (const candidate of candidates) {
    counts[candidate.factKind] = (counts[candidate.factKind] ?? 0) + 1;
  }
  return counts;
}

function countSuppressReasons(candidates: SemanticMgCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const reason of candidate.hardGate.blockedBy) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function stableCandidateId(
  factKind: SemanticMgFactKind,
  evidenceKeys: string[],
  sourceText: string,
  content: Record<string, unknown>,
): string {
  const basis = stableStringify({
    factKind,
    evidenceKeys: [...evidenceKeys].sort(),
    sourceText,
    content,
  });
  return `smg_${factKind}_${hashString(basis)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
