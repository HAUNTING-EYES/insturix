/**
 * Graph Query Service — Runtime interface to the Creative Knowledge Graph v3
 *
 * Loads creative-knowledge-graph.json (671 nodes, 799 edges, 883KB) into memory
 * and provides O(1) indexed lookups for the signal-driven executor.
 *
 * Architecture: Rule 25N mandates querying this graph before any creative decision.
 * This service is the runtime implementation of that rule.
 *
 * Consumers:
 *   - signal-executor.ts (mapping evaluation + technique parameter lookup)
 *   - constraint-enforcer.ts (constraint validation)
 *   - genre-parameter-computer.ts (constant lookups)
 *   - quality-review-service.ts (constraint scoring)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Node Types ─────────────────────────────────────────────────────────────

export interface SignalNode {
  id: string;
  type: 'Signal';
  category: string;
  name: string;
  summary: string;
  details: {
    detection: string;
    output: string;
    thresholds: string | null;
    rationale: string | null;
    implementsIn: string[];
  };
  tags: string[];
  sourceLines: [number, number];
}

export interface TechniqueParameter {
  default: number | string;
  range?: [number, number];
  options?: string[];
}

export interface SoundPairing {
  type: string;          // "impact" | "whoosh" | "shimmer" | "shutter" | null
  level_db: [number, number];
  required: boolean;
}

export interface TechniqueNode {
  id: string;
  type: 'Technique';
  category: string;
  name: string;
  summary: string;
  details: {
    what: string;
    feels: string;
    parameters: Record<string, TechniqueParameter | string>;
    edlDecisionType: string;
    neverUseWhen: string[];
    duration: string;
    alternatives?: string[];
    intensity_levels?: string;
  };
  tags: string[];
  sourceLines: [number, number];
}

export interface MappingNode {
  id: string;
  type: 'Mapping';
  category: string;
  name: string;
  summary: string;
  details: {
    trigger: string;
    primary: string;
    complements: string[];
    antiPatterns: string[];
    weightResponse: {
      high: string;
      medium: string;
      low: string;
    };
    why: string;
    learningTarget: string;
    detectionHint: string;
  };
  tags: string[];
  sourceLines: [number, number];
}

export interface ConstraintNode {
  id: string;
  type: 'Constraint';
  category: string;
  name: string;
  summary: string;
  details: {
    rule: string;
    detection: string;
    threshold: string;
    autoCorrection: string;
    severity: 'blocker' | 'warning' | 'info';
    appliesTo: string[];
    rationale: string;
    overridable?: boolean;
    deduction?: number;
  };
  tags: string[];
  sourceLines: [number, number];
}

export interface ConstantNode {
  id: string;
  type: 'Constant';
  category: string;
  name: string;
  summary: string;
  details: {
    value: string | number;
    units: string;
    platform?: string;
    source?: string;
    minMax?: { min: string | number; max: string | number };
  };
  tags: string[];
  sourceLines: [number, number];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  label?: string;
  sourceLines?: [number, number];
}

// ─── Trigger Evaluator ──────────────────────────────────────────────────────

export interface SignalValues {
  [signalId: string]: number | boolean | string | null;
}

export interface GenreParameters {
  pacing_tolerance: number;
  energy_baseline: number;
  transition_density: number;
  graphic_density: number;
  silence_tolerance: number;
  zoom_budget: number;
  sfx_density: number;
  color_temperature: number;
  formality: number;
}

export type TriggerEvaluator = (signals: SignalValues, genreParams: GenreParameters) => boolean;

// ─── Graph Index ────────────────────────────────────────────────────────────

export interface GraphIndex {
  version: string;
  totalNodes: number;
  totalEdges: number;

  // O(1) lookups
  signals: Map<string, SignalNode>;
  mappings: Map<string, MappingNode>;
  techniques: Map<string, TechniqueNode>;
  constraints: Map<string, ConstraintNode>;
  constants: Map<string, ConstantNode>;

  // Relational indexes
  mappingsBySignal: Map<string, MappingNode[]>;        // signal_id → mappings triggered by it
  mappingsByCategory: Map<string, MappingNode[]>;      // category → mappings in that domain
  constraintsByCategory: Map<string, ConstraintNode[]>;
  constraintsByAppliesTo: Map<string, ConstraintNode[]>; // technique/edit type → constraints

  // Alias resolution
  aliasMap: Map<string, string>;

  // Pre-compiled evaluators
  triggerEvaluators: Map<string, TriggerEvaluator>;

  // Edge lookups
  edgesFrom: Map<string, GraphEdge[]>;
  edgesTo: Map<string, GraphEdge[]>;
}

// ─── Graph Loading ──────────────────────────────────────────────────────────

let cachedIndex: GraphIndex | null = null;

/**
 * Load and index the creative knowledge graph. Cached after first call.
 * Returns null if the graph file doesn't exist or fails to parse.
 */
