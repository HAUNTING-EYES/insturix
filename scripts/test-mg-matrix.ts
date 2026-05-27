/**
 * MG Engine Test Matrix — runs planComposition + structural gate across
 * 6 realistic signal profiles. Verifies elements, keyframes, hold patterns,
 * gate scores, and signal-driven decisions.
 *
 * Usage: npx tsx scripts/test-mg-matrix.ts
 */

import { planComposition, DEFAULT_SIGNALS } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { checkCompositionStructure } from '../lib/editron/motion-graphics/engine/structural-gate';

interface TestProfile {
  name: string;
  kind: string;
  content: Record<string, unknown>;
  signals: Record<string, number>;
  expect: {
    minElements: number;
    maxElements: number;
    hasKeyframes: boolean;
    holdPattern?: string;
    gatePasses: boolean;
  };
}

const PROFILES: TestProfile[] = [
  {
    name: '1. TALKING HEAD — lower-third (Hank Green intro)',
    kind: 'identity',
    content: { name: 'Hank Green', title: 'YouTuber & Author' },
    signals: { ...DEFAULT_SIGNALS, formality: 0.3, enthusiasm: 0.6, warmth: 0.7, pacing_velocity: 0.4 },
    expect: { minElements: 2, maxElements: 5, hasKeyframes: false, holdPattern: 'breathe', gatePasses: true },
  },
  {
    name: '2. STAT COUNTER — dramatic number reveal',
    kind: 'numeric',
    content: { value: '73%', label: 'user satisfaction', suffix: '%' },
    signals: { ...DEFAULT_SIGNALS, formality: 0.5, enthusiasm: 0.9, visceral_impact: 0.8, pacing_velocity: 0.7 },
    expect: { minElements: 2, maxElements: 5, hasKeyframes: true, holdPattern: 'gentle-float', gatePasses: true },
  },
  {
    name: '3. QUOTE CARD — standout assertion',
    kind: 'quotation',
    content: { quote: 'The data doesn\'t lie', author: 'Speaker Name' },
    signals: { ...DEFAULT_SIGNALS, formality: 0.6, enthusiasm: 0.4, warmth: 0.5 },
    expect: { minElements: 2, maxElements: 4, hasKeyframes: false, gatePasses: true },
  },
  {
    name: '4. KEYWORD HIGHLIGHT — casual emphasis',
    kind: 'emphasis',
    content: { text: 'neural entrainment' },
    signals: { ...DEFAULT_SIGNALS, formality: 0.2, enthusiasm: 0.7, warmth: 0.4, pacing_velocity: 0.5 },
    expect: { minElements: 1, maxElements: 4, hasKeyframes: false, holdPattern: 'gentle-float', gatePasses: true },
  },
  {
    name: '5. MONTAGE SUPPRESSION — music-driven section',
    kind: 'emphasis',
    content: { text: 'should not appear' },
    signals: { ...DEFAULT_SIGNALS, montage_mode: 0.8, active_overlay_count: 1, enthusiasm: 0.5 },
    expect: { minElements: 0, maxElements: 0, hasKeyframes: false, gatePasses: true },
  },
  {
    name: '6. HIGH VISCERAL — dramatic drift keyframes',
    kind: 'identity',
    content: { name: 'Breaking News', title: 'Live Coverage' },
    signals: { ...DEFAULT_SIGNALS, visceral_impact: 0.9, enthusiasm: 0.7, formality: 0.8, warmth: 0.3 },
    expect: { minElements: 2, maxElements: 5, hasKeyframes: true, gatePasses: true },
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const profile of PROFILES) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(profile.name);
  console.log('═'.repeat(70));

  const tokens = resolveMotionTokens(profile.signals as any, {});
  const recipe = planComposition(
    { kind: profile.kind as any, content: profile.content },
    tokens,
    profile.signals,
  );

  const elementCount = recipe.elements.length;
  const kfElements = recipe.elements.filter(e => e.keyframeTracks?.length);
  const holdPatterns = [...new Set(recipe.elements.filter(e => e.holdAnimation).map(e => e.holdAnimation))];
  const gate = elementCount > 0 ? checkCompositionStructure(recipe, tokens) : { pass: true, score: 100, issues: [] };

  console.log(`Elements: ${elementCount} (expect ${profile.expect.minElements}-${profile.expect.maxElements})`);
  console.log(`Keyframed: ${kfElements.length} (expect ${profile.expect.hasKeyframes ? '>0' : '0'})`);
  if (kfElements.length > 0) {
    kfElements.forEach(e => console.log(`  ${e.role}: ${e.keyframeTracks!.map(t => `${t.property}(${t.keyframes.length}kf)`).join(', ')}`));
  }
  console.log(`Hold patterns: ${holdPatterns.length > 0 ? holdPatterns.join(', ') : 'static'} ${profile.expect.holdPattern ? `(expect ${profile.expect.holdPattern})` : ''}`);
  console.log(`Gate: ${gate.pass ? 'PASS' : 'FAIL'} ${gate.score}/100 (expect ${profile.expect.gatePasses ? 'PASS' : 'FAIL'})`);
  if (gate.issues.length > 0) gate.issues.forEach(i => console.log(`  ${i.severity}: ${i.description}`));
  console.log(`Layout: ${recipe.layout.position}, exit: ${recipe.exitStyle}`);
  console.log(`Types: ${recipe.elements.map(e => `${e.role}(${e.primitive})`).join(', ') || 'EMPTY (suppressed)'}`);

  // Assertions
  const checks: [string, boolean][] = [
    ['element count in range', elementCount >= profile.expect.minElements && elementCount <= profile.expect.maxElements],
    ['keyframes match', profile.expect.hasKeyframes ? kfElements.length > 0 : kfElements.length === 0],
    ['gate result', gate.pass === profile.expect.gatePasses],
  ];
  if (profile.expect.holdPattern) {
    checks.push(['hold pattern', holdPatterns.includes(profile.expect.holdPattern)]);
  }

  for (const [name, ok] of checks) {
    if (ok) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${name}`);
      failed++;
      failures.push(`${profile.name}: ${name}`);
    }
  }
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(70));
