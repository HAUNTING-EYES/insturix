export type CurveType = 'linear' | 'polynomial' | 'logistic' | 'logit' | 'normal' | 'sine';

export interface CurveParams {
  slope: number;
  exponent: number;
  xShift: number;
  yShift: number;
}

export const DEFAULT_CURVE_PARAMS: CurveParams = {
  slope: 1,
  exponent: 1,
  xShift: 0,
  yShift: 0,
};

export interface Consideration {
  signalId: string;
  curveType: CurveType;
  params: CurveParams;
  invert: boolean;
  description: string;
}

export type OverlayCategory =
  | 'zoom'
  | 'transition'
  | 'sfx'
  | 'graphic'
  | 'filter'
  | 'caption'
  | 'cut'
  | 'camera'
  | 'mg-property';

export const CATEGORY_CONSTRAINTS: Record<OverlayCategory, { maxPerGridPoint: number; minGapFrames: number; global: boolean }> = {
  zoom:       { maxPerGridPoint: 1, minGapFrames: 90, global: false },
  transition: { maxPerGridPoint: 1, minGapFrames: 0,  global: false },
  sfx:        { maxPerGridPoint: 2, minGapFrames: 30, global: false },
  graphic:    { maxPerGridPoint: 1, minGapFrames: 90, global: false },
  filter:     { maxPerGridPoint: 1, minGapFrames: 0,  global: true },
  caption:    { maxPerGridPoint: 1, minGapFrames: 0,  global: true },
  cut:        { maxPerGridPoint: 1, minGapFrames: 60, global: false },
  camera:     { maxPerGridPoint: 1, minGapFrames: 60, global: false },
  'mg-property': { maxPerGridPoint: 99, minGapFrames: 0, global: true },
};

export interface OutputParam {
  name: string;
  mode: 'fixed' | 'proportional';
  fixedValue?: string | number | boolean;
  minValue?: number;
  maxValue?: number;
}

export interface OverlayDefinition {
  id: string;
  category: OverlayCategory;
  rank: number;
  weight: number;
  minScore: number;
  minGapFrames: number;
  considerations: Consideration[];
  outputParams: OutputParam[];
}

export interface ConsiderationScore {
  signalId: string;
  rawInput: number;
  curveOutput: number;
  compensated: number;
  description: string;
}

export interface ScoringResult {
  overlayId: string;
  category: OverlayCategory;
  rank: number;
  totalScore: number;
  considerationScores: ConsiderationScore[];
  outputValues: Record<string, number | string | boolean>;
  placementAdjustment?: PlacementAdjustment;
}

export interface GridPointDecision {
  frame: number;
  timestampMs: number;
  winners: Record<OverlayCategory, ScoringResult | null>;
  allScores: ScoringResult[];
}

export type ScoringMethod = 'multiplicative' | 'additive';

export type SignalSnapshot = Record<string, number>;

export type PlacementRegion =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'full-frame';

export interface PlacementBox {
  kind: 'avoid' | 'prefer';
  reason: string;
  region: PlacementRegion;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strength: number;
}

export interface PlacementHints {
  density: 'open' | 'balanced' | 'restrained';
  legibilityRisk: number;
  screenBusyness: number;
  avoid: PlacementBox[];
  prefer: PlacementBox[];
  constraints: string[];
}

export interface PlacementAdjustment {
  candidateRegion?: PlacementRegion;
  multiplier: number;
  penalty: number;
  bonus: number;
  avoidHits: string[];
  preferHits: string[];
  constraints: string[];
}

export interface ScoringContext {
  placementHints?: PlacementHints;
  candidateRegion?: PlacementRegion;
}
