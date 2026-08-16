/**
 * Writing Graph Query Service — Runtime interface to writing-knowledge.json
 *
 * The writing-side equivalent of lib/editron/services/graph-query.ts.
 *
 * KEY DIFFERENCE: Editing graph uses boolean triggers (pass/fail).
 * Writing graph uses scored activation (float 0-1). Same signal profile
 * → deterministic technique ranking → different techniques for different content.
 *
 * Selection algorithm: Part 4.0 of creative-content-knowledge.md.
 * Shared signal types: @insturix/signals (lib/shared/signals/).
 *
 * Consumers:
 *   - script-author-agent.ts (technique selection for prompt injection)
 *   - script-outline-agent.ts (structural technique selection)
 *   - stylist-agent.ts (constraint checking)
 *   - Brand Studio UI (signal definitions, technique browsing)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { CreativeSignals } from '../../shared/signals/types';

// ─── JSON Data Types ────────────────────────────────────────────────────────

interface ActivationCondition {
  signal: string;
  min?: number;
  max?: number;
  value?: string;
  weight: number;
}

interface Inhibitor {
  signal: string;
  threshold: number;
}

export interface SignalDefinition {
  id: string;
  axis: string;
  range: { type: 'continuous' | 'bipolar' | 'enum'; min?: number; max?: number; values?: string[] };
  scope: string;
  inference: string | null;
  campaignLockable: boolean;
  primary: boolean;
  anchors: Record<string, string>;
  grounding: string | null;
  sourceLines: [number, number];
}

export interface TechniqueCard {
  id: string;
  category: string;
  activation: ActivationCondition[];
  inhibitors: Inhibitor[];
  primary: string | null;
  complements?: string;
  antiPatterns?: string[];
  weightResponse?: Record<string, string>;
  why?: string;
  example?: string;
  whenToUse?: string;
  sourceLines: [number, number];
}

export interface ConstraintDef {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  deduction: number | null;
  detection: string | null;
  autoCorrection: string | null;
  why: string | null;
  overridable?: boolean | string;
  platforms?: string;
  section: string | null;
  sourceLines: [number, number];
}

export interface AntiAiFillerPattern {
  pattern: string;
  label: string;
}

export interface AntiAiConstraintBundle {
  constraints: ConstraintDef[];
  fillerPatterns: AntiAiFillerPattern[];
  promptGuidance: string;
}

export interface WritingKnowledgeBlockOptions {
  /** Server-owned feasibility constraints may rule out otherwise well-scored techniques. */
  excludeTechniqueIds?: readonly string[];
}

export interface PlatformSpec {
  name: string;
  lastVerified: string | null;
  characterLimits: Record<string, number>;
  durationLimits: { minSeconds?: number; maxSeconds?: number };
  sweetSpots: string[];
  sourceLines: [number, number];
}

interface WritingKnowledgeData {
  version: string;
  source: string;
  extractedAt: string;
  stats: { signals: number; techniques: number; constraints: number; platforms: number };
  selectionAlgorithm: {
    priorityRules: string[];
    qualityScoring: { startScore: number; autoReviewThreshold: number; belowStandard: number; hardReject: number };
  };
  signals: SignalDefinition[];
  techniques: TechniqueCard[];
  constraints: ConstraintDef[];
  platforms: PlatformSpec[];
}

// ─── Query Result Types ─────────────────────────────────────────────────────

export interface TechniqueResult {
  id: string;
  category: string;
  score: number;
  primary: string | null;
  antiPatterns?: string[];
  weightResponse?: Record<string, string>;
  why?: string;
  example?: string;
  whenToUse?: string;
}

export type QualityStatus = 'pass' | 'review' | 'below_standard' | 'reject';

export interface QualityScore {
  score: number;
  status: QualityStatus;
  violations: Array<{ id: string; severity: string; deduction: number }>;
}

// ─── Index ──────────────────────────────────────────────────────────────────

interface WritingIndex {
  version: string;
  signals: Map<string, SignalDefinition>;
  techniquesByCategory: Map<string, TechniqueCard[]>;
  techniquesById: Map<string, TechniqueCard>;
  constraints: Map<string, ConstraintDef>;
  constraintsBySection: Map<string, ConstraintDef[]>;
  platforms: Map<string, PlatformSpec>;
  primarySignals: SignalDefinition[];
  qualityScoring: { startScore: number; autoReviewThreshold: number; belowStandard: number; hardReject: number };
}

