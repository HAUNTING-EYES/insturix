// Untracked: tile rendered MG stills into labeled contact sheets for fast visual triage at scale
// (so an adversarial sweep is a few montages to read, not 30+ separate images). sharp-based.
// Run: npx tsx scripts/mg-montage.ts adv2  ->  .calibration-temp/mg-montage-adv2-N.png. STAYS UNTRACKED.
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

const set = process.argv[2] || 'adv2';
const dir = path.resolve(process.cwd(), '.calibration-temp', 'mg-stills', set);
const COLS = 4;
const PER_SHEET = 16;
const CW = 480;
const CH = 480;
const LABEL = 36;
const GAP = 8;
const BG = { r: 8, g: 10, b: 16, alpha: 1 };

async function main(): Promise<void> {
  if (!fs.existsSync(dir)) { console.error(`Missing ${dir} — render first`); process.exit(1); }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  const sheets = Math.ceil(files.length / PER_SHEET);
  for (let s = 0; s < sheets; s += 1) {
    const batch = files.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const rows = Math.ceil(batch.length / COLS);
    const sheetW = COLS * (CW + GAP) + GAP;
    const sheetH = rows * (CH + LABEL + GAP) + GAP;
    const composites: Array<{ input: Buffer; top: number; left: number }> = [];
    for (let i = 0; i < batch.length; i += 1) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GAP + col * (CW + GAP);
      const y = GAP + row * (CH + LABEL + GAP);
      const idx = s * PER_SHEET + i;
      const name = batch[i].replace(/^mg\d+-/, '').replace(/\.png$/, '').slice(0, 44);
      const img = await sharp(path.join(dir, batch[i])).resize(CW, CH, { fit: 'contain', background: BG }).toBuffer();
      composites.push({ input: img, top: y + LABEL, left: x });
      const safe = `[${idx}] ${name}`.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const svg = `<svg width="${CW}" height="${LABEL}"><rect width="100%" height="100%" fill="#1e293b"/><text x="8" y="25" font-family="sans-serif" font-size="22" fill="#e2e8f0">${safe}</text></svg>`;
      composites.push({ input: Buffer.from(svg), top: y, left: x });
    }
    const out = path.resolve(process.cwd(), '.calibration-temp', `mg-montage-${set}-${s + 1}.png`);
    const buf = await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: BG } }).composite(composites).png().toBuffer();
    fs.writeFileSync(out, buf);
    console.log(`Sheet ${s + 1}/${sheets} -> ${out} (${batch.length} cells, ${sheetW}x${sheetH})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
