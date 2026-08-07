/**
 * Fix-0 CLI: sweep MG judge/acceptance thresholds against a labeled set (brief §18).
 *
 * Usage:
 *   npx tsx scripts/prompt-optimization/eval-mg-threshold-sweep.ts --labels=p.jsonl
 *   (JSONL: one LabeledJudgeItem per line; human: "accept"|"watchlist"|"reject"; judge = raw VLM verdict;
 *    geometry optional — Fix-2 grounding.)
 *
 * Without --labels it runs a tiny synthetic plumbing-only fixture so the wiring can be smoke-tested; metrics from
 * that run are NOT real calibration (see the UNLABELED warning). Populate real labeled renders before shipping any
 * threshold (§18.8 / §21 §22).
 */
import { readFileSync } from 'node:fs';

import { runThresholdSweep, formatSweepReport, type LabeledJudgeItem } from '../../lib/editron/motion-graphics/codegen/mg-threshold-sweep';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const cn = { fabrication: false, nonBrandColor: false, clippedOrOverflowing: false, subjectInterference: false, captionOrExistingTextInterference: false, unreadableContrast: false, opaqueFootageOcclusion: false, missingMotionDevelopment: false, templateLikeForm: false };
const dims = { hierarchy: 8, typography: 8, color: 8, composition: 8, motion: 8, form: 8 };

const SYNTHETIC: LabeledJudgeItem[] = [
  { id: 's-good', judge: { faithful: true, ...dims, hardFailures: { ...cn }, score: 8.6, issues: [] }, human: 'accept' },
  { id: 's-hard', judge: { faithful: true, ...dims, hardFailures: { ...cn, subjectInterference: true }, score: 9, issues: ['crosses speaker'] }, human: 'reject' },
  { id: 's-watch', judge: { faithful: true, hierarchy: 7, typography: 6, color: 7, composition: 7, motion: 7, form: 6, hardFailures: { ...cn }, score: 6.8, issues: ['typography weight'] }, human: 'watchlist' },
];

function main(): void {
  const labelsPath = arg('labels');
  let items: LabeledJudgeItem[];
  if (labelsPath) {
    items = readFileSync(labelsPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LabeledJudgeItem);
  } else {
    console.warn('[eval-mg-threshold-sweep] --labels not provided; SYNTHETIC plumbing-only fixture. These numbers are NOT calibration.');
    items = SYNTHETIC;
  }
  console.log(formatSweepReport(runThresholdSweep(items)));
}

main();
