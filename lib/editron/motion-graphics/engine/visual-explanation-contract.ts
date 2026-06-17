import { deriveContentStructure } from './content-shape-analyzer';
import type {
  ContentPartRole,
  ContentStructurePart,
  ContentStructureRelation,
  ContentStructureSignature,
} from './recipe-types';

export type MgStageMode =
  | 'overlay-on-footage'
  | 'full-frame-graphic-scene'
  | 'interstitial-graphic-scene'
  | 'split-footage-graphic'
  | 'device-or-screen-scene'
  | 'mg-led-transition';

export type VisualObligationKind =
  | 'show-cardinality'
  | 'show-magnitude'
  | 'show-proportion'
  | 'compare-peers'
  | 'preserve-order'
  | 'show-sequence'
  | 'show-cause-effect'
  | 'prove-claim'
  | 'quote-proof'
  | 'refute-claim'
  | 'summarize-section'
  | 'locate-object'
  | 'explain-screen-action'
  | 'show-search-query'
  | 'show-device-context'
  | 'protect-legibility'
  | 'land-on-rhythm'
  | 'reduce-redundancy';

export type VisualContractConstraintKind =
  | 'no-invented-facts'
  | 'requires-evidence'
  | 'caption-zone-aware'
  | 'safe-zone'
  | 'readability-floor'
  | 'conservative-fallback';

export interface VisualObligation {
  kind: VisualObligationKind;
  evidenceAtomKeys: string[];
  confidence: number;
}

export interface VisualContractConstraint {
  kind: VisualContractConstraintKind;
  reason: string;
  evidenceAtomKeys: string[];
}

export interface VisualContractChoreography {
  shouldCoordinateWithCaptions: boolean;
  shouldCoordinateWithZoom: boolean;
  shouldCoordinateWithTransition: boolean;
  shouldCoordinateWithSfx: boolean;
  rhythmEvidenceKeys: string[];
}

export interface VisualExplanationContractInput {
  content: Record<string, unknown>;
  structure?: ContentStructureSignature;
  semanticAtoms?: Record<string, unknown>;
  signals?: Record<string, unknown>;
  brandHints?: Record<string, unknown>;
  activeOverlayContext?: {
    captionRedundancy?: number;
    activeOverlayCount?: number;
  };
}

export interface VisualExplanationContract {
  version: 'visual-explanation-contract-v1';
  allow: boolean;
  communicationGain: number;
  visualCost: number;
  brandFit: number;
  renderRisk: number;
  stageMode: MgStageMode;
  obligations: VisualObligation[];
  constraints: VisualContractConstraint[];
  choreography: VisualContractChoreography;
  evidenceAtomKeys: string[];
  missingEvidence: string[];
  calibration: {
    status: 'invented-needs-calibration';
    fields: string[];
  };
}

