/**
 * Phase-2 face="display" smoke test: render the SAME headline with face="sans" vs face="display" (heavy condensed
 * Anton ALL-CAPS) and composite both over the footage, to eyeball the impact difference. Uncommitted (scripts/).
 *   MG_EVAL_SCRATCH=<dir with footage-b.jpg> npx tsx scripts/prompt-optimization/mg-display-smoke.ts
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

const bodyFor = (face: string) => `
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const {durationInFrames} = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.4} w={0.56} h={0.22} align="left" justify="center">
        <FitHeadline brand={brand} text={data.phrase ?? 'ten times faster'} accentWords={["ten"]} face="${face}" size="display" kinetic="rise" startAt={ph.intro}/>
      </Region>
    </Stage>
  );
};
type Data = { phrase?: string };
`;

async function renderOne(face: string, outName: string): Promise<void> {
  const artifact = applyImportPreamble(bodyFor(face));
  const render = await renderMomentToWebpFrames({
    componentSource: artifact, brand: INSTURIX, data: { phrase: 'ten times faster' },
    width: W, height: H, fps: FPS, durationInFrames: DUR,
  });
  const idx = Math.round(render.files.length * 0.7);
  const frame = fs.readFileSync(path.join(render.webpDir, render.files[idx]));
  const footage = await sharp(path.join(SCRATCH!, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  const overlay = await sharp(frame).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const out = path.join(SCRATCH!, 'vision-out', outName);
  await sharp(footage).composite([{ input: overlay }]).png().toFile(out);
  console.log(`rendered face="${face}" → ${out}`);
  await cleanupWorkspace(render.workspaceDir);
}

async function main() {
  await renderOne('sans', 'display-smoke-sans.png');
  await renderOne('display', 'display-smoke-display.png');
}
main().catch((e) => { console.error(e); process.exit(1); });
