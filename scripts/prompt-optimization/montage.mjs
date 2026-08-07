/** Scratch review utility: composite a dir of JPG frames into one contact sheet for fast eyeballing. Uncommitted. */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
const out = process.argv[3];
const COLS = Number(process.argv[4] || 8);
const TW = 200, TH = 112;

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
const rows = Math.ceil(files.length / COLS);

const tiles = await Promise.all(files.map(async (f, i) => ({
  input: await sharp(path.join(dir, f)).resize(TW, TH, { fit: 'cover' }).jpeg().toBuffer(),
  left: (i % COLS) * TW,
  top: Math.floor(i / COLS) * TH,
})));

await sharp({ create: { width: COLS * TW, height: rows * TH, channels: 3, background: '#101010' } })
  .composite(tiles).jpeg({ quality: 82 }).toFile(out);

console.log(`montage: ${files.length} tiles -> ${COLS * TW}x${rows * TH} -> ${out}`);
