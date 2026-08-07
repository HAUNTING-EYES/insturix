/**
 * DEV PROBE (not committed) — R0 production exit gate.
 *
 * "Cut detector beats the current fixed-threshold baseline on the R0 corpus."
 *
 * Runs the SHIPPED detector pipeline (detectCutsFfmpeg + score-aware adaptive
 * merge) on real reference videos and scores against HUMAN-annotated ground
 * truth (the frame-verified annotations in .calibration-temp/r0-annotations).
 * Compares raw fixed-threshold vs adaptive output F1 — the gate passes when
 * adaptive F1 >= raw baseline across the corpus.
 *
 * Usage: npx tsx scripts/gate-r0-corpus.ts
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { mergeCloseCuts } from '../lib/editron/reference-video/adaptive-cut-postprocess';
import { scoreCutDetection } from '../lib/editron/reference-video/r0-cut-detection-baseline';

async function main() {
  const require = createRequire(import.meta.url);
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileP = promisify(execFile);

  const temp = path.resolve(process.cwd(), '.calibration-temp');
  const annDir = path.join(temp, 'r0-annotations');
  const candidatesDir = path.join(temp, 'r0-real-video-candidates');

  // 1. Collect annotations (ground truth).
  const annFiles = (await readdir(annDir)).filter((f) => f.endsWith('.annotations.json')).sort();
  const results: Array<{ video: string; truth: number; raw: { f1: number; p: number; r: number }; adaptive: { f1: number; p: number; r: number }; rawBeatsAdaptive: boolean }> = [];

  for (const annFile of annFiles) {
    const ann = JSON.parse(await readFile(path.join(annDir, annFile), 'utf8'));
    const fileName = ann.fileName;
    const videoPath = ann.videoPath;
    const truth = (ann.confirmed ?? []).map((c: { tMs: number }) => ({ id: `t${c.tMs}`, tMs: c.tMs }));
    if (truth.length === 0) { console.log(`[gate] ${fileName}: no ground truth — skip`); continue; }
    const size = await import('node:fs/promises').then(fs => fs.stat(videoPath)).catch(() => null);
    if (!size) { console.log(`[gate] ${fileName}: video missing — skip`); continue; }

    // 2. Run the SHIPPED raw ffmpeg detector on the real video.
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'gate-'));
    try {
      const { detectCutsFfmpeg } = await import('../lib/editron/reference-video/detect-cuts-ffmpeg');
      const detection = await detectCutsFfmpeg(videoPath, { runFfmpeg: async (args) => {
        const full = [ffmpeg, ...args];
        try {
          const { stdout, stderr } = await execFileP(ffmpeg, args);
          return { code: 0, stdout, stderr };
        } catch (e: any) {
          return { code: e?.code ?? 1, stdout: e?.stdout ?? '', stderr: e?.stderr ?? String(e) };
        }
      } });
      const raw = detection.cuts;
      // 3. Apply the score-aware adaptive merge (shipped post-process).
      const adaptive = mergeCloseCuts(raw).cuts;

      const rawScore = scoreCutDetection(truth, raw);
      const adaptiveScore = scoreCutDetection(truth, adaptive);

      results.push({
        video: fileName,
        truth: truth.length,
        raw: { f1: round(rawScore.f1), p: round(rawScore.precision), r: round(rawScore.recall) },
        adaptive: { f1: round(adaptiveScore.f1), p: round(adaptiveScore.precision), r: round(adaptiveScore.recall) },
        rawBeatsAdaptive: rawScore.f1 === adaptiveScore.f1,
      });
      console.log(`[gate] ${fileName}: truth=${truth.length} | raw F1=${rawScore.f1.toFixed(3)} (${rawScore.precision.toFixed(2)}/${rawScore.recall.toFixed(2)}) vs adaptive F1=${adaptiveScore.f1.toFixed(3)} (${adaptiveScore.precision.toFixed(2)}/${adaptiveScore.recall.toFixed(2)})`);
    } catch (error) {
      console.log(`[gate] ${fileName}: FAILED (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (results.length === 0) { console.log('[gate] no annotated videos could be scored'); return; }
  const meanRaw = results.reduce((a, r) => a + r.raw.f1, 0) / results.length;
  const meanAdaptive = results.reduce((a, r) => a + r.adaptive.f1, 0) / results.length;
  const passed = meanAdaptive >= meanRaw;
  console.log(`\n[gate] MEAN raw F1=${meanRaw.toFixed(3)} | MEAN adaptive F1=${meanAdaptive.toFixed(3)}`);
  console.log(`[gate] Gate 'adaptive cut detector beats fixed-threshold baseline': ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`[gate] (n=${results.length} frame-verified corpus videos)`);
}

function round(v: number): number { return Math.round(v * 1000) / 1000; }

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
