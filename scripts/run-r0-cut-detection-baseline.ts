import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CUT_BASELINE_VERSION,
  buildCutBaselineReport,
  createSyntheticCutFixture,
  scoreCutDetection,
} from '../lib/editron/reference-video/r0-cut-detection-baseline';

export async function runR0CutBaseline() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'r0-cut-detection-baseline',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  const fixture = createSyntheticCutFixture();
  const report = buildCutBaselineReport(fixture);
  const { score } = report;

  const receipt = {
    version: CUT_BASELINE_VERSION,
    status: 'pass' as const,
    generatedAt,
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    controlFlow: {
      scorer: 'lib/editron/reference-video/r0-cut-detection-baseline.ts#scoreCutDetection',
      corpus: 'synthetic (deterministic) — R0 starter before human-annotated fixtures',
    },
    fixture: {
      videoId: fixture.videoId,
      durationMs: fixture.durationMs,
      groundTruthCutCount: fixture.groundTruth.length,
      predictedCutCount: fixture.detectorOutput.length,
      description: fixture.description,
    },
    score: {
      truePositives: score.truePositives,
      falsePositives: score.falsePositives,
      falseNegatives: score.falseNegatives,
      precision: round(score.precision),
      recall: round(score.recall),
      f1: round(score.f1),
      toleranceMs: score.toleranceMs,
      meanTimingErrorMs: score.meanTimingErrorMs === null ? null : round(score.meanTimingErrorMs),
      medianTimingErrorMs: score.medianTimingErrorMs === null ? null : round(score.medianTimingErrorMs),
      p90TimingErrorMs: score.p90TimingErrorMs === null ? null : round(score.p90TimingErrorMs),
    },
    baselineMeaning:
      'This is the R0 baseline snapshot. The plan gate: an AdaptiveDetector must beat these precision/recall/timing numbers on the same corpus.',
  };

  const receiptPath = path.join(outputDir, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receiptPath, receipt };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function main(): Promise<void> {
  const { receiptPath, receipt } = await runR0CutBaseline();
  console.log(JSON.stringify({
    status: receipt.status,
    receiptPath,
    zeroCredit: receipt.zeroCredit,
    score: receipt.score,
    fixture: receipt.fixture,
  }, null, 2));
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

export { scoreCutDetection };
