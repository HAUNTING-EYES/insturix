// Objectively check whether a WAV is tonal ("whistle") or noise-like ("click").
// Usage: node scripts/check-sfx.mjs public/sfx/click.wav
import fs from 'fs';

const buf = fs.readFileSync(process.argv[2]);
const SR = 44100;
const n = (buf.length - 44) / 2;
const x = new Float64Array(n);
let peak = 1e-9;
for (let i = 0; i < n; i++) {
  x[i] = buf.readInt16LE(44 + i * 2) / 32768;
  peak = Math.max(peak, Math.abs(x[i]));
}
for (let i = 0; i < n; i++) x[i] /= peak;

// tonality = max normalized autocorrelation over musical lags (high = a sustained pitch = whistle)
let best = 0;
let bestLag = 0;
for (let lag = 25; lag < 700; lag++) {
  let s = 0;
  let e = 0;
  for (let i = 0; i + lag < n; i++) {
    s += x[i] * x[i + lag];
    e += x[i] * x[i];
  }
  const r = e > 0 ? s / e : 0;
  if (r > best) {
    best = r;
    bestLag = lag;
  }
}

// energy decay: windowed RMS, time to fall below 10% of peak
const win = 64;
const rms = [];
let maxr = 0;
for (let i = 0; i + win < n; i += win) {
  let s = 0;
  for (let j = 0; j < win; j++) s += x[i + j] ** 2;
  const r = Math.sqrt(s / win);
  rms.push(r);
  maxr = Math.max(maxr, r);
}
let decayIdx = rms.length - 1;
for (let i = 1; i < rms.length; i++) {
  if (rms[i] < 0.1 * maxr) {
    decayIdx = i;
    break;
  }
}

console.log(
  JSON.stringify({
    file: process.argv[2],
    tonality: +best.toFixed(2),
    tonalPitchHz: bestLag ? +(SR / bestLag).toFixed(0) : 0,
    energyDecayMs: +((decayIdx * win) / SR * 1000).toFixed(1),
    verdict: best < 0.32 ? 'NOISE-LIKE (click — no whistle)' : best < 0.5 ? 'MIXED' : 'TONAL (whistle risk)',
  })
);
