import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import defs from '../lib/editron/engine/overlay-definitions.json';
import type { OverlayDefinition, SignalSnapshot, ScoringResult } from '../lib/editron/engine/utility-types';

const mgDefs = (defs as OverlayDefinition[]).filter(d => d.category === 'mg-property');
const mgPropertyIds = new Set([
  'mg.typography.font_size', 'mg.typography.font_weight', 'mg.typography.letter_tracking',
  'mg.typography.line_height', 'mg.typography.text_transform_tendency',
  'mg.layout.center_avoidance',
  'mg.styling.container_opacity', 'mg.styling.corner_radius', 'mg.styling.surface_complexity',
  'mg.color.saturation_boost', 'mg.color.accent_usage',
  'mg.animation.entrance_speed',
]);
const mgPropertyDefs = mgDefs.filter(d => mgPropertyIds.has(d.id));
const mgSelectionDefs = mgDefs.filter(d => !mgPropertyIds.has(d.id));
console.log(`MG overlay definitions loaded: ${mgDefs.length} (${mgPropertyDefs.length} properties, ${mgSelectionDefs.length} selections)`);

const profiles: Record<string, SignalSnapshot> = {
  'Energetic Vlog': { enthusiasm: 0.85, warmth: 0.7, formality: 0.2, emotional_arousal: 0.6, pacing_velocity: 0.7, visceral_impact: 0.6, visual_dependency: 0.3, humor: 0.3, 'speech.coverage': 0.65 },
  'Calm Corporate': { enthusiasm: 0.3, warmth: 0.3, formality: 0.8, emotional_arousal: 0.2, pacing_velocity: 0.3, visceral_impact: 0.2, visual_dependency: 0.5, humor: 0.05, 'speech.coverage': 0.7 },
  'Product Ad':     { enthusiasm: 0.7, warmth: 0.4, formality: 0.4, emotional_arousal: 0.5, pacing_velocity: 0.8, visceral_impact: 0.8, visual_dependency: 0.7, humor: 0.1, 'speech.coverage': 0.3 },
  'Documentary':    { enthusiasm: 0.3, warmth: 0.6, formality: 0.6, emotional_arousal: 0.5, pacing_velocity: 0.3, visceral_impact: 0.4, visual_dependency: 0.4, humor: 0.05, 'speech.coverage': 0.8 },
  'Music Video':    { enthusiasm: 0.9, warmth: 0.5, formality: 0.15, emotional_arousal: 0.8, pacing_velocity: 0.9, visceral_impact: 0.9, visual_dependency: 0.8, humor: 0.1, 'speech.coverage': 0.1 },
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; process.stdout.write(`  ✓ ${msg}\n`); }
  else { failed++; process.stdout.write(`  ✗ FAIL: ${msg}\n`); }
}

function scoreMG(signals: SignalSnapshot): { properties: ScoringResult[]; selections: ScoringResult[] } {
  const properties = scoreAllOverlays(mgPropertyDefs, signals, 'additive');
  const selections = scoreAllOverlays(mgSelectionDefs, signals, 'multiplicative');
  return { properties, selections };
}

function getVal(results: ScoringResult[], id: string, param: string): number {
  return (results.find(r => r.overlayId === id)?.outputValues[param] as number) ?? NaN;
}