// ─── Loading ────────────────────────────────────────────────────────────────

let cachedIndex: WritingIndex | null = null;
let cachedAntiAiFillerPatterns: AntiAiFillerPattern[] | null = null;

function loadWritingGraph(): WritingIndex | null {
  if (cachedIndex) return cachedIndex;

  let data: WritingKnowledgeData;
  const attempts: string[] = [];
  if (typeof __dirname !== 'undefined') {
    attempts.push(join(__dirname, 'writing-knowledge.json'));
  }
  attempts.push(
    join(process.cwd(), 'lib', 'thinkforge', 'data', 'writing-knowledge.json'),
    join(process.cwd(), '.next', 'server', 'lib', 'thinkforge', 'data', 'writing-knowledge.json'),
  );

  let loaded = false;
  const failReasons: string[] = [];

  for (const attempt of attempts) {
    try {
      data = JSON.parse(readFileSync(attempt, 'utf8'));
      loaded = true;
      break;
    } catch (e: any) {
      failReasons.push(`${attempt}: ${e.code || e.message}`);
    }
  }

  if (!loaded) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      data = require('./writing-knowledge.json');
      loaded = true;
    } catch (e: any) {
      failReasons.push(`require(): ${e.code || e.message}`);
      console.error(`[WritingGraphQuery] FAILED ALL PATHS:\n  ${failReasons.join('\n  ')}`);
      return null;
    }
  }

  const index: WritingIndex = {
    version: data!.version,
    signals: new Map(),
    techniquesByCategory: new Map(),
    techniquesById: new Map(),
    constraints: new Map(),
    constraintsBySection: new Map(),
    platforms: new Map(),
    primarySignals: [],
    qualityScoring: data!.selectionAlgorithm.qualityScoring,
  };

  for (const signal of data!.signals) {
    index.signals.set(signal.id, signal);
    if (signal.primary) index.primarySignals.push(signal);
  }

  for (const technique of data!.techniques) {
    index.techniquesById.set(technique.id, technique);
    const cat = technique.category || 'unknown';
    if (!index.techniquesByCategory.has(cat)) index.techniquesByCategory.set(cat, []);
    index.techniquesByCategory.get(cat)!.push(technique);
  }

  for (const constraint of data!.constraints) {
    index.constraints.set(constraint.id, constraint);
    const section = constraint.section || 'unknown';
    if (!index.constraintsBySection.has(section)) index.constraintsBySection.set(section, []);
    index.constraintsBySection.get(section)!.push(constraint);
  }

  for (const platform of data!.platforms) {
    index.platforms.set(platform.name.toLowerCase(), platform);
  }

  cachedIndex = index;
  return index;
}

// ─── Signal Value Lookup ────────────────────────────────────────────────────

function getSignalValue(
  signals: Partial<CreativeSignals>,
  signalId: string,
): number | string | boolean | null {
  const val = (signals as Record<string, unknown>)[signalId];
  if (val === undefined) return null;
  return val as number | string | boolean | null;
}

// ─── Core Selection Algorithm (Part 4.0) ────────────────────────────────────

/**
 * Select and rank writing techniques for a given category based on signal profile.
 *
 * DETERMINISTIC: same signal profile → same technique ranking.
 * The LLM executes techniques; it does not choose them.
 *
 * Algorithm:
 *   1. Filter candidates by category
 *   2. Check inhibitors (hard reject)
 *   3. Score activation conditions: sum(signal_match * weight)
 *   4. Return top N with score > 0, sorted descending
 */
