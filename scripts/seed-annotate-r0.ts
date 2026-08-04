/**
 * R0 annotation seed + score.
 *
 * Phase 1 (seed): for each real-video candidate JSON, write a proposed
 *   `.annotations.json` containing the adaptive (score-aware) cut list as the
 *   initial `confirmed` ground truth. A human (or Qwen frame review) edits this
 *   file — removing phantom cuts, keeping real ones — then the tool re-runs.
 *
 * Phase 2 (score): with confirmed annotations present, compute real-video F1
 *   for BOTH the raw fixed-threshold detector and the adaptive output, plus a
 *   synthetic no-regression check. This is the R0 exit-gate number.
 *
 * Usage:
 *   npx tsx scripts/seed-annotate-r0.ts seed      # write proposed annotations
 *   npx tsx scripts/seed-annotate-r0.ts score     # F1 once annotations confirmed
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

interface AnnotationDoc {
  version: 'editron-r0-real-video-annotations-v1';
  fileName: string;
  videoPath: string;
  durationMs: number | null;
  confirmed: Array<{ tMs: number; note?: string }>;
}

const ANNOTATIONS_DIR = path.resolve(process.cwd(), '.calibration-temp', 'r0-annotations');

async function findCandidateFiles(): Promise<string[]> {
  const base = path.resolve(process.cwd(), '.calibration-temp', 'r0-real-video-candidates');
  const dirs = (await readdir(base, { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => path.join(base, e.name))
    .sort();
  const files: string[] = [];
  for (const dir of dirs) {
    const candidates = (await readdir(dir)).filter(f => f.endsWith('.candidates.json')).sort();
    for (const f of candidates) {
      const full = path.join(dir, f);
      if (!files.includes(full)) files.push(full);
    }
  }
  return files;
}

export async function seedAnnotations(candidateFiles: string[]) {
  await mkdir(ANNOTATIONS_DIR, { recursive: true });
  const seeded: string[] = [];
  for (const file of candidateFiles) {
    const doc = JSON.parse(await readFile(file, 'utf8')) as CandidateDoc;
    const annotationPath = path.join(ANNOTATIONS_DIR, `${doc.video.fileName}.annotations.json`);
    if (await fileExists(annotationPath)) {
      console.log(`[seed] SKIP (exists): ${doc.video.fileName}`);
      continue;
    }
    const adaptive = mergeCloseCuts(doc.candidates.map(c => ({ tMs: c.tMs, sceneScore: c.sceneScore })));
    const annotation: AnnotationDoc = {
      version: 'editron-r0-real-video-annotations-v1',
      fileName: doc.video.fileName,
      videoPath: doc.video.path,
      durationMs: doc.video.durationMs,
      confirmed: adaptive.cuts.map(c => ({
        tMs: c.tMs,
        note: c.sceneScore !== undefined && c.sceneScore >= 0.5 ? 'strong-cut' : 'accepted-cut',
      })),
    };
    await writeFile(annotationPath, `${JSON.stringify(annotation, null, 2)}\n`, 'utf8');
    seeded.push(doc.video.fileName);
  }
  return { annotationsDir: ANNOTATIONS_DIR, seeded };
}

export async function scoreAgainstAnnotations() {
  const files = (await readdir(ANNOTATIONS_DIR)).filter(f => f.endsWith('.annotations.json')).sort();
  if (files.length === 0) {
    throw new Error('No confirmed annotations found — run `seed` first, then edit/confirm them.');
  }

  const results: Array<{
    fileName: string;
    rawCount: number;
    adaptiveCount: number;
    confirmedCount: number;
    raw: { precision: number; recall: number; f1: number; meanTimingMs: number | null };
    adaptive: { precision: number; recall: number; f1: number; meanTimingMs: number | null };
  }> = [];

  for (const file of files) {
    const annotation = JSON.parse(await readFile(path.join(ANNOTATIONS_DIR, file), 'utf8')) as AnnotationDoc;
    // Find the matching raw candidates so we can compare raw vs adaptive vs confirmed.
    const matches = await findCandidateFiles();
    let rawDoc: CandidateDoc | null = null;
    for (const candidatePath of matches) {
      const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as CandidateDoc;
      if (candidate.video.fileName === annotation.fileName) {
        rawDoc = candidate;
        break;
      }
    }
    if (!rawDoc) {
      console.warn(`[score] no raw candidates for ${annotation.fileName} — skipped`);
      continue;
    }
    const truth = annotation.confirmed.map(c => ({ id: String(c.tMs), tMs: c.tMs }));
    const rawCuts = rawDoc.candidates.map(c => ({ tMs: c.tMs, sceneScore: c.sceneScore }));
    const adaptiveCuts = mergeCloseCuts(rawCuts).cuts;

    const rawScore = scoreCutDetection(truth, rawCuts);
    const adaptiveScore = scoreCutDetection(truth, adaptiveCuts);
    results.push({
      fileName: annotation.fileName,
      rawCount: rawCuts.length,
      adaptiveCount: adaptiveCuts.length,
      confirmedCount: truth.length,
      raw: {
        precision: round(rawScore.precision),
        recall: round(rawScore.recall),
        f1: round(rawScore.f1),
        meanTimingMs: rawScore.meanTimingErrorMs === null ? null : round(rawScore.meanTimingErrorMs),
      },
      adaptive: {
        precision: round(adaptiveScore.precision),
        recall: round(adaptiveScore.recall),
        f1: round(adaptiveScore.f1),
        meanTimingMs: adaptiveScore.meanTimingErrorMs === null ? null : round(adaptiveScore.meanTimingErrorMs),
      },
    });
  }

  // Synthetic no-regression gate.
  const synthetic = createSyntheticCutFixture();
  const merged = mergeCloseCuts(synthetic.detectorOutput);
  const baseF1 = buildCutBaselineReport(synthetic).score.f1;
  const adaptiveF1 = scoreCutDetection(synthetic.groundTruth, merged.cuts).f1;

  return {
    results,
    synthetic: { baseF1: round(baseF1), adaptiveF1: round(adaptiveF1), unchanged: Math.abs(baseF1 - adaptiveF1) < 1e-9 },
  };
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'seed';
  if (command === 'seed') {
    const candidates = await findCandidateFiles();
    const result = await seedAnnotations(candidates);
    console.log(`Seeded ${result.seeded.length} annotation file(s) into ${result.annotationsDir}`);
    console.log('Edit each .annotations.json to confirm/remove cuts, then run: npx tsx scripts/seed-annotate-r0.ts score');
  } else if (command === 'score') {
    const result = await scoreAgainstAnnotations();
    for (const r of result.results) {
      console.log(
        `[score] ${r.fileName}: confirmed=${r.confirmedCount} | raw F1=${r.raw.f1} (${r.raw.precision}/${r.raw.recall}) vs adaptive F1=${r.adaptive.f1} (${r.adaptive.precision}/${r.adaptive.recall})`,
      );
    }
    console.log(`[score] synthetic no-regression: base F1=${result.synthetic.baseF1}, adaptive F1=${result.synthetic.adaptiveF1}, unchanged=${result.synthetic.unchanged}`);
  } else {
    console.error('Usage: npx tsx scripts/seed-annotate-r0.ts [seed|score]');
    process.exitCode = 1;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
