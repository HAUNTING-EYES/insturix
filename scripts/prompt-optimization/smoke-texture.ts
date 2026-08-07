/** Texture/ornament smoke: 4 Texture kinds + 3 Motif kinds in a grid → eyeball + scanCode legality. */
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
  const cell: React.CSSProperties = { position: 'relative', flex: 1, height: '100%', borderRadius: brand.shape.radius, overflow: 'hidden', border: \`1px solid \${brand.colors.border}\` };
  const row: React.CSSProperties = { display: 'flex', gap: 14, width: '100%', height: '100%' };
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.04} y={0.1} w={0.92} h={0.36} align="start" justify="start">
        <div style={row}>
          <div style={cell}><Texture brand={brand} kind="grain" strength={1} at={ph.intro} /></div>
          <div style={cell}><Texture brand={brand} kind="scanline" strength={1} at={ph.intro} /></div>
          <div style={cell}><Texture brand={brand} kind="grid" strength={1} at={ph.intro} /></div>
          <div style={cell}><Texture brand={brand} kind="dots" strength={1} at={ph.intro} /></div>
        </div>
      </Region>
      <Region brand={brand} x={0.04} y={0.54} w={0.92} h={0.36} align="start" justify="start">
        <div style={row}>
          <div style={cell}><Motif brand={brand} kind="chevrons" at={ph.intro} /></div>
          <div style={cell}><Motif brand={brand} kind="sunburst" at={ph.intro} /></div>
          <div style={cell}><Motif brand={brand} kind="zigzag" at={ph.intro} /></div>
        </div>
      </Region>
    </Stage>
  );
};`;
async function main(){
  const artifact = applyImportPreamble(body);
  console.log('scan:', scanCode(artifact).ok ? 'PASS' : 'FAIL — ' + scanCode(artifact).reason);
  const render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: {}, width: W, height: H, fps: FPS, durationInFrames: DUR }, { renderBudgetMs: 90000 });
  const footage = await sharp(path.join(SCRATCH,'footage-b.jpg')).resize(W,H,{fit:'cover'}).toBuffer();
  const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[render.files.length-1]))).resize(W,H,{fit:'fill'}).png().toBuffer();
  await sharp(footage).composite([{input:overlay}]).png().toFile(path.join(SCRATCH,'texture-smoke.png'));
  console.log('OK -> texture-smoke.png  frames:', render.files.length);
  await cleanupWorkspace(render.workspaceDir);
}
main().then(()=>process.exit(0)).catch(e=>{console.error('THREW:', String(e.message||e).slice(0,300)); process.exit(1);});