export function resolveVisualExplanationContract(
  input: VisualExplanationContractInput,
): VisualExplanationContract {
  const structure = input.structure ?? deriveContentStructure(input.content);
  const missingEvidence: string[] = [];
  const obligations = collectObligations(input.content, structure, missingEvidence);
  const evidenceAtomKeys = unique(obligations.flatMap((obligation) => obligation.evidenceAtomKeys));
  const signals = input.signals ?? {};
  const captionRedundancy = clamp01(
    readNumber(input.activeOverlayContext, 'captionRedundancy')
      ?? readNumber(input.content, 'captionRedundancy')
      ?? readNumber(signals, 'caption_redundancy')
      ?? 0,
  );
  const screenPressure = resolveScreenPressure(signals);
  const momentStrength = resolveMomentStrength(signals);
  const longCopyRisk = readableWordCount(input.content) >= 18 ? 0.18 : readableWordCount(input.content) >= 10 ? 0.1 : 0;
  const weakKeyword = isWeakKeywordOnly(input.content, structure);
  const structuralGain = obligations.reduce((sum, obligation) => sum + obligation.confidence, 0) / Math.max(2, obligations.length + 1);
  const communicationGain = round4(clamp01(structuralGain * 0.68 + momentStrength * 0.32));
  const visualCost = round4(clamp01(screenPressure * 0.58 + captionRedundancy * 0.32 + overlayCrowding(input) * 0.1));
  const renderRisk = round4(clamp01(longCopyRisk + (missingEvidence.length ? 0.08 : 0) + screenPressure * 0.22));
  const brandFit = resolveBrandFit(input.brandHints);
  const stageMode = resolveStageMode(input.content, structure, signals, obligations, communicationGain, screenPressure);
  const constraints = buildConstraints({
    captionRedundancy,
    evidenceAtomKeys,
    missingEvidence,
    screenPressure,
    stageMode,
    weakKeyword,
  });
  const allow = obligations.length > 0
    && !weakKeyword
    && communicationGain >= 0.32
    && communicationGain >= visualCost * 0.55
    && renderRisk < 0.74;

  if (!obligations.length) missingEvidence.push('visual-obligation');
  if (weakKeyword) missingEvidence.push('meaningful-structure');

  return {
    version: 'visual-explanation-contract-v1',
    allow,
    communicationGain,
    visualCost,
    brandFit,
    renderRisk,
    stageMode,
    obligations,
    constraints,
    choreography: resolveChoreography(signals, obligations, captionRedundancy),
    evidenceAtomKeys,
    missingEvidence: unique(missingEvidence),
    calibration: {
      status: 'invented-needs-calibration',
      fields: [
        'communicationGain',
        'visualCost',
        'brandFit',
        'renderRisk',
        'stageMode',
        'obligationConfidence',
      ],
    },
  };
}

function collectObligations(
  content: Record<string, unknown>,
  structure: ContentStructureSignature,
  missingEvidence: string[],
): VisualObligation[] {
  const obligations: VisualObligation[] = [];

  if (hasRole(structure, 'list-items')) {
    const keys = partKeys(structure, ['list-items', 'title', 'body']);
    addObligation(obligations, 'preserve-order', keys, 0.86);
    addObligation(obligations, 'show-sequence', keys, 0.84);
    const cardinality = readNumber(structure.evidence, 'listCardinality');
    if (cardinality !== undefined && cardinality >= 2) addObligation(obligations, 'show-cardinality', keys, 0.72);
  }

  if (hasRole(structure, 'primary-value')) {
    const valueKeys = partKeys(structure, ['primary-value', 'supporting-label', 'quantity-kind', 'quantity-unit']);
    addObligation(obligations, 'show-magnitude', valueKeys, 0.82);
    const proportionKeys = partKeys(structure, ['primary-value', 'quantity-bounds', 'quantity-kind', 'quantity-unit']);
    if (hasRole(structure, 'quantity-bounds')) {
      addObligation(obligations, 'show-proportion', proportionKeys, 0.86);
    } else if (looksLikeProportion(content)) {
      missingEvidence.push('bounded-denominator-or-part-of-whole');
    }
  }

  if (hasRole(structure, 'series-values')) {
    const keys = partKeys(structure, ['series-values', 'series-labels']);
    addObligation(obligations, 'show-sequence', keys, 0.78);
    addObligation(obligations, 'show-cardinality', keys, 0.68);
  }

  if (hasRole(structure, 'compare-from') || hasRole(structure, 'compare-to')) {
    const keys = [
      ...partKeys(structure, ['compare-from', 'compare-to', 'supporting-label']),
      ...relationKeys(structure, ['compares']),
    ];
    if (hasRole(structure, 'compare-from') && hasRole(structure, 'compare-to') && hasRelation(structure, 'compares')) {
      addObligation(obligations, 'compare-peers', keys, 0.88);
    } else {
      missingEvidence.push('two-peer-comparison-relation');
    }
  }

  if (hasRelation(structure, 'refutes')) {
    addObligation(obligations, 'refute-claim', relationKeys(structure, ['refutes']), 0.82);
  }

  if (hasRole(structure, 'quote')) {
    addObligation(obligations, 'quote-proof', partKeys(structure, ['quote', 'author']), 0.82);
  }

  if (hasRole(structure, 'title') && hasRole(structure, 'body')) {
    addObligation(obligations, 'summarize-section', partKeys(structure, ['title', 'body']), 0.72);
  }

  if (hasConceptContextRelation(structure)) {
    addObligation(obligations, 'summarize-section', [
      ...partKeys(structure, ['keyword', 'body', 'context-phrase']),
      ...relationKeys(structure, ['context-for']),
    ], 0.94);
  }

  if (hasIdentityAnchor(structure)) {
    addObligation(obligations, 'locate-object', partKeys(structure, ['name', 'title']), 0.9);
  }

  if (hasSearchEvidence(content)) {
    addObligation(obligations, 'show-search-query', contentEvidenceKeys(content, ['query', 'searchQuery', 'url']), 0.78);
  }

  if (hasDeviceEvidence(content)) {
    addObligation(obligations, 'show-device-context', contentEvidenceKeys(content, ['device', 'screen', 'url', 'screenshot']), 0.76);
  }

  return obligations;
}

