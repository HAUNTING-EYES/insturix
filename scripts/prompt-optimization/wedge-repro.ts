/** Wedge repro (uncommitted): render the REAL crashing artifact (Frame NaN) — before the fix this wedged the
 *  process forever after the catch; with cancel-on-any-failure it must throw fast AND the process must EXIT. */
import fs from 'fs';
import { renderMomentToWebpFrames } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
const src = applyImportPreamble(fs.readFileSync(process.env.CRASH_TSX!, 'utf8'));
const t0 = Date.now();
try {
  await renderMomentToWebpFrames({ componentSource: src, brand: INSTURIX, data: { value: 1_000_000, unit: '+', label: 'videos made' }, width: 1280, height: 720, fps: 30, durationInFrames: 75 });
  console.log('UNEXPECTED: rendered fine');
} catch (e) {
  console.log(`threw as expected after ${Math.round((Date.now() - t0) / 1000)}s: ${(e as Error).message.slice(0, 80)}`);
}
console.log('MAIN DONE — process should now exit on its own (no process.exit call!)');
