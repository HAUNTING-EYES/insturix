/**
 * Eval harness for avatar appearance inference (Rule 35: never ship a prompt without an eval).
 *
 * Runs the REAL vision call over labeled reference photos and scores the extraction against
 * expected values, so you can trust the prompt before wiring it into the forge — and catch
 * the failure that matters most: hallucinating attributes a photo can't show.
 *
 * Usage:
 *   GEMINI_API_KEY=... npx tsx scripts/eval-avatar-inference.ts [fixtures.json]
 *
 * fixtures.json (see scripts/avatar-inference-fixtures.example.json):
 *   [
 *     {
 *       "name": "nimit-front",
 *       "images": [{ "path": "D:/.../face.png", "label": "front portrait" }],  // path OR url
 *       "expected": {
 *         "hair": "short black", "build": "average", "skinTone": "medium",
 *         "notableTraits": ["glasses"], "wardrobe": "navy",
 *         "quality": { "usable": true },
 *         "mustBeEmpty": ["skinTone"]   // adversarial: these MUST come back empty (no hallucination)
 *       }
 *     }
 *   ]
 */

import { readFileSync } from 'node:fs';
import { inferAvatarAttributesFromImages, type InferredAvatarAttributes } from '../lib/avatar/infer-avatar-attributes';

interface Fixture {
  name: string;
  images: Array<{ path?: string; url?: string; label?: string; mimeType?: string }>;
  expected?: {
    identityDescription?: string;
    build?: string;
    hair?: string;
    skinTone?: string;
    wardrobe?: string;
    notableTraits?: string[];
    quality?: { faceDetected?: boolean; singlePerson?: boolean; usable?: boolean };
    /** Fields that MUST come back empty — guards against hallucination on ambiguous photos. */
    mustBeEmpty?: string[];
  };
}

const STRING_FIELDS = ['identityDescription', 'build', 'hair', 'skinTone', 'wardrobe'] as const;

function keywordRecall(expected: string, actual: string): number {
  const terms = expected.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 1;
  const hay = actual.toLowerCase();
  return terms.filter((t) => hay.includes(t)).length / terms.length;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((x) => x.toLowerCase().trim()));
  const sb = new Set(b.map((x) => x.toLowerCase().trim()));
  if (sa.size === 0 && sb.size === 0) return 1;
  const inter = [...sa].filter((x) => sb.has(x)).length;
  return inter / (sa.size + sb.size - inter);
}

function scoreFixture(fx: Fixture, got: InferredAvatarAttributes): { lines: string[]; score: number; hallucinated: string[] } {
  const lines: string[] = [];
  const scores: number[] = [];
  const exp = fx.expected ?? {};

  for (const field of STRING_FIELDS) {
    const want = exp[field];
    if (want === undefined) continue;
    const r = keywordRecall(want, got[field]);
    scores.push(r);
    lines.push(`  ${field}: ${(r * 100).toFixed(0)}%  want "${want}" | got "${got[field]}"`);
  }
  if (exp.notableTraits) {
    const r = jaccard(exp.notableTraits, got.notableTraits);
    scores.push(r);
    lines.push(`  notableTraits: ${(r * 100).toFixed(0)}%  want [${exp.notableTraits}] | got [${got.notableTraits}]`);
  }
  if (exp.quality) {
    for (const k of ['faceDetected', 'singlePerson', 'usable'] as const) {
      if (exp.quality[k] === undefined) continue;
      const ok = exp.quality[k] === got.quality[k];
      scores.push(ok ? 1 : 0);
      lines.push(`  quality.${k}: ${ok ? 'OK' : 'MISS'}  want ${exp.quality[k]} | got ${got.quality[k]}`);
    }
  }

  // Hallucination guard: fields that must be empty.
  const hallucinated: string[] = [];
  for (const field of exp.mustBeEmpty ?? []) {
    const v = (got as Record<string, unknown>)[field];
    const empty = v === '' || (Array.isArray(v) && v.length === 0);
    if (!empty) { hallucinated.push(field); lines.push(`  ⚠ HALLUCINATION: ${field} should be empty, got "${JSON.stringify(v)}"`); }
  }

  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
  return { lines, score, hallucinated };
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Set GEMINI_API_KEY (or GOOGLE_API_KEY) to run the eval.');
    process.exit(1);
  }
  const fixturesPath = process.argv[2] || 'scripts/avatar-inference-fixtures.json';
  const fixtures: Fixture[] = JSON.parse(readFileSync(fixturesPath, 'utf8'));

  const fixtureScores: number[] = [];
  let anyHallucination = false;

  for (const fx of fixtures) {
    const images = fx.images.map((img) => {
      if (img.path) return { data: readFileSync(img.path), mimeType: img.mimeType ?? 'image/png', label: img.label };
      if (img.url) return { imageUrl: img.url, label: img.label };
      throw new Error(`Fixture ${fx.name}: image needs a path or url.`);
    });
    const result = await inferAvatarAttributesFromImages(images);
    console.log(`\n=== ${fx.name} ===`);
    if (!result.ok) { console.log(`  FAILED: ${result.error}`); fixtureScores.push(0); continue; }
    const { lines, score, hallucinated } = scoreFixture(fx, result.data);
    lines.forEach((l) => console.log(l));
    console.log(`  → score ${(score * 100).toFixed(0)}%`);
    fixtureScores.push(score);
    if (hallucinated.length) anyHallucination = true;
  }

  const overall = fixtureScores.length ? fixtureScores.reduce((a, b) => a + b, 0) / fixtureScores.length : 0;
  const min = fixtureScores.length ? Math.min(...fixtureScores) : 0;
  console.log(`\n════════════════════════════════════\nOverall: ${(overall * 100).toFixed(0)}%  ·  worst fixture: ${(min * 100).toFixed(0)}%`);
  // Rule 35 bar: min(score) >= 0.85 and zero hallucinations.
  const pass = min >= 0.85 && !anyHallucination;
  console.log(anyHallucination ? '❌ HALLUCINATION detected — tighten the guidance before shipping.' : pass ? '✅ PASS' : '⚠ Below the 85% bar — tune the prompt.');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
