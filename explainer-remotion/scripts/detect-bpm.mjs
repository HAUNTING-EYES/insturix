// Estimate BPM + first-beat offset from a raw mono s16le PCM file (22050 Hz).
// Usage: node scripts/detect-bpm.mjs <pcm-path>
// Decode first:  ffmpeg -i track.mp3 -ac 1 -ar 22050 -f s16le -y track.pcm
import fs from 'fs';

const SR = 22050;
const HOP = 256;
const envFps = SR / HOP;

const buf = fs.readFileSync(process.argv[2]);
const nSamples = Math.floor(buf.length / 2);
const nFrames = Math.floor(nSamples / HOP);

// Energy per hop, then half-wave-rectified log-energy flux = onset envelope.
const energy = new Float64Array(nFrames);
for (let f = 0; f < nFrames; f++) {
  let s = 0;
  const base = f * HOP * 2;
  for (let i = 0; i < HOP; i++) {
    const v = buf.readInt16LE(base + i * 2) / 32768;
    s += v * v;
  }
  energy[f] = s;
}
const env = new Float64Array(nFrames);
for (let f = 1; f < nFrames; f++) {
  const d = Math.log(energy[f] + 1e-9) - Math.log(energy[f - 1] + 1e-9);
  env[f] = d > 0 ? d : 0;
}
let mean = 0;
for (let f = 0; f < nFrames; f++) mean += env[f];
mean /= nFrames;
for (let f = 0; f < nFrames; f++) env[f] -= mean;

function autocorr(lag) {
  let s = 0;
  for (let f = lag; f < nFrames; f++) s += env[f] * env[f - lag];
  return s;
}

const minBpm = 70;
const maxBpm = 180;
const minLag = Math.floor((60 * envFps) / maxBpm);
const maxLag = Math.ceil((60 * envFps) / minBpm);
let best = -Infinity;
let bestLag = minLag;
for (let lag = minLag; lag <= maxLag; lag++) {
  const v = autocorr(lag);
  if (v > best) {
    best = v;
    bestLag = lag;
  }
}
let bpm = (60 * envFps) / bestLag;

// Octave correction: prefer a tempo in [95,165] with the strongest support.
const cands = [bpm / 2, bpm, bpm * 2].filter((b) => b >= 60 && b <= 200);
let chosen = bpm;
let chosenScore = -Infinity;
for (const b of cands) {
  const lag = Math.round((60 * envFps) / b);
  const sc = autocorr(lag) * (b >= 95 && b <= 165 ? 1.4 : 1); // bias to musical range
  if (sc > chosenScore) {
    chosenScore = sc;
    chosen = b;
  }
}
bpm = chosen;

// First-beat phase: comb of pulses at the beat period; pick the offset with max onset energy.
const period = (60 * envFps) / bpm;
let bestOff = 0;
let bestPhase = -Infinity;
for (let off = 0; off < Math.round(period); off++) {
  let s = 0;
  for (let k = 0; off + k * period < nFrames; k++) {
    s += env[Math.round(off + k * period)] || 0;
  }
  if (s > bestPhase) {
    bestPhase = s;
    bestOff = off;
  }
}
const firstBeatSec = bestOff / envFps;

console.log(JSON.stringify({
  bpm: Math.round(bpm * 100) / 100,
  beatPeriodSec: Math.round((60 / bpm) * 1000) / 1000,
  firstBeatSec: Math.round(firstBeatSec * 1000) / 1000,
  durationSec: Math.round((nFrames / envFps) * 100) / 100,
}, null, 2));
