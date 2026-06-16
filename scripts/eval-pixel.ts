// Pixel-path eval: measure the REAL footage frame brightness (sharp) and feed it to L1 so the
// footage-contrast check — DEAD in prod (no frameContext passed at edl-executor.ts:1194) — fires
// on real footage. Talking-head → one frame's brightness represents the video. Reads the MG dump
// (no Mongo). STAYS UNTRACKED.
// Run: npx tsx scripts/eval-pixel.ts <pid> <frame.png>
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { scoreLegibility } from '../lib/editron/motion-graphics/engine/eval/legibility';
import type { Recipe } from '../lib/editron/motion-graphics/engine/recipe-types';
import type { MotionTokens } from '../lib/editron/motion-graphics/types';

/** Average frame brightness ∈ [0,1] (Rec.709 luma of the channel means). */
async function frameBrightness(framePath: string): Promise<number> {
  const stats = await sharp(framePath).stats();
  const ch = stats.channels;
  const lum = ch.length >= 3
    ? 0.2126 * ch[0].mean + 0.7152 * ch[1].mean + 0.0722 * ch[2].mean
    : ch[0].mean;
  return lum / 255;
}

async function main(): Promise<void> {
  const pid = process.argv[2] || 'proj_OzG2qgoYudFa';
  const framePath = process.argv[3];
  if (!framePath || !fs.existsSync(framePath)) {
    console.error(`Usage: npx tsx scripts/eval-pixel.ts <pid> <frame.png>  (frame not found: ${framePath ?? '—'})`);
    process.exit(1);
  }
  const brightness = await frameBrightness(framePath);
  console.log(`\nFootage brightness = ${brightness.toFixed(3)} (0=black … 1=white)  [${path.basename(framePath)}]`);

  const dumpFile = path.resolve(process.cwd(), '.calibration-temp', `${pid}-mgs.json`);
  if (!fs.existsSync(dumpFile)) {
    console.error(`No dump at ${dumpFile}. Run: npx tsx scripts/dump-proj-mgs.ts ${pid}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dumpFile, 'utf8')) as { mgs: Array<Record<string, unknown>> };

  const origWarn = console.warn;
  console.warn = () => {};
  console.log(`=== PIXEL PATH — L1 recipe-only vs on-real-footage ===\n`);
  let fired = 0;
  for (let i = 0; i < data.mgs.length; i++) {
    const mg = data.mgs[i];
    const recipe = mg.recipe as Recipe | undefined;
    const tokens = mg.resolvedTokens as MotionTokens | undefined;
    const meta = mg.metadata as Record<string, unknown> | undefined;
    const content = (mg.content ?? {}) as Record<string, unknown>;
    const label = `${meta?.graphicType ?? '?'} "${content.value ?? content.text ?? ''}"`.slice(0, 28);
    if (!recipe || !Array.isArray(recipe.elements) || !tokens?.color) {
      console.log(`  MG[${i}] (no recipe)`);
      continue;
    }
    const recipeOnly = scoreLegibility(recipe, tokens);
    const onFootage = scoreLegibility(recipe, tokens, { brightness });
    const flagged = (onFootage.notes ?? '').includes('brightness-match');
    if (flagged) fired++;
    console.log(`  MG[${String(i).padStart(2)}] recipe=${recipeOnly.score?.toFixed(2)} footage=${onFootage.score?.toFixed(2)}  ${label}${flagged ? '  ← footage-contrast FLAGGED' : ''}`);
  }
  console.warn = origWarn;
  console.log(`\nfootage-contrast flagged on ${fired}/${data.mgs.length} MGs at brightness ${brightness.toFixed(2)}.`);
}

main();
