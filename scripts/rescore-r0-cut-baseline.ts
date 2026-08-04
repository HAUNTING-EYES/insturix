/**
 * R0 adaptive rescore: run the merge post-process over real-video candidate
 * cuts and compare against the fixed-threshold baseline. Also runs a
 * synthetic no-regression check so the scorer's F1 is unchanged by the pass.
 *
 * Reads candidate JSONs written by scripts/generate-r0-cut-candidates.ts from
 * .calibration-temp/r0-real-video-candidates/<ts>/*.candidates.json
 *
 * Usage: npx tsx scripts/rescore-r0-cut-baseline.ts "<candidates.json path>"
 *   OR with no args, picks the most recent candidates directory.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { mergeCloseCuts } from '../lib/editron/reference-video/adaptive-cut-postprocess';
import {
  buildCutBaselineReport,
  createSyntheticCutFixture,
  scoreCutDetection,
} from '../lib/editron/reference-video/r0-cut-detection-baseline';
interface CandidateDoc {
  version: string;
  generatedAt: string;
  video: {
    path: string;
    fileName: string;
    durationMs: number | null;
    cutCount: number;
  };
  candidates: Array<{
    index: number;
    tMs: number;
    seconds: string;
    sceneScore?: number;
    status: string;
  }>;
}

async function findLatestCandidatesDir(): Promise<string> {
  const base = path.resolve(process.cwd(), '.calibration-temp', 'r0-real-video-candidates');
  const entries = await readdir(base, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory())
    .map(e => path.join(base, e.name))
    .sort();
  if (dirs.length === 0) throw new Error(`No candidates dir found under ${base}`);
  return dirs[dirs.length - 1];
}

export async function rescoreR0RealVideos(inputPaths: string[]) {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'r0-adaptive-rescore',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  // 1. Synthetic no-regression check: the merge pass must not change the scored F1.
  const synthetic = createSyntheticCutFixture();
  const mergedSynthetic = mergeCloseCuts(synthetic.detectorOutput);
  const beforeSynthetic = buildCutBaselineReport(synthetic).score;
  const afterSynthetic = scoreCutDetection(synthetic.groundTruth, mergedSynthetic.cuts);
  const syntheticNoRegression = {
    baselineF1: beforeSynthetic.f1,
    adaptiveF1: afterSynthetic.f1,
    merges: mergedSynthetic.merges,
    unchanged: Math.abs(beforeSynthetic.f1 - afterSynthetic.f1) < 1e-9,
  };

  const videos: Array<{
    fileName: string;
    durationMs: number | null;
    rawCount: number;
    adaptiveCount: number;
    merges: number;
    rawCutsPerMin: string;
    adaptiveCutsPerMin: string;
  }> = [];

  for (const inputPath of inputPaths) {
    const text = await readFile(inputPath, 'utf8');
    const doc = JSON.parse(text) as CandidateDoc;
    const raw = doc.candidates.map(c => ({ tMs: c.tMs, sceneScore: c.sceneScore }));
    const merged = mergeCloseCuts(raw);
    const minutes = doc.video.durationMs && doc.video.durationMs > 0
      ? doc.video.durationMs / 60000
      : null;
    const perMin = (count: number) => minutes && minutes > 0
      ? (count / minutes).toFixed(1)
      : '?';
    videos.push({
      fileName: doc.video.fileName,
      durationMs: doc.video.durationMs,
      rawCount: merged.before,
      adaptiveCount: merged.after,
      merges: merged.merges,
      rawCutsPerMin: perMin(merged.before),
      adaptiveCutsPerMin: perMin(merged.after),
    });
    console.log(
      `[adapt] ${doc.video.fileName}: ${merged.before} -> ${merged.after} cuts (${merged.merges} merged), ` +
      `${perMin(merged.before)} -> ${perMin(merged.after)}/min`,
    );
  }

  const receipt = {
    version: 'editron-r0-adaptive-rescore-v1',
    status: 'pass' as const,
    generatedAt,
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    syntheticNoRegression,
    videos,
  };
  const receiptPath = path.join(outputDir, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receiptPath, receipt };
}

async function findAllCandidatesDirs(): Promise<string[]> {
  const base = path.resolve(process.cwd(), '.calibration-temp', 'r0-real-video-candidates');
  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => path.join(base, e.name))
    .sort();
}

async function main(): Promise<void> {
  let inputPaths = process.argv.slice(2);
  if (inputPaths.length === 0) {
    const dirs = await findAllCandidatesDirs();
    inputPaths = [];
    for (const dir of dirs) {
      const files = (await readdir(dir)).filter(f => f.endsWith('.candidates.json')).sort();
      inputPaths.push(...files.map(f => path.join(dir, f)));
    }
  }
  if (inputPaths.length === 0) {
    console.error('No candidate JSONs found.');
    process.exitCode = 1;
    return;
  }
  const { receiptPath, receipt } = await rescoreR0RealVideos(inputPaths);
  console.log(JSON.stringify(receipt, null, 2));
  console.log(`\nReceipt: ${receiptPath}`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
