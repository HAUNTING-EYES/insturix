/** Type-weight axis smoke: FitHeadline sans at 200 / 500 / 800 → eyeball thickness contrast. */
import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url'; import sharp from 'sharp';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MG_EVAL_SCRATCH!;
import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { scanCode } from '../../lib/editron/motion-graphics/codegen/scan';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
const W=1280,H=720,FPS=30,DUR=42;
const body = `
type Data = Record<string, never>;
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand}) => {
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.07} y={0.16} w={0.86} h={0.68} align="left" justify="center" gapScale={2.2}>
        <FitHeadline brand={brand} text="Light editorial 200" face="sans" weight={200} size="m" startAt={ph.intro} />
        <FitHeadline brand={brand} text="Regular sans 500" face="sans" weight={500} size="m" startAt={ph.intro + 2} />
        <FitHeadline brand={brand} text="Heavy punchy 800" face="sans" weight={800} size="m" startAt={ph.intro + 4} />
      </Region>
    </Stage>
  );
};`;
async function main(){
  const artifact = applyImportPreamble(body);
  console.log('scan:', scanCode(artifact).ok ? 'PASS' : 'FAIL');
  const render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: {}, width: W, height: H, fps: FPS, durationInFrames: DUR }, { renderBudgetMs: 90000 });
  const footage = await sharp(path.join(SCRATCH,'footage-b.jpg')).resize(W,H,{fit:'cover'}).toBuffer();
  const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[render.files.length-1]))).resize(W,H,{fit:'fill'}).png().toBuffer();
  await sharp(footage).composite([{input:overlay}]).png().toFile(path.join(SCRATCH,'weight-smoke.png'));
  console.log('OK -> weight-smoke.png  frames:', render.files.length);
  await cleanupWorkspace(render.workspaceDir);
}
main().then(()=>process.exit(0)).catch(e=>{console.error('THREW:', String(e.message||e).slice(0,300)); process.exit(1);});