function resolveStageMode(
  content: Record<string, unknown>,
  structure: ContentStructureSignature,
  signals: Record<string, unknown>,
  obligations: VisualObligation[],
  communicationGain: number,
  screenPressure: number,
): MgStageMode {
  const transitionBoundaryStrength = readNumber(signals, 'transition_boundary_strength', 'structural.transition_boundary_strength') ?? 0;
  const visualComplexity = readNumber(signals, 'visual_complexity', 'visual.complexity') ?? 0;
  const negativeSpace = availableNegativeSpace(signals) ?? 1;

  if (hasSearchEvidence(content) || hasDeviceEvidence(content)) return 'device-or-screen-scene';
  if (transitionBoundaryStrength >= 0.72) return 'mg-led-transition';
  if (hasObligation(obligations, 'compare-peers') && screenPressure >= 0.42) return 'split-footage-graphic';
  if (
    hasConceptContextRelation(structure)
    && hasObligation(obligations, 'summarize-section')
    && communicationGain >= 0.32
    && hasTextCollision(signals)
  ) {
    return 'full-frame-graphic-scene';
  }
  if (
    hasIdentityAnchor(structure)
    && hasObligation(obligations, 'locate-object')
    && communicationGain >= 0.32
    && hasTextCollision(signals)
  ) {
    return 'full-frame-graphic-scene';
  }
  if (
    communicationGain >= 0.58
    && (
      screenPressure >= 0.58
      || visualComplexity >= 0.68
      || negativeSpace <= 0.22
    )
  ) {
    return 'full-frame-graphic-scene';
  }
  return 'overlay-on-footage';
}

function resolveChoreography(
  signals: Record<string, unknown>,
  obligations: VisualObligation[],
  captionRedundancy: number,
): VisualContractChoreography {
  const rhythmEvidenceKeys: string[] = [];
  const beat = readNumber(signals, 'beat_strength', 'beat', 'audio.music_beat') ?? 0;
  const speech = readNumber(signals, 'speech_energy', 'speech.energy') ?? 0;
  const visualSignificance = readNumber(signals, 'visual_significance', 'visual.significance') ?? 0;
  const transitionBoundaryStrength = readNumber(signals, 'transition_boundary_strength', 'structural.transition_boundary_strength') ?? 0;
  if (beat >= 0.5) rhythmEvidenceKeys.push('signal:beat_strength');
  if (speech >= 0.72) rhythmEvidenceKeys.push('signal:speech_energy');

  return {
    shouldCoordinateWithCaptions: captionRedundancy > 0.35 || hasObligation(obligations, 'reduce-redundancy'),
    shouldCoordinateWithZoom: visualSignificance >= 0.62,
    shouldCoordinateWithTransition: transitionBoundaryStrength >= 0.55,
    shouldCoordinateWithSfx: beat >= 0.65 || speech >= 0.82,
    rhythmEvidenceKeys,
  };
}

