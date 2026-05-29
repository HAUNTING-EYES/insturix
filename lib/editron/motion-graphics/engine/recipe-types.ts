import type { MotionTokens } from '../types';

// --- Primitives ---

export type PrimitiveType =
  | 'shape'
  | 'text'
  | 'image'
  | 'video-clip'
  | 'mask'
  | 'container'
  | 'decoration'
  | 'data-viz'
  | 'particle'
  | 'gradient'
  | 'pattern';

export type ShapeKind = 'rect' | 'circle' | 'line' | 'path' | 'pill';

export type EntrancePattern = 'fade' | 'slide-up' | 'slide-left' | 'slide-down' | 'slide-right' | 'scale-up' | 'pop' | 'blur-in' | 'draw' | 'rotate-in' | 'skew-in' | 'zoom-blur' | 'scramble';
export type ExitPattern = 'fade' | 'slide-down' | 'slide-left' | 'slide-right' | 'slide-up' | 'scale-down' | 'blur-out' | 'draw-reverse' | 'rotate-out' | 'skew-out' | 'zoom-blur-out' | 'scramble-out';
export type ExitStyle = 'reverse-stagger' | 'simultaneous-fade' | 'simultaneous-scale' | 'hold-then-fade';

export type ElementAnimation = 'count-up' | 'word-by-word' | 'word-highlight' | 'grow-up' | 'grow-right' | 'typewriter' | 'none';

export type HoldPattern = 'static' | 'pulse' | 'breathe' | 'gentle-float' | 'glow' | 'morph';

export type SyncTarget = 'audio-beats' | 'word-timings' | 'even-stagger';

// --- D8: Crazy Edits — Keyframes + Speed Ramp ---

export type MGAnimatableProperty =
  | 'translateX' | 'translateY'
  | 'scaleX' | 'scaleY'
  | 'rotation' | 'skewX'
  | 'opacity'
  | 'filterBlur' | 'filterBrightness';

