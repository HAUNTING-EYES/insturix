/**
 * FRAME-ARMED JUDGE PROBE (taste-gate layer 3b — the decisive test).
 *
 * Question: with the REAL anchor stills (Vox / premium cards / competitor hooks) injected into the judge call as
 * the visual FORM bar, does the judge finally score an undesigned text-list's `form` LOW while designed graphics
 * HOLD? The text-only rubric failed this (rationalized text-lines as form=7); the founder's point is the judge
 * has never SEEN the bar. This probe arms it.
 *
 * Candidates (existing e2e composites, judged identically):
 *   text-list      = e2e-out-v2/list-set-*           → EXPECT form to DROP (undesigned)
 *   designed-stat  = e2e-out-v2/magnitude-quiet-*    → EXPECT form to HOLD (~7: display numerals + rule)
 *   designed-hero  = e2e-out/concept-hero-rev-*      → EXPECT form to HOLD (display face + accent + glow)
 *
 * Note: no stress sheet here (raw overlay frames were cleaned) — both candidates are judged with the identical
 * 3-composite shape, so the comparison is fair; this probe scores FORM discrimination, not contrast.
 * Uncommitted (scripts/ rule). GEMINI_API_KEY (prod) via shell env; MG_FRAMES_DIR + MG_E2E_DIRS via env.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(REPO, '.env.local') });
if (!process.env.GEMINI_API_KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }
const FRAMES = process.env.MG_FRAMES_DIR || '';
const SCRATCH = process.env.MG_SCRATCH || '';
if (!FRAMES || !SCRATCH) { console.error('set MG_FRAMES_DIR + MG_SCRATCH'); process.exit(1); }

import { JUDGE_PROMPT } from '../../lib/editron/motion-graphics/codegen/prompt';

// The anchors that define the FORM bar (diverse: minimal-kinetic, cinematic big-number, premium cards, editorial map).
const ANCHORS = ['autoae-01-kinetic.jpg', 'autoae-04.jpg', 'iman-premium-cards.jpg', 'vox-tierb-map.jpg'];

const REFERENCE_BLOCK = `REFERENCE STILLS — THE FORM BAR: the first ${ANCHORS.length} images are GENUINE professional
motion-graphic stills (editorial data-viz, premium product cards, competitor hook designs). They are the bar for the
\`form\` dimension ONLY: professional MGs invest DESIGNED visual form — structure, marks, figures, spatial
composition — never bare text lines on a panel. Score the CANDIDATE's \`form\` by asking: does its design
investment belong alongside these? Do NOT require imitating their style, palette, or content — they define the
LEVEL of design investment, not the look. Everything after them is the candidate.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    faithful: { type: 'BOOLEAN' },
    hierarchy: { type: 'NUMBER' }, typography: { type: 'NUMBER' }, color: { type: 'NUMBER' },
    composition: { type: 'NUMBER' }, motion: { type: 'NUMBER' }, form: { type: 'NUMBER' }, score: { type: 'NUMBER' },
    issues: { type: 'ARRAY', items: { type: 'STRING' } }, reasoning: { type: 'STRING' },
  },
  required: ['faithful', 'hierarchy', 'typography', 'color', 'composition', 'motion', 'form', 'score', 'issues', 'reasoning'],
};

interface Candidate { id: string; dir: string; prefix: string; fact: Record<string, unknown> }
const CANDIDATES: Candidate[] = [
  { id: 'text-list (expect form LOW)', dir: 'e2e-out-v2', prefix: 'list-set', fact: { factKind: 'list', content: { items: ['Script', 'Record', 'Publish'], label: 'three steps' }, sourceText: 'three steps: script it, record it, publish it' } },
  { id: 'designed-stat (expect form HOLD)', dir: 'e2e-out-v2', prefix: 'magnitude-quiet', fact: { factKind: 'magnitude-stat', content: { value: 1_000_000, unit: '+', label: 'videos made' }, sourceText: 'over a million videos made' } },
  { id: 'designed-hero (expect form HOLD)', dir: 'e2e-out', prefix: 'concept-hero-rev', fact: { factKind: 'concept', content: { keyword: 'ten times faster', body: 'onboarding' }, sourceText: 'onboarding is ten times faster' } },
];

function img(p: string): { inlineData: { mimeType: string; data: string } } {
  return { inlineData: { mimeType: p.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(p).toString('base64') } };
}

async function judge(c: Candidate): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: `${JUDGE_PROMPT}\n\n${REFERENCE_BLOCK}\n\nLICENSED FACT JSON:\n${JSON.stringify(c.fact)}` }];
  ANCHORS.forEach((a, i) => {
    parts.push({ text: `REFERENCE STILL ${i + 1} (form bar — not the candidate)` });
    parts.push(img(path.join(FRAMES, a)));
  });
  for (const [k, phase] of (['intro', 'build', 'settled'] as const).entries()) {
    parts.push({ text: `JUDGE IMAGE ${k + 1}: candidate ${phase} composite` });
    parts.push(img(path.join(SCRATCH, c.dir, `${c.prefix}-${phase}.png`)));
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0, maxOutputTokens: 8192 } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
}

async function main() {
  console.log(`FRAME-ARMED JUDGE PROBE — production rubric + ${ANCHORS.length} anchor stills as the form bar\n`);
  const results: Record<string, number> = {};
  for (const c of CANDIDATES) {
    let r: Record<string, unknown>;
    try { r = await judge(c); }
    catch (e) { console.log(`${c.id}: THREW — ${(e as Error).message.slice(0, 140)}\n`); continue; }
    const form = typeof r.form === 'number' ? r.form : NaN;
    results[c.prefix] = form;
    console.log(`${c.id}`);
    console.log(`  form=${form}  score=${r.score}  h=${r.hierarchy} t=${r.typography} c=${r.color} comp=${r.composition} m=${r.motion}`);
    console.log(`  ${String(r.reasoning ?? '').slice(0, 170)}\n`);
  }
  console.log('--- VERDICT ---');
  const list = results['list-set'], stat = results['magnitude-quiet'], hero = results['concept-hero-rev'];
  if (Number.isFinite(list) && Number.isFinite(stat) && Number.isFinite(hero)) {
    console.log(`text-list form=${list} vs designed stat=${stat} / hero=${hero}`);
    console.log(list <= 4 && stat >= 6 && hero >= 6
      ? 'PASS — the frame-armed judge discriminates: undesigned text drops, designed work holds.'
      : list < Math.min(stat, hero)
        ? 'PARTIAL — direction correct (list lowest) but margins weak; tune the reference block.'
        : 'FAIL — anchors did not move the form score; escalate (writer-side fix / stronger reference framing).');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
