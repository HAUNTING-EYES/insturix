// Procedurally synthesize UI sound effects → public/sfx/*.wav (16-bit mono 44.1k).
// Royalty-free, deterministic assets. Run once: node scripts/gen-sfx.mjs
import fs from 'fs';
import path from 'path';

const SR = 44100;
const OUT = path.join(process.cwd(), 'public', 'sfx');
fs.mkdirSync(OUT, {recursive: true});
// optional filter: `node scripts/gen-sfx.mjs click` regenerates only click.wav (leaves the rest untouched)
const ONLY = process.argv[2] ? `${process.argv[2]}.wav` : null;

const tone = (f, t) => Math.sin(2 * Math.PI * f * t);
const noise = () => Math.random() * 2 - 1;

// Build a Float32 buffer from a per-sample function over `dur` seconds, with soft fade in/out.
function synth(dur, fn) {
  const n = Math.floor(SR * dur);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    buf[i] = fn(t, i);
  }
  // tiny fades to kill clicks
  const f = Math.min(64, (n / 8) | 0);
  for (let i = 0; i < f; i++) {
    buf[i] *= i / f;
    buf[n - 1 - i] *= i / f;
  }
  return buf;
}

const lowpass = (buf, a = 0.3) => {
  let prev = 0;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    prev = prev * (1 - a) + buf[i] * a;
    out[i] = prev;
  }
  return out;
};

function writeWav(name, buf, gain = 0.8) {
  if (ONLY && name !== ONLY) return; // targeted regen
  // normalize then apply gain
  let peak = 1e-6;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const n = buf.length;
  const bytes = Buffer.alloc(44 + n * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, (buf[i] / peak) * gain));
    bytes.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), bytes);
  console.log('wrote', name, `${(bytes.length / 1024).toFixed(1)}kb`);
}

// click — pure transient TAP (filtered noise, no sustained tone = no "whistle"). Short + warm.
writeWav('click.wav', lowpass(synth(0.045, (t) =>
  noise() * Math.exp(-t * 820) +                            // main tap transient
  noise() * Math.exp(-t * 180) * 0.20 +                     // short warm tail
  tone(1000, t) * Math.exp(-t * 1500) * 0.3                 // sub-3ms attack snap (too fast to be tonal)
), 0.4), 0.72);
// tick — soft, for count-up digits / card drops
writeWav('tick.wav', synth(0.035, (t) => tone(1500, t) * Math.exp(-t * 90)), 0.45);
// pop — pluck, for element pops
writeWav('pop.wav', synth(0.09, (t) => tone(680, t) * Math.exp(-t * 34) * (1 - Math.exp(-t * 500))), 0.6);
// whoosh — filtered noise swell, for slides/transitions
writeWav('whoosh.wav', lowpass(synth(0.32, (t) => noise() * Math.sin((Math.PI * t) / 0.32) ** 2), 0.18), 0.55);
// impact — low thud, for landings / downbeats
writeWav('impact.wav', synth(0.18, (t) => (0.7 * tone(72, t) + 0.3 * tone(112, t) + 0.25 * noise() * Math.exp(-t * 45)) * Math.exp(-t * 13)), 0.85);
// riser — NOISE build-up swell (no tone sweep = no whistle); crescendos into the hit
writeWav('riser.wav', lowpass(synth(0.5, (t) => {
  const p = t / 0.5;
  return noise() * Math.pow(p, 1.7);
}), 0.5), 0.6);
// success — two-note chime for completion ("✓ Ready", score landed)
writeWav('success.wav', synth(0.4, (t) => {
  const a = tone(660, t) * Math.exp(-t * 6);
  const b = t > 0.13 ? tone(990, t - 0.13) * Math.exp(-(t - 0.13) * 6) : 0;
  return (a + b) * 0.5;
}), 0.6);

console.log('SFX generated in', OUT);
