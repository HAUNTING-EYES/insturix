import { deriveContentStructure } from '@/lib/editron/motion-graphics/engine/content-shape-analyzer';
import {
  buildSemanticMgCandidateLedger,
  type SemanticMgCandidateLedger,
  type SemanticMgSourceSpan,
} from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';
import type { ContentStructureSignature } from '@/lib/editron/motion-graphics/engine/recipe-types';

export interface NormalizedMotionGraphicContent {
  content: Record<string, unknown>;
  structure: ContentStructureSignature;
  semanticAtoms?: Record<string, unknown>;
  semanticMgCandidateLedger: SemanticMgCandidateLedger;
}

export function normalizeMotionGraphicContent(
  params: Record<string, unknown>,
): NormalizedMotionGraphicContent {
  const content = sanitizeMotionGraphicContentRecord(params);
  const atoms = objectParam(content.semanticAtoms) ?? objectParam(content.contentAtoms) ?? objectParam(content.atoms);

  if (atoms) {
    content.semanticAtoms = atoms;
    applySemanticAtoms(atoms, content);
  }
  sanitizeMotionGraphicContentInPlace(content);
  applyDerivedQuantityKind(content);
  const structure = deriveContentStructure(content);
  const sourceSpan = resolveSemanticSourceSpan(content);
  const semanticMgCandidateLedger = buildSemanticMgCandidateLedger({
    content,
    structure,
    ...(atoms ? { semanticAtoms: atoms } : {}),
    ...(sourceSpan ? { sourceSpan } : {}),
  });
  content.contentStructure = {
    parts: structure.parts,
    relations: structure.relations,
    channels: structure.channels,
    evidence: structure.evidence,
    primaryChannel: structure.primaryChannel,
  };

  return {
    content,
    structure,
    semanticMgCandidateLedger,
    ...(atoms ? { semanticAtoms: atoms } : {}),
  };
}

/* ─── Quantity-kind derivation (2026-07-21) ────────────────────────────────────────────────────────────────
 * WHY: the semantic MG ledger licenses a stat by its quantity kind — percent/fraction/ratio → bounded-stat
 * (semantic-mg-candidates.ts hasBoundedEvidence), magnitude/currency → magnitude-stat (hasMagnitudeEvidence).
 * But no producer on the live path ever SET `quantityKind`, so every plain spoken number ("this is thirty-five
 * US" → value '35', title 'US Dollars') classified as `weak-stat` and was hard-blocked by the salience gate —
 * 0 motion graphics across 124 real projects while lab fixtures ('47%') passed.
 *
 * This derives the kind the speaker actually used, from fields the model explicitly attached (value + title/
 * label/keyword/targetWord) — NEVER from loose context, and NEVER overriding an explicit quantityKind. If
 * nothing matches, the kind stays unset and the weak-stat gate keeps doing its job (Rule 32: fix the facts,
 * not the gate).
 *
 * Taxonomy ← CKG signal:entity.number: "type (count | percentage | currency | duration | comparison)" —
 * "Natural stat-graphic anchor points". Format examples ← technique:graphic.stat_counter: "numeric (300%) |
 * currency ($49) | count (10x)". Word lists are standard notation (ISO-4217-common currencies, common time
 * units), deliberately conservative allowlists.
 * NOTE: only percent/currency gain a license today (the ledger's existing bounded/magnitude rules); duration/
 * count are stamped truthfully but still classify weak-stat — extending magnitude evidence to typed durations
 * is a separate, founder-gated ledger change. */

const QK_CURRENCY_SYMBOL = /[$€£¥₹]/;
const QK_CURRENCY_WORDS = /\b(dollars?|usd|euros?|eur|pounds?|gbp|rupees?|inr|yen|jpy|cents?|bucks?)\b/i;
const QK_PERCENT_WORDS = /\b(percent(?:age)?|pct)\b/i;
const QK_DURATION_WORDS = /\b(years?|months?|weeks?|days?|hours?|minutes?|mins?|seconds?|secs?)\b/i;
const QK_MULTIPLIER_VALUE = /^\s*\d+(?:[.,]\d+)?\s*[x×]\s*$/i;

