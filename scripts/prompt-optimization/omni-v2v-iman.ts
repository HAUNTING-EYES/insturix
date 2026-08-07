/**
 * P3 STEP 2 — OMNI V2V INTEGRATION PROBES (criteria written in the master plan BEFORE this run).
 *
 * V-a (safe): Omni enriches the FOOTAGE ONLY (grade/depth/light; NO graphics, NO text) — kit composites after.
 *   ACCEPT iff: footage visibly richer + no content drift (same person/room/framing) + zero text introduced.
 * V-b (the real question): Omni v2v on the footage+card COMPOSITE — integrate the panel (lighting/reflections/
 *   tracking), change NOTHING else.
 *   ACCEPT iff ALL: card text VERBATIM ("DISCIPLINE IS THE ULTIMATE SHORTCUT" + "the principle") · layout intact ·
 *   motion timing unchanged · integration lift visible. ONE re-run allowed on failure. Fail → Iman stays pure-kit.
 *
 * Mechanics (bytes only): re-render the P3c winning component (iman-premium-rev.tsx) → alpha frames → ffmpeg
 * per-frame overlay onto the real kitchen bed (iman-t1300) → input-vb.mp4 (2s, 854x480). V-a input = 2s static
 * clip of the bed alone. Omni inline Method B (proven). Outputs: enriched mp4s + 3-frame strips for verdicts.
 * GEMINI_API_KEY via shell. MG_V2V_DIR = e2e-out-p3c dir; MG_V2V_BED = bed jpg; MG_V2V_OUT = output. Uncommitted.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
if (!process.env.GEMINI_API_KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }
const KEY = process.env.GEMINI_API_KEY;
const SRC_DIR = process.env.MG_V2V_DIR!;
const BED = process.env.MG_V2V_BED!;
const OUT = process.env.MG_V2V_OUT || path.join(REPO, '.mg-render-tmp', 'omni-v2v');
fs.mkdirSync(OUT, { recursive: true });

import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const W = 854, H = 480, FPS = 30, DUR = 60; // 2s probe clips
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${KEY}`;
const MODEL = 'gemini-omni-flash-preview';

const PROMPT_VA = [
  'Enrich this footage to a premium cinematic grade: deeper filmic colour grade, subtle depth-of-field,',
  'richer directional lighting and gentle atmosphere. PRESERVE THE SCENE EXACTLY: the same person, same room,',
  'same framing, same motion — no new objects, no people changes, and ABSOLUTELY NO text, captions, graphics,',
  'logos, or watermarks anywhere.',
].join(' ');

const PROMPT_VB = [
  'This shot contains a frosted glass information panel. Integrate the panel PHYSICALLY into the scene:',
  'match the room lighting and colour temperature on the panel, add subtle realistic reflections and soft',
  'environmental shadowing, and let it sit naturally in the space. CHANGE NOTHING ELSE. ABSOLUTELY CRITICAL:',
  'the panel text must remain EXACTLY as-is, character for character — "DISCIPLINE IS THE ULTIMATE SHORTCUT"',
  'and "the principle" — same font look, same layout, same size, same position; all motion and timing identical;',
  'the person, the room, and every other pixel unchanged; no new text, no new elements.',
].join(' ');

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

function findVideoData(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as string | undefined;
  const data = (o.data ?? (o.inlineData as Record<string, unknown> | undefined)?.data) as string | undefined;
  if (typeof data === 'string' && data.length > 5000 && (!mime || String(mime).startsWith('video'))) return data;
  for (const v of Object.values(o)) {
    const found = Array.isArray(v) ? v.map(findVideoData).find(Boolean) : findVideoData(v);
    if (found) return found as string;
  }
  return null;
}

async function omniV2V(inMp4: string, prompt: string, tag: string): Promise<string | null> {
  const b64 = fs.readFileSync(inMp4).toString('base64');
  console.log(`[${tag}] calling Omni (${(b64.length * 0.75 / 1024) | 0}KB clip) …`);
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: [{ type: 'user_input', content: [
      { type: 'video', mime_type: 'video/mp4', data: b64 },
      { type: 'text', text: prompt },
    ] }] }),
  });
  const txt = await res.text();
  if (!res.ok) { console.log(`[${tag}] HTTP ${res.status}: ${txt.slice(0, 250)}`); return null; }
  let json: unknown; try { json = JSON.parse(txt); } catch { console.log(`[${tag}] non-JSON`); return null; }
  const data = findVideoData(json);
  if (!data) { console.log(`[${tag}] no video in response`); fs.writeFileSync(path.join(OUT, `resp-${tag}.json`), txt.slice(0, 3000)); return null; }
  const outPath = path.join(OUT, `${tag}.mp4`);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`[${tag}] OK ${(fs.statSync(outPath).size / 1024) | 0}KB in ${((Date.now() - started) / 1000) | 0}s`);
  ffmpeg(['-i', outPath, '-vf', "select='not(mod(n\\,20))',scale=427:-1,tile=3x1", '-frames:v', '1', path.join(OUT, `${tag}-strip.png`)]);
  return outPath;
}

async function main() {
  // 1. Rebuild the animated Iman composite clip (bytes-plumbing of the SYSTEM's own winning component).
  const tsx = fs.readFileSync(path.join(SRC_DIR, 'iman-premium-rev.tsx'), 'utf8');
  console.log('rendering the winning card (alpha frames) …');
  const render = await renderMomentToWebpFrames(
    { componentSource: tsx, brand: INSTURIX, data: { quote: 'discipline is the ultimate shortcut', label: 'the principle' }, width: W, height: H, fps: FPS, durationInFrames: DUR },
    { renderBudgetMs: 120_000 },
  );
  const inVb = path.join(OUT, 'input-vb.mp4');
  // per-frame overlay of the alpha webp sequence onto the real bed
  ffmpeg(['-loop', '1', '-i', BED, '-framerate', String(FPS), '-i', path.join(render.webpDir, '%05d.webp'),
    '-filter_complex', `[0:v]scale=${W}:${H},setsar=1[bg];[1:v]scale=${W}:${H}[fg];[bg][fg]overlay=shortest=1`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-r', String(FPS), inVb]);
  await cleanupWorkspace(render.workspaceDir).catch(() => undefined);
  const inVa = path.join(OUT, 'input-va.mp4');
  ffmpeg(['-loop', '1', '-t', '2', '-i', BED, '-vf', `scale=${W}:${H}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), inVa]);
  ffmpeg(['-i', inVb, '-vf', "select='not(mod(n\\,20))',scale=427:-1,tile=3x1", '-frames:v', '1', path.join(OUT, 'input-vb-strip.png')]);
  console.log(`inputs ready: input-va.mp4 ${(fs.statSync(inVa).size / 1024) | 0}KB · input-vb.mp4 ${(fs.statSync(inVb).size / 1024) | 0}KB`);

  // 2. The two probes.
  await omniV2V(inVa, PROMPT_VA, 'va-footage-only');
  await omniV2V(inVb, PROMPT_VB, 'vb-integrate-card');

  console.log(`\nDONE → ${OUT}\nVERDICT CHECKS (per the plan's criteria): V-a = richer? drift? any text? · V-b = text VERBATIM? layout? timing? lift?`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 400)); process.exit(1); });