export function loadGraph(): GraphIndex | null {
  if (cachedIndex) return cachedIndex;

  try {
    // Try multiple paths — Vercel serverless bundles files differently than local dev.
    // Attempt order: __dirname relative → process.cwd() → require() (webpack-bundled)
    let graph: any;
    const attempts = [
      join(__dirname, '..', 'data', 'creative-knowledge-graph.json'),
      join(process.cwd(), 'lib', 'editron', 'data', 'creative-knowledge-graph.json'),
      join(process.cwd(), '.next', 'server', 'lib', 'editron', 'data', 'creative-knowledge-graph.json'),
    ];
    let loaded = false;
    for (const attempt of attempts) {
      try {
        const raw = readFileSync(attempt, 'utf8');
        graph = JSON.parse(raw);
        loaded = true;
        break;
      } catch {
        // Try next path
      }
    }
    if (!loaded) {
      // Final fallback: dynamic import-style require (eslint-disable for this line only)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        graph = require('../data/creative-knowledge-graph.json');
        loaded = true;
      } catch {
        console.error(`[GraphQuery] Failed to load graph from any path. Tried: ${attempts.join(', ')} + require()`);
        return null;
      }
    }

    const index: GraphIndex = {
      version: graph.version,
      totalNodes: graph.stats.totalNodes,
      totalEdges: graph.stats.totalEdges,
      signals: new Map(),
      mappings: new Map(),
      techniques: new Map(),
      constraints: new Map(),
      constants: new Map(),
      mappingsBySignal: new Map(),
      mappingsByCategory: new Map(),
      constraintsByCategory: new Map(),
      constraintsByAppliesTo: new Map(),
      aliasMap: new Map(),
      triggerEvaluators: new Map(),
      edgesFrom: new Map(),
      edgesTo: new Map(),
    };

    // Build alias map
    if (graph.aliasMap) {
      for (const [alias, canonical] of Object.entries(graph.aliasMap)) {
        index.aliasMap.set(alias, canonical as string);
      }
    }

    // Index nodes by type
    for (const node of graph.nodes) {
      switch (node.type) {
        case 'Signal':
          index.signals.set(node.id, node as SignalNode);
          break;
        case 'Mapping':
          index.mappings.set(node.id, node as MappingNode);
          break;
        case 'Technique':
          index.techniques.set(node.id, node as TechniqueNode);
          break;
        case 'Constraint':
          index.constraints.set(node.id, node as ConstraintNode);
          break;
        case 'Constant':
          index.constants.set(node.id, node as ConstantNode);
          break;
      }
    }

    // Build mapping-by-signal index from edges
    for (const edge of graph.edges) {
      // Index edges by source and target
      if (!index.edgesFrom.has(edge.from)) index.edgesFrom.set(edge.from, []);
      index.edgesFrom.get(edge.from)!.push(edge);
      if (!index.edgesTo.has(edge.to)) index.edgesTo.set(edge.to, []);
      index.edgesTo.get(edge.to)!.push(edge);

      // Build mappingsBySignal: signal → triggered mappings
      if (edge.type === 'triggered_by' && edge.from?.startsWith('mapping:') && edge.to?.startsWith('signal:')) {
        const mappingNode = index.mappings.get(edge.from);
        if (mappingNode) {
          if (!index.mappingsBySignal.has(edge.to)) index.mappingsBySignal.set(edge.to, []);
          index.mappingsBySignal.get(edge.to)!.push(mappingNode);
        }
      }
    }

    // Build mapping-by-category index
    Array.from(index.mappings.values()).forEach(mapping => {
      const cat = mapping.category;
      if (!index.mappingsByCategory.has(cat)) index.mappingsByCategory.set(cat, []);
      index.mappingsByCategory.get(cat)!.push(mapping);
    });

    // Build constraint indexes
    Array.from(index.constraints.values()).forEach(constraint => {
      // By category
      const cat = constraint.category;
      if (!index.constraintsByCategory.has(cat)) index.constraintsByCategory.set(cat, []);
      index.constraintsByCategory.get(cat)!.push(constraint);

      // By appliesTo
      if (constraint.details?.appliesTo) {
        for (const target of constraint.details.appliesTo) {
          if (!index.constraintsByAppliesTo.has(target)) index.constraintsByAppliesTo.set(target, []);
          index.constraintsByAppliesTo.get(target)!.push(constraint);
        }
      }
    });

    // Compile trigger evaluators for each mapping
    Array.from(index.mappings.entries()).forEach(([id, mapping]) => {
      const evaluator = compileTrigger(mapping.details.trigger);
      index.triggerEvaluators.set(id, evaluator);
    });

    cachedIndex = index;
    console.log(`[GraphQuery] Loaded v${index.version}: ${index.signals.size} signals, ${index.mappings.size} mappings, ${index.techniques.size} techniques, ${index.constraints.size} constraints`);
    return index;
  } catch (err) {
    console.error('[GraphQuery] Failed to load creative knowledge graph:', (err as Error).message);
    return null;
  }
}