/** Derive `quantityKind` (+ `unit` for durations) for a stat whose kind the producer left unset. Pure and
 *  conservative: reads only value/number + the labels the model attached; fills EMPTY fields only. */
function applyDerivedQuantityKind(content: Record<string, unknown>): void {
  if (content.value == null && content.number == null) return;
  if (stringValue(content.quantityKind)) return; // explicit kind always wins — never overridden

  const value = String(content.value ?? content.number ?? '').trim();
  if (!value) return;
  const labels = [content.label, content.title, content.keyword, content.targetWord]
    .map((v) => stringValue(v))
    .filter((v): v is string => Boolean(v))
    .join(' ');

  if (value.includes('%') || QK_PERCENT_WORDS.test(value) || QK_PERCENT_WORDS.test(labels)) {
    content.quantityKind = 'percent';
    return;
  }
  if (QK_CURRENCY_SYMBOL.test(value) || QK_CURRENCY_WORDS.test(value) || QK_CURRENCY_WORDS.test(labels)) {
    content.quantityKind = 'currency';
    return;
  }
  const duration = value.match(QK_DURATION_WORDS) ?? labels.match(QK_DURATION_WORDS);
  if (duration) {
    content.quantityKind = 'duration';
    if (content.unit == null) content.unit = duration[0].toLowerCase();
    return;
  }
  if (QK_MULTIPLIER_VALUE.test(value)) {
    content.quantityKind = 'count';
  }
}

const KG_EXAMPLE_PLACEHOLDERS = new Set([
  'person/brand name from transcript or brief',
  'role/description (optional)',
  'numeric (300%) | currency ($49) | count (10x)',
  'count-up | pop | fade',
  'slide-in from left | fade-in',
]);

const KG_ENUM_PLACEHOLDER_KEYS = new Set([
  'animation',
  'color',
  'duration',
  'format',
  'name',
  'position',
  'role',
  'size',
  'style',
  'title',
]);

function sanitizeMotionGraphicContentRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const next = sanitizeMotionGraphicContentValue(value, key);
    if (next !== undefined) sanitized[key] = next;
  }
  return sanitized;
}

function sanitizeMotionGraphicContentInPlace(record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    const next = sanitizeMotionGraphicContentValue(value, key);
    if (next === undefined) {
      delete record[key];
    } else {
      record[key] = next;
    }
  }
}

function sanitizeMotionGraphicContentValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || isMotionGraphicPlaceholderText(text, key)) return undefined;
    return text;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeMotionGraphicContentValue(item, key))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const nested = sanitizeMotionGraphicContentRecord(value as Record<string, unknown>);
    return Object.keys(nested).length > 0 ? nested : undefined;
  }

  return value;
}

function isMotionGraphicPlaceholderText(value: string, key?: string): boolean {
  const normalized = normalizePlaceholderText(value);
  if (KG_EXAMPLE_PLACEHOLDERS.has(normalized)) return true;
  if (normalized.includes('from transcript or brief')) return true;
  if (normalized.includes('exact number')) return true;
  if (normalized.includes('placeholder')) return true;
  if (normalized.includes('role/description')) return true;

  if (key && KG_ENUM_PLACEHOLDER_KEYS.has(key) && /\s\|\s/.test(value)) {
    return /\b(default|fade|large|medium|numeric|optional|pop|small|slide|currency|count)\b/i.test(value);
  }

  return false;
}

