/**
 * DEV PROBE (not committed) — LIVE AudD recognition test.
 *
 * Demuxes real reference audio (R1-A path), then calls AudD with the token
 * from the process env (AUDD_API_TOKEN). Prints the recognized identity +
 * the fingerprint mapping. NEVER prints the token.
 *
 * Usage: set AUDD_API_TOKEN, then
 *   npx tsx scripts/probe-r3-live.ts <video.mp4>
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';

async function main() {
  const video = process.argv[2];
  if (!video) throw new Error('usage: npx tsx scripts/probe-r3-live.ts <video.mp4>');
  const s = await stat(video).catch(() => null);
  if (!s) throw new Error(`video not found: ${video}`);
  if (!process.env.AUDD_API_TOKEN) throw new Error('AUDD_API_TOKEN not set in env');

  const require = createRequire(import.meta.url);
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string;

  const audioBytes = await new Promise<Buffer>((resolvePromise, reject) => {
    const proc = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', video,
      '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-t', '90', 'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolvePromise(Buffer.concat(chunks)) : reject(new Error('ffmpeg failed')));
  });
  console.log(`[live] demuxed ${(audioBytes.length / 4 / 16000).toFixed(1)}s of mono 16k PCM from ${path.basename(video)}`);

  // Encode to a real audio file for AudD (small m4a).
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(path.join(tmpdir(), 'audd-live-'));
  const wav = path.join(dir, 'ref.wav');
  await writeFile(wav, audioBytes);
  const m4a = path.join(dir, 'ref.m4a');
  await new Promise<void>((resolvePromise, reject) => {
    const proc = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', '16000', '-ac', '1', '-i', wav, '-c:a', 'aac', m4a]);
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error('re-encode failed')));
  });
  const payload = new Uint8Array(await import('node:fs/promises').then(fs => fs.readFile(m4a)));

  const { createAuddRecognizer } = await import('../lib/editron/reference-video/audd-recognizer');
  const { resolveSoundtrackIdentity, identityToFingerprintRecognition } = await import('../lib/editron/reference-video/soundtrack-identity');

  const recognize = createAuddRecognizer();
  const result = await resolveSoundtrackIdentity('ref_live_probe', payload, { recognize });

  if (!result) {
    console.log('[live] identity: null (AudD returned no match for this clip)');
  } else {
    console.log(`[live] RECOGNIZED: ${result.title} — ${result.artists.join(', ')}`);
    console.log(`[live]   recordingId: ${result.recordingId}`);
    console.log(`[live]   isrcs: ${result.isrcs.length ? result.isrcs.join(', ') : '(none)'}`);
    console.log(`[live]   confidence: ${result.confidence}`);
    console.log(`[live]   cueOffsetMs: ${result.cueOffsetMs}`);
    console.log(`[live]   provider.receipt: ${result.provider.receipt}`);
    console.log(`[live]   -> fingerprint recognition: ${JSON.stringify(identityToFingerprintRecognition(result))}`);
  }

  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