function buildConstraints(input: {
  captionRedundancy: number;
  evidenceAtomKeys: string[];
  missingEvidence: string[];
  screenPressure: number;
  stageMode: MgStageMode;
  weakKeyword: boolean;
}): VisualContractConstraint[] {
  const constraints: VisualContractConstraint[] = [
    {
      kind: 'no-invented-facts',
      reason: 'Visual obligations must preserve content truth and cite evidence.',
      evidenceAtomKeys: input.evidenceAtomKeys,
    },
    {
      kind: 'requires-evidence',
      reason: input.missingEvidence.length ? 'Some desired visual jobs lack evidence.' : 'Every rich visual job must remain evidence-backed.',
      evidenceAtomKeys: input.evidenceAtomKeys,
    },
    {
      kind: 'readability-floor',
      reason: 'Rendered text must remain legible before calibration or learning writes.',
      evidenceAtomKeys: input.evidenceAtomKeys,
    },
  ];
  if (input.captionRedundancy > 0.35) {
    constraints.push({
      kind: 'caption-zone-aware',
      reason: 'Caption redundancy is high; MG should coordinate rather than repeat caption text.',
      evidenceAtomKeys: ['signal:caption_redundancy'],
    });
  }
  if (input.screenPressure > 0.55) {
    constraints.push({
      kind: 'safe-zone',
      reason: 'Visual frame is busy or low on safe negative space.',
      evidenceAtomKeys: ['signal:screen_pressure'],
    });
  }
  if (input.weakKeyword || input.stageMode === 'overlay-on-footage') {
    constraints.push({
      kind: 'conservative-fallback',
      reason: 'Unknown or low-obligation content should stay conservative.',
      evidenceAtomKeys: input.evidenceAtomKeys,
    });
  }
  return constraints;
}

function addObligation(
  obligations: VisualObligation[],
  kind: VisualObligationKind,
  evidenceAtomKeys: string[],
  confidence: number,
): void {
  const keys = unique(evidenceAtomKeys);
  if (!keys.length) return;
  obligations.push({ kind, evidenceAtomKeys: keys, confidence: round4(clamp01(confidence)) });
}

function partKeys(structure: ContentStructureSignature, roles: ContentPartRole[]): string[] {
  return structure.parts
    .filter((part) => roles.includes(part.role))
    .map(partKey);
}

function relationKeys(structure: ContentStructureSignature, types: ContentStructureRelation['type'][]): string[] {
  return structure.relations
    .filter((relation) => types.includes(relation.type))
    .map((relation) => `relation:${relation.type}:${relation.fromRole}->${relation.toRole}`);
}

function contentEvidenceKeys(content: Record<string, unknown>, keys: string[]): string[] {
  return keys.filter((key) => content[key] != null).map((key) => `content:${key}`);
}

function partKey(part: ContentStructurePart): string {
  return `part:${part.sourceKey}:${part.role}`;
}

function hasRole(structure: ContentStructureSignature, role: ContentPartRole): boolean {
  return structure.parts.some((part) => part.role === role);
}

function hasRelation(structure: ContentStructureSignature, type: ContentStructureRelation['type']): boolean {
  return structure.relations.some((relation) => relation.type === type);
}

function hasConceptContextRelation(structure: ContentStructureSignature): boolean {
  return hasRole(structure, 'keyword')
    && (hasRole(structure, 'body') || hasRole(structure, 'context-phrase'))
    && hasRelation(structure, 'context-for');
}

function hasIdentityAnchor(structure: ContentStructureSignature): boolean {
  return hasRole(structure, 'name') && hasRole(structure, 'title');
}

function hasObligation(obligations: VisualObligation[], kind: VisualObligationKind): boolean {
  return obligations.some((obligation) => obligation.kind === kind);
}

function hasTextCollision(signals: Record<string, unknown>): boolean {
  return (readNumber(signals, 'text_on_screen', 'visual.text_on_screen') ?? 0) >= 0.45
    || (readNumber(signals, 'text_coverage', 'visual.text_coverage') ?? 0) >= 0.04
    || (readNumber(signals, 'text_box_count', 'visual.text_box_count') ?? 0) > 0;
}

function resolveMomentStrength(signals: Record<string, unknown>): number {
  return clamp01(
    (readNumber(signals, 'word_importance', 'word.importance') ?? 0) * 0.3
      + (readNumber(signals, 'speech_energy', 'speech.energy') ?? 0) * 0.24
      + (readNumber(signals, 'visual_dependency', 'visual.dependency') ?? 0) * 0.2
      + (readNumber(signals, 'cinematic_moment', 'composite.cinematic_moment') ?? 0) * 0.14
      + (readNumber(signals, 'visual_significance', 'visual.significance') ?? 0) * 0.12,
  );
}

