/**
 * Phase 1.1: Convert CRG Mappings → Utility AI OverlayDefinitions
 *
 * Reads creative-knowledge-graph.json, extracts 95 Mapping nodes,
 * converts each into an OverlayDefinition with linear considerations.
 * Phase 3 will upgrade these to response curves.
 *
 * Run: npx tsx scripts/convert-crg-to-overlays.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { OverlayDefinition, Consideration, OverlayCategory, OutputParam, CurveParams } from '../lib/editron/engine/utility-types';
import { DEFAULT_CURVE_PARAMS } from '../lib/editron/engine/utility-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CRG_PATH = path.join(__dirname, '../lib/editron/data/creative-knowledge-graph.json');
const OUTPUT_PATH = path.join(__dirname, '../lib/editron/engine/overlay-definitions.json');

interface CRGNode {
  id: string;
  type: string;
  category: string;
  name: string;
  summary: string;
  details?: {
    trigger?: string;
    primary?: string;
    complements?: string[];
    antiPatterns?: string[];
    weightResponse?: { high?: string; medium?: string; low?: string };
    why?: string;
    detectionHint?: string;
  };
}

const PRIMARY_TO_CATEGORY: Record<string, OverlayCategory> = {
  zoom_push: 'zoom',
  zoom_punch: 'zoom',
  zoom_pull_back: 'zoom',
  zoom_drift: 'zoom',
  zoom_reset: 'zoom',
  dissolve: 'transition',
  fade_to_black: 'transition',
  whip_pan: 'transition',
  flash: 'transition',
  hard_cut: 'transition',
  j_cut: 'transition',
  l_cut: 'transition',
  match_cut: 'transition',
  smash_cut: 'transition',
  jump_cut: 'transition',
  soft_cut: 'transition',
  dip_to_white: 'transition',
  blur_transition: 'transition',
  slide_transition: 'transition',
  stat_graphic: 'graphic',
  lower_third: 'graphic',
  keyword_highlight: 'graphic',
  callout: 'graphic',
  caption_emphasis: 'caption',
  sfx_impact: 'sfx',
  sfx_whoosh: 'sfx',
  sfx_spot: 'sfx',
  sfx_ambient_bed: 'sfx',
  music_duck: 'sfx',
  zoom_in: 'zoom',
  camera_shake: 'camera',
  speed_ramp: 'camera',
  film_grain: 'filter',
  color_grade: 'filter',
  vignette: 'filter',
};

function extractPrimaryAction(primary: string): string | null {
  if (!primary) return null;
  const lower = primary.toLowerCase().replace(/[^a-z0-9_\s]/g, '');
  for (const key of Object.keys(PRIMARY_TO_CATEGORY)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key)) {
      return key;
    }
  }
  if (lower.includes('hold') || lower.includes('do nothing') || lower.includes('no action')) return null;
  if (lower.includes('increase') || lower.includes('shorten') || lower.includes('extend')) return null;
  if (lower.includes('silence_removal') || lower.includes('filler')) return 'cut';
  return null;
}

interface ParsedComparison {
  signal: string;
  operator: string;
  value: number | boolean | string;
}

function extractComparisons(trigger: string): ParsedComparison[] {
  const comparisons: ParsedComparison[] = [];
  const pattern = /(\w[\w._]*)\s*(>=|<=|>|<|!=|=)\s*([\w.+-]+)/g;
  let match;
  while ((match = pattern.exec(trigger)) !== null) {
    const [, signal, op, rawValue] = match;
    const noise = new Set([
      'and', 'or', 'the', 'over', 'for', 'not', 'with', 'sustained', 'window',
      'dropping', 'rising', 'falling', 'was', 'max', 'min', 'delta', 'spike',
      'type', 'technique', 'duration', 'previous', 'incoming', 'continuous',
      'seconds', 'frames', 'percent', 'step', 'any', 'all', 'next', 'last',
      'value', 'than', 'least', 'most', 'both', 'same', 'different',
    ]);
    if (noise.has(signal.toLowerCase())) continue;
    if (signal.length <= 2) continue;
    let value: number | boolean | string = rawValue;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (!isNaN(Number(rawValue))) value = Number(rawValue);
    comparisons.push({ signal, operator: op, value });
  }
  return comparisons;
}

function comparisonToConsideration(comp: ParsedComparison, mappingName: string): Consideration | null {
  const signalId = comp.signal
    .replace(/^signal:/, '')
    .replace(/^entity_/, 'entity.')
    .replace(/^speech_/, 'speech.')
    .replace(/^visual_/, 'visual.')
    .replace(/^audio_/, 'audio.');

  if (typeof comp.value === 'boolean') {
    return {
      signalId,
      curveType: 'linear' as const,
      params: { ...DEFAULT_CURVE_PARAMS },
      invert: comp.value === false,
      description: `${mappingName}: ${signalId} = ${comp.value}`,
    };
  }

  if (typeof comp.value === 'number') {
    const threshold = comp.value;
    const isLessThan = comp.operator === '<' || comp.operator === '<=';

    if (isLessThan) {
      return {
        signalId,
        curveType: 'logistic' as const,
        params: {
          slope: 1,
          exponent: 1.5,
          xShift: -(0.5 - threshold),
          yShift: 0,
        },
        invert: true,
        description: `${mappingName}: ${signalId} ${comp.operator} ${threshold}`,
      };
    }

    return {
      signalId,
      curveType: 'logistic' as const,
      params: {
        slope: 1,
        exponent: 1.5,
        xShift: -(0.5 - threshold),
        yShift: 0,
      },
      invert: false,
      description: `${mappingName}: ${signalId} ${comp.operator} ${threshold}`,
    };
  }

  if (typeof comp.value === 'string') {
    return {
      signalId,
      curveType: 'linear' as const,
      params: { ...DEFAULT_CURVE_PARAMS },
      invert: comp.operator === '!=',
      description: `${mappingName}: ${signalId} = ${comp.value}`,
    };
  }

  return null;
}

function extractOutputParams(primary: string, action: string): OutputParam[] {
  const params: OutputParam[] = [];

  if (action.startsWith('zoom_push')) {
    const scaleMatch = primary.match(/(\d+\.?\d*)x\s*-?>?\s*(\d+\.?\d*)x/);
    params.push({
      name: 'scaleTo',
      mode: 'proportional',
      minValue: scaleMatch ? Number(scaleMatch[1]) : 1.0,
      maxValue: scaleMatch ? Number(scaleMatch[2]) : 1.1,
    });
  } else if (action.startsWith('zoom_punch')) {
    const scaleMatch = primary.match(/(\d+\.?\d*)x/);
    params.push({
      name: 'scaleTo',
      mode: 'proportional',
      minValue: 1.1,
      maxValue: scaleMatch ? Number(scaleMatch[1]) : 1.3,
    });
  } else if (action.startsWith('zoom_pull')) {
    params.push({ name: 'scaleTo', mode: 'proportional', minValue: 0.95, maxValue: 1.0 });
  } else if (action === 'stat_graphic' || action === 'lower_third' || action === 'keyword_highlight' || action === 'callout') {
    params.push({ name: 'graphicType', mode: 'fixed', fixedValue: action });
  } else if (action.startsWith('sfx_')) {
    params.push({ name: 'sfxType', mode: 'fixed', fixedValue: action });
    params.push({ name: 'volume', mode: 'proportional', minValue: 0.1, maxValue: 0.5 });
  } else if (action === 'camera_shake') {
    params.push({ name: 'intensity', mode: 'proportional', minValue: 0.02, maxValue: 0.08 });
  }

  return params;
}

function getMinGapFrames(category: OverlayCategory, action: string): number {
  switch (category) {
    case 'zoom': return action === 'zoom_punch' ? 600 : 90;
    case 'transition': return 0;
    case 'sfx': return 15;
    case 'graphic': return 90;
    case 'filter': return 0;
    case 'caption': return 0;
    case 'cut': return 60;
    case 'camera': return 60;
    default: return 90;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

const crg = JSON.parse(fs.readFileSync(CRG_PATH, 'utf-8'));
const mappings: CRGNode[] = crg.nodes.filter((n: CRGNode) => n.type === 'Mapping');

const definitions: OverlayDefinition[] = [];
const skipped: { id: string; reason: string }[] = [];

for (const mapping of mappings) {
  const trigger = mapping.details?.trigger ?? '';
  const primary = mapping.details?.primary ?? '';

  const action = extractPrimaryAction(primary);
  if (!action) {
    skipped.push({ id: mapping.id, reason: `no mappable action in primary: "${primary.substring(0, 60)}"` });
    continue;
  }

  const category = PRIMARY_TO_CATEGORY[action];
  if (!category) {
    skipped.push({ id: mapping.id, reason: `unknown action: ${action}` });
    continue;
  }

  const comparisons = extractComparisons(trigger);
  const considerations: Consideration[] = [];

  for (const comp of comparisons) {
    const consideration = comparisonToConsideration(comp, mapping.name);
    if (consideration) considerations.push(consideration);
  }

  if (considerations.length === 0) {
    considerations.push({
      signalId: 'speech.energy',
      curveType: 'linear',
      params: { ...DEFAULT_CURVE_PARAMS },
      invert: false,
      description: `${mapping.name}: fallback (trigger unparseable)`,
    });
    skipped.push({ id: mapping.id, reason: `trigger unparseable, added fallback: "${trigger.substring(0, 60)}"` });
  }

  const overlayId = `${mapping.category}.${action}_${mapping.id.replace('mapping:', '').replace(/\./g, '_')}`;

  const def: OverlayDefinition = {
    id: overlayId,
    category,
    rank: 50,
    weight: 1.0,
    minScore: 0.3,
    minGapFrames: getMinGapFrames(category, action),
    considerations,
    outputParams: extractOutputParams(primary, action),
  };

  definitions.push(def);
}

// ─── Output ────────────────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(definitions, null, 2));

console.log(`\nCRG → Overlay Conversion Complete`);
console.log(`  Total mappings:     ${mappings.length}`);
console.log(`  Converted:          ${definitions.length}`);
console.log(`  Skipped:            ${skipped.length}`);
console.log(`  Output:             ${OUTPUT_PATH}`);
console.log('');

if (skipped.length > 0) {
  console.log('Skipped mappings:');
  for (const s of skipped) {
    console.log(`  ${s.id}: ${s.reason}`);
  }
}

console.log('\nCategory breakdown:');
const catCount: Record<string, number> = {};
for (const d of definitions) {
  catCount[d.category] = (catCount[d.category] || 0) + 1;
}
for (const [k, v] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}