export interface MGKeyframe {
  frame: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface MGKeyframeTrack {
  property: MGAnimatableProperty;
  keyframes: MGKeyframe[];
}

export interface MGSpeedRamp {
  speedCurve: MGKeyframe[];
}

// --- Binding expressions ---
// Bindings are strings that resolve at runtime:
//   "token:color.accent"    → reads from VisualLanguage tokens
//   "content:name"          → reads from content data map
//   "constraint:typography.lower_third_name_min_font" → reads from CRG constraints
//   literal values (numbers, hex colors) pass through directly

export type BindingExpr = string | number | boolean;

// --- Recipe schema ---

export type DepthLayer = 'background' | 'midground' | 'foreground';

export type TextSplitMode = 'none' | 'chars' | 'words';

// Structural-move anchoring. Lets a primitive attach RELATIVE to the content block
// instead of flowing in the flex column. Resolved deterministically via CSS (no DOM
// measurement — Remotion renders frame-by-frame and must stay deterministic).
//   flow       → normal flex child; array order positions it (kicker, divider, underline)
//   block-fill → position:absolute, inset around content block (backdrop, corner frame)
//   block-edge → pinned to one side of the block (side-bar = left, accent-line = bottom)
export interface ElementAnchor {
  mode: 'flow' | 'flow-span' | 'block-fill' | 'block-edge';
  side?: 'top' | 'bottom' | 'left' | 'right';
  thickness?: number; // px — bar width (left/right) or height (top/bottom) for block-edge;
                      // also the line height for flow-span rules (divider/underline)
  inset?: number;     // px — padding around content for block-fill (negative bleeds past)
}

export interface RecipeElement {
  primitive: PrimitiveType;
  role: string;
  shape?: ShapeKind;
  animation?: ElementAnimation;
  layer?: DepthLayer;
  count?: number;
  repeat?: string;
  bind: Record<string, BindingExpr>;
  anchor?: ElementAnchor;
  entranceOverride?: EntrancePattern;
  exitOverride?: ExitPattern;
  holdAnimation?: HoldPattern;
  keyframeTracks?: MGKeyframeTrack[];
  speedRamp?: MGSpeedRamp;
  textSplit?: TextSplitMode;
  scrambleChars?: string;
  morphTarget?: string;
}

export interface RecipeLayout {
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center' | 'full-width-bottom' | 'full-width-top';
  captionZoneAware?: boolean;
  maxWidth?: string;
  arrangement?: 'horizontal-distributed' | 'vertical-stack' | 'grid';
}

export interface RecipeChoreography {
  pattern?: 'staggered' | 'word-stagger' | 'left-to-right-stagger' | 'simultaneous';
  syncTo?: SyncTarget;
}

export interface Recipe {
  id: string;
  elements: RecipeElement[];
  layout: RecipeLayout;
  choreography?: RecipeChoreography;
  exitStyle: ExitStyle;
}

// --- Resolved state (after binding resolution) ---

export interface ResolvedElement {
  primitive: PrimitiveType;
  role: string;
  shape?: ShapeKind;
  animation?: ElementAnimation;
  holdAnimation?: HoldPattern;
  layer?: DepthLayer;
  anchor?: ElementAnchor;
  enterOrder: number;
  resolvedProps: Record<string, string | number | boolean>;
  entrancePattern: EntrancePattern;
  exitPattern: ExitPattern;
  keyframeTracks?: MGKeyframeTrack[];
  speedRamp?: MGSpeedRamp;
  textSplit?: TextSplitMode;
  scrambleChars?: string;
  morphTarget?: string;
}

export interface ComputedChoreography {
  // Disney #2 — Anticipation: optional reverse movement before entrance
  anticipateStartFrame?: number;
  anticipateEndFrame?: number;
  enterStartFrame: number;
  enterEndFrame: number;
  holdStartFrame: number;
  holdEndFrame: number;
  exitStartFrame: number;
  exitEndFrame: number;
  enterEasing: (t: number) => number;
  exitEasing: (t: number) => number;
}

export interface ResolvedComposition {
  elements: ResolvedElement[];
  choreography: Map<string, ComputedChoreography>;
  layout: RecipeLayout;
  totalDurationFrames: number;
}

// --- Hierarchy constraint envelope ---

export interface TokenConstraint {
  allowed?: string[];
  min?: number;
  max?: number;
  locked?: string | number | boolean;
  default?: string | number | boolean;
}

export type HierarchyScope = 'brand' | 'campaign' | 'format' | 'project' | 'act' | 'scene';

export interface HierarchyScopeOverrides {
  scope: HierarchyScope;
  constraints: Record<string, TokenConstraint>;
}

// --- Content shape analysis (replaces GraphicPurpose enum) ---

export type ContentShapeKind =
  | 'numeric'
  | 'identity'
  | 'quotation'
  | 'emphasis'
  | 'data-series'
  | 'brand'
  | 'structured'
  | 'free-text';

export type ContentShape =
  | { kind: 'numeric'; value: string; label?: string; prefix?: string; suffix?: string }
  | { kind: 'identity'; name: string; title?: string; avatar?: string }
  | { kind: 'quotation'; quote: string; author?: string }
  | { kind: 'emphasis'; text: string; weight: 'light' | 'medium' | 'heavy' }
  | { kind: 'data-series'; values: number[]; labels?: string[] }
  | { kind: 'brand'; text: string; logo?: string }
  | { kind: 'structured'; title: string; body?: string; items?: string[] }
  | { kind: 'free-text'; text: string };

export interface CompositionStrategy {
  shapes: ContentShape[];
  suggestedLayout: RecipeLayout;
  suggestedExitStyle: ExitStyle;
  complexityBudget: number;
  holdDurationFrames: number;
}

// --- Composition planner input ---

export interface GraphicIntent {
  kind?: ContentShapeKind;
  content: Record<string, unknown>;
  triggerMoment?: string;
}

// --- Composition renderer props ---

export interface CompositionRendererProps {
  recipe: Recipe;
  language: MotionTokens;
  content: Record<string, unknown>;
  durationInFrames: number;
}
