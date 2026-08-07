/**
 * Phase 9 CLI: run evs calibration over a labeled dataset (brief §18.7/§13.4).
 *
 * Usage:
 *   npx tsx scripts/prompt-optimization/eval-mg-calibrate.ts --labels=p.jsonl --run=Eval
 *   (JSONL: one EvalItem per line; human.accept required for calibration)
 *
 * Without labels it loads the seed corpus (.calibration-temp/mg-eval-seed.jsonl — real captured verdicts,
 * human labels blank) — which will correctly REFUSE to calibrate until a real labeled set exists (≥20 labels).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseLabeledDataset, MIN_CALIBRATION_LABELS } from '../../lib/editron/motion-graphics/eval/eval-dataset';
import { runCalibration } from '../../lib/editron/motion-graphics/eval/calibration';
import { formatSweepReport } from '../../lib/editron/motion-graphics/codegen/mg-threshold-sweep';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

function main(): void {
  const labelsPath = arg('labels');
  const runId = arg('run') ?? `run-${Date.now().toString(36)}`;
  const file = labelsPath ?? path.resolve('.calibration-temp/mg-eval-seed.jsonl');
  const { items, datasetHash } = parseLabeledDataset(readFileSync(file, 'utf8'));
  const res = runCalibration(items, { datasetHash, runId });
  console.log(formatSweepReport(res.sweep));
  console.log(`\ndataset: ${items.length} items (labeled ${items.filter((i) => i.human).length}/${MIN_CALIBRATION_LABELS}) hash=${datasetHash.slice(0, 16)} run=${runId}`);
  if (res.artifact) {
    console.log('CALIBRATION ARTIFACT:\n' + JSON.stringify(res.artifact, null, 2));
  } else {
    console.log('NO ARTIFACT — ' + res.reasons.join('; '));
  }
}

main();