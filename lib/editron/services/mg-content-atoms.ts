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
  const content: Record<string, unknown> = { ...params };
  const atoms = objectParam(params.semanticAtoms) ?? objectParam(params.contentAtoms) ?? objectParam(params.atoms);

  if (atoms) {
    content.semanticAtoms = atoms;
    applySemanticAtoms(atoms, content);
  }

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

function resolveSemanticSourceSpan(content: Record<string, unknown>): SemanticMgSourceSpan | undefined {
  const existing = objectParam(content.sourceSpan);
  const text = stringValue(existing?.text)
    ?? stringValue(content.contextPhrase)
    ?? stringValue(content.text)
    ?? stringValue(content.quote)
    ?? stringValue(content.evidencePhrase)
    ?? fallbackSemanticSourceText(content);
  if (!text) return undefined;
  const startMs = numberValue(existing?.startMs) ?? numberValue(content.contextStartMs) ?? numberValue(content.targetWordStartMs);
  const endMs = numberValue(existing?.endMs) ?? numberValue(content.contextEndMs) ?? numberValue(content.targetWordEndMs);
  const wordStart = numberValue(existing?.wordStart);
  const wordEnd = numberValue(existing?.wordEnd);

  return {
    text,
    ...(startMs != null ? { startMs } : {}),
    ...(endMs != null ? { endMs } : {}),
    ...(wordStart != null ? { wordStart } : {}),
    ...(wordEnd != null ? { wordEnd } : {}),
    source: stringValue(existing?.source) ?? stringValue(content.text_source) ?? 'mg-content-normalization',
  };
}

function fallbackSemanticSourceText(content: Record<string, unknown>): string | undefined {
  const from = stringValue(content.from);
  const to = stringValue(content.to);
  if (from && to) return `${from} to ${to}`;

  const value = stringValue(content.value) ?? stringValue(content.number);
  const label = stringValue(content.label) ?? stringValue(content.quantityKind) ?? stringValue(content.unit);
  if (value && label) return `${value} ${label}`;
  if (value) return value;

  const title = stringValue(content.title);
  const body = stringValue(content.body);
  if (title && body) return `${title} ${body}`;

  const keyword = stringValue(content.keyword);
  if (keyword && body) return `${keyword} ${body}`;

  const name = stringValue(content.name);
  const role = stringValue(content.role) ?? stringValue(content.subtitle);
  if (name && role) return `${name} ${role}`;

  return title ?? keyword ?? name;
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