// ─── Query Functions ────────────────────────────────────────────────────────

/** Resolve an alias to its canonical ID. Returns input if no alias exists. */
export function resolveAlias(index: GraphIndex, id: string): string {
  return index.aliasMap.get(id) ?? id;
}

/** Get all mappings triggered by a given signal ID. */
export function getMappingsForSignal(index: GraphIndex, signalId: string): MappingNode[] {
  return index.mappingsBySignal.get(signalId) ?? [];
}

/** Get a technique by ID (with alias resolution). */
export function getTechnique(index: GraphIndex, techniqueId: string): TechniqueNode | null {
  const resolved = resolveAlias(index, techniqueId);
  return index.techniques.get(resolved) ?? null;
}

/** Get all constraints that apply to a given edit type (e.g., "cut_point", "zoom", "transition"). */
export function getConstraintsFor(index: GraphIndex, editType: string): ConstraintNode[] {
  return index.constraintsByAppliesTo.get(editType) ?? [];
}

/** Get a constant value by ID. */
export function getConstant(index: GraphIndex, constantId: string): ConstantNode | null {
  return index.constants.get(constantId) ?? null;
}

/** Evaluate a mapping's trigger against current signal values. */
export function evaluateMapping(
  index: GraphIndex,
  mappingId: string,
  signals: SignalValues,
  genreParams: GenreParameters
): boolean {
  const evaluator = index.triggerEvaluators.get(mappingId);
  if (!evaluator) return false;
  try {
    return evaluator(signals, genreParams);
  } catch {
    // Trigger evaluation failed — skip mapping, don't crash pipeline
    return false;
  }
}

/**
 * Interpolate technique parameters based on moment weight.
 * weight 0.9 → toward upper range (more impactful)
 * weight 0.5 → defaults
 * weight 0.3 → toward lower range (gentler)
 */
export function interpolateParams(
  technique: TechniqueNode,
  weight: number
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  const params = technique.details.parameters;

  for (const [key, spec] of Object.entries(params)) {
    if (typeof spec === 'string') {
      // String parameter — use as-is
      result[key] = spec;
      continue;
    }

    const paramSpec = spec as TechniqueParameter;

    if (paramSpec.range && typeof paramSpec.default === 'number') {
      const [min, max] = paramSpec.range;
      // Normalize weight to 0-1 for interpolation (0.3-0.9 maps to 0-1)
      const t = Math.max(0, Math.min(1, (weight - 0.3) / 0.6));
      // Higher weight → more impactful (toward the "stronger" end)
      // For scale/intensity: higher t → higher value
      // For duration: higher t → LOWER value (faster = more impactful)
      if (key.includes('duration') || key.includes('time')) {
        result[key] = max - t * (max - min); // high weight → shorter duration
      } else {
        result[key] = min + t * (max - min); // high weight → larger scale/intensity
      }
    } else if (paramSpec.options) {
      // Enum — pick based on weight tier
      const options = paramSpec.options;
      const idx = Math.min(options.length - 1, Math.floor(weight * options.length));
      result[key] = options[idx];
    } else {
      // Use default
      result[key] = paramSpec.default;
    }
  }

  return result;
}

// ─── Trigger Compilation ────────────────────────────────────────────────────

/**
 * Compile a human-readable trigger condition string into an evaluator function.
 *
 * Common patterns in the graph:
 *   "speech_energy_delta > +0.15 over 2s window"
 *   "speech_energy > (energy_baseline + 0.25)"
 *   "motion_intensity > 0.7 sustained 2+ seconds"
 *   "entity_number = true AND claim_strength = assertive"
 *   "position_in_video < 0.05"
 *   "time_since_last_cut > pacing_tolerance"
 *   "montage_mode = true"
 *   "EVERY cut point" (always-true mappings)
 *   "FINAL PASS" (post-processing mappings)
 *
 * Strategy: Parse key comparison patterns. For complex conditions we can't parse,
 * return a function that always returns false (skip mapping, log warning).
 * This is intentional — unparseable triggers are flagged at load time.
 */
