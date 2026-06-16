// Untracked G-2 verification. Exercises the REAL brandInputsFromUnifiedBrand → resolveMotionTokens
// path (the colour logic the executeEDL wire feeds) on adversarial brand palettes, and builds
// brand-themed overlays so render-mg-stills can PROVE the accent goes brand-coloured, not gold.
// READ-ONLY (writes only to .calibration-temp). Stays UNTRACKED.
// Run: npx tsx scripts/verify-brand-wire.ts   then   npx tsx scripts/render-mg-stills.ts brands-mgs.json
import * as fs from 'fs';
import * as path from 'path';
import { brandInputsFromUnifiedBrand } from '../lib/editron/motion-graphics/engine/brand-composition-rules';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';

interface SampleBrand { name: string; colors: string[]; expect: string }
const BRANDS: SampleBrand[] = [
  { name: 'blue',         colors: ['#2563EB', '#1E3A8A'],            expect: 'vivid blue accent' },
  { name: 'orange',       colors: ['#FF6B00', '#7C2D12'],            expect: 'vivid orange accent' },
  { name: 'teal-magenta', colors: ['#0D9488', '#DB2777', '#0F172A'], expect: 'most-saturated legible (magenta/teal)' },
  { name: 'all-dark',     colors: ['#0A0A0A', '#1A1A2E'],            expect: 'NO legible colour → {} → DEFAULT gold' },
  { name: 'gray',         colors: ['#888888', '#CCCCCC'],            expect: 'legible but dull → a grey accent' },
  { name: 'empty',        colors: [],                                expect: 'no palette → {} → DEFAULT gold' },
  { name: 'three-digit',  colors: ['#F50', '#05F'],                  expect: '3-digit hex normalised → an accent' },
];

const brandOf = (b: SampleBrand) => brandInputsFromUnifiedBrand({ visual: { colors: b.colors } } as never);

// 1. Adversarial mapper check — does accent selection survive odd palettes? (Rule 29)
console.log('=== G-2 mapper: brand palette → accent → resolved token.color.accent ===');
console.log('   (DEFAULT_BRAND gold = #D4A652; anything else means the brand reached the render)\n');
for (const b of BRANDS) {
  const bi = brandOf(b);
  const tok = resolveMotionTokens({}, bi);
  console.log(`  ${b.name.padEnd(13)} ${JSON.stringify(b.colors).padEnd(36)} accent=${(bi.accentColor ?? '(none)').padEnd(9)} → token=${tok.color.accent}   [${b.expect}]`);
}

// 2. Build brand-themed overlays for a real render (clone a keyword overlay, swap resolvedTokens).
const RENDER = ['blue', 'orange', 'teal-magenta', 'all-dark', 'gray'];
const src = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.calibration-temp', 'proj_OzG2qgoYudFa-mgs.json'), 'utf8'));
const kwTemplate = src.mgs.find((o: Record<string, any>) => o.metadata?.graphicType === 'keyword-highlight');
if (!kwTemplate) { console.error('no keyword template in source dump'); process.exit(1); }

const mgs = RENDER.map((name) => {
  const b = BRANDS.find((x) => x.name === name)!;
  const bi = brandOf(b);
  const o = structuredClone(kwTemplate) as Record<string, any>;
  o.content = { ...(o.content || {}), emphasisWord: name.toUpperCase(), text: name.toUpperCase(), title: name.toUpperCase() };
  const sig = (o.contentSignals || o.content?.signals || {}) as Record<string, number>;
  o.resolvedTokens = resolveMotionTokens(sig, bi); // ← the G-2 effect: tokens now carry the brand accent
  o.metadata = { ...(o.metadata || {}), graphicType: `brand-${name}` };
  return o;
});

const dst = path.resolve(process.cwd(), '.calibration-temp', 'brands-mgs.json');
fs.writeFileSync(dst, JSON.stringify({ projectId: 'brands', width: src.width, height: src.height, mgs }, null, 2), 'utf8');
console.log(`\nwrote ${mgs.length} brand-themed overlays → ${dst}`);
console.log('render: npx tsx scripts/render-mg-stills.ts brands-mgs.json');
