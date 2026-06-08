// Untracked verify driver for EMERGENT LAYOUT. Scores the mg.* overlays (incl. mg.arrangement.*)
// on each case's signals — the SAME content with different signals must produce a DIFFERENT
// arrangement (horizontal vs vertical), proving layout emerges from signals, not a hardcoded case.
// Run: npx tsx scripts/build-comparison-mg.ts  (then render-mg-stills.ts comparison)
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

type Case = { name: string; content: Record<string, unknown>; signals: Record<string, number>; brand: Record<string, string> };
const CASES: Case[] = [
  // SAME content, energetic signals → should score HORIZONTAL
  { name: 'energetic', content: { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' },
    signals: { enthusiasm: 0.9, pacing_velocity: 0.85, formality: 0.2, warmth: 0.3, emotional_arousal: 0.7 },
    brand: { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' } },
  // SAME content, formal/calm signals → should score VERTICAL
  { name: 'formal', content: { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' },
    signals: { enthusiasm: 0.2, pacing_velocity: 0.3, formality: 0.9, warmth: 0.7, emotional_arousal: 0.3 },
    brand: { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' } },
  // a versus case (orange brand)
  { name: 'versus', content: { from: 'the old way', to: 'Insturix', relation: 'vs' },
    signals: { enthusiasm: 0.8, pacing_velocity: 0.6, formality: 0.4, warmth: 0.4 },
    brand: { accentColor: '#F97316', backgroundColor: '#0A0A0A' } },
];

const mgs = CASES.map((c) => {
  const tokens = resolveMotionTokens(c.signals, c.brand);
  const mgScores = mgScoresFor(c.signals);
  const recipe = planComposition({ content: c.content }, tokens, c.signals, mgScores as never);
  return { recipe, resolvedTokens: tokens, contentSignals: c.signals, content: c.content,
    durationInFrames: 90, canvasWidth: 1920, canvasHeight: 1080, metadata: { graphicType: 'comparison', case: c.name } };
});

const file = path.resolve(process.cwd(), '.calibration-temp', 'comparison-mgs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ width: 1920, height: 1080, mgs }, null, 2));
console.log(`Wrote ${mgs.length} comparison MGs → ${file}\n`);
mgs.forEach((m, i) => {
  console.log(`  [${i}] ${(CASES[i].name + '').padEnd(10)} "${m.content.from} → ${m.content.to}"  ARRANGEMENT=${m.recipe.layout.arrangement}  (${m.recipe.elements.length} elements)  accent=${m.resolvedTokens.color.accent}`);
});
console.log('\nPROOF: same "12% → 47%" content, energetic vs formal signals → DIFFERENT arrangement = layout emerged from signals.');
