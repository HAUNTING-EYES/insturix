/**
 * MG TASTE-GATE LAYER-2 RUBRIC eval (Rule 35 — the gate for the criterion-separated JUDGE_PROMPT).
 *
 * The production judge is Gemini (dead key locally); this validates the SAME committed JUDGE_PROMPT + the new
 * per-dimension schema on a live PROXY vision model (grok-4, xAI) against REAL kit renders (not synthetic mockups):
 * hand-authored GOOD / BAD / QUIET components → renderMomentToWebpFrames → composite 3 phases over a synthetic
 * busy-footage frame → grok-4 vision judge with the real rubric → parse the new {hierarchy,typography,color,
 * composition,motion,score} shape.
 *
 * PROVES: (1) a real VLM returns valid, parseable per-dimension JSON for the new rubric; (2) the craft dimensions
 * DISCRIMINATE a well-crafted graphic from a broken one; (3) RESTRAINT is not penalized (the QUIET case scores
 * well on hierarchy/typography). Does NOT replace the production-Gemini calibration against the founder's good/bad
 * set — that needs the live Vercel key. Uncommitted (scripts/ rule).
 *
 *   XAI_API_KEY in .env.local.  npx tsx scripts/prompt-optimization/eval-mg-judge-rubric.ts
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(REPO, '.env.local') });
if (!process.env.XAI_API_KEY) { console.error('no XAI_API_KEY in .env.local'); process.exit(1); }

import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { JUDGE_PROMPT } from '../../lib/editron/motion-graphics/codegen/prompt';
import { scanCode } from '../../lib/editron/motion-graphics/codegen/scan';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import { phases } from '../../lib/editron/motion-graphics/codegen/kit/choreo';

const W = 1280, H = 720, FPS = 30, DUR = 60;

// A GOOD graphic: ONE focal headline placed in the frame's ROOM (center-right), gold accent, a supporting bar,
// animated (countUp + ambient float + Bar grows) → develops across phases. Restrained, in-brand, legible.
const GOOD = `type Data = { value?: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const n = countUp(frame, ph.intro, 30, data.value ?? 10);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.44} y={0.46} w={0.5} h={0.3} align="left" justify="center" gapScale={1.2}>
        <div style={ambient(frame, ph.build, 'float', 0.5)}>
          <FitHeadline brand={brand} text={n + "x FASTER"} face="display" size="l" accentWords={["FASTER"]} startAt={ph.intro}/>
        </div>
        <Bar brand={brand} value={0.92} at={ph.intro + 6} tone="accent"/>
      </Region>
    </Stage>
  );
};`;

// A BAD graphic: a near-opaque raised plate covering ~80% of the frame (hides the footage + the subject) with two
// competing oversized headlines (no hierarchy, two focal points). Valid kit code, deliberately bad composition.
const BAD = `type Data = { value?: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.06} y={0.1} w={0.88} h={0.8} align="center" justify="center">
        <Plate brand={brand} surface="raised" opacity={0.9}>
          <FitHeadline brand={brand} text="TEN TIMES FASTER ONBOARDING RIGHT NOW TODAY" size="display" startAt={ph.intro}/>
        </Plate>
        <FitHeadline brand={brand} text="EVERYTHING IS BIGGER" size="display" startAt={ph.intro}/>
      </Region>
    </Stage>
  );
};`;

// A QUIET graphic: a small restrained corner chip. CORRECT for a subtle moment — must NOT be penalized as "timid".
const QUIET = `type Data = { label?: string };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Corner brand={brand} at="br">
        <div style={enter(brand, frame, ph.intro, 30, 'rise')}>
          <Chip brand={brand} text="10x faster" tone="accent" startAt={ph.intro}/>
        </div>
      </Corner>
    </Stage>
  );
};`;

const CASES = [
  { id: 'GOOD', src: GOOD, data: { value: 10 } as Record<string, unknown> },
  { id: 'BAD', src: BAD, data: { value: 10 } as Record<string, unknown> },
  { id: 'QUIET', src: QUIET, data: { label: '10x faster' } as Record<string, unknown> },
];

/** A synthetic "busy footage" frame: dark bg + a light subject block (left-centre), a title bar (top-left), a
 *  dashboard block (top-right), a caption bar (bottom). The graphic must sit in the centre-right ROOM, clear of all. */
