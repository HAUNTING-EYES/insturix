import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HoldoutMediaManifestV2R }
  from '../lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import {
  buildSealedHoldoutEnvironmentReproofReceiptV2R,
  interpretSealedHoldoutPaidCohortV2R,
  isSealedHoldoutEnvironmentReproofCandidateV2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-interpretation-v2r';
import { proveSealedHoldoutPaidOutcomeV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-proof-adapter-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

const repoRoot = process.cwd();

async function main(): Promise<void> {
  const cohortRoot = path.resolve(required('--cohort-root'));
  const mediaManifestPath = path.resolve(required('--media-manifest'));
  const outputRoot = path.resolve(required('--output-root'));
  const shortProofRoot = path.resolve(required('--short-proof-root'));
  if (option('--reprove-environment-failures') !== 'YES') {
    throw new Error('SEALED_INTERPRETATION_EXPLICIT_LOCAL_REPROOF_CONFIRMATION_REQUIRED');
  }
  if (shortProofRoot.length > 120) {
    throw new Error('SEALED_INTERPRETATION_SHORT_PROOF_ROOT_TOO_LONG');
  }
  await assertAbsent(outputRoot, 'SEALED_INTERPRETATION_OUTPUT_ROOT_EXISTS');
  await assertAbsent(shortProofRoot, 'SEALED_INTERPRETATION_SHORT_PROOF_ROOT_EXISTS');
  const [cohortReceipt, rows, mediaManifest, contractSource] = await Promise.all([
    readJson(path.join(cohortRoot, 'cohort-receipt.json')),
    readRows(path.join(cohortRoot, 'rows')),
    readJson(mediaManifestPath) as Promise<HoldoutMediaManifestV2R>,
    readFile(path.join(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R)),
  ]);
  const manifest = buildSealedHoldoutCohortManifestV2R(sha256(contractSource));

  // This first pass validates the immutable cohort before any local renderer is invoked.
  interpretSealedHoldoutPaidCohortV2R({ cohortReceipt, rows });
  const candidates = rows.filter(isSealedHoldoutEnvironmentReproofCandidateV2R);
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  await mkdir(path.join(outputRoot, 'environment-reproofs'), { recursive: false });
  await mkdir(path.dirname(shortProofRoot), { recursive: true });
  await mkdir(shortProofRoot, { recursive: false });

  const environmentReproofs: JsonRecord[] = [];
  for (const row of candidates) {
    const rowPlan = record(row.rowPlan);
    const rowId = text(rowPlan.rowId);
    const proofOutput = path.join(shortProofRoot, rowId.slice(0, 3));
    const proofReceipt = await proveSealedHoldoutPaidOutcomeV2R({
      manifest,
      caseId: text(rowPlan.caseId),
      trace: record(row.trace) as unknown as BudgetedSealedHoldoutSelectedOperationTraceV2R,
      evaluation: record(row.evaluation) as unknown as BudgetedSealedHoldoutEvaluationReceiptV2R,
      mediaManifest,
      outputDirectory: proofOutput,
    });
    const reproof = buildSealedHoldoutEnvironmentReproofReceiptV2R({
      row,
      proofReceipt,
    });
    environmentReproofs.push(reproof as unknown as JsonRecord);
    await writeJsonOnce(
      path.join(outputRoot, 'environment-reproofs', `${rowId}.json`),
      reproof,
    );
  }
  const interpretation = interpretSealedHoldoutPaidCohortV2R({
    cohortReceipt,
    rows,
    environmentReproofs,
  });
  await writeJsonOnce(path.join(outputRoot, 'interpretation-receipt.json'), interpretation);
  await writeJsonOnce(path.join(outputRoot, 'source-binding.json'), {
    sourceCohortRoot: path.relative(repoRoot, cohortRoot).replaceAll('\\', '/'),
    sourceCohortReceiptSha256: text(record(cohortReceipt).receiptSha256),
    mediaManifestSha256: mediaManifest.manifestSha256,
    manifestSha256: manifest.manifestSha256,
    rowFileSetSha256: sha256(Buffer.from(JSON.stringify(rows.map((row) => row.receiptSha256)))),
    environmentReproofReceiptSha256: environmentReproofs.map((entry) => entry.receiptSha256),
    projectReads: 0,
    projectMutations: 0,
    stateEffects: [],
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'SEALED_HOLDOUT_FROZEN_INTERPRETATION_NO_INFERENCE',
    outputRoot,
    sourceCohortReceiptSha256: interpretation.sourceCohortReceiptSha256,
    interpretationReceiptSha256: interpretation.receiptSha256,
    rowCount: interpretation.rowCount,
    evidenceDispositionCounts: interpretation.evidenceDispositionCounts,
    environmentReproofs: environmentReproofs.length,
    providerInferenceCalls: 0,
    projectReads: 0,
    projectMutations: 0,
  }, null, 2)}\n`);
}

async function readRows(root: string): Promise<JsonRecord[]> {
  const names = (await readdir(root)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map((name) => readJson(path.join(root, name)) as Promise<JsonRecord>));
}
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
async function writeJsonOnce(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
async function assertAbsent(target: string, code: string): Promise<void> {
  try { await stat(target); throw new Error(code); }
  catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    if (record(error).code !== 'ENOENT') throw error;
  }
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_INTERPRETATION_OPTION_REQUIRED:${name}`);
  return value;
}
function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
