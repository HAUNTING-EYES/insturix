/**
 * Font-wire smoke test: re-render a saved codegen artifact (from the vision eval) now that kit/fonts.ts is wired,
 * and composite over the footage — to eyeball whether the type is now Plus Jakarta Sans instead of Chromium
 * default. NO model call; pure local render. Uncommitted (scripts/ rule).
 *   MG_EVAL_SCRATCH=<dir with vision-out/*.tsx + footage-b.jpg> npx tsx scripts/prompt-optimization/mg-render-smoke.ts
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MG_EVAL_SCRATCH;
if (!SCRATCH) { console.error('set MG_EVAL_SCRATCH'); process.exit(1); }

import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const W = 1280, H = 720, FPS = 30, DUR = 60;

async function main() {
  const artifact = fs.readFileSync(path.join(SCRATCH!, 'vision-out', 'concept-subtle.tsx'), 'utf8');
  const t0 = Date.now();
  const render = await renderMomentToWebpFrames({
    componentSource: artifact, brand: INSTURIX,
    data: { keyword: 'onboarding', body: 'ten times faster' },
    width: W, height: H, fps: FPS, durationInFrames: DUR,
  });
  console.log(`rendered ${render.count} frames in ${Date.now() - t0}ms (fonts wired)`);
  const idx = Math.round(render.files.length * 0.7);
  const frame = fs.readFileSync(path.join(render.webpDir, render.files[idx]));
  const footage = await sharp(path.join(SCRATCH!, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  const overlay = await sharp(frame).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const out = path.join(SCRATCH!, 'vision-out', 'fonts-smoke-composite.png');
  await sharp(footage).composite([{ input: overlay }]).png().toFile(out);
  console.log(`composite → ${out}`);
  await cleanupWorkspace(render.workspaceDir);
}
main().catch((e) => { console.error(e); process.exit(1); });
