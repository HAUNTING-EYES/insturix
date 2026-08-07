/**
 * TASTE-GATE CALIBRATION — does the layer-2/3a CRAFT rubric rate genuine PROFESSIONAL MG stills highly?
 *
 * The production judge (JUDGE_PROMPT) is built for our transparent-MG-over-footage 3-phase composites with a
 * licensed fact. The reference anchors are FINISHED stills (MG already composited, no our-fact, no 3-phase motion),
 * so this uses a CRAFT-ONLY variant of the same dimensions + professional bar. If the real pros score 8+, the
 * craft rubric is calibrated to professional quality (the layer-3 "definition of good"). Real Gemini judge
 * (gemini-2.5-flash). Uncommitted (scripts/ rule). Pass the LIVE Vercel GEMINI_API_KEY via shell env.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(REPO, '.env.local') });
if (!process.env.GEMINI_API_KEY) { console.error('no GEMINI_API_KEY (pass the live Vercel key via shell env)'); process.exit(1); }

const FR = process.env.MG_FRAMES_DIR || '';
if (!FR || !fs.existsSync(FR)) { console.error('set MG_FRAMES_DIR to the reference-frames dir'); process.exit(1); }

// Craft-only rubric — same 4 static-judgeable dimensions + the layer-3a professional bar, framed for a finished still.
const CRAFT_PROMPT = `You are a ruthless motion-graphics craft judge. The image is ONE finished, professional motion-graphic still. Judge its CRAFT only (it is a real still, so do not judge motion or faithfulness to any external fact). Score EACH dimension 0-10 by its guiding question — these are Swiss/Bauhaus craft LAWS, not personal taste:
- hierarchy: does the eye know where to ENTER and in what order to read? A single-point graphic earns this with one dominant element + deliberately smaller support. ★ When the content IS A SET — a labelled map, an icon-array/pictogram chart, a compared group, a menu of options, an illustrated scene — then several elements of EQUAL visual weight are the CORRECT form. That is a SET, not "competing focal points": do NOT call it competing and do NOT mark hierarchy down for it. Forcing one member to dominate would misrepresent the content. For a set, judge instead: is it cleanly grouped, consistently styled, legibly labelled, and can the eye enter and read it in a sensible order? Low = undifferentiated flatness (no entry point at all, everything one weight with no grouping), or genuinely unrelated elements fighting each other.
- typography: is the type legible, well-set (weight, tracking, case), and never clipped or overflowing? Illegible / clipped / overflowing = low.
- color: is the palette cohesive with clean contrast and no muddy gradients? Muddy / clashing / weak contrast = low.
- composition: is it a considered layout with intentional negative space, balanced, not cluttered or cramped? Cluttered / cramped / dead-quadrant = low.
- form: is there DESIGNED visual form — structure, marks, motifs, spatial composition, drawn/figurative elements — matched to the moment, or is it MINIMUM-VIABLE TEXT (bare words on a plain panel)? A designed-minimal graphic (a considered dot, rule, texture, accent — small but composed) scores HIGH. Bare text lines where a professional would design a structure = low. Words alone on a rectangle is a slide, not a motion graphic.
RESTRAINT IS CRAFT, NOT TIMIDITY: a quiet, precise, minimal graphic is CORRECT — never mark it down for restraint. Reward deliberate negative space, one accent, clean readability. But restraint means a SMALLER design, never NO design — judge \`form\` on design investment, not on size.
PROFESSIONAL BAR — hold it to the ONE bar whose kind fits: a DATA/EDITORIAL still → clarity + editorial restraint (Vox); a KINETIC/HOOK still → energy + one high-contrast accent (Hormozi); a PREMIUM still → refined restraint + polish (Gadzhi). Ask: does this belong alongside professional motion design? Score against the FITTING bar.
score = a holistic 0-10 overall consistent with the four dimensions.
Return ONLY JSON: {"hierarchy":0-10,"typography":0-10,"color":0-10,"composition":0-10,"form":0-10,"score":0-10,"reasoning":"one sentence"}.`;

const CRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hierarchy: { type: 'NUMBER' }, typography: { type: 'NUMBER' }, color: { type: 'NUMBER' },
    composition: { type: 'NUMBER' }, form: { type: 'NUMBER' }, score: { type: 'NUMBER' }, reasoning: { type: 'STRING' },
  },
  required: ['hierarchy', 'typography', 'color', 'composition', 'form', 'score', 'reasoning'],
};

async function judgeStill(jpg: Buffer): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  const body = {
    contents: [{ role: 'user', parts: [{ text: CRAFT_PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: jpg.toString('base64') } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: CRAFT_SCHEMA, temperature: 0, maxOutputTokens: 8192 },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return JSON.parse(text);
}

async function main() {
  const files = fs.readdirSync(FR).filter((f) => f.endsWith('.jpg')).sort();
  console.log(`TASTE-GATE CALIBRATION — Gemini craft judge on ${files.length} real pro MG stills\n`);
  const scores: number[] = [];
  for (const f of files) {
    let r: Record<string, unknown>;
    try { r = await judgeStill(fs.readFileSync(path.join(FR, f))); }
    catch (e) { console.log(`${f}: JUDGE THREW — ${(e as Error).message.slice(0, 140)}\n`); continue; }
    const s = typeof r.score === 'number' ? r.score : NaN;
    scores.push(s);
    console.log(`${f}`);
    console.log(`  score=${s}  hierarchy=${r.hierarchy} typography=${r.typography} color=${r.color} composition=${r.composition} form=${r.form}`);
    console.log(`  ${String(r.reasoning ?? '').slice(0, 150)}\n`);
  }
  const pass8 = scores.filter((s) => s >= 8).length;
  const pass7 = scores.filter((s) => s >= 7).length;
  console.log('--- VERDICT ---');
  console.log(`pros scoring >=8: ${pass8}/${scores.length}  |  >=7: ${pass7}/${scores.length}`);
  console.log(scores.length && pass7 === scores.length ? 'PASS — the craft rubric rates genuine pro work at professional level (>=7 all).' : 'CHECK — some pro stills scored below 7; inspect the rubric or the frames.');
}

main().catch((e) => { console.error(e); process.exit(1); });