async function busyFootage(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#12151b"/>
    <rect x="90" y="250" width="330" height="430" rx="14" fill="#3a4048"/>
    <circle cx="255" cy="360" r="70" fill="#565d68"/>
    <rect x="40" y="45" width="470" height="120" rx="10" fill="#242a33"/>
    <text x="60" y="120" font-family="Arial" font-size="54" fill="#aab2bd">TITLE TEXT</text>
    <rect x="720" y="60" width="500" height="250" rx="12" fill="#1c2734"/>
    <rect x="745" y="95" width="200" height="30" rx="6" fill="#41556b"/>
    <rect x="745" y="150" width="440" height="18" rx="4" fill="#31404f"/>
    <rect x="745" y="185" width="380" height="18" rx="4" fill="#31404f"/>
    <rect x="60" y="620" width="1160" height="70" rx="8" fill="#0c1a12"/>
    <text x="90" y="668" font-family="Arial" font-size="40" fill="#8fd6a6">caption line of subtitles here</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function compositeOver(bg: Buffer, frameBuf: Buffer): Promise<Buffer> {
  const overlay = await sharp(frameBuf).resize(W, H, { fit: 'fill' }).png().toBuffer();
  return sharp(bg).composite([{ input: overlay }]).png().toBuffer();
}

/** A contrast-only stress sheet: the settled overlay over a dark row and a light row (the judge's 4th image). */
async function stressSheet(frameBuf: Buffer): Promise<Buffer> {
  const w = 640, h = 360;
  const ov = await sharp(frameBuf).resize(w, h, { fit: 'fill' }).png().toBuffer();
  const dark = await sharp({ create: { width: w, height: h, channels: 3, background: '#111111' } }).png().composite([{ input: ov }]).toBuffer();
  const light = await sharp({ create: { width: w, height: h, channels: 3, background: '#f2f2f2' } }).png().composite([{ input: ov }]).toBuffer();
  return sharp({ create: { width: w, height: h * 2, channels: 3, background: '#000000' } }).png()
    .composite([{ input: dark, top: 0, left: 0 }, { input: light, top: h, left: 0 }]).toBuffer();
}

function du(buf: Buffer): string { return `data:image/png;base64,${buf.toString('base64')}`; }

// The REAL production judge = Gemini gemini-2.5-flash with the same responseSchema the production judge uses
// (visual-judge-provider.GEMINI_RESPONSE_SCHEMA). Key from process.env.GEMINI_API_KEY (pass the LIVE Vercel key,
// not the stale .env.local one). This closes the production-calibration gap the grok proxy could not.
const GEMINI_JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    faithful: { type: 'BOOLEAN' },
    hierarchy: { type: 'NUMBER' }, typography: { type: 'NUMBER' }, color: { type: 'NUMBER' },
    composition: { type: 'NUMBER' }, motion: { type: 'NUMBER' }, score: { type: 'NUMBER' },
    issues: { type: 'ARRAY', items: { type: 'STRING' } }, reasoning: { type: 'STRING' },
  },
  required: ['faithful', 'hierarchy', 'typography', 'color', 'composition', 'motion', 'score', 'issues', 'reasoning'],
};

async function geminiJudge(images: Buffer[], fact: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const labels = ['intro composite', 'build composite', 'settled-hold composite', 'contrast stress sheet'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: `${JUDGE_PROMPT}\n\nLICENSED FACT JSON:\n${fact}` }];
  images.forEach((img, i) => {
    parts.push({ text: `JUDGE IMAGE ${i + 1}: ${labels[i]}` });
    parts.push({ inlineData: { mimeType: 'image/png', data: img.toString('base64') } });
  });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_JUDGE_SCHEMA, temperature: 0, maxOutputTokens: 8192 } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

