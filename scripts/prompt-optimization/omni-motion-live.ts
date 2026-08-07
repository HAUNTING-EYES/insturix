/** Live proof of the REAL generateMotionBackdrop client path (no injected fakes): imagery spec → its own still
 *  (defaultGeminiImageGenerate) → Omni image→motion (defaultOmniEnrich) → mp4 + the carried still. Saves the
 *  still, mp4, and a filmstrip. GEMINI_API_KEY via shell env; MG_OMNI_OUT = output dir. Uncommitted. */
import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { execFileSync } from 'child_process';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.GEMINI_API_KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }
const OUT = process.env.MG_OMNI_OUT || path.join(__dirname, '../../.mg-render-tmp/omni-motion-live');
fs.mkdirSync(OUT, { recursive: true });
import { generateMotionBackdrop } from '../../lib/editron/motion-graphics/codegen/design/imagery-client';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import type { MgDesignImagery } from '../../lib/editron/motion-graphics/codegen/design/design-plan';

const imagery: MgDesignImagery = {
  scenePrompt: 'a vast dark studio space where scattered abstract fragments slowly converge into one luminous flowing ribbon, sense of order emerging from chaos',
  mode: 'motion',
  paletteDirection: 'warm gold on deep charcoal, cinematic',
};

async function main() {
  console.log('generateMotionBackdrop (real still-gen → real Omni) …');
  const started = Date.now();
  const m = await generateMotionBackdrop(imagery, { brand: INSTURIX, canvas: { width: 1280, height: 720 } });
  fs.writeFileSync(path.join(OUT, 'still.jpg'), m.still.bytes);
  fs.writeFileSync(path.join(OUT, 'motion.mp4'), m.bytes);
  console.log(`still ${(m.still.bytes.length / 1024) | 0}KB · motion ${(m.bytes.length / 1024) | 0}KB in ${((Date.now() - started) / 1000) | 0}s`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(OUT, 'motion.mp4'), '-vf', "select='not(mod(n\\,10))',scale=320:-1,tile=6x1", '-frames:v', '1', path.join(OUT, 'motion-strip.png')], { stdio: 'inherit' });
  console.log(`OK → ${OUT} (still.jpg, motion.mp4, motion-strip.png)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 400)); process.exit(1); });
