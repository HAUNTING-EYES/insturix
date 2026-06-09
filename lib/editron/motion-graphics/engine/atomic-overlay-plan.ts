import type { BrandInputs, MotionTokens } from '../types';
import type {
  DepthLayer,
  EntrancePattern,
  ExitPattern,
  PrimitiveType,
  Recipe,
  ResolvedElement,
  ShapeKind,
  TextSplitMode,
} from './recipe-types';
import { deriveSpatialConfig } from './primitive-renderers';
import type { MgOverlayScores, PlannerSignals } from './composition-planner';
import { resolveElements } from './property-resolver';
import { deriveAtomicBrandProfile, type AtomicBrandProfile } from './brand-composition-rules';
import { deriveAtomicVisualContext, type AtomicVisualContext } from '../../engine/atomic-overlay-core';

export type AtomicMotionProperty =
  | 'x'
  | 'y'
  | 'z'
  | 'scaleX'
  | 'scaleY'
  | 'opacity'
  | 'rotateZ'
  | 'skewX'
  | 'blur'
  | 'clip';

export type AtomicMotionPhase = 'entrance' | 'hold' | 'exit' | 'custom';

export interface AtomicKeyframe {
  t: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface AtomicMotionTrack {
  property: AtomicMotionProperty;
  phase: AtomicMotionPhase;
  source: string;
  keyframes: AtomicKeyframe[];
}

export interface AtomicGeometryPart {
  kind: ShapeKind | 'glyph-run' | 'bar-rect' | 'arc' | 'polyline' | 'image-plane' | 'group';
  semantic: string;
  channel?: 'text' | 'shape' | 'data' | 'media' | 'group';
  purpose?: 'value' | 'label' | 'axis' | 'track' | 'fill' | 'portrait' | 'logo' | 'container' | 'connector' | 'decoration' | 'mask';
  quantity?: number;
  constraints?: {
    minReadablePx?: number;
    strokePx?: number;
    radiusPx?: number;
    aspectRatio?: number;
    maxCount?: number;
  };
}

export interface AtomicStructure {
  primitive: PrimitiveType;
  role: string;
  layer: DepthLayer;
  shape?: ShapeKind;
  dataShape?: 'bar-chart' | 'percentage-ring' | 'sparkline';
  text?: AtomicTextStructure;
  parts: AtomicGeometryPart[];
}

export interface AtomicTextStructure {
  glyphRole: 'value' | 'label' | 'headline' | 'subtitle' | 'connector' | 'quote' | 'name' | 'brand' | 'body' | 'fallback';
  hierarchy: 'primary' | 'secondary' | 'tertiary';
  emphasis: 'hero' | 'support' | 'annotation';
  casing: 'uppercase' | 'lowercase' | 'titlecase' | 'mixed';
  lines: string[];
  splitMode: TextSplitMode;
}

export interface AtomicTypography {
  family?: string;
  weight?: number;
  sizePx?: number;
  lineHeight?: number;
  tracking?: string;
  transform?: string;
}

export interface AtomicColor {
  text?: string;
  fill?: string;
  stroke?: string;
  accent: string;
  gradient?: string;
}

export interface AtomicElementPlan {
  id: string;
  renderKey?: string;
  parentRenderKey?: string;
  role: string;
  primitive: PrimitiveType;
  structure: AtomicStructure;
  typography?: AtomicTypography;
  color: AtomicColor;
  motion: {
    coordinateSystem: 'screen-xyz';
    neutralPosition: { x: number; y: number; z: number };
    tracks: AtomicMotionTrack[];
  };
  sourceBindings: string[];
}

export interface AtomicOverlayIntensity {
  motion: number;
  scale: number;
  opacity: number;
  blur: number;
  typography: number;
  structure: number;
  signal: number;
  overlayScore: number;
  overall: number;
}

export interface AtomicOverlayPlan {
  recipeId: string;
  layout: Recipe['layout'];
  exitStyle: Recipe['exitStyle'];
  brand?: AtomicBrandProfile;
  visualContext?: AtomicVisualContext;
  intensity: AtomicOverlayIntensity;
  elements: AtomicElementPlan[];
}

const SIGNAL_INTENSITY_WEIGHTS: Partial<Record<keyof PlannerSignals, number>> = {
  enthusiasm: 0.2,
  emotional_arousal: 0.2,
  pacing_velocity: 0.15,
  visceral_impact: 0.15,
  visual_dependency: 0.1,
  cinematic_moment: 0.2,
};

export function buildAtomicOverlayPlan(
  recipe: Recipe,
  tokens: MotionTokens,
  content: Record<string, unknown> = {},
  signals: Partial<PlannerSignals> = {},
  mgScores?: MgOverlayScores,
  brand: Partial<BrandInputs> = {},
): AtomicOverlayPlan {
  const resolved = flattenResolvedElements(resolveElements(recipe.elements, tokens, content));
  const elements = resolved.map((entry, index) => elementToAtomicPlan(entry, index, tokens));

  return {
    recipeId: recipe.id,
    layout: recipe.layout,
    exitStyle: recipe.exitStyle,
    brand: deriveAtomicBrandProfile(brand, tokens),
    visualContext: deriveAtomicVisualContext(signals as Record<string, unknown>),
    intensity: deriveOverlayIntensity(elements, signals, mgScores),
    elements,
  };
}

interface FlattenedResolvedElement {
  element: ResolvedElement;
  path: number[];
  parentRenderKey?: string;
}

function flattenResolvedElements(
  elements: ResolvedElement[],
  parentPath: number[] = [],
  parentRenderKey?: string,
): FlattenedResolvedElement[] {
  const flat: FlattenedResolvedElement[] = [];
  for (const [index, element] of elements.entries()) {
    const path = [...parentPath, index];
    const renderKey = atomicElementRenderKey(element, path);
    flat.push({ element, path, parentRenderKey });
    if (element.children?.length) {
      flat.push(...flattenResolvedElements(element.children, path, renderKey));
    }
  }
  return flat;
}

export function atomicElementRenderKey(element: Pick<ResolvedElement, 'primitive' | 'role'>, path: number[]): string {
  return `${path.join('.')}:${element.primitive}:${element.role}`;
}

function elementToAtomicPlan(
  entry: FlattenedResolvedElement,
  index: number,
  tokens: MotionTokens,
): AtomicElementPlan {
  const { element, path, parentRenderKey } = entry;
  const structure = deriveStructure(element);
  const renderKey = atomicElementRenderKey(element, path);
  return {
    id: `${element.role}-${index}`,
    renderKey,
    parentRenderKey,
    role: element.role,
    primitive: element.primitive,
    structure,
    typography: deriveTypography(element),
    color: deriveColor(element, tokens),
    motion: {
      coordinateSystem: 'screen-xyz',
      neutralPosition: { x: 0, y: 0, z: 0 },
      tracks: deriveMotionTracks(element, tokens, structure.layer),
    },
    sourceBindings: Object.keys(element.resolvedProps),
  };
}

function deriveStructure(element: ResolvedElement): AtomicStructure {
  const parts: AtomicGeometryPart[] = [];

  if (element.primitive === 'text') {
    parts.push(...textParts(element));
  } else if (element.primitive === 'data-viz') {
    parts.push(...dataVizParts(element));
  } else if (element.primitive === 'image') {
    parts.push({ kind: 'image-plane', semantic: element.role, channel: 'media', purpose: imagePurposeForRole(element.role) });
  } else if (element.primitive === 'group') {
    parts.push({
      kind: 'group',
      semantic: element.role,
      channel: 'group',
      purpose: 'container',
      quantity: element.children?.length,
    });
  } else if (element.shape) {
    parts.push(shapePart(element));
  } else {
    parts.push(shapePart({ ...element, shape: 'rect' }));
  }

  return {
    primitive: element.primitive,
    role: element.role,
    layer: element.layer ?? 'midground',
    shape: element.shape,
    dataShape: dataShapeForRole(element.role),
    text: element.primitive === 'text' ? textStructure(element) : undefined,
    parts,
  };
}

function dataShapeForRole(role: string): AtomicStructure['dataShape'] {
  if (role === 'bar-chart') return 'bar-chart';
  if (role === 'percentage-ring') return 'percentage-ring';
  if (role === 'sparkline') return 'sparkline';
  if (role === 'proportion-boundary-rule') return 'percentage-ring';
  return undefined;
}

function imagePurposeForRole(role: string): AtomicGeometryPart['purpose'] {
  if (role === 'avatar') return 'portrait';
  if (role === 'logo') return 'logo';
  return 'fill';
}

function textParts(element: ResolvedElement): AtomicGeometryPart[] {
  const text = asString(element.resolvedProps.text);
  const prefix = asString(element.resolvedProps.prefix);
  const suffix = asString(element.resolvedProps.suffix);
  const sizePx = asNumber(element.resolvedProps.minSize);
  const parts: AtomicGeometryPart[] = [{ kind: 'glyph-run', semantic: element.role }];

  if (prefix) {
    parts.push({
      kind: 'glyph-run',
      semantic: `${element.role}:prefix`,
      channel: 'text',
      purpose: 'label',
      quantity: prefix.length,
      constraints: { minReadablePx: sizePx },
    });
  }

  if (text) {
    parts.push({
      kind: 'glyph-run',
      semantic: `${element.role}:value`,
      channel: 'text',
      purpose: element.role === 'counter' || element.role === 'primary' ? 'value' : 'label',
      quantity: text.length,
      constraints: { minReadablePx: sizePx },
    });
  }

  if (suffix) {
    parts.push({
      kind: 'glyph-run',
      semantic: `${element.role}:suffix`,
      channel: 'text',
      purpose: 'label',
      quantity: suffix.length,
      constraints: { minReadablePx: sizePx },
    });
  }

  return parts;
}

function textStructure(element: ResolvedElement): AtomicTextStructure {
  const text = asString(element.resolvedProps.text) || '';
  const prefix = asString(element.resolvedProps.prefix) || '';
  const suffix = asString(element.resolvedProps.suffix) || '';
  const fullText = `${prefix}${text}${suffix}`;
  const role = element.role;

  return {
    glyphRole: glyphRoleForTextElement(role, text),
    hierarchy: hierarchyForTextRole(role),
    emphasis: emphasisForTextRole(role),
    casing: casingForText(element, fullText),
    lines: fullText.length > 0 ? fullText.split(/\r?\n/) : [],
    splitMode: element.textSplit ?? 'none',
  };
}

function glyphRoleForTextElement(role: string, text: string): AtomicTextStructure['glyphRole'] {
  if (role === 'counter') return 'value';
  if (role === 'primary') return looksLikeBrandText(text) ? 'brand' : 'headline';
  if (role === 'secondary') return 'subtitle';
  if (role === 'label') return isConnectorGlyph(text) ? 'connector' : 'label';
  if (role === 'quote') return 'quote';
  if (role === 'body') return 'body';
  return 'fallback';
}

function hierarchyForTextRole(role: string): AtomicTextStructure['hierarchy'] {
  if (role === 'counter' || role === 'primary') return 'primary';
  if (role === 'secondary') return 'secondary';
  return 'tertiary';
}

function emphasisForTextRole(role: string): AtomicTextStructure['emphasis'] {
  if (role === 'counter' || role === 'primary') return 'hero';
  if (role === 'secondary') return 'support';
  return 'annotation';
}

function casingForText(element: ResolvedElement, text: string): AtomicTextStructure['casing'] {
  const transform = asString(element.resolvedProps.transform)?.toLowerCase();
  if (transform === 'uppercase') return 'uppercase';
  if (transform === 'lowercase') return 'lowercase';
  if (text && text === text.toUpperCase() && /[A-Z]/.test(text)) return 'uppercase';
  if (text && text === text.toLowerCase() && /[a-z]/.test(text)) return 'lowercase';
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((word) => /^[A-Z][a-z0-9'’-]*$/.test(word))) return 'titlecase';
  return 'mixed';
}

function isConnectorGlyph(text: string): boolean {
  return text === 'vs' || text === '→' || text === '↓' || text === '->';
}

function looksLikeBrandText(text: string): boolean {
  return text.length > 1 && text === text.toUpperCase() && /[A-Z]/.test(text);
}

function dataVizParts(element: ResolvedElement): AtomicGeometryPart[] {
  const role = element.role;
  const values = asNumberArray(element.resolvedProps.values);
  const labels = asStringArray(element.resolvedProps.labels);
  const valueCount = values.length;

  if (role === 'percentage-ring') {
    return [
      { kind: 'arc', semantic: 'value-arc' },
      { kind: 'glyph-run', semantic: 'center-value' },
      {
        kind: 'arc',
        semantic: 'ring:track',
        channel: 'data',
        purpose: 'track',
        quantity: 1,
        constraints: { strokePx: 8, aspectRatio: 1 },
      },
      {
        kind: 'arc',
        semantic: 'ring:value-fill',
        channel: 'data',
        purpose: 'value',
        quantity: valueCount || 1,
        constraints: { strokePx: 8, aspectRatio: 1 },
      },
      {
        kind: 'glyph-run',
        semantic: 'ring:center-label',
        channel: 'text',
        purpose: 'value',
        quantity: String(values[0] ?? '').length,
      },
    ];
  }
  if (role === 'sparkline') {
    return [
      { kind: 'polyline', semantic: 'trend-line' },
      { kind: 'glyph-run', semantic: 'point-labels' },
      {
        kind: 'polyline',
        semantic: 'sparkline:value-path',
        channel: 'data',
        purpose: 'value',
        quantity: valueCount,
        constraints: { strokePx: 2 },
      },
      {
        kind: 'circle',
        semantic: 'sparkline:end-marker',
        channel: 'data',
        purpose: 'value',
        quantity: valueCount > 1 ? 1 : 0,
        constraints: { radiusPx: 3 },
      },
      ...labels.slice(0, 2).map((label, index) => ({
        kind: 'glyph-run' as const,
        semantic: `sparkline:label:${index}`,
        channel: 'text' as const,
        purpose: 'label' as const,
        quantity: label.length,
      })),
    ];
  }
  return [
    { kind: 'bar-rect', semantic: 'bar' },
    { kind: 'glyph-run', semantic: 'axis-label' },
    ...values.slice(0, 8).map((value, index) => ({
      kind: 'bar-rect' as const,
      semantic: `bar:${index}`,
      channel: 'data' as const,
      purpose: 'value' as const,
      quantity: value,
      constraints: { minReadablePx: 8, maxCount: 8 },
    })),
    ...labels.slice(0, 8).map((label, index) => ({
      kind: 'glyph-run' as const,
      semantic: `axis-label:${index}`,
      channel: 'text' as const,
      purpose: 'axis' as const,
      quantity: label.length,
      constraints: { minReadablePx: 12, maxCount: 8 },
    })),
  ];
}

function shapePart(element: ResolvedElement): AtomicGeometryPart {
  const width = asNumber(element.resolvedProps.width);
  const height = asNumber(element.resolvedProps.height);
  const radius = asNumber(element.resolvedProps.radius);
  const aspectRatio = width && height ? width / Math.max(1, height) : undefined;
  const purpose = element.primitive === 'mask' ? 'mask'
    : element.primitive === 'container' ? 'container'
      : element.role.includes('line') || element.shape === 'line' ? 'connector'
        : 'decoration';

  return compactObject({
    kind: element.shape ?? 'rect',
    semantic: element.role,
    channel: 'shape',
    purpose,
    constraints: compactObject({
      radiusPx: radius,
      aspectRatio,
    }),
  }) as AtomicGeometryPart;
}

function deriveTypography(element: ResolvedElement): AtomicTypography | undefined {
  if (element.primitive !== 'text' && element.primitive !== 'data-viz') return undefined;

  const props = element.resolvedProps;
  return compactObject({
    family: asString(props.font),
    weight: asNumber(props.weight),
    sizePx: asNumber(props.minSize),
    lineHeight: asNumber(props.lineHeight),
    tracking: asString(props.tracking),
    transform: asString(props.transform),
  });
}

function deriveColor(element: ResolvedElement, tokens: MotionTokens): AtomicColor {
  const props = element.resolvedProps;
  const color = asString(props.color);
  const fill = asString(props.fill);

  return compactObject({
    text: element.primitive === 'text' || element.primitive === 'data-viz' ? color : undefined,
    fill: element.primitive === 'text' || element.primitive === 'data-viz' ? undefined : fill,
    stroke: asString(props.strokeColor),
    accent: tokens.color.accent,
    gradient: asString(props.textGradient),
  });
}

function deriveMotionTracks(
  element: ResolvedElement,
  tokens: MotionTokens,
  layer: DepthLayer,
): AtomicMotionTrack[] {
  const spatial = deriveSpatialConfig(tokens);
  const tracks = [
    depthZTrack(layer, element.entrancePattern),
    ...entranceTracks(element.entrancePattern, spatial),
    ...holdTracks(element),
    ...exitTracks(element.exitPattern, spatial),
  ];

  return coalesceTracks(tracks);
}

function depthZTrack(layer: DepthLayer, source: string): AtomicMotionTrack {
  const target = depthZForLayer(layer);
  const from = target === 0 ? 0 : target * 0.25;
  return {
    property: 'z',
    phase: 'entrance',
    source: `depth:${source}`,
    keyframes: [
      { t: 0, value: from, easing: 'ease-out' },
      { t: 1, value: target, easing: 'ease-in-out' },
    ],
  };
}

function depthZForLayer(layer: DepthLayer): number {
  if (layer === 'foreground') return 24;
  if (layer === 'background') return -24;
  return 0;
}

function entranceTracks(pattern: EntrancePattern, s: ReturnType<typeof deriveSpatialConfig>): AtomicMotionTrack[] {
  const fromScale = pattern === 'pop' ? 0 : s.scaleFrom;

  switch (pattern) {
    case 'fade':
    case 'scramble':
      return [track('opacity', 'entrance', pattern, 0, 1)];
    case 'slide-left':
      return [track('x', 'entrance', pattern, -s.horizontalSlidePx, 0), track('opacity', 'entrance', pattern, 0, 1)];
    case 'slide-right':
      return [track('x', 'entrance', pattern, s.horizontalSlidePx, 0), track('opacity', 'entrance', pattern, 0, 1)];
    case 'slide-up':
      return [track('y', 'entrance', pattern, s.verticalSlidePx, 0), track('opacity', 'entrance', pattern, 0, 1)];
    case 'slide-down':
      return [track('y', 'entrance', pattern, -s.verticalSlidePx, 0), track('opacity', 'entrance', pattern, 0, 1)];
    case 'scale-up':
    case 'pop':
      return [
        track('scaleX', 'entrance', pattern, fromScale, 1),
        track('scaleY', 'entrance', pattern, fromScale, 1),
        track('opacity', 'entrance', pattern, 0, 1),
      ];
    case 'blur-in':
      return [track('blur', 'entrance', pattern, 20, 0), track('opacity', 'entrance', pattern, 0, 1)];
    case 'draw':
      return [track('clip', 'entrance', pattern, 0, 1)];
    case 'rotate-in':
      return [
        track('rotateZ', 'entrance', pattern, 15, 0),
        track('scaleX', 'entrance', pattern, s.scaleFrom, 1),
        track('scaleY', 'entrance', pattern, s.scaleFrom, 1),
        track('opacity', 'entrance', pattern, 0, 1),
      ];
    case 'skew-in':
      return [
        track('skewX', 'entrance', pattern, 10, 0),
        track('x', 'entrance', pattern, -s.horizontalSlidePx * 0.5, 0),
        track('opacity', 'entrance', pattern, 0, 1),
      ];
    case 'zoom-blur':
      return [
        track('scaleX', 'entrance', pattern, 2, 1),
        track('scaleY', 'entrance', pattern, 2, 1),
        track('blur', 'entrance', pattern, 30, 0),
        track('opacity', 'entrance', pattern, 0, 1),
      ];
    default:
      return [track('opacity', 'entrance', pattern, 0, 1)];
  }
}

function holdTracks(element: ResolvedElement): AtomicMotionTrack[] {
  const tracks: AtomicMotionTrack[] = [];
  for (const keyframeTrack of element.keyframeTracks ?? []) {
    const property = mapKeyframeProperty(keyframeTrack.property);
    if (!property) continue;
    tracks.push({
      property,
      phase: 'hold',
      source: keyframeTrack.property,
      keyframes: normalizeKeyframes(keyframeTrack.keyframes),
    });
  }
  return tracks;
}

function exitTracks(pattern: ExitPattern, s: ReturnType<typeof deriveSpatialConfig>): AtomicMotionTrack[] {
  switch (pattern) {
    case 'fade':
    case 'scramble-out':
      return [track('opacity', 'exit', pattern, 1, 0)];
    case 'slide-left':
      return [track('x', 'exit', pattern, 0, -s.horizontalSlidePx), track('opacity', 'exit', pattern, 1, 0)];
    case 'slide-right':
      return [track('x', 'exit', pattern, 0, s.horizontalSlidePx), track('opacity', 'exit', pattern, 1, 0)];
    case 'slide-up':
      return [track('y', 'exit', pattern, 0, -s.verticalSlidePx), track('opacity', 'exit', pattern, 1, 0)];
    case 'slide-down':
      return [track('y', 'exit', pattern, 0, s.verticalSlidePx), track('opacity', 'exit', pattern, 1, 0)];
    case 'scale-down':
      return [
        track('scaleX', 'exit', pattern, 1, 0),
        track('scaleY', 'exit', pattern, 1, 0),
        track('opacity', 'exit', pattern, 1, 0),
      ];
    case 'blur-out':
      return [track('blur', 'exit', pattern, 0, 20), track('opacity', 'exit', pattern, 1, 0)];
    case 'draw-reverse':
      return [track('clip', 'exit', pattern, 1, 0)];
    case 'rotate-out':
      return [
        track('rotateZ', 'exit', pattern, 0, -15),
        track('scaleX', 'exit', pattern, 1, 0),
        track('scaleY', 'exit', pattern, 1, 0),
        track('opacity', 'exit', pattern, 1, 0),
      ];
    case 'skew-out':
      return [
        track('skewX', 'exit', pattern, 0, -10),
        track('x', 'exit', pattern, 0, s.horizontalSlidePx * 0.5),
        track('opacity', 'exit', pattern, 1, 0),
      ];
    case 'zoom-blur-out':
      return [
        track('scaleX', 'exit', pattern, 1, 2),
        track('scaleY', 'exit', pattern, 1, 2),
        track('blur', 'exit', pattern, 0, 30),
        track('opacity', 'exit', pattern, 1, 0),
      ];
    default:
      return [track('opacity', 'exit', pattern, 1, 0)];
  }
}

function track(
  property: AtomicMotionProperty,
  phase: AtomicMotionPhase,
  source: string,
  from: number,
  to: number,
): AtomicMotionTrack {
  return {
    property,
    phase,
    source,
    keyframes: [
      { t: 0, value: from, easing: 'ease-out' },
      { t: 1, value: to, easing: 'ease-in-out' },
    ],
  };
}

function normalizeKeyframes(
  keyframes: Array<{ frame: number; value: number; easing: AtomicKeyframe['easing'] }>,
): AtomicKeyframe[] {
  const min = Math.min(...keyframes.map((kf) => kf.frame));
  const max = Math.max(...keyframes.map((kf) => kf.frame));
  const span = Math.max(1, max - min);
  return keyframes.map((kf) => ({
    t: (kf.frame - min) / span,
    value: kf.value,
    easing: kf.easing,
  }));
}

function mapKeyframeProperty(property: string): AtomicMotionProperty | undefined {
  switch (property) {
    case 'translateX': return 'x';
    case 'translateY': return 'y';
    case 'scaleX': return 'scaleX';
    case 'scaleY': return 'scaleY';
    case 'rotation': return 'rotateZ';
    case 'skewX': return 'skewX';
    case 'opacity': return 'opacity';
    case 'filterBlur': return 'blur';
    default: return undefined;
  }
}

function coalesceTracks(tracks: AtomicMotionTrack[]): AtomicMotionTrack[] {
  return tracks.filter((candidate, index) => {
    if (candidate.property !== 'z') return true;
    return index === tracks.findIndex((trackItem) => trackItem.property === 'z');
  });
}

function deriveOverlayIntensity(
  elements: AtomicElementPlan[],
  signals: Partial<PlannerSignals>,
  mgScores?: MgOverlayScores,
): AtomicOverlayIntensity {
  const motion = clamp01(maxTrackDelta(elements, ['x', 'y', 'z', 'rotateZ', 'skewX']) / 60);
  const scale = clamp01(maxTrackDelta(elements, ['scaleX', 'scaleY']));
  const opacity = clamp01(maxTrackDelta(elements, ['opacity']));
  const blur = clamp01(maxTrackDelta(elements, ['blur']) / 30);
  const typography = clamp01(maxTypographySize(elements) / 120);
  const structure = clamp01(elements.reduce((sum, element) => sum + element.structure.parts.length, 0) / 12);
  const signal = weightedSignalAverage(signals, SIGNAL_INTENSITY_WEIGHTS);
  const overlayScore = averageOverlayScore(mgScores);
  const overall = clamp01((
    motion * 0.18 +
    scale * 0.14 +
    opacity * 0.08 +
    blur * 0.08 +
    typography * 0.16 +
    structure * 0.16 +
    signal * 0.12 +
    overlayScore * 0.08
  ));

  return { motion, scale, opacity, blur, typography, structure, signal, overlayScore, overall };
}

function maxTrackDelta(elements: AtomicElementPlan[], properties: AtomicMotionProperty[]): number {
  let max = 0;
  for (const element of elements) {
    for (const motionTrack of element.motion.tracks) {
      if (!properties.includes(motionTrack.property)) continue;
      const values = motionTrack.keyframes.map((keyframe) => keyframe.value);
      max = Math.max(max, Math.max(...values) - Math.min(...values));
    }
  }
  return max;
}

function maxTypographySize(elements: AtomicElementPlan[]): number {
  return elements.reduce((max, element) => Math.max(max, element.typography?.sizePx ?? 0), 0);
}

function weightedSignalAverage(
  signals: Partial<PlannerSignals>,
  weights: Partial<Record<keyof PlannerSignals, number>>,
): number {
  let weighted = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as Array<[keyof PlannerSignals, number]>) {
    const value = signals[key];
    if (typeof value !== 'number' || !isFinite(value)) continue;
    weighted += clamp01(value) * weight;
    total += weight;
  }
  return total > 0 ? weighted / total : 0;
}

function averageOverlayScore(mgScores?: MgOverlayScores): number {
  if (!mgScores) return 0;
  const scores = Object.values(mgScores).map((entry) => entry.score).filter((score) => isFinite(score));
  if (scores.length === 0) return 0;
  return clamp01(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== '') result[key] = entry;
  }
  return result as T;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && isFinite(item))
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