export function selectTechniques(
  signals: Partial<CreativeSignals>,
  category: string,
  maxResults: number = 3,
): TechniqueResult[] {
  const index = loadWritingGraph();
  if (!index) return [];

  const candidates = index.techniquesByCategory.get(category);
  if (!candidates) return [];

  const scored: TechniqueResult[] = [];

  for (const technique of candidates) {
    let score = 0;
    let inhibited = false;

    for (const inhibitor of technique.inhibitors) {
      const value = getSignalValue(signals, inhibitor.signal);
      if (typeof value === 'number' && value > inhibitor.threshold) {
        inhibited = true;
        break;
      }
    }
    if (inhibited) continue;

    for (const condition of technique.activation) {
      const value = getSignalValue(signals, condition.signal);

      if (condition.value !== undefined) {
        score += value === condition.value ? condition.weight : 0;
      } else if (condition.min !== undefined && condition.max !== undefined) {
        if (typeof value === 'number') {
          if (value >= condition.min && value <= condition.max) {
            score += condition.weight * value;
          } else {
            score -= condition.weight * 0.5;
          }
        }
      }
    }

    if (score > 0) {
      scored.push({
        id: technique.id,
        category: technique.category,
        score,
        primary: technique.primary,
        antiPatterns: technique.antiPatterns,
        weightResponse: technique.weightResponse,
        why: technique.why,
        example: technique.example,
        whenToUse: technique.whenToUse,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/**
 * Select techniques across ALL categories for a full signal profile.
 * Returns a map of category → ranked techniques.
 */
export function selectAllTechniques(
  signals: Partial<CreativeSignals>,
  maxPerCategory: number = 2,
): Map<string, TechniqueResult[]> {
  const index = loadWritingGraph();
  if (!index) return new Map();

  const result = new Map<string, TechniqueResult[]>();
  index.techniquesByCategory.forEach((_, category) => {
    const techniques = selectTechniques(signals, category, maxPerCategory);
    if (techniques.length > 0) result.set(category, techniques);
  });
  return result;
}

// ─── Quality Scoring ────────────────────────────────────────────────────────

/**
 * Compute quality score from a list of constraint violation IDs.
 *
 * Scoring: starts at 100, deducts per severity.
 *   < 70 = auto-review, < 50 = below standard, 0 = hard-reject.
 */
export function computeQualityScore(
  violationIds: string[],
): QualityScore {
  const index = loadWritingGraph();
  if (!index) return { score: 100, status: 'pass', violations: [] };

  const violations: QualityScore['violations'] = [];
  let totalDeduction = 0;

  for (const id of violationIds) {
    const constraint = index.constraints.get(id);
    if (!constraint) continue;

    const deduction = constraint.deduction ?? (
      constraint.severity === 'critical' ? 15 :
      constraint.severity === 'warning' ? 5 : 1
    );

    violations.push({ id, severity: constraint.severity, deduction });
    totalDeduction += deduction;
  }

  const score = Math.max(0, index.qualityScoring.startScore - totalDeduction);
  const status: QualityStatus =
    score <= index.qualityScoring.hardReject ? 'reject' :
    score < index.qualityScoring.belowStandard ? 'below_standard' :
    score < index.qualityScoring.autoReviewThreshold ? 'review' : 'pass';

  return { score, status, violations };
}

// ─── Lookup Functions ───────────────────────────────────────────────────────

export function getPrimarySignals(): SignalDefinition[] {
  const index = loadWritingGraph();
  return index?.primarySignals ?? [];
}

export function getSignalDefinition(signalId: string): SignalDefinition | null {
  const index = loadWritingGraph();
  return index?.signals.get(signalId) ?? null;
}

export function getAllSignals(): SignalDefinition[] {
  const index = loadWritingGraph();
  if (!index) return [];
  const result: SignalDefinition[] = [];
  index.signals.forEach(s => result.push(s));
  return result;
}

export function getTechniqueById(techniqueId: string): TechniqueCard | null {
  const index = loadWritingGraph();
  return index?.techniquesById.get(techniqueId) ?? null;
}

export function getTechniqueCategories(): string[] {
  const index = loadWritingGraph();
  if (!index) return [];
  const result: string[] = [];
  index.techniquesByCategory.forEach((_, k) => result.push(k));
  return result;
}

export function getConstraints(section?: string): ConstraintDef[] {
  const index = loadWritingGraph();
  if (!index) return [];
  if (section) return index.constraintsBySection.get(section) ?? [];
  const result: ConstraintDef[] = [];
  index.constraints.forEach(c => result.push(c));
  return result;
}

export function loadAntiAiFillerPatterns(): AntiAiFillerPattern[] {
  if (cachedAntiAiFillerPatterns) return cachedAntiAiFillerPatterns;

  const attempts: string[] = [];
  if (typeof __dirname !== 'undefined') {
    attempts.push(join(__dirname, 'ai-filler-patterns.json'));
  }
  attempts.push(
    join(process.cwd(), 'lib', 'thinkforge', 'data', 'ai-filler-patterns.json'),
    join(process.cwd(), '.next', 'server', 'lib', 'thinkforge', 'data', 'ai-filler-patterns.json'),
  );

  for (const attempt of attempts) {
    try {
      cachedAntiAiFillerPatterns = JSON.parse(readFileSync(attempt, 'utf8')) as AntiAiFillerPattern[];
      return cachedAntiAiFillerPatterns;
    } catch {
      // Try the next runtime path.
    }
  }

  cachedAntiAiFillerPatterns = [];
  return cachedAntiAiFillerPatterns;
}

function formatAntiAiConstraintForPrompt(constraint: ConstraintDef): string {
  const pieces = [
    constraint.detection ? `detect: ${constraint.detection}` : null,
    constraint.autoCorrection ? `fix: ${constraint.autoCorrection}` : null,
    constraint.why ? `why: ${constraint.why}` : null,
  ].filter(Boolean);

  return `- ${constraint.id} (${constraint.severity}): ${pieces.join(' | ')}`;
}

export function getAntiAiConstraintBundle(): AntiAiConstraintBundle {
  const constraints = getConstraints('Anti-AI Constraints');
  const hasFillerConstraint = constraints.some((constraint) => constraint.id === 'ai_filler_words');
  const fillerPatterns = hasFillerConstraint ? loadAntiAiFillerPatterns() : [];
  const fillerLabels = fillerPatterns.map((pattern) => pattern.label).filter(Boolean);
  const promptGuidance = [
    ...constraints.map(formatAntiAiConstraintForPrompt),
    fillerLabels.length > 0
      ? `- banned_phrase_list: ${fillerLabels.join(', ')}`
      : null,
  ].filter(Boolean).join('\n');

  return { constraints, fillerPatterns, promptGuidance };
}

/**
 * Render the writing knowledge graph into a prompt block: the top technique per category
 * (DO / EXAMPLE / WHY / NEVER), selected deterministically from the creative signals, plus a
 * grounded-specificity quality line. Single source of truth shared by every writer
 * (ScriptAuthor + the flat Post/Script writers) so technique injection can't drift between
 * stacks. Returns '' when nothing matches (caller omits the block). Never throws.
 */
export function buildWritingKnowledgeBlock(
  signals: Partial<CreativeSignals>,
  options: WritingKnowledgeBlockOptions = {},
): string {
  try {
    const techniqueMap = selectAllTechniques(signals, 2);
    const antiAiConstraints = getConstraints('Anti-AI Constraints');
    const excludedTechniqueIds = new Set(options.excludeTechniqueIds ?? []);

    if (techniqueMap.size === 0 && antiAiConstraints.length === 0) {
      return '';
    }

    const lines: string[] = ['<writing_knowledge>'];

    techniqueMap.forEach((techniques: TechniqueResult[], category: string) => {
      const top = techniques.find((technique) => !excludedTechniqueIds.has(technique.id));
      if (!top) return;
      lines.push(`${category.toUpperCase()}: ${top.id}`);
      if (top.primary) lines.push(`  DO: ${top.primary}`);
      if (top.example) lines.push(`  EXAMPLE: ${top.example}`);
      if (top.why) lines.push(`  WHY: ${top.why}`);
      if (top.antiPatterns && top.antiPatterns.length > 0) {
        lines.push(`  NEVER: ${top.antiPatterns.join(' | ')}`);
      }
    });

    lines.push('');
    lines.push('QUALITY: Be SPECIFIC with supplied facts only. If no metric is supplied, use concrete scene, pain, consequence, or image instead of inventing numbers. Vary sentence rhythm. No AI filler.');
    lines.push('</writing_knowledge>');
    return lines.join('\n');
  } catch (e) {
    console.error('[ThinkForge:WritingKnowledge] Failed to build knowledge block:', e);
    return '';
  }
}

export function getPlatform(name: string): PlatformSpec | null {
  const index = loadWritingGraph();
  return index?.platforms.get(name.toLowerCase()) ?? null;
}

export function getVersion(): string | null {
  const index = loadWritingGraph();
  return index?.version ?? null;
}
