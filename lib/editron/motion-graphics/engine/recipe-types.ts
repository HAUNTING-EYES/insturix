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

export type EntrancePattern = 'fade' | 'slide-up' | 'slide-left' | 'slide-down' | 'slide-right' | 'scale-up' | 'pop' | 'blur-in' | 'draw';
export type ExitPattern = 'fade' | 'slide-down' | 'slide-left' | 'slide-right' | 'slide-up' | 'scale-down' | 'blur-out' | 'draw-reverse';
export type ExitStyle = 'reverse-stagger' | 'simultaneous-fade' | 'simultaneous-scale' | 'hold-then-fade';

export type ElementAnimation = 'count-up' | 'word-by-word' | 'word-highlight' | 'grow-up' | 'grow-right' | 'typewriter' | 'none';

export type SyncTarget = 'audio-beats' | 'word-timings' | 'even-stagger';

// --- Binding expressions ---
// Bindings are strings that resolve at runtime:
//   "token:color.accent"    → reads from VisualLanguage tokens
//   "content:name"          → reads from content data map
//   "constraint:typography.lower_third_name_min_font" → reads from CRG constraints
//   literal values (numbers, hex colors) pass through directly

export type BindingExpr = string | number | boolean;

// --- Recipe schema ---

export type DepthLayer = 'background' | 'midground' | 'foreground';

export interface RecipeElement {
  primitive: PrimitiveType;
  role: string;
  shape?: ShapeKind;
  animation?: ElementAnimation;
  layer?: DepthLayer;
  count?: number;
  repeat?: string;
  bind: Record<string, BindingExpr>;
  entranceOverride?: EntrancePattern;
  exitOverride?: ExitPattern;
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
  enterOrder: number;
  resolvedProps: Record<string, string | number | boolean>;
  entrancePattern: EntrancePattern;
  exitPattern: ExitPattern;
}

export interface ComputedChoreography {
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
