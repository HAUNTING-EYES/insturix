/** P2 word-sync smoke: render a hand-authored kinetic caption (kinetic="words", wordsAt from data.wordFrames)
 *  over footage → grab frames just AFTER each onset + settled → contact sheet. Eyeball: (1) word-by-word landing
 *  on the onsets, (2) the punch entrance, (3) the display-face seam check (hairline artifacts at large Anton).
 *  MG_EVAL_SCRATCH=<dir> (footage-b.jpg source + output). Uncommitted. */
import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url'; import sharp from 'sharp';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MG_EVAL_SCRATCH || path.join(__dirname, '../../.mg-render-tmp');
import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
const W = 1280, H = 720, FPS = 30, DUR = 75;

const body = `
type Data = { keyword: string; wordFrames: number[] };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.5} w={0.84} h={0.34} align="center" justify="center">
        <FitHeadline brand={brand} text={data.keyword} face="display" size="display"
          kinetic="words" wordsAt={data.wordFrames} accentWords={["faster"]} align="center" />
      </Region>
    </Stage>
  );
};`;

async function main() {
  const artifact = applyImportPreamble(body);
  const render = await renderMomentToWebpFrames(
    { componentSource: artifact, brand: INSTURIX, data: { keyword: 'ten times faster than editing', wordFrames: [6, 16, 26, 40, 52] }, width: W, height: H, fps: FPS, durationInFrames: DUR },
    { renderBudgetMs: 90_000 },
  );
  const footage = await sharp(path.join(SCRATCH, 'footage-b.jpg')).resize(W, H, { fit: 'cover' }).toBuffer();
  // one tile just after each onset (+4f: mid-punch) + the settled hold
  const grabs = [10, 20, 30, 44, 56, 70];
  const tiles: Buffer[] = [];
  for (const f of grabs) {
    const overlay = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[Math.min(f, render.count - 1)]))).resize(W, H, { fit: 'fill' }).png().toBuffer();
    const full = await sharp(footage).composite([{ input: overlay }]).png().toBuffer(); // composite at full res…
    tiles.push(await sharp(full).resize(640, 360).png().toBuffer()); // …then resize (sharp orders resize BEFORE composite in one pipeline)
  }
  const sheet = path.join(SCRATCH, 'wordsync-sheet.png');
  await sharp({ create: { width: 640 * 3, height: 360 * 2, channels: 3, background: '#000' } }).png()
    .composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 })))
    .toFile(sheet);
  // full-res settled crop for the seam check (large Anton glyph edges)
  const settled = await sharp(fs.readFileSync(path.join(render.webpDir, render.files[70]))).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const settledFull = await sharp(footage).composite([{ input: settled }]).png().toBuffer();
  await sharp(settledFull).extract({ left: 100, top: 320, width: 1080, height: 260 }).png()
    .toFile(path.join(SCRATCH, 'wordsync-seamcheck.png'));
  console.log(`OK -> wordsync-sheet.png (f ${grabs.join(',')}) + wordsync-seamcheck.png  frames:${render.count}`);
  await cleanupWorkspace(render.workspaceDir);
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 400)); process.exit(1); });
