/**
 * Motion-library smoke test: render a component using ambient() hold-motion + Reveal + Particles, save TWO
 * hold-phase frames (30 & 50) so we can confirm the graphic keeps MOVING (frames differ, not frozen). Uncommitted.
 *   MG_EVAL_SCRATCH=<dir with footage-b.jpg> npx tsx scripts/prompt-optimization/mg-motion-smoke.ts
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
  const frame = useCurrentFrame();
  return (
    <Stage brand={brand}>
      <Bleed><Particles brand={brand} kind="dust" count={44} at={ph.intro} tone="accent"/></Bleed>
      <Region brand={brand} x={0.1} y={0.42} w={0.42} h={0.2} align="left" justify="center">
        <div style={ambient(frame, ph.build, 'float', 1)}>
          <FitHeadline brand={brand} text="ten times faster" accentWords={["ten"]} face="display" size="l" kinetic="rise" startAt={ph.intro}/>
        </div>
      </Region>
      <Region brand={brand} x={0.63} y={0.4} w={0.26} h={0.26} align="center" justify="center">
        <Reveal at={ph.build} dur={20} from="left"><Ring brand={brand} value={0.43} at={ph.intro} size={170} thickness={16}/></Reveal>
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
  const footage = await sharp(path.join(SCRATCH!, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  for (const f of [30, 50]) {
    const frame = fs.readFileSync(path.join(render.webpDir, render.files[Math.min(f, render.files.length - 1)]));
    const overlay = await sharp(frame).resize(W, H, { fit: 'fill' }).png().toBuffer();
    const out = path.join(SCRATCH!, 'vision-out', `motion-smoke-f${f}.png`);
    await sharp(footage).composite([{ input: overlay }]).png().toFile(out);
    console.log(`frame ${f} → ${out}`);
  }
  await cleanupWorkspace(render.workspaceDir);
}
main().catch((e) => { console.error(e); process.exit(1); });
