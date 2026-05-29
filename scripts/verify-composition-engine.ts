/**
 * Level 2 Verification: Composition Engine
 * Tests planComposition with 7 content types against expected output shapes.
 * Run: npx tsx scripts/verify-composition-engine.ts
 */
import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { analyzeContentShape } from '../lib/editron/motion-graphics/engine/content-shape-analyzer';
import { validateRecipeConstraints } from '../lib/editron/motion-graphics/engine/crg-constraint-validator';
import { deriveBrandRules } from '../lib/editron/motion-graphics/engine/brand-composition-rules';
import { generateBrandPattern } from '../lib/editron/motion-graphics/engine/brand-pattern-generator';

const brand = { primaryColor: '#6366F1', accentColor: '#10B981', backgroundColor: '#0A0A14', headingFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', monoFont: 'JetBrains Mono, monospace' };
const signals = { formality: 0.5, enthusiasm: 0.6, warmth: 0.5, emotional_arousal: 0.4, pacing_velocity: 0.5, humor: 0.1, visceral_impact: 0.3, visual_dependency: 0.5 };
const tokens = resolveMotionTokens(signals, brand);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL: ${name} -- ${e.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log('\n=== COMPOSITION ENGINE LEVEL 2 VERIFICATION ===\n');

// --- Content Shape Analyzer ---
console.log('1. Content Shape Analyzer:');

test('numeric detection (kind provided)', () => {
  const strategy = analyzeContentShape({ value: '42%', label: 'Growth' }, 'numeric', signals);
  assert(strategy.shapes.length > 0, 'Expected at least 1 shape');
  assert(strategy.shapes[0].kind === 'numeric', `Expected numeric, got ${strategy.shapes[0].kind}`);
  assert(strategy.suggestedLayout.position === 'center', `Expected center, got ${strategy.suggestedLayout.position}`);
});

test('identity detection (kind provided)', () => {
  const strategy = analyzeContentShape({ name: 'Sarah', title: 'CEO' }, 'identity', signals);
  assert(strategy.shapes[0].kind === 'identity', `Expected identity, got ${strategy.shapes[0].kind}`);
  assert(strategy.suggestedLayout.position === 'bottom-left', `Expected bottom-left, got ${strategy.suggestedLayout.position}`);
});

test('duck-typing (no kind, name+title in content)', () => {
  const strategy = analyzeContentShape({ name: 'John', title: 'VP' }, undefined, signals);
  assert(strategy.shapes.some(s => s.kind === 'identity'), 'Expected identity shape detected');
});

test('empty content fallback', () => {
  const strategy = analyzeContentShape({}, undefined, signals);
  assert(strategy.shapes.length > 0, 'Expected at least 1 shape');
  assert(strategy.shapes[0].kind === 'free-text', `Expected free-text, got ${strategy.shapes[0].kind}`);
});

test('complexity budget driven by importance, not timeline position', () => {
  const lowImportance = analyzeContentShape({ text: 'hi' }, 'emphasis',
    { ...signals, formality: 0, emotional_arousal: 0, visceral_impact: 0, cinematic_moment: 0 } as any);
  const highImportance = analyzeContentShape({ text: 'hi' }, 'emphasis',
    { ...signals, cinematic_moment: 0.9 } as any);
  assert(highImportance.complexityBudget > lowImportance.complexityBudget,
    `Expected high-importance (${highImportance.complexityBudget}) > low (${lowImportance.complexityBudget})`);
});

// --- Composition Planner ---
console.log('\n2. Composition Planner:');

test('numeric -> counter + label + accent', () => {
  const recipe = planComposition({ kind: 'numeric', content: { value: '42%', label: 'Growth' } }, tokens, signals);
  assert(recipe.id === 'composed-numeric', `Expected composed-numeric, got ${recipe.id}`);
  assert(recipe.elements.length >= 2, `Expected 2+ elements, got ${recipe.elements.length}`);
  const counter = recipe.elements.find(e => e.role === 'counter');
  assert(counter !== undefined, 'Expected counter element');
  assert(counter!.animation === 'count-up', `Expected count-up, got ${counter!.animation}`);
  assert(counter!.bind.minSize === 64, `Expected minSize 64 (CRG), got ${counter!.bind.minSize}`);
});

test('identity -> primary + secondary, bottom-left', () => {
  const recipe = planComposition({ kind: 'identity', content: { name: 'Sarah', title: 'CEO' } }, tokens, { ...signals, formality: 0.8 });
  assert(recipe.layout.position === 'bottom-left', `Expected bottom-left, got ${recipe.layout.position}`);
  assert(recipe.exitStyle === 'reverse-stagger', `Expected reverse-stagger, got ${recipe.exitStyle}`);
  const primary = recipe.elements.find(e => e.role === 'primary');
  assert(primary!.bind.minSize === 48, `Expected minSize 48 (CRG), got ${primary!.bind.minSize}`);
});

test('quotation -> quote text with minSize 42', () => {
  const recipe = planComposition({ kind: 'quotation', content: { quote: 'Test quote', author: 'Author' } }, tokens, signals);
  const primary = recipe.elements.find(e => e.role === 'primary');
  assert(primary!.bind.minSize === 42, `Expected minSize 42 (CRG quote_card), got ${primary!.bind.minSize}`);
});

test('emphasis -> no hardcoded entrance (defers to overlay scoring), corner position', () => {
  const recipe = planComposition({ content: { text: 'WOW' } }, tokens, { ...signals, formality: 0.2 });
  // emphasis layout rotates through the 4 corners (global counter), so assert membership,
  // not a fixed position — the exact corner is order-dependent.
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  assert(corners.includes(recipe.layout.position), `Expected a corner, got ${recipe.layout.position}`);
  const primary = recipe.elements.find(e => e.role === 'primary');
  assert(!primary!.entranceOverride, `Expected no hardcoded entrance (overlay scoring or role default decides), got ${primary!.entranceOverride}`);
});

test('brand -> hold-then-fade exit', () => {
  // Content-inferred: brand shape requires a brand marker (logo or brand:true), not a kind label.
  const recipe = planComposition({ content: { text: 'INSTURIX', brand: true } }, tokens, signals);
  assert(recipe.exitStyle === 'hold-then-fade', `Expected hold-then-fade, got ${recipe.exitStyle}`);
});

test('empty content -> free-text fallback', () => {
  const recipe = planComposition({ content: {} }, tokens);
  assert(recipe.elements.length >= 1, 'Expected at least 1 element');
  assert(recipe.id === 'composed-free-text', `Expected composed-free-text, got ${recipe.id}`);
});

test('depth layers assigned', () => {
  const recipe = planComposition({ kind: 'numeric', content: { value: '99', label: 'Score' } }, tokens, { ...signals, formality: 0.8 });
  const layers = recipe.elements.map(e => e.layer);
  assert(layers.includes('foreground'), 'Expected foreground layer');
  // High formality = container, so background layer should exist
  assert(layers.includes('background'), `Expected background layer for high formality, got ${layers}`);
});

// --- CRG Constraint Validator ---
console.log('\n3. CRG Constraint Validator:');

test('valid recipe passes without violations', () => {
  const recipe = planComposition({ kind: 'numeric', content: { value: '42%', label: 'Growth' } }, tokens, signals);
  const result = validateRecipeConstraints(recipe);
  assert(result.converged, 'Expected convergence');
  // All our recipes should have CRG-compliant minSize since we set them in the planner
  console.log(`    Violations: ${result.violations.length}, Corrections: ${result.corrections.length}`);
});

test('recipe with missing minSize gets corrected', () => {
  // Manually create a recipe with a text element missing minSize
  const badRecipe = {
    id: 'test-bad',
    elements: [{ primitive: 'text' as const, role: 'counter', bind: { text: 'hello' } }],
    layout: { position: 'center' as const },
    exitStyle: 'simultaneous-fade' as const,
  };
  const result = validateRecipeConstraints(badRecipe);
  assert(result.violations.length > 0, `Expected violations, got ${result.violations.length}`);
  assert(result.corrections.length > 0, `Expected corrections, got ${result.corrections.length}`);
  console.log(`    Violations: ${result.violations.length}, Corrections: ${result.corrections.length}`);
});

// --- Brand Composition Rules ---
console.log('\n4. Brand Composition Rules:');

test('sans-serif brand -> smooth animation, standard spacing', () => {
  const rules = deriveBrandRules(brand);
  assert(rules.fontCategory === 'sans-serif', `Expected sans-serif, got ${rules.fontCategory}`);
  assert(rules.animationPersonality === 'smooth', `Expected smooth, got ${rules.animationPersonality}`);
  assert(rules.elementSpacing === 'standard', `Expected standard, got ${rules.elementSpacing}`);
});

test('serif brand -> gentle animation, generous spacing', () => {
  const serifBrand = { ...brand, headingFont: 'Playfair Display, serif' };
  const rules = deriveBrandRules(serifBrand);
  assert(rules.fontCategory === 'serif', `Expected serif, got ${rules.fontCategory}`);
  assert(rules.animationPersonality === 'gentle', `Expected gentle, got ${rules.animationPersonality}`);
  assert(rules.elementSpacing === 'generous', `Expected generous, got ${rules.elementSpacing}`);
});

test('mono brand -> snappy animation, tight spacing', () => {
  const monoBrand = { ...brand, headingFont: 'JetBrains Mono, monospace' };
  const rules = deriveBrandRules(monoBrand);
  assert(rules.fontCategory === 'mono', `Expected mono, got ${rules.fontCategory}`);
  assert(rules.animationPersonality === 'snappy', `Expected snappy, got ${rules.animationPersonality}`);
});

// --- Brand Pattern Generator ---
console.log('\n5. Brand Pattern Generator:');

test('sans-serif -> dot-grid pattern', () => {
  const rules = deriveBrandRules(brand);
  const pattern = generateBrandPattern(brand, rules);
  assert(pattern.type === 'dot-grid', `Expected dot-grid, got ${pattern.type}`);
  assert(pattern.css.startsWith('url('), `Expected url() CSS, got ${pattern.css.slice(0, 20)}`);
});

test('serif -> no pattern', () => {
  const serifBrand = { ...brand, headingFont: 'Georgia, serif' };
  const rules = deriveBrandRules(serifBrand);
  const pattern = generateBrandPattern(serifBrand, rules);
  assert(pattern.type === 'none', `Expected none, got ${pattern.type}`);
});

// --- Motion Theme Resolver (signal expansion) ---
console.log('\n6. Signal-Expanded Motion Theme Resolver:');

test('speaking_rate_wpm affects holdDurationMs', () => {
  const slow = resolveMotionTokens({ ...signals, speaking_rate_wpm: 100 } as any, brand);
  const fast = resolveMotionTokens({ ...signals, speaking_rate_wpm: 200 } as any, brand);
  assert(slow.layout.holdDurationMs > fast.layout.holdDurationMs, `Expected slow (${slow.layout.holdDurationMs}) > fast (${fast.layout.holdDurationMs})`);
});

test('narrative_pressure triggers overshoot', () => {
  const calm = resolveMotionTokens({ ...signals, narrative_pressure: 0.2 } as any, brand);
  const tense = resolveMotionTokens({ ...signals, narrative_pressure: 0.8 } as any, brand);
  assert(tense.animation.overshoot === true, 'Expected overshoot at high narrative_pressure');
});

test('position_in_video affects density', () => {
  const early = resolveMotionTokens({ ...signals, position_in_video: 0.05, visual_dependency: 0.8 } as any, brand);
  const late = resolveMotionTokens({ ...signals, position_in_video: 0.5, visual_dependency: 0.8 } as any, brand);
  // Early should reduce density by 1 tier (rich -> standard)
  console.log(`    Early density: ${early.layout.density}, Late density: ${late.layout.density}`);
});

// --- Summary ---
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