function resolveScreenPressure(signals: Record<string, unknown>): number {
  const explicit = readNumber(signals, 'screen_pressure', 'visual.screen_pressure');
  if (explicit !== undefined) return clamp01(explicit);
  const negativeSpace = availableNegativeSpace(signals);
  return clamp01(
    (readNumber(signals, 'text_on_screen', 'visual.text_on_screen') ?? 0) * 0.28
      + Math.min(1, (readNumber(signals, 'text_box_count', 'visual.text_box_count') ?? 0) / 4) * 0.2
      + Math.min(1, (readNumber(signals, 'object_count', 'visual.object_count') ?? 0) / 8) * 0.18
      + (readNumber(signals, 'visual_complexity', 'visual.complexity') ?? 0) * 0.22
      + (negativeSpace === undefined ? 0 : (1 - clamp01(negativeSpace)) * 0.12),
  );
}

function overlayCrowding(input: VisualExplanationContractInput): number {
  return clamp01(Math.min(1, (
    input.activeOverlayContext?.activeOverlayCount
      ?? readNumber(input.signals, 'active_overlay_count', 'structural.active_overlays_count')
      ?? 0
  ) / 4));
}

function resolveBrandFit(brandHints: Record<string, unknown> | undefined): number {
  if (!brandHints) return 0.5;
  const confidence = readNumber(brandHints, 'confidence') ?? readNumber(brandHints, 'trust') ?? 0.5;
  const minimal = readNumber(brandHints, 'minimal') ?? 0;
  const expressive = readNumber(brandHints, 'expressive') ?? readNumber(brandHints, 'bold') ?? 0;
  return round4(clamp01(confidence * 0.7 + Math.max(minimal, expressive) * 0.3));
}

function isWeakKeywordOnly(content: Record<string, unknown>, structure: ContentStructureSignature): boolean {
  const keyword = stringValue(content.keyword) ?? stringValue(content.text);
  if (!keyword) return false;
  const hasOnlyKeywordStructure = structure.parts.every((part) => (
    part.role === 'keyword'
      || part.role === 'emphasis-text'
      || part.role === 'fallback-text'
      || part.role === 'caption-redundancy'
  ));
  return hasOnlyKeywordStructure && isFillerKeyword(keyword);
}

function isFillerKeyword(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.split(/\s+/).length <= 2 && [
    'people',
    'thing',
    'things',
    'this',
    'that',
    'it',
    'you',
    'they',
    'stuff',
    'idea',
  ].includes(normalized);
}

function hasSearchEvidence(content: Record<string, unknown>): boolean {
  return stringValue(content.query) !== undefined || stringValue(content.searchQuery) !== undefined;
}

function hasDeviceEvidence(content: Record<string, unknown>): boolean {
  return ['device', 'screen', 'url', 'screenshot'].some((key) => content[key] != null);
}

function looksLikeProportion(content: Record<string, unknown>): boolean {
  const raw = String(content.value ?? content.label ?? content.quantityKind ?? '');
  return raw.includes('%') || /\b(percent|percentage|share|ratio|fraction)\b/i.test(raw);
}

function readableWordCount(content: Record<string, unknown>): number {
  return ['title', 'body', 'text', 'quote', 'keyword', 'contextPhrase']
    .map((key) => stringValue(content[key]) ?? '')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function availableNegativeSpace(signals: Record<string, unknown>): number | undefined {
  const explicit = readNumber(signals, 'negative_space', 'visual.negative_space');
  if (explicit !== undefined) return explicit;
  const directional = [
    readNumber(signals, 'negative_space_top', 'visual.negative_space.top'),
    readNumber(signals, 'negative_space_right', 'visual.negative_space.right'),
    readNumber(signals, 'negative_space_bottom', 'visual.negative_space.bottom'),
    readNumber(signals, 'negative_space_left', 'visual.negative_space.left'),
  ].filter((value): value is number => value !== undefined);
  return directional.length ? Math.max(...directional) : undefined;
}

function readNumber(source: unknown, ...keys: string[]): number | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
