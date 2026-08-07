/**
 * R2 silence-threshold calibration on real videos.
 *
 * Oracle: ffmpeg `silencedetect` (dB-threshold + min-duration silence detector).
 * Candidate: measureSilence over a (silenceRmsFactor x minSilenceMs) grid.
 * Score per video: how much candidate silence overlaps oracle silence (start
 * tolerance from R0 cut work, 250ms). Report the best setting by mean F1 so
 * the INVENTED defaults can be replaced with measured ones.
 *
 * Usage: npx tsx scripts/calibrate-r2-silence.ts
 * Writes: .calibration-temp/r2-silence-calibration/report.json
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { measureSilence, SILENCE_MEASUREMENT_VERSION } from '../lib/editron/reference-video/measure-silence';

interface OracleWindow { startMs: number; endMs: number }
interface Scoring { precision: number; recall: number; f1: number; hits: number; oracleCount: number; candCount: number }

const TOL_MS = 250; // R0 cut-detect tolerance, reused
const ORACLE_DB = -45; // ffmpeg silencedetect noise threshold (dBFS). Tune-independent of our algorithm.
const ORACLE_MIN_S = 0.3; // oracle ignores silences shorter than this
const SAMPLE_RATE = 16_000;
const WIN_SEC = 360; // analyze first 6 min per video (covers all shorts; bounds runtime)

const CANDIDATE_FACTORS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4];
const CANDIDATE_MINS = [150, 300, 500, 800];

function parseOracle(stderr: string): OracleWindow[] {
  const windows: OracleWindow[] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*([0-9.]+)/);
    if (s) { start = Number(s[1]) * 1000; continue; }
    const e = line.match(/silence_end:\s*([0-9.]+)/);
    if (e && start !== null) {
      windows.push({ startMs: start, endMs: Number(e[1]) * 1000 });
      start = null;
    }
  }
  return windows;
}

function score(cand: OracleWindow[], oracle: OracleWindow[]): Scoring {
  const oracleCount = oracle.length;
  const candCount = cand.length;
  if (oracleCount === 0 && candCount === 0) {
    return { precision: 1, recall: 1, f1: 1, hits: 0, oracleCount: 0, candCount: 0 };
  }
  const matchedOracle = new Set<number>();
  let hits = 0;
  for (const c of cand) {
    const hit = oracle.findIndex((o, i) =>
      !matchedOracle.has(i) && Math.abs(o.startMs - c.startMs) <= TOL_MS && Math.abs(o.endMs - c.endMs) <= TOL_MS * 2,
    );
    if (hit >= 0) { matchedOracle.add(hit); hits++; }
  }
  const precision = candCount > 0 ? hits / candCount : (oracleCount === 0 ? 1 : 0);
  const recall = oracleCount > 0 ? hits / oracleCount : (candCount === 0 ? 1 : 0);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, hits, oracleCount, candCount };
}

async function collectInjectedFfmpeg() {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  return require('@ffmpeg-installer/ffmpeg').path as string;
}

async function main(): Promise<void> {
  const ffmpeg = await collectInjectedFfmpeg();
  const { spawn } = await import('node:child_process');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileP = promisify(execFile);

  const temp = path.resolve(process.cwd(), '.calibration-temp');
  const outDir = path.join(temp, 'r2-silence-calibration');
  await mkdir(outDir, { recursive: true });

  const videos = (await readdir(temp)).filter((f) => f.endsWith('.mp4')).sort();
  console.log(`Calibrating over ${videos.length} real videos...`);

  // Per-video oracle windows.
  const oracleByVideo: Record<string, OracleWindow[]> = {};
  // Per-video PCM (decode once, reuse across the candidate grid).
  const pcmByVideo: Record<string, Float32Array> = {};
  const sampleRateOf = 16_000;

  for (const video of videos) {
    const src = path.join(temp, video);
    try {
      // 1. PCM decode: mono 16kHz f32. Rounds to WIN_SEC seconds.
      const pcm = await new Promise<{ data: Buffer; ms: number }>((resolvePromise, reject) => {
        const probe = spawn(ffmpeg, ['-hide_banner', '-i', src]);
        let err = '';
        probe.stderr.on('data', (d: Buffer) => { err += d.toString(); });
        probe.on('close', () => {
          const m = err.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
          const ms = m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : 0;
          const decode = spawn(ffmpeg, [
            '-hide_banner', '-loglevel', 'error', '-i', src,
            '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-t', String(WIN_SEC), 'pipe:1',
          ]);
          const out: Buffer[] = [];
          decode.stdout.on('data', (d: Buffer) => out.push(d));
          decode.stderr.on('data', () => {});
          decode.on('close', (code) => {
            if (code !== 0) return reject(new Error(`decode failed for ${video}`));
            resolvePromise({ data: Buffer.concat(out), ms });
          });
        });
        probe.on('error', reject);
      });
      const float = new Float32Array(pcm.data.buffer.slice(0, pcm.data.byteLength));
      pcmByVideo[video] = float;
      const durationMs = Math.min(pcm.ms, WIN_SEC * 1000);

      // 2. Oracle: ffmpeg silencedetect, -45 dBFS, min 0.3s.
      const oracleOut = await execFileP(ffmpeg, [
        '-hide_banner', '-loglevel', 'info', '-i', src,
        '-vn', '-af', `silencedetect=n=${ORACLE_DB}dB:d=${ORACLE_MIN_S}`,
        '-t', String(WIN_SEC), '-f', 'null', '-',
      ]).catch((e) => ({ stdout: '', stderr: e?.stderr ?? '' }));
      // Reset the probe wait above by calling repeatedly is heavy: instead use a dedicated spawn for oracle.
      const oracleWindows = parseOracle(oracleOut.stderr);
      // Oracle is duration-capped; clamp ends to durationMs.
      oracleByVideo[video] = oracleWindows
        .filter((w) => w.endMs > w.startMs)
        .map((w) => ({ startMs: w.startMs, endMs: Math.min(w.endMs, durationMs) }));
      console.log(`  ${video}: duration=${Math.round(durationMs / 1000)}s, oracle silences=${oracleByVideo[video].length}`);
    } catch (error) {
      console.warn(`  ${video}: skipped (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  // Score the grid.
  const results = [];
  for (const factor of CANDIDATE_FACTORS) {
    for (const minSilence of CANDIDATE_MINS) {
      const f1s: number[] = [];
      const rows: Array<{ video: string; cand: number; oracle: number; hits: number; f1: number }> = [];
      for (const video of videos) {
        const pcm = pcmByVideo[video];
        if (!pcm || !oracleByVideo[video]) continue;
        const m = measureSilence(pcm, sampleRateOf, { silenceRmsFactor: factor, minSilenceMs: minSilence });
        const cand = m.windows.map((w) => ({ startMs: w.startMs, endMs: w.endMs }));
        const s = score(cand, oracleByVideo[video]);
        f1s.push(s.f1);
        rows.push({ video, cand: s.candCount, oracle: s.oracleCount, hits: s.hits, f1: round(s.f1) });
      }
      const meanF1 = f1s.length ? round(f1s.reduce((a, b) => a + b, 0) / f1s.length) : 0;
      results.push({
        silenceRmsFactor: factor,
        minSilenceMs: minSilence,
        meanF1,
        perVideo: rows,
      });
      console.log(`  factor=${factor} min=${minSilence}ms  meanF1=${meanF1}`);
    }
  }
  results.sort((a, b) => b.meanF1 - a.meanF1);
  const best = results[0];
  console.log(`\nBest: factor=${best.silenceRmsFactor} minSilenceMs=${best.minSilenceMs}ms meanF1=${best.meanF1}`);

  await writeFile(path.join(outDir, 'report.json'), JSON.stringify({
    version: SILENCE_MEASUREMENT_VERSION,
    oracle: { db: ORACLE_DB, minSec: ORACLE_MIN_S, toleranceMs: TOL_MS },
    best,
    results,
  }, null, 2), 'utf8');
  console.log(`Report: ${path.join(outDir, 'report.json')}`);
}

function round(v: number): number { return Math.round(v * 1000) / 1000; }

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
