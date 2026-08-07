/**
 * OMNI ANIMATIC-ENRICHMENT PROBE (4b-4 companion). Tests the architectural question the founder raised: can
 * Gemini Omni be the "animatic enrichment" finishing layer — take OUR deterministic, brand-exact, honest MG
 * render and elevate its MATERIAL (depth, lighting, filmic grade — the Gadzhi bar) WITHOUT fabricating or
 * breaking our text/values/motion/timing?
 *
 * Pipeline: re-render a saved scene component → small h264 mp4 (our clean render) → Gemini Omni video-to-video
 * "enrich the material, preserve ALL text/layout/motion exactly" → extract frames from OUR input AND Omni's
 * output → eyeball three questions: (1) TEXT preserved verbatim & readable? (2) MATERIAL genuinely richer?
 * (3) MOTION/timing preserved? This is the ACTUAL measurement of "does Omni preserve our text when enriching"
 * (memory: values stay kit-side for editability/brand-exactness/verifiability — this measures the enrichment
 * path's fidelity, the one open unknown).
 *
 * API (docs-verified 2026-07-18): POST /v1beta/interactions, model gemini-omni-flash-preview. Inline for small
 * clips (Method B: input[].type=user_input, content[].type=video + data base64); Files API fallback for >4MB.
 * India (this account) is NOT in the EEA/UK/CH upload-restricted set. ~$0.10/s — a 2s clip is cents.
 *
 * GEMINI_API_KEY via shell env (prod key). MG_OMNI_SCENE_DIR = the e2e-out-scene dir (has scene-journey.tsx +
 * scene-journey-backdrop.jpg). MG_OMNI_OUT = output dir. Uncommitted (scripts/ rule).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
if (!process.env.GEMINI_API_KEY) { console.error('missing GEMINI_API_KEY (prod key via shell env)'); process.exit(1); }
const KEY = process.env.GEMINI_API_KEY;
const SCENE_DIR = process.env.MG_OMNI_SCENE_DIR || path.join(REPO, 'tmp');
const OUT = process.env.MG_OMNI_OUT || path.join(REPO, '.mg-render-tmp', 'omni-animatic');
fs.mkdirSync(OUT, { recursive: true });

import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const W = 854, H = 480, FPS = 30, DUR = 60; // 2s, 480p → small mp4 for inline delivery

const OMNI_MODEL = process.env.MG_OMNI_MODEL?.trim() || 'gemini-omni-flash-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${KEY}`;

const PROMPT = [
  'You are a finishing artist. Enrich the MATERIAL of this motion graphic to a premium cinematic grade:',
  'add subtle depth-of-field, volumetric/rim lighting, richer gradients and reflections, a filmic colour grade,',
  'and gentle atmospheric depth. Make it look like a high-end broadcast package.',
  'ABSOLUTELY CRITICAL — preserve these EXACTLY, do not change, reword, add, remove, translate, or re-typeset:',
  'the headline text "FROM CHAOS TO ONE CLEAN TIMELINE", the subtext "editing untangled", the layout and',
  'composition, the left-to-right timing, and all existing motion. The words must remain identical and readable.',
  'Do not introduce any new text, numbers, logos, or people. Keep the same meaning and the same shot.',
].join(' ');

/** Deep-walk a JSON tree for the first video part carrying base64 bytes (tolerant to the exact response shape). */
function findVideoData(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as string | undefined;
  const data = (o.data ?? (o.inlineData as Record<string, unknown> | undefined)?.data) as string | undefined;
  if (typeof data === 'string' && data.length > 1000 && (!mime || String(mime).startsWith('video'))) return data;
  for (const v of Object.values(o)) {
    const found = Array.isArray(v)
      ? v.map(findVideoData).find(Boolean)
      : findVideoData(v);
    if (found) return found as string;
  }
  return null;
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

async function main() {
  // 1. Re-render the saved opaque scene to a frame sequence, then stitch to a small h264 mp4.
  const tsx = fs.readFileSync(path.join(SCENE_DIR, 'scene-journey.tsx'), 'utf8');
  const backdrop = fs.readFileSync(path.join(SCENE_DIR, 'scene-journey-backdrop.jpg'));
  const backdropSrc = `data:image/jpeg;base64,${backdrop.toString('base64')}`;
  const data = { keyword: 'from chaos to one clean timeline', body: 'editing untangled', backdropSrc };

  console.log('rendering our clean scene → frames …');
  const render = await renderMomentToWebpFrames(
    { componentSource: tsx, brand: INSTURIX, data, width: W, height: H, fps: FPS, durationInFrames: DUR },
    { expectOpaque: true, renderBudgetMs: 120_000 },
  );
  const inMp4 = path.join(OUT, 'input.mp4');
  ffmpeg(['-framerate', String(FPS), '-i', path.join(render.webpDir, '%05d.webp'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', inMp4]);
  await cleanupWorkspace(render.workspaceDir).catch(() => undefined);
  const inBytes = fs.statSync(inMp4).size;
  console.log(`input.mp4 = ${(inBytes / 1024).toFixed(0)}KB (${render.count} frames)`);

  // 2. Call Omni — inline (Method B) for a small clip; Files API is the >4MB fallback (not needed here).
  if (inBytes > 4 * 1024 * 1024) { console.error('clip >4MB — Files API path not implemented in this probe; shrink DUR/dims'); process.exit(1); }
  const body = {
    model: OMNI_MODEL,
    input: [{
      type: 'user_input',
      content: [
        { type: 'video', mime_type: 'video/mp4', data: fs.readFileSync(inMp4).toString('base64') },
        { type: 'text', text: PROMPT },
      ],
    }],
  };
  console.log(`calling Omni (${OMNI_MODEL}) — enrich material, preserve text/motion …`);
  const started = Date.now();
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const rawText = await res.text();
  fs.writeFileSync(path.join(OUT, 'omni-response-head.json'), rawText.slice(0, 4000));
  if (!res.ok) {
    console.error(`Omni HTTP ${res.status}: ${rawText.slice(0, 600)}`);
    console.error('(if this is a shape/region error, the response head is saved for diagnosis — Files-API/shape fallback is the next iteration)');
    process.exit(1);
  }
  let json: unknown;
  try { json = JSON.parse(rawText); } catch { console.error('Omni response not JSON:', rawText.slice(0, 300)); process.exit(1); }
  const outData = findVideoData(json);
  if (!outData) { console.error('Omni response carried no video bytes — head saved. Keys:', Object.keys(json as object).join(',')); process.exit(1); }
  const outMp4 = path.join(OUT, 'output.mp4');
  fs.writeFileSync(outMp4, Buffer.from(outData, 'base64'));
  console.log(`Omni returned output.mp4 = ${(fs.statSync(outMp4).size / 1024).toFixed(0)}KB in ${((Date.now() - started) / 1000).toFixed(0)}s`);

  // 3. Extract comparable frames from BOTH for eyeballing (text preservation + material lift + motion).
  for (const [tag, mp4] of [['in', inMp4], ['out', outMp4]] as const) {
    ffmpeg(['-i', mp4, '-vf', `fps=${FPS}`, '-frames:v', '1', '-ss', '0.1', path.join(OUT, `${tag}-a.png`)]);
    ffmpeg(['-i', mp4, '-ss', '1.0', '-frames:v', '1', path.join(OUT, `${tag}-b.png`)]);
    ffmpeg(['-i', mp4, '-ss', '1.9', '-frames:v', '1', path.join(OUT, `${tag}-c.png`)]);
  }
  console.log(`\nOK → ${OUT}\n  eyeball: in-*.png vs out-*.png — (1) text "FROM CHAOS TO ONE CLEAN TIMELINE" preserved & readable? (2) material richer? (3) motion/timing preserved?`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 500)); process.exit(1); });