for (const [name, signals] of Object.entries(profiles)) {
  const { properties, selections } = scoreMG(signals);
  const all = [...properties, ...selections];
  console.log(`\n=== ${name} ===`);
  console.log(`  Properties scored: ${properties.length}/${mgPropertyDefs.length} | Selections scored: ${selections.length}/${mgSelectionDefs.length}`);

  const fontSize = getVal(properties, 'mg.typography.font_size', 'fontSize');
  const fontWeight = getVal(properties, 'mg.typography.font_weight', 'fontWeight');
  const tracking = getVal(properties, 'mg.typography.letter_tracking', 'letterTracking');
  const lineHeight = getVal(properties, 'mg.typography.line_height', 'lineHeight');
  const cornerRadius = getVal(properties, 'mg.styling.corner_radius', 'cornerRadius');
  const opacity = getVal(properties, 'mg.styling.container_opacity', 'containerOpacity');
  const entranceSpeed = getVal(properties, 'mg.animation.entrance_speed', 'entranceSpeed');
  const saturation = getVal(properties, 'mg.color.saturation_boost', 'saturationBoost');
  const accent = getVal(properties, 'mg.color.accent_usage', 'accentUsage');
  const centerAvoid = getVal(properties, 'mg.layout.center_avoidance', 'centerAvoidance');

  const entrances = selections
    .filter(r => r.overlayId.startsWith('mg.animation.entrance_'))
    .sort((a, b) => b.totalScore - a.totalScore);
  const holds = selections
    .filter(r => r.overlayId.startsWith('mg.animation.hold_'))
    .sort((a, b) => b.totalScore - a.totalScore);

  console.log(`  fontSize: ${fontSize.toFixed(0)}px | weight: ${fontWeight.toFixed(0)} | tracking: ${tracking.toFixed(3)}em | lineHeight: ${lineHeight.toFixed(2)}`);
  console.log(`  corner: ${cornerRadius.toFixed(1)}px | opacity: ${opacity.toFixed(2)} | saturation: +${saturation.toFixed(3)} | accent: ${accent.toFixed(2)}`);
  console.log(`  centerAvoid: ${centerAvoid.toFixed(2)} | entranceSpeed: ${entranceSpeed.toFixed(2)}s`);
  console.log(`  entrance: ${entrances[0]?.overlayId.replace('mg.animation.entrance_', '') ?? 'none'} (${entrances[0]?.totalScore.toFixed(3) ?? 'N/A'}) > ${entrances[1]?.overlayId.replace('mg.animation.entrance_', '') ?? 'none'} (${entrances[1]?.totalScore.toFixed(3) ?? 'N/A'})`);
  console.log(`  hold: ${holds[0]?.overlayId.replace('mg.animation.hold_', '') ?? 'none'} (${holds[0]?.totalScore.toFixed(3) ?? 'N/A'}) > ${holds[1]?.overlayId.replace('mg.animation.hold_', '') ?? 'none'} (${holds[1]?.totalScore.toFixed(3) ?? 'N/A'})`);

  assert(properties.length === mgPropertyDefs.length, `all ${mgPropertyDefs.length} property overlays scored for ${name}`);
  assert(entrances.length >= 1, `at least 1 entrance type scored for ${name} (got ${entrances.length})`);
  assert(holds.length >= 1, `at least 1 hold type scored for ${name} (got ${holds.length})`);
}

// Cross-profile differentiation
const vlog = scoreMG(profiles['Energetic Vlog']);
const corp = scoreMG(profiles['Calm Corporate']);
const music = scoreMG(profiles['Music Video']);
const doc = scoreMG(profiles['Documentary']);
const product = scoreMG(profiles['Product Ad']);

console.log('\n=== Cross-Profile Differentiation ===');

const vlogFont = getVal(vlog.properties, 'mg.typography.font_size', 'fontSize');
const corpFont = getVal(corp.properties, 'mg.typography.font_size', 'fontSize');
const musicFont = getVal(music.properties, 'mg.typography.font_size', 'fontSize');
assert(vlogFont > corpFont, `vlog fontSize (${vlogFont.toFixed(0)}) > corporate (${corpFont.toFixed(0)})`);
assert(musicFont > vlogFont, `music fontSize (${musicFont.toFixed(0)}) > vlog (${vlogFont.toFixed(0)})`);

const vlogWeight = getVal(vlog.properties, 'mg.typography.font_weight', 'fontWeight');
const corpWeight = getVal(corp.properties, 'mg.typography.font_weight', 'fontWeight');
assert(vlogWeight > corpWeight, `vlog fontWeight (${vlogWeight.toFixed(0)}) > corporate (${corpWeight.toFixed(0)})`);

const vlogCorner = getVal(vlog.properties, 'mg.styling.corner_radius', 'cornerRadius');
const corpCorner = getVal(corp.properties, 'mg.styling.corner_radius', 'cornerRadius');
assert(vlogCorner > corpCorner, `vlog corner (${vlogCorner.toFixed(1)}) > corporate (${corpCorner.toFixed(1)})`);

