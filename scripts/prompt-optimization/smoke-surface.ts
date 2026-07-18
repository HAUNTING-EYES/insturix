/** Surface-axis smoke (4b-4): render Plate in ALL 5 material modes (+ a grained one) for BOTH a dark and a light
 *  brand, composited over a mid-tone gradient so BOTH the specular rim (reads on dark) AND the elevation shadow
 *  (reads on light) are visible → eyeball material depth + brand-lock + dark/light correctness.
 *  MG_EVAL_SCRATCH=<dir> for output. */
import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url'; import sharp from 'sharp';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MG_EVAL_SCRATCH || path.join(__dirname, '../../.mg-render-tmp');
fs.mkdirSync(SCRATCH, { recursive: true });
import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX, NORTHWIND, type Brand } from '../../lib/editron/motion-graphics/codegen/kit/brand';
const W = 1280, H = 720, FPS = 30, DUR = 48;

const body = `
type Data = Record<string, never>;
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand}) => {
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const cells = [
    {m:'flat'},{m:'gradient'},{m:'frosted'},{m:'raised'},{m:'glow'},{m:'glow',grain:true},
  ] as const;
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.05} y={0.1} w={0.9} h={0.8} align="start" justify="start" gapScale={2.2}>
        {cells.map((c, i) => (
          <Plate key={i} brand={brand} at={ph.intro + i * 2} surface={c.m} emphasis={0.85} grain={'grain' in c ? c.grain : false} opacity={0.94}>
            <div style={{ padding: '18px 26px', minWidth: 330, color: brand.colors.text, fontFamily: brand.fontSans, fontWeight: 700, fontSize: 24 }}>
              {c.m.toUpperCase()}{'grain' in c && c.grain ? ' + grain' : ''}
            </div>
          </Plate>
        ))}
      </Region>
    </Stage>
  );
};`;

/** A neutral diagonal gradient (dark→light) so shadow (needs light area) AND rim (needs dark area) both read. */
async function gradientBg(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101216"/><stop offset="1" stop-color="#c9cdd4"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderBrand(brand: Brand, tag: string): Promise<string> {
  const artifact = applyImportPreamble(body);
  const render = await renderMomentToWebpFrames({ componentSource: artifact, brand, data: {}, width: W, height: H, fps: FPS, durationInFrames: DUR }, { renderBudgetMs: 90000 });
  const idx = render.files.length - 1;
  const bg = await gradientBg();
  const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[idx]))).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const out = path.join(SCRATCH, `surface-${tag}.png`);
  await sharp(bg).composite([{ input: overlay }]).png().toFile(out);
  await cleanupWorkspace(render.workspaceDir);
  console.log(`OK -> surface-${tag}.png  frames: ${render.files.length}`);
  return out;
}

async function main() {
  const dark = await renderBrand(INSTURIX, 'insturix-dark');
  const light = await renderBrand(NORTHWIND, 'northwind-light');
  // stacked contact sheet
  const [a, b] = await Promise.all([sharp(dark).resize(W, H).png().toBuffer(), sharp(light).resize(W, H).png().toBuffer()]);
  await sharp({ create: { width: W, height: H * 2, channels: 3, background: '#000' } }).png()
    .composite([{ input: a, top: 0, left: 0 }, { input: b, top: H, left: 0 }])
    .toFile(path.join(SCRATCH, 'surface-sheet.png'));
  console.log('OK -> surface-sheet.png (dark over light)');
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e.message || e).slice(0, 400)); process.exit(1); });
