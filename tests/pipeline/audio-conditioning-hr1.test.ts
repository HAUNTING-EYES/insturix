import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getFFmpegPath } from '../../lib/editron/services/media/ffmpeg-runtime';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const TEST_DURATION_SECONDS = 20;

interface FfmpegResult {
  stdout: Buffer;
  stderr: string;
}

function createEbuReferenceSignal(): Buffer {
  const frameCount = SAMPLE_RATE * TEST_DURATION_SECONDS;
  const amplitude = 10 ** (-23 / 20);
  const pcm = Buffer.allocUnsafe(frameCount * CHANNELS * Float32Array.BYTES_PER_ELEMENT);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = amplitude * Math.sin((2 * Math.PI * 1_000 * frame) / SAMPLE_RATE);
    const frameOffset = frame * CHANNELS * Float32Array.BYTES_PER_ELEMENT;
    pcm.writeFloatLE(sample, frameOffset);
    pcm.writeFloatLE(sample, frameOffset + Float32Array.BYTES_PER_ELEMENT);
  }

  return pcm;
}

function runFfmpeg(args: string[], input: Buffer): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFFmpegPath(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE' && error.code !== 'EOF') reject(error);
    });
    child.on('close', (code) => {
      const stderrText = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with ${code}: ${stderrText.slice(-1_000)}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout), stderr: stderrText });
    });

    child.stdin.end(input);
  });
}

async function measureIntegratedLufs(pcm: Buffer): Promise<number> {
  const result = await runFfmpeg([
    '-hide_banner',
    '-nostats',
    '-f', 'f32le',
    '-ar', String(SAMPLE_RATE),
    '-ac', String(CHANNELS),
    '-i', 'pipe:0',
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-',
  ], pcm);
  const matches = [...result.stderr.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)];
  const integratedLufs = Number(matches.at(-1)?.[1]);

  if (!Number.isFinite(integratedLufs)) {
    throw new Error(`No integrated LUFS measurement found: ${result.stderr.slice(-1_000)}`);
  }
  return integratedLufs;
}

describe('audio conditioning HR1', () => {
  it('measures decoded PCM against the EBU Tech 3341 reference and normalizes pre-render', async () => {
    const referencePcm = createEbuReferenceSignal();
    const measuredReferenceLufs = await measureIntegratedLufs(referencePcm);

    expect(Math.abs(measuredReferenceLufs - (-23))).toBeLessThanOrEqual(0.1);

    const normalized = await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'f32le',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-i', 'pipe:0',
      '-af', 'loudnorm=I=-14:TP=-1:LRA=7',
      '-f', 'f32le',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      'pipe:1',
    ], referencePcm);
    const normalizedLufs = await measureIntegratedLufs(normalized.stdout);

    expect(Math.abs(normalizedLufs - (-14))).toBeLessThanOrEqual(1);
  }, 30_000);

  it('traces the Linux executable into every Lane A conditioning consumer', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    const routes = [
      '/api/internal/workers/pipeline/audio',
      '/api/services/editron/chat/tool-call',
      '/api/services/pipeline/storyboard/*/finalize',
    ];

    for (const route of routes) {
      expect(config).toContain(`'${route}'`);
    }
    expect(config.match(/@ffmpeg-installer\/linux-x64\/ffmpeg/g)?.length).toBeGreaterThanOrEqual(routes.length);
  });
});