const DIMS = ['hierarchy', 'typography', 'color', 'composition', 'motion'] as const;

async function main() {
  const bg = await busyFootage();
  const results: Record<string, Record<string, number>> = {};
  console.log('MG TASTE-GATE LAYER-2 RUBRIC eval — grok-4 proxy over REAL kit renders\n');

  for (const c of CASES) {
    const artifact = applyImportPreamble(c.src);
    const scan = scanCode(artifact);
    console.log(`=== ${c.id} ===  scan: ${scan.ok ? 'PASS' : `FAIL — ${scan.reason}`}`);
    if (!scan.ok) continue;

    let render;
    try {
      render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: c.data, width: W, height: H, fps: FPS, durationInFrames: DUR });
    } catch (e) { console.log(`  render THREW: ${(e as Error).message.slice(0, 200)}\n`); continue; }

    const ph = phases(render.count, INSTURIX);
    const idxs = [Math.round(ph.intro), Math.round(ph.build), Math.min(render.count - 1, Math.round(ph.resolve + (render.count - ph.resolve) * 0.5))];
    const comps: Buffer[] = [];
    for (const i of idxs) comps.push(await compositeOver(bg, fs.readFileSync(path.join(render.webpDir, render.files[Math.max(0, Math.min(render.count - 1, i))]))));
    comps.push(await stressSheet(fs.readFileSync(path.join(render.webpDir, render.files[idxs[2]]))));
    await cleanupWorkspace(render.workspaceDir);

    const fact = JSON.stringify({ factKind: 'comparison', content: c.data, sourceText: 'ten times faster' });
    let raw = '';
    try { raw = await geminiJudge(comps, fact); }
    catch (e) { console.log(`  judge THREW: ${(e as Error).message.slice(0, 200)}\n`); continue; }

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, '')); }
    catch { console.log(`  judge returned UNPARSEABLE JSON: ${raw.slice(0, 200)}\n`); continue; }

    const row: Record<string, number> = {};
    for (const d of DIMS) row[d] = typeof parsed[d] === 'number' ? (parsed[d] as number) : NaN;
    row.score = typeof parsed.score === 'number' ? (parsed.score as number) : NaN;
    results[c.id] = row;
    const faithful = parsed.faithful;
    console.log(`  faithful=${faithful}  score=${row.score}  ${DIMS.map((d) => `${d}=${row[d]}`).join(' ')}`);
    console.log(`  reasoning: ${String(parsed.reasoning ?? '').slice(0, 160)}`);
    console.log(`  issues: ${Array.isArray(parsed.issues) ? (parsed.issues as string[]).join(' | ').slice(0, 220) : ''}\n`);
  }

  // Verdicts (craft dims — motion + overall need a fuller render eval; craft dims are the static-discriminating axes).
  const g = results.GOOD, b = results.BAD, q = results.QUIET;
  console.log('--- VERDICTS ---');
  if (g && b) {
    const craft = (r: Record<string, number>) => (r.hierarchy + r.typography + r.color + r.composition) / 4;
    console.log(`discrimination (craft avg): GOOD ${craft(g).toFixed(1)} vs BAD ${craft(b).toFixed(1)} → ${craft(g) > craft(b) ? 'PASS (good > bad)' : 'FAIL'}`);
    console.log(`composition occlusion: GOOD ${g.composition} vs BAD ${b.composition} → ${g.composition > b.composition ? 'PASS' : 'FAIL'}`);
  }
  if (q) console.log(`restraint not penalized: QUIET hierarchy=${q.hierarchy} typography=${q.typography} → ${q.hierarchy >= 6 && q.typography >= 6 ? 'PASS (quiet is not marked timid)' : 'CHECK'}`);
  if (g) console.log(`structured output parsed for GOOD with all 5 dims → ${DIMS.every((d) => Number.isFinite(g[d])) ? 'PASS' : 'FAIL'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