const vlogSpeed = getVal(vlog.properties, 'mg.animation.entrance_speed', 'entranceSpeed');
const corpSpeed = getVal(corp.properties, 'mg.animation.entrance_speed', 'entranceSpeed');
assert(vlogSpeed < corpSpeed, `vlog entrance faster (${vlogSpeed.toFixed(2)}s) < corporate (${corpSpeed.toFixed(2)}s)`);

// Entrance type: vlog should prefer pop/slide, corporate should prefer fade
const vlogEntrances = vlog.selections.filter(r => r.overlayId.startsWith('mg.animation.entrance_')).sort((a, b) => b.totalScore - a.totalScore);
const corpEntrances = corp.selections.filter(r => r.overlayId.startsWith('mg.animation.entrance_')).sort((a, b) => b.totalScore - a.totalScore);
assert(
  vlogEntrances[0]?.overlayId !== 'mg.animation.entrance_fade',
  `vlog top entrance is NOT fade (got ${vlogEntrances[0]?.overlayId.replace('mg.animation.entrance_', '')})`,
);
assert(
  corpEntrances[0]?.overlayId === 'mg.animation.entrance_fade',
  `corporate top entrance IS fade (got ${corpEntrances[0]?.overlayId.replace('mg.animation.entrance_', '')})`,
);

// Hold pattern: vlog should prefer pulse, documentary should prefer breathe
const vlogHolds = vlog.selections.filter(r => r.overlayId.startsWith('mg.animation.hold_')).sort((a, b) => b.totalScore - a.totalScore);
const docHolds = doc.selections.filter(r => r.overlayId.startsWith('mg.animation.hold_')).sort((a, b) => b.totalScore - a.totalScore);
assert(
  vlogHolds[0]?.overlayId === 'mg.animation.hold_pulse',
  `vlog top hold is pulse (got ${vlogHolds[0]?.overlayId.replace('mg.animation.hold_', '')})`,
);
assert(
  docHolds[0]?.overlayId === 'mg.animation.hold_breathe',
  `documentary top hold is breathe (got ${docHolds[0]?.overlayId.replace('mg.animation.hold_', '')})`,
);

// Output bounds (additive scoring)
console.log('\n=== Output Bounds ===');
const allFontSizes = Object.values(profiles).map(s => getVal(scoreMG(s).properties, 'mg.typography.font_size', 'fontSize'));
assert(allFontSizes.every(f => f >= 36 && f <= 160), `all font sizes in [36, 160] range: ${allFontSizes.map(f => f.toFixed(0)).join(', ')}`);

const allSpeeds = Object.values(profiles).map(s => getVal(scoreMG(s).properties, 'mg.animation.entrance_speed', 'entranceSpeed'));
assert(allSpeeds.every(s => s >= 0.15 && s <= 0.6), `all entrance speeds in [0.15, 0.6] range: ${allSpeeds.map(s => s.toFixed(2)).join(', ')}`);

const allOpacities = Object.values(profiles).map(s => getVal(scoreMG(s).properties, 'mg.styling.container_opacity', 'containerOpacity'));
assert(allOpacities.every(o => o >= 0.3 && o <= 0.92), `all opacities in [0.3, 0.92] range: ${allOpacities.map(o => o.toFixed(2)).join(', ')}`);

const allWeights = Object.values(profiles).map(s => getVal(scoreMG(s).properties, 'mg.typography.font_weight', 'fontWeight'));
assert(allWeights.every(w => w >= 300 && w <= 800), `all weights in [300, 800] range: ${allWeights.map(w => w.toFixed(0)).join(', ')}`);

// Diversity check: no two profiles produce identical font sizes
console.log('\n=== Diversity Check ===');
const uniqueFonts = new Set(allFontSizes.map(f => Math.round(f)));
assert(uniqueFonts.size >= 4, `at least 4 distinct font sizes across 5 profiles (got ${uniqueFonts.size}: ${[...uniqueFonts].join(', ')})`);

const uniqueSpeeds = new Set(allSpeeds.map(s => s.toFixed(2)));
assert(uniqueSpeeds.size >= 4, `at least 4 distinct entrance speeds across 5 profiles (got ${uniqueSpeeds.size}: ${[...uniqueSpeeds].join(', ')})`);

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) console.log('ALL MG OVERLAY TESTS PASSED ✓');
else { console.log('SOME TESTS FAILED ✗'); process.exit(1); }
