/** Colour-axis smoke: in-brand tint/shade/mix swatches → eyeball palette variation + scanCode legality. */
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
  const frame = useCurrentFrame();
  const ph = phases(durationInFrames, brand);
  const p = interpolate(frame, [ph.intro, ph.intro + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const swatches = [
    brand.colors.accent,
    tint(brand.colors.accent, 0.55),
    shade(brand.colors.accent, 0.45),
    mix(brand.colors.accent, brand.colors.text, 0.5),
    mix(brand.colors.accent, brand.colors.text, 0.85),
  ];
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.34} w={0.84} h={0.32} align="start" justify="center">
        <div style={{ display: 'flex', gap: 20, opacity: p, width: '100%' }}>
          {swatches.map((c, i) => (
            <div key={i} style={{ flex: 1, height: 150, borderRadius: brand.shape.radius, background: c, transform: \`translateY(\${(1 - p) * 12}px)\` }} />
          ))}
        </div>
      </Region>
    </Stage>
  );
};`;
async function main(){
  const artifact = applyImportPreamble(body);
  const scan = scanCode(artifact);
  console.log('scan (tint/shade/mix legality):', scan.ok ? 'PASS' : 'FAIL — ' + scan.reason);
  const render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: {}, width: W, height: H, fps: FPS, durationInFrames: DUR }, { renderBudgetMs: 90000 });
  const footage = await sharp(path.join(SCRATCH,'footage-b.jpg')).resize(W,H,{fit:'cover'}).toBuffer();
  const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[render.files.length-1]))).resize(W,H,{fit:'fill'}).png().toBuffer();
  await sharp(footage).composite([{input:overlay}]).png().toFile(path.join(SCRATCH,'palette-smoke.png'));
  console.log('OK -> palette-smoke.png  frames:', render.files.length);
  await cleanupWorkspace(render.workspaceDir);
}
main().then(()=>process.exit(0)).catch(e=>{console.error('THREW:', String(e.message||e).slice(0,300)); process.exit(1);});
