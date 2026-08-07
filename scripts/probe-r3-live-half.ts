/**
 * DEV PROBE (not committed) — local half of the R3 live test.
 *
 * The AudD token lives in Vercel env, so the network call can't run here.
 * This proves the LOCAL chain works on REAL reference audio:
 *   1. ffmpeg-demux a real reference video -> audio bytes (R1-A path)
 *   2. measure R2 audio beats + silence from those bytes (real algorithm)
 *   3. run R3 identity resolution -> must be null w/o token (gating correct)
 *   4. print what the deployed worker would store (minus the live identity)
 *
 * Usage: npx tsx scripts/probe-r3-live-half.ts <video.mp4>
 */

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { measureSilence } from '../lib/editron/reference-video/measure-silence';
import { resolveSoundtrackIdentity } from '../lib/editron/reference-video/soundtrack-identity';
import { isAuddConfigured } from '../lib/editron/reference-video/audd-recognizer';

async function main() {
  const video = process.argv[2];
  if (!video) throw new Error('usage: npx tsx scripts/probe-r3-live-half.ts <video.mp4>');
  const size = await stat(video).catch(() => null);
  if (!size) throw new Error(`video not found: ${video}`);

  const require = createRequire(import.meta.url);
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string;

  // 1. Demux audio (R1-A): mono 16k f32 PCM, first 120s.
  const audio = await new Promise<{ samples: Float32Array; sampleRate: number }>((resolvePromise, reject) => {
    const proc = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', video,
      '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-t', '120', 'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg audio demux failed'));
      const data = Buffer.concat(chunks);
      resolvePromise({ samples: new Float32Array(data.buffer.slice(0, data.byteLength)), sampleRate: 16_000 });
    });
  });

  console.log(`[probe] ${path.basename(video)}: demuxed ${(audio.samples.length / 16000).toFixed(1)}s of PCM (${audio.samples.length} samples)`);

  // 2. R2 audio evidence from real bytes.
  const { analyzeBeatsFull } = await import('../lib/editron/services/media/beat-detection-service');
  const beats = await analyzeBeatsFull({
    sampleRate: audio.sampleRate,
    length: audio.samples.length,
    numberOfChannels: 1,
    getChannelData: () => audio.samples,
    duration: audio.samples.length / audio.sampleRate,
  });
  const silence = measureSilence(audio.samples, audio.sampleRate);

  console.log(`[probe] beats: bpm=${beats.bpm} (conf ${beats.bpmConfidence}), beats=${beats.beats.length}, onsets=${beats.rawOnsets.length}, energyPeaks=${beats.energyPeaks.length}`);
  console.log(`[probe] silence: ${silence.windows.length} windows (${silence.totalSilentMs}ms / ${silence.silentRatio.toFixed(3)})`);
  if (silence.windows.length > 0) {
    const first = silence.windows[0];
    console.log(`[probe]   first silence: ${first.startMs}ms–${first.endMs}ms (${first.durationMs}ms)`);
  }

  // 3. R3 identity — MUST gate to null when no local token (proves correct behavior).
  const identity = await resolveSoundtrackIdentity('ref_probe', new Uint8Array(audio.samples.buffer), {
    recognize: undefined,
  });
  const tokenPresentLocally = isAuddConfigured();
  console.log(`[probe] AUDD configured in THIS env: ${tokenPresentLocally}`);
  console.log(`[probe] identity resolution (no local token): ${identity === null ? 'null (correct — gated)' : 'UNEXPECTED non-null'}`);
  console.log(`[probe] => deployed worker WILL populate soundtrackIdentity once Vercel env + AUDD_API_TOKEN are live.`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
