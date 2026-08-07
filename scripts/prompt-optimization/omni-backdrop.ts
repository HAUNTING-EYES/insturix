/**
 * OMNI BACKDROP MOTION PROBE (4b enrichment build, step 0). Settles the architecture question before the client:
 * can Gemini Omni turn a WORDLESS still backdrop into a MOVING cinematic backdrop (image→motion), with no text,
 * preserving the scene? If yes → the illustrated-overlay motion-backdrop path is clean (no Veo, no meaning-drift,
 * because a wordless world has no meaning to drift). If Omni needs a video input, the probe falls back to feeding
 * a 2s static-still clip and asks Omni to animate it.
 *
 * Tries in order: (A) image document + animate prompt; (B) a static-still mp4 + animate prompt. Whichever returns
 * video bytes wins and prints WHICH — that decides the client's input shape. GEMINI_API_KEY via shell env.
 * MG_OMNI_BACKDROP_STILL = a wordless still jpg; MG_OMNI_OUT = output dir. Uncommitted (scripts/ rule).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
if (!process.env.GEMINI_API_KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }
const KEY = process.env.GEMINI_API_KEY;
const STILL = process.env.MG_OMNI_BACKDROP_STILL || path.join(REPO, 'tmp', 'backdrop.jpg');
const OUT = process.env.MG_OMNI_OUT || path.join(REPO, '.mg-render-tmp', 'omni-backdrop');
fs.mkdirSync(OUT, { recursive: true });

const OMNI_MODEL = process.env.MG_OMNI_MODEL?.trim() || 'gemini-omni-flash-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${KEY}`;

const ANIMATE = [
  'Bring this abstract scene to life as a premium, living cinematic BACKDROP: add subtle continuous motion',
  '(slow drift, flowing light, gentle parallax and depth), volumetric/rim lighting, soft depth-of-field,',
  'atmospheric particles, and a filmic colour grade — a high-end broadcast background.',
  'Keep the same composition and the same clear negative space. ABSOLUTELY NO text, letters, numbers, labels,',
  'logos, watermarks, or people anywhere — pure illustrative imagery only. Keep it seamless and loopable.',
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

async function callOmni(content: unknown[], label: string): Promise<string | null> {
  console.log(`\n[${label}] calling Omni …`);
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: OMNI_MODEL, input: [{ type: 'user_input', content }] }),
  });
  const txt = await res.text();
  fs.writeFileSync(path.join(OUT, `resp-${label}.json`), txt.slice(0, 4000));
  if (!res.ok) { console.log(`[${label}] HTTP ${res.status}: ${txt.slice(0, 300)}`); return null; }
  let json: unknown; try { json = JSON.parse(txt); } catch { console.log(`[${label}] non-JSON`); return null; }
  const data = findVideoData(json);
  console.log(`[${label}] ${data ? `VIDEO returned (${((Date.now() - started) / 1000).toFixed(0)}s)` : 'no video in response'}`);
  return data;
}

async function main() {
  const still = fs.readFileSync(STILL);
  const b64 = still.toString('base64');
  console.log(`still: ${STILL} (${(still.length / 1024).toFixed(0)}KB)`);

  // (A) image document → animate
  let data = await callOmni([{ type: 'image', mime_type: 'image/jpeg', data: b64 }, { type: 'text', text: ANIMATE }], 'A-image');
  let via = 'image→motion';

  // (B) fallback: 2s static-still clip → animate
  if (!data) {
    const clip = path.join(OUT, 'still-clip.mp4');
    ffmpeg(['-loop', '1', '-t', '2', '-i', STILL, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-vf', 'scale=854:480', clip]);
    const clipB64 = fs.readFileSync(clip).toString('base64');
    data = await callOmni([{ type: 'video', mime_type: 'video/mp4', data: clipB64 }, { type: 'text', text: ANIMATE }], 'B-stillclip');
    via = 'still-clip→motion';
  }

  if (!data) { console.error('\nNEITHER path returned video — Omni image→motion not available this way; the motion-backdrop client must use Veo/another path. Response heads saved.'); process.exit(2); }

  const outMp4 = path.join(OUT, 'backdrop-motion.mp4');
  fs.writeFileSync(outMp4, Buffer.from(data, 'base64'));
  console.log(`\nWINNER: ${via} → backdrop-motion.mp4 (${(fs.statSync(outMp4).size / 1024).toFixed(0)}KB)`);
  ffmpeg(['-i', outMp4, '-vf', 'select=\'not(mod(n\\,10))\',scale=320:-1,tile=6x1', '-frames:v', '1', path.join(OUT, 'backdrop-strip.png')]);
  console.log(`strip → backdrop-strip.png · eyeball: MOVING? wordless? scene preserved? clear zone intact?`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 400)); process.exit(1); });
