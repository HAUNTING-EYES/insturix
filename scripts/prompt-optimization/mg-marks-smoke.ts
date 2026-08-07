/**
 * Non-text primitive smoke test: render a component that composes the new kit marks (Ring gauge + Bar comparison
 * + Plot trend) and composite over the footage — to verify data-viz primitives render. Uncommitted (scripts/).
 *   MG_EVAL_SCRATCH=<dir with footage-b.jpg> npx tsx scripts/prompt-optimization/mg-marks-smoke.ts
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MG_EVAL_SCRATCH;
if (!SCRATCH) { console.error('set MG_EVAL_SCRATCH'); process.exit(1); }

import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const W = 1280, H = 720, FPS = 30, DUR = 60;

const BODY = `
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const {durationInFrames} = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.62} y={0.36} w={0.26} h={0.32} align="center" justify="center">
        <Ring brand={brand} value={0.43} at={ph.intro} size={190} thickness={16}/>
      </Region>
      <Region brand={brand} x={0.1} y={0.5} w={0.32} h={0.2} align="left" justify="center" gapScale={1.4}>
        <Bar brand={brand} value={0.92} at={ph.intro} tone="accent"/>
        <Bar brand={brand} value={0.61} at={ph.intro + 4} tone="text"/>
        <Bar brand={brand} value={0.38} at={ph.intro + 8} tone="muted"/>
      </Region>
      <Region brand={brand} x={0.1} y={0.14} w={0.32} h={0.16} align="left" justify="center">
        <Plot brand={brand} points={[3,4,3.5,6,5.5,8,7.5,11]} at={ph.intro} width={360} height={120}/>
      </Region>
    </Stage>
  );
};
type Data = {};
`;

async function main() {
  const artifact = applyImportPreamble(BODY);
  const render = await renderMomentToWebpFrames({
    componentSource: artifact, brand: INSTURIX, data: {}, width: W, height: H, fps: FPS, durationInFrames: DUR,
  });
  const idx = Math.round(render.files.length * 0.72);
  const frame = fs.readFileSync(path.join(render.webpDir, render.files[idx]));
  const footage = await sharp(path.join(SCRATCH!, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  const overlay = await sharp(frame).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const out = path.join(SCRATCH!, 'vision-out', 'marks-smoke-composite.png');
  await sharp(footage).composite([{ input: overlay }]).png().toFile(out);
  console.log(`rendered ${render.count} frames; marks composite → ${out}`);
  await cleanupWorkspace(render.workspaceDir);
}
main().catch((e) => { console.error(e); process.exit(1); });