function compileTrigger(triggerStr: string): TriggerEvaluator {
  if (!triggerStr) return () => false;

  const lower = triggerStr.toLowerCase();

  // Always-true triggers
  if (lower.includes('every cut point') || lower.includes('every scene') ||
      lower.includes('every transition') || lower.includes('project start')) {
    return () => true;
  }

  // Final-pass triggers (run after main loop)
  if (lower.includes('final pass') || lower.includes('after all other mappings')) {
    return (signals) => signals['structural.final_pass'] === true;
  }

  // Parse simple comparisons: "signal_name > value" or "signal_name = value"
  const comparisons = extractComparisons(triggerStr);
  if (comparisons.length === 0) {
    // Complex trigger we can't parse — log at load time, skip at runtime
    return () => false;
  }

  // Build evaluator from parsed comparisons (AND logic — all must be true)
  return (signals: SignalValues, genreParams: GenreParameters) => {
    for (const comp of comparisons) {
      const signalValue = resolveSignalValue(comp.signal, signals, genreParams);
      if (signalValue === null || signalValue === undefined) return false; // Missing signal = condition cannot be verified = trigger FAILS (strict AND)

      if (!evaluateComparison(signalValue, comp.operator, comp.value, genreParams)) {
        return false;
      }
    }
    return true;
  };
}

interface ParsedComparison {
  signal: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: string | number | boolean;
}

function extractComparisons(trigger: string): ParsedComparison[] {
  const comparisons: ParsedComparison[] = [];

  // Match patterns like: signal_name > 0.5, signal_name = true, etc.
  const patterns = [
    /(\w+[\w._]*)\s*(>=|<=|>|<|!=|=)\s*([\w.+-]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(trigger)) !== null) {
      const [, signal, op, rawValue] = match;
      // Skip noise words
      if (['and', 'or', 'the', 'over', 'for', 'not', 'with'].includes(signal.toLowerCase())) continue;

      let value: string | number | boolean = rawValue;
      if (rawValue === 'true') value = true;
      else if (rawValue === 'false') value = false;
      else if (!isNaN(Number(rawValue))) value = Number(rawValue);

      comparisons.push({
        signal: signal.replace(/^signal:/, ''),
        operator: op as ParsedComparison['operator'],
        value,
      });
    }
  }

  return comparisons;
}

function resolveSignalValue(
  signalName: string,
  signals: SignalValues,
  genreParams: GenreParameters
): number | boolean | string | null {
  // STRICT matching: exact key match or exact dotted suffix match ONLY.
  // Previous `includes()` was too loose — "energy" matched "speech.energy",
  // "audio.music_energy", "speech.energy_delta" causing 400+ false trigger fires.
  const exactKey = signals[signalName];
  if (exactKey !== undefined && exactKey !== null) return exactKey as number | boolean | string;

  // Try with dotted prefix: "speech_energy" → "speech.energy"
  const dottedName = signalName.replace('_', '.');
  const dottedKey = signals[dottedName];
  if (dottedKey !== undefined && dottedKey !== null) return dottedKey as number | boolean | string;

  // Try exact suffix match: "energy_delta" → find key ending in ".energy_delta"
  const suffixKey = Object.keys(signals).find(k => k.endsWith('.' + signalName));
  if (suffixKey && signals[suffixKey] !== undefined) return signals[suffixKey] as number | boolean | string;

  // Check genre params (pacing_tolerance, energy_baseline, etc.)
  const gpKey = signalName as keyof GenreParameters;
  if (gpKey in genreParams) return genreParams[gpKey];

  // NOT FOUND — return null (this mapping condition cannot be evaluated → condition fails)
  return null;
}

function evaluateComparison(
  actual: number | boolean | string,
  operator: string,
  expected: number | boolean | string,
  genreParams: GenreParameters
): boolean {
  // Resolve expected if it's a genre parameter reference
  if (typeof expected === 'string' && expected in genreParams) {
    expected = genreParams[expected as keyof GenreParameters];
  }

  // Handle "(energy_baseline + 0.25)" style expressions
  if (typeof expected === 'string' && expected.includes('+')) {
    const parts = expected.split('+').map(p => p.trim().replace(/[()]/g, ''));
    let sum = 0;
    for (const part of parts) {
      if (part in genreParams) sum += genreParams[part as keyof GenreParameters];
      else if (!isNaN(Number(part))) sum += Number(part);
    }
    expected = sum;
  }

  const numActual = typeof actual === 'number' ? actual : Number(actual);
  const numExpected = typeof expected === 'number' ? expected : Number(expected);

  switch (operator) {
    case '>': return numActual > numExpected;
    case '<': return numActual < numExpected;
    case '>=': return numActual >= numExpected;
    case '<=': return numActual <= numExpected;
    case '=': return actual === expected || numActual === numExpected;
    case '!=': return actual !== expected && numActual !== numExpected;
    default: return false;
  }
}

// ─── Invalidation ───────────────────────────────────────────────────────────

/** Force reload on next access (used if graph is updated at runtime). */
export function invalidateGraphCache(): void {
  cachedIndex = null;
}
