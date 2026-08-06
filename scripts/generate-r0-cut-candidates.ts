/**
 * R0 candidate-annotation generator over REAL local reference videos.
 *
 * Runs the actual production cut detector (detectCutsFfmpeg) over one or more
 * locally available reference videos and writes a candidate annotation JSON
 * (every detected cut = a reviewable candidate) plus a human-readable summary
 * into .calibration-temp/r0-real-video-candidates/<ts>/.
 *
 * These are ANALYSIS-ONLY fixtures: cut timing for evaluation, never render
 * audio. Review + confirm each candidate before treating it as ground truth.
 *
 * Usage: npx tsx scripts/generate-r0-cut-candidates.ts "<video 1>" ["<video 2>" ...]
 */

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseDurationMs, parseSceneCuts } from '../lib/editron/reference-video/detect-cuts-ffmpeg';

interface GeneratedCandidates {
  version: 'editron-r0-candidate-cuts-v1';
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
    sceneScore: number | undefined;
    status: 'pending-review';
  }>;
}

function runFfmpeg(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => (stdout += String(d)));
    proc.stderr.on('data', d => (stderr += String(d)));
    proc.on('error', reject);
    proc.on('close', code => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function detectOnFile(videoPath: string): Promise<GeneratedCandidates['video'] & {
  cuts: Array<{ tMs: number; sceneScore?: number }>;
}> {
  const { code, stdout, stderr } = await runFfmpeg([
    '-hide_banner',
    '-i', videoPath,
    '-filter:v', "select='gt(scene,0.3)',metadata=print:file=-",
    '-an', '-f', 'null', '-',
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg scene detection failed (exit ${code}) for ${videoPath}: ${stderr.slice(-300)}`);
  }
  return {
    path: videoPath,
    fileName: path.basename(videoPath),
    durationMs: parseDurationMs(stderr),
    cutCount: 0,
    cuts: parseSceneCuts(stdout),
  };
}

export async function generateR0CutCandidates(videoPaths: string[]) {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(process.cwd(), '.calibration-temp', 'r0-real-video-candidates', generatedAt.replace(/[:.]/g, '-'));
  await mkdir(outputDir, { recursive: true });

  const docs: Array<{ doc: GeneratedCandidates; summary: string }> = [];
  for (const videoPath of videoPaths) {
    const resolved = path.resolve(videoPath);
    let video;
    try {
      video = await detectOnFile(resolved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[r0] SKIP ${videoPath}: ${message}`);
      continue;
    }

    const candidates = video.cuts.map((cut, index) => ({
      index,
      tMs: cut.tMs,
      seconds: (cut.tMs / 1000).toFixed(3),
      sceneScore: cut.sceneScore,
      status: 'pending-review' as const,
    }));
    const doc: GeneratedCandidates = {
      version: 'editron-r0-candidate-cuts-v1',
      generatedAt,
      video: {
        path: resolved,
        fileName: video.fileName,
        durationMs: video.durationMs,
        cutCount: candidates.length,
      },
      candidates,
    };
    const fileNameSafe = video.fileName.replace(/[^A-Za-z0-9_.-]/g, '_');
    const jsonPath = path.join(outputDir, `${fileNameSafe}.candidates.json`);
    await writeFile(jsonPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

    const minutes = video.durationMs !== null ? (video.durationMs / 60000).toFixed(2) : '?';
    const cutsPerMinute = video.durationMs && video.durationMs > 0
      ? (candidates.length / (video.durationMs / 60000)).toFixed(1)
      : '?';
    const summary = [
      `VIDEO: ${video.fileName}`,
      `  duration: ${minutes} min | detected cuts: ${candidates.length} (${cutsPerMinute}/min avg)`,
      `  cuts: ${candidates.map(c => `${c.seconds}s`).join(', ') || '(none)'}`,
    ].join('\n');
    console.log(summary);
    docs.push({ doc, summary });
  }

  const reviewPath = path.join(outputDir, 'REVIEW.md');
  const review = [
    '# R0 Real-Video Cut Candidates (review me)',
    '',
    'Generated from local reference videos in `.calibration-temp` (analysis-only fixtures).',
    'For each candidate below, confirm or reject the cut timing to establish ground truth.',
    '',
    ...docs.flatMap(({ summary }) => [summary, '']),
  ].join('\n');
  await writeFile(reviewPath, `${review}\n`);

  return { outputDir, reviewPath, count: docs.length };
}

async function main(): Promise<void> {
  const videoPaths = process.argv.slice(2);
  if (videoPaths.length === 0) {
    console.error('Usage: npx tsx scripts/generate-r0-cut-candidates.ts "<video 1>" ["<video 2>" ...]');
    process.exitCode = 1;
    return;
  }
  const result = await generateR0CutCandidates(videoPaths);
  console.log(`\nWrote ${result.count} candidate file(s) to ${result.outputDir}`);
  console.log(`Review: ${result.reviewPath}`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
