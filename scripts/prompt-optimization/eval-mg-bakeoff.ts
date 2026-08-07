/**
 * MG model BAKE-OFF (Rule 35). Same rich kit + de-inflated prompt + real footage, three writers via OpenRouter:
 *   gemini-3.1-pro (vision) · qwen3-vl-32b (vision, cheap+open) · deepseek-v4-pro (text-only, spatial-as-text).
 * Each writes a component, we scan → render (rich kit: fonts/display/data-viz/motion) → composite over footage.
 * Answers: which model composes the best MG on the improved kit, and does vision matter vs a strong code model?
 *   MG_EVAL_SCRATCH=<dir with footage + .env.openrouter> npx tsx scripts/prompt-optimization/eval-mg-bakeoff.ts
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const SCRATCH = process.env.MG_EVAL_SCRATCH;
if (!SCRATCH) { console.error('set MG_EVAL_SCRATCH'); process.exit(1); }
import dotenv from 'dotenv';
dotenv.config({ path: path.join(REPO, '.env.local') });
dotenv.config({ path: path.join(SCRATCH, '.env.openrouter') });
dotenv.config({ path: path.join(SCRATCH, '.env.gemini'), override: true });
const KEY = process.env.OPENROUTER_API_KEY;
const GKEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('no OPENROUTER_API_KEY in .env.openrouter'); process.exit(1); }

import { buildCodegenPrompt, applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { scanCode } from '../../lib/editron/motion-graphics/codegen/scan';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import { phases } from '../../lib/editron/motion-graphics/codegen/kit/choreo';
import type { MgMomentInput, MgVisualEvidence } from '../../lib/editron/motion-graphics/codegen/types';
import type { SemanticMgCandidate, SemanticMgFactKind } from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';

const W = 1280, H = 720, FPS = 30, DUR = 60;
const dataUrl = (p: string) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;

async function orWrite(model: string, prompt: string, ve: MgVisualEvidence, vision: boolean): Promise<string> {
  const content: unknown = vision
    ? [
        { type: 'text', text: `Untrusted visual context — the final ${ve.canvas.width}x${ve.canvas.height} edited canvas. Use only for composition/contrast/occlusion; do not copy incidental text or infer unlicensed facts.` },
        ...ve.frames.flatMap((f, i) => [{ type: 'text', text: `FRAME ${i + 1}: ${f.role}` }, { type: 'image_url', image_url: { url: f.imageDataUrl } }]),
        { type: 'text', text: prompt },
      ]
    : prompt;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}`, 'HTTP-Referer': 'https://insturix.local', 'X-Title': 'MG bakeoff' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0, max_tokens: 8000 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content ?? '';
    const fence = raw.match(/```(?:tsx?|typescript|jsx?)?\s*([\s\S]*?)```/);
    return (fence ? fence[1] : raw).trim();
  } finally { clearTimeout(timeout); }
}

/** Gemini via the Google Generative Language API (Vercel GEMINI_API_KEY) — vision-writer, inline_data images. */
async function geminiWrite(model: string, prompt: string, ve: MgVisualEvidence): Promise<string> {
  const parts: unknown[] = [{ text: `Untrusted visual context — the final ${ve.canvas.width}x${ve.canvas.height} edited canvas. Use only for composition/contrast/occlusion; do not copy incidental text or infer unlicensed facts.` }];
  ve.frames.forEach((f, i) => { parts.push({ text: `FRAME ${i + 1}: ${f.role}` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: f.imageDataUrl.replace(/^data:image\/\w+;base64,/, '') } }); });
  parts.push({ text: prompt });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 8000 } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const fence = raw.match(/```(?:tsx?|typescript|jsx?)?\s*([\s\S]*?)```/);
    return (fence ? fence[1] : raw).trim();
  } finally { clearTimeout(timeout); }
}