function normalizePlaceholderText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveSemanticSourceSpan(content: Record<string, unknown>): SemanticMgSourceSpan | undefined {
  const existing = objectParam(content.sourceSpan);
  const explicitText = stringValue(existing?.text)?.trim();
  if (explicitText) {
    return {
      text: explicitText,
      ...(numberValue(existing?.startMs) != null ? { startMs: numberValue(existing?.startMs) } : {}),
      ...(numberValue(existing?.endMs) != null ? { endMs: numberValue(existing?.endMs) } : {}),
      ...(numberValue(existing?.wordStart) != null ? { wordStart: numberValue(existing?.wordStart) } : {}),
      ...(numberValue(existing?.wordEnd) != null ? { wordEnd: numberValue(existing?.wordEnd) } : {}),
      source: stringValue(existing?.source) ?? 'explicit-source-span',
    };
  }

  const text = stringValue(content.contextPhrase)?.trim();
  if (!text) return undefined;
  const startMs = numberValue(content.contextStartMs) ?? numberValue(content.targetWordStartMs);
  const endMs = numberValue(content.contextEndMs) ?? numberValue(content.targetWordEndMs);
  if (startMs == null && endMs == null) return undefined;

  return {
    text,
    ...(startMs != null ? { startMs } : {}),
    ...(endMs != null ? { endMs } : {}),
    source: 'transcript-context',
  };
}

function applySemanticAtoms(atoms: Record<string, unknown>, content: Record<string, unknown>): void {
  copyString(atoms, content, 'concept', 'title');
  copyString(atoms, content, 'claim', 'body');
  copyString(atoms, content, 'evidencePhrase', 'contextPhrase');
  copyString(atoms, content, 'keyword', 'keyword');
  copyString(atoms, content, 'badge', 'badge');
  copyString(atoms, content, 'rank', 'rank');
  copyString(atoms, content, 'annotation', 'annotation');
  copyString(atoms, content, 'kicker', 'kicker');
  copyString(atoms, content, 'category', 'category');
  copyStringArray(atoms, content, 'items', 'items');

  applyTextAtoms(objectParam(atoms.text) ?? objectParam(atoms.textual), content);
  applyQuantityAtoms(objectParam(atoms.quantity) ?? objectParam(atoms.scalar), content);
  applyTruthAtoms(objectParam(atoms.truth) ?? objectParam(atoms.claimTruth), content);
  applyRelationAtoms(objectParam(atoms.relation) ?? objectParam(atoms.contrast) ?? objectParam(atoms.comparison), content);
  applySeriesAtoms(objectParam(atoms.series) ?? objectParam(atoms.dataSeries), atoms, content);
  applyIdentityAtoms(objectParam(atoms.identity) ?? objectParam(atoms.person) ?? objectParam(atoms.entity), content);
  applyMediaAtoms(objectParam(atoms.media) ?? objectParam(atoms.image), content);
  applyQuoteAtoms(objectParam(atoms.quote) ?? objectParam(atoms.quotation), content);

  copyString(atoms, content, 'polarity', 'polarity');
  copyBoolean(atoms, content, 'negated', 'negated');
  copyBoolean(atoms, content, 'refuted', 'refuted');
  copyBoolean(atoms, content, 'warranted', 'warranted');
  copyNumber(atoms, content, 'salience', 'salience');
  copyNumber(atoms, content, 'captionRedundancy', 'captionRedundancy');
}

function applyTextAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyString(atoms, content, 'primary', 'title');
  copyString(atoms, content, 'headline', 'title');
  copyString(atoms, content, 'title', 'title');
  copyString(atoms, content, 'secondary', 'body');
  copyString(atoms, content, 'body', 'body');
  copyString(atoms, content, 'phrase', 'contextPhrase');
  copyString(atoms, content, 'context', 'contextPhrase');
  copyString(atoms, content, 'keyword', 'keyword');
  copyString(atoms, content, 'text', 'text');
}

function applyQuantityAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyScalarAsString(atoms, content, 'displayText', 'value');
  copyScalarAsString(atoms, content, 'valueText', 'value');
  copyScalarAsString(atoms, content, 'value', 'value');
  copyString(atoms, content, 'label', 'label');
  copyString(atoms, content, 'kind', 'quantityKind');
  copyString(atoms, content, 'unit', 'unit');
  copyNumber(atoms, content, 'denominator', 'denominator');
  copyBoolean(atoms, content, 'bounded', 'bounded');
}

function applyTruthAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyString(atoms, content, 'polarity', 'polarity');
  copyBoolean(atoms, content, 'negated', 'negated');
  copyBoolean(atoms, content, 'refuted', 'refuted');
  copyBoolean(atoms, content, 'warranted', 'warranted');
}

function applyRelationAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyString(atoms, content, 'from', 'from');
  copyString(atoms, content, 'to', 'to');
  copyString(atoms, content, 'fromLabel', 'fromLabel');
  copyString(atoms, content, 'toLabel', 'toLabel');
  copyString(atoms, content, 'relation', 'relation');
  copyString(atoms, content, 'kind', 'relationKind');
  copyString(atoms, content, 'type', 'relationKind');
}

function applySeriesAtoms(
  seriesAtoms: Record<string, unknown> | null,
  rootAtoms: Record<string, unknown>,
  content: Record<string, unknown>,
): void {
  const values = numberArray(seriesAtoms?.values ?? seriesAtoms?.points ?? rootAtoms.values);
  if (values.length > 0 && !Array.isArray(content.values)) content.values = values;

  const labels = stringArray(seriesAtoms?.labels ?? rootAtoms.labels);
  if (labels.length > 0 && !Array.isArray(content.labels)) content.labels = labels;
}

function applyIdentityAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyString(atoms, content, 'name', 'name');
  copyString(atoms, content, 'title', 'title');
  copyString(atoms, content, 'role', 'title');
  copyString(atoms, content, 'avatar', 'avatar');
  copyString(atoms, content, 'image', 'avatar');
  copyString(atoms, content, 'imageUrl', 'avatar');
}

function applyMediaAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  const role = stringValue(atoms.role)?.toLowerCase();
  const src = stringValue(atoms.src) ?? stringValue(atoms.url) ?? stringValue(atoms.image) ?? stringValue(atoms.imageUrl);
  if (role === 'logo' || role === 'brand-logo') {
    if (src) setIfEmpty(content, 'logo', src);
    return;
  }
  if (role === 'avatar' || role === 'portrait' || role === 'image' || !role) {
    if (src) setIfEmpty(content, 'avatar', src);
  }
}

function applyQuoteAtoms(atoms: Record<string, unknown> | null, content: Record<string, unknown>): void {
  if (!atoms) return;
  copyString(atoms, content, 'text', 'quote');
  copyString(atoms, content, 'quote', 'quote');
  copyString(atoms, content, 'value', 'quote');
  copyString(atoms, content, 'author', 'author');
}

function objectParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, fromKey: string, toKey: string): void {
  const value = stringValue(source[fromKey]);
  if (value) setIfEmpty(target, toKey, value);
}

function copyScalarAsString(source: Record<string, unknown>, target: Record<string, unknown>, fromKey: string, toKey: string): void {
  const value = source[fromKey];
  if (typeof value === 'string' && value.trim()) setIfEmpty(target, toKey, value.trim());
  if (typeof value === 'number' && Number.isFinite(value)) setIfEmpty(target, toKey, String(value));
}

function copyNumber(source: Record<string, unknown>, target: Record<string, unknown>, fromKey: string, toKey: string): void {
  const value = source[fromKey];
  if (typeof value === 'number' && Number.isFinite(value)) {
    setIfEmpty(target, toKey, value);
    return;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setIfEmpty(target, toKey, parsed);
  }
}

function copyBoolean(source: Record<string, unknown>, target: Record<string, unknown>, fromKey: string, toKey: string): void {
  const value = source[fromKey];
  if (typeof value === 'boolean') {
    setIfEmpty(target, toKey, value);
    return;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true') setIfEmpty(target, toKey, true);
    if (text === 'false') setIfEmpty(target, toKey, false);
  }
}

function copyStringArray(source: Record<string, unknown>, target: Record<string, unknown>, fromKey: string, toKey: string): void {
  const value = stringArray(source[fromKey]);
  if (value.length > 0) setIfEmpty(target, toKey, value);
}

function setIfEmpty(target: Record<string, unknown>, key: string, value: unknown): void {
  const current = target[key];
  if (typeof current === 'string' && current.trim()) return;
  if (Array.isArray(current) && current.length > 0) return;
  if (current !== undefined && current !== null && typeof current !== 'string') return;
  target[key] = value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === 'number' ? item : typeof item === 'string' ? parseFloat(item.replace(/,/g, '')) : NaN)
    .filter((item) => Number.isFinite(item));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}
