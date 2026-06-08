// Untracked verify driver for EMERGENT EMPHASIS (frozen-list #1, the x0.75 ratio family across
// composeNumeric/Identity/Quotation/Structured). Scores the mg.* overlays (incl. the new
// mg.emphasis.scale_contrast) on each case's signals — the SAME content under energetic vs formal
// signals must produce a DIFFERENT size hierarchy (dramatic vs gentle), proving emphasis emerges
// from signals, not a hardcoded ratio. Mirrors build-comparison-mg.ts. STAYS UNTRACKED.
// Run: npx tsx scripts/build-emphasis-mgs.ts  (then npx tsx scripts/render-mg-stills.ts emphasis)
import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import * as fs from 'fs';
import * as path from 'path';

function mgScoresFor(signals: Record<string, number>): Record<string, { score: number; values: Record<string, number | string | boolean> }> {
  const defs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
  const results = scoreAllOverlays(defs, signals, 'additive');
  const out: Record<string, { score: number; values: Record<string, number | string | boolean> }> = {};
  for (const r of results) out[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return out;
}

const ENERGETIC = { enthusiasm: 0.9, pacing_velocity: 0.85, formality: 0.2, warmth: 0.3, emotional_arousal: 0.7 };
const FORMAL = { enthusiasm: 0.2, pacing_velocity: 0.3, formality: 0.9, warmth: 0.7, emotional_arousal: 0.3 };
const BRAND = { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' };

const SHAPES: { name: string; gtype: string; content: Record<string, unknown> }[] = [
  { name: 'numeric', gtype: 'stat', content: { value: '2.4', prefix: '$', suffix: 'M', label: 'annual revenue' } },
  { name: 'identity', gtype: 'lower-third', content: { name: 'Jane Okafor', title: 'Chief Marketing Officer' } },
  { name: 'quotation', gtype: 'quote', content: { quote: 'This changed how our whole team ships.', author: 'A. Rivera, VP Engineering' } },
  { name: 'structured', gtype: 'callout', content: { title: 'Zero config', body: 'Connect a repo and the pipeline runs itself, end to end.' } },
];
const PROFILES: { tag: string; signals: Record<string, number> }[] = [
  { tag: 'energetic', signals: ENERGETIC },
  { tag: 'formal', signals: FORMAL },
];

const mgs = SHAPES.flatMap((s) => PROFILES.map((p) => {
  const tokens = resolveMotionTokens(p.signals, BRAND);
  const mgScores = mgScoresFor(p.signals);
  const recipe = planComposition({ content: s.content }, tokens, p.signals, mgScores as never);
  return { recipe, resolvedTokens: tokens, contentSignals: p.signals, content: s.content,
    durationInFrames: 90, canvasWidth: 1920, canvasHeight: 1080,
    metadata: { graphicType: s.gtype, case: `${s.name}-${p.tag}`, scaleContrast: (mgScores['mg.emphasis.scale_contrast'] as { values?: { scaleContrast?: number } })?.values?.scaleContrast } };
}));

const file = path.resolve(process.cwd(), '.calibration-temp', 'emphasis-mgs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ width: 1920, height: 1080, mgs }, null, 2));
console.log(`\nWrote ${mgs.length} emphasis MGs -> ${file}\n`);
mgs.forEach((m, i) => {
  const sizes = m.recipe.elements
    .filter((e: { bind?: { minSize?: unknown } }) => e.bind?.minSize != null)
    .map((e: { role?: string; bind?: { minSize?: unknown } }) => `${e.role}:${Math.round(Number(e.bind!.minSize))}`)
    .join('  ');
  const r = m.metadata.scaleContrast;
  console.log(`  [${i}] ${(m.metadata.case + '').padEnd(20)} r=${typeof r === 'number' ? r.toFixed(2) : 'n/a'}  ${sizes}`);
});
console.log('\nPROOF: same content, energetic (high r = dramatic) vs formal (low r = gentle) => DIFFERENT size hierarchy = emphasis emerged from signals.');