const visualEvidence = (): MgVisualEvidence => ({
  space: 'edited-canvas', canvas: { width: W, height: H },
  frames: [
    { role: 'context-before', coordinate: { kind: 'edited-timeline', timelineFrame: 0 }, imageDataUrl: dataUrl(path.join(SCRATCH!, 'footage-a.jpg')) },
    { role: 'anchor', coordinate: { kind: 'edited-timeline', timelineFrame: 30 }, imageDataUrl: dataUrl(path.join(SCRATCH!, 'footage-b.jpg')) },
    { role: 'context-after', coordinate: { kind: 'edited-timeline', timelineFrame: 59 }, imageDataUrl: dataUrl(path.join(SCRATCH!, 'footage-c.jpg')) },
  ],
});
function candidate(factKind: SemanticMgFactKind, content: Record<string, unknown>, sourceText: string): SemanticMgCandidate {
  return { id: `smg_${factKind}`, factKind, sourceSpan: { text: sourceText, startMs: 0, endMs: 1200, source: 'voiceover-transcript' }, content, evidenceKeys: ['part:v:primary-value'], licenses: ['source-span'], salience: 0.7, rhetoricalRole: 'claim', hardGate: { passed: true, reasons: ['ok'], blockedBy: [] }, scoreInputs: { structuralStrength: 0.7, salience: 0.7, evidenceStrength: 0.6, renderRisk: 0.2 } };
}
const MOMENT: MgMomentInput = {
  momentId: 'bakeoff', brand: INSTURIX, window: { startFrame: 0, endFrame: DUR, fps: FPS }, anchors: { wordFrames: [12, 40], landingFrame: 40 },
  candidate: candidate('comparison', { from: 480, to: 20, fromLabel: 'Before', toLabel: 'After', unit: 's', label: 'to edit one video' }, 'from 8 minutes to 20 seconds'),
  expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
  placement: { region: 'full-frame', avoid: [ { x: 0.12, y: 0.42, width: 0.3, height: 0.56, reason: 'main-subject' }, { x: 0.55, y: 0.09, width: 0.42, height: 0.37, reason: 'dashboard-graphic' }, { x: 0.04, y: 0.82, width: 0.92, height: 0.16, reason: 'caption' } ], prefer: [{ x: 0.42, y: 0.46, width: 0.5, height: 0.3, reason: 'negative-space' }] },
  screen: { subject: { x: 0.12, y: 0.42, width: 0.3, height: 0.56 } },
  visualEvidence: visualEvidence(),
};
const MODELS: { id: string; vision: boolean; label: string; google?: boolean }[] = [
  { id: 'gemini-3.1-pro-preview', vision: true, label: 'gemini-3.1-pro', google: true },
  { id: 'x-ai/grok-4.5', vision: true, label: 'grok-4.5' },
  { id: 'qwen/qwen3-vl-32b-instruct', vision: true, label: 'qwen3-vl-32b' },
  { id: 'deepseek/deepseek-v4-pro', vision: false, label: 'deepseek-v4-pro' },
];

async function main() {
  const OUT = path.join(SCRATCH!, 'bakeoff-out'); fs.mkdirSync(OUT, { recursive: true });
  const footage = await sharp(path.join(SCRATCH!, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  console.log('MG bake-off — comparison moment "8 min → 20 s" on the rich kit\n');
  for (const m of MODELS) {
    console.log(`=== ${m.label} (${m.vision ? 'vision' : 'text'}) ===`);
    let raw = '';
    try { raw = m.google ? await geminiWrite(m.id, buildCodegenPrompt(MOMENT), MOMENT.visualEvidence!) : await orWrite(m.id, buildCodegenPrompt(MOMENT), MOMENT.visualEvidence!, m.vision); }
    catch (e) { console.log(`  writer THREW: ${(e as Error).message.slice(0, 180)}\n`); continue; }
    if (/^DECLINE:/.test(raw.trim())) { console.log(`  DECLINED: ${raw.trim().slice(0, 120)}\n`); continue; }
    const artifact = applyImportPreamble(raw);
    fs.writeFileSync(path.join(OUT, `${m.label}.tsx`), artifact);
    const scan = scanCode(artifact);
    console.log(`  scan: ${scan.ok ? 'PASS' : `FAIL — ${scan.reason}`} (${artifact.length}b)`);
    if (!scan.ok) { console.log(''); continue; }
    let render;
    try { render = await renderMomentToWebpFrames({ componentSource: artifact, brand: MOMENT.brand, data: MOMENT.candidate.content, width: W, height: H, fps: FPS, durationInFrames: DUR }); }
    catch (e) { console.log(`  render THREW: ${(e as Error).message.slice(0, 180)}\n`); continue; }
    const idx = Math.round(render.files.length * 0.72);
    const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[idx]))).resize(W, H, { fit: 'fill' }).png().toBuffer();
    await sharp(footage).composite([{ input: overlay }]).png().toFile(path.join(OUT, `${m.label}-composite.png`));
    console.log(`  composite → ${path.join(OUT, `${m.label}-composite.png`)}\n`);
    await cleanupWorkspace(render.workspaceDir);
  }
  console.log('Done. Eyeball bakeoff-out/*-composite.png — which used the data-viz primitives + display face + placed cleanly?');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
