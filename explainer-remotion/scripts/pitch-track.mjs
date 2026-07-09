// Track dominant frequency over time (catches PITCH SWEEPS that fixed-lag autocorrelation misses).
// Usage: node scripts/pitch-track.mjs <wav> [startSec] [endSec]
import fs from 'fs';

const file = process.argv[2];
const SR = 44100;
const buf = fs.readFileSync(file);
const n = (buf.length - 44) / 2;
const x = new Float64Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(44 + i * 2) / 32768;

const t0 = process.argv[3] ? Math.floor(parseFloat(process.argv[3]) * SR) : 0;
const t1 = process.argv[4] ? Math.floor(parseFloat(process.argv[4]) * SR) : n;
const W = 1024;
const H = 512;
const freqs = [];
for (let s = t0; s + W < t1; s += H) {
  let e = 0;
  for (let i = 0; i < W; i++) e += x[s + i] * x[s + i];
  let best = 0;
  let bl = 0;
  for (let lag = 20; lag < 1100; lag++) {
    let a = 0;
    for (let i = 0; i + lag < W; i++) a += x[s + i] * x[s + i + lag];
    const r = e > 0 ? a / e : 0;
    if (r > best) {
      best = r;
      bl = lag;
    }
  }
  const freq = bl ? Math.round(SR / bl) : 0;
  const rms = Math.sqrt(e / W);
  if (rms > 0.01 && best > 0.25) freqs.push(freq);
  console.log(`${String(Math.round((s / SR) * 1000)).padStart(5)}ms  freq=${String(freq).padStart(5)}Hz  tonal=${best.toFixed(2)}  rms=${rms.toFixed(3)}`);
}
if (freqs.length > 2) {
  const rising = freqs[freqs.length - 1] - freqs[0];
  console.log(`\nSWEEP CHECK: pitch went ${freqs[0]}Hz → ${freqs[freqs.length - 1]}Hz (Δ${rising > 0 ? '+' : ''}${rising}Hz over ${freqs.length} tonal windows) ${Math.abs(rising) > 200 ? '=> RISING/FALLING TONE = WHISTLE' : ''}`);
}
