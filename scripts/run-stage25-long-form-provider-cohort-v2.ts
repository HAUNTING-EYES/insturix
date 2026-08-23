import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertStage25LongFormProviderCohortManifestV2,
  buildStage25LongFormProviderCohortManifestV2,
  stage25LongFormProviderMaxSpendUsdV2,
  stage25LongFormProviderSourceEntriesV2,
  STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
  type Stage25LongFormProviderSourceBindingInputV2,
} from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v2';
import {
  assertStage25LongFormProviderPaidAuthorizationV2,
  issueStage25LongFormProviderPaidAuthorizationV2,
} from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-authorization-v2';
import type {
  Stage25LongFormProviderPaidDurablePortV2,
  Stage25LongFormProviderPaidRowResultV2,
} from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-contract-v2';
import { runStage25LongFormProviderPaidCohortV2 }
  from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-v2';
import type { Stage25LongFormProviderRequestCaptureV1 }
  from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v1';
import {
  assertStage25LongFormProviderPreflightBundleV2,
  preflightStage25LongFormProvidersV2,
  type Stage25LongFormProviderPreflightReceiptV2,
} from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v2';

type JsonRecord = Record<string, unknown>;
const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

async function main(): Promise<void> {
  const mode = required('--mode');
  if (!['issue', 'preflight', 'execute'].includes(mode)) fail('STAGE25_LONG_FORM_SCRIPT_MODE_INVALID');
  const outputRoot = path.resolve(required('--output-root'));
  const operatorId = required('--operator-id');
  const manifest = await currentManifest();
  if (mode === 'issue') {
    await mkdir(path.dirname(outputRoot), { recursive: true });
    await mkdir(outputRoot, { recursive: false });
    await writeJson(path.join(outputRoot, 'provider-manifest-v2.json'), manifest);
    return printSummary('ISSUED_ZERO_NETWORK', outputRoot, manifest, {});
  }
  confirm('--confirm-manifest', manifest.manifestSha256);
  const stored = assertStage25LongFormProviderCohortManifestV2(
    await readJson(path.join(outputRoot, 'provider-manifest-v2.json')),
  );
  if (stored.manifestSha256 !== manifest.manifestSha256) fail('STAGE25_LONG_FORM_STORED_MANIFEST_DRIFT');
  if (mode === 'preflight') {
    if (process.argv.some((value) => value.startsWith('--execute-paid-cohort='))) {
      fail('STAGE25_LONG_FORM_PREFLIGHT_INFERENCE_FLAG_FORBIDDEN');
    }
    const bundle = await preflightStage25LongFormProvidersV2({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId, environment: process.env,
    });
    await writeJson(path.join(outputRoot, 'preflight-receipt-v2.json'), bundle.receipt);
    await writeJson(path.join(outputRoot, 'request-captures-v2.json'), bundle.requestCaptures);
    return printSummary('ZERO_INFERENCE_PREFLIGHT_COMPLETE', outputRoot, manifest, {
      preflightReceiptSha256: bundle.receipt.receiptSha256,
      requestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
      networkCalls: bundle.receipt.networkCalls,
      initialAttemptCostUpperBoundUsd: bundle.receipt.initialAttemptCostUpperBoundUsd,
    });
  }
  await executePaid({ outputRoot, operatorId, manifest });
}

async function executePaid(input: {
  outputRoot: string;
  operatorId: string;
  manifest: ReturnType<typeof buildStage25LongFormProviderCohortManifestV2>;
}): Promise<void> {
  confirm('--execute-paid-cohort', STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2);
  confirm('--confirm-max-spend-usd', stage25LongFormProviderMaxSpendUsdV2(input.manifest));
  const preflight = (await readJson(
    path.join(input.outputRoot, 'preflight-receipt-v2.json'),
  )) as Stage25LongFormProviderPreflightReceiptV2;
  const captures = (await readJson(
    path.join(input.outputRoot, 'request-captures-v2.json'),
  )) as Stage25LongFormProviderRequestCaptureV1[];
  const bundle = assertStage25LongFormProviderPreflightBundleV2({
    manifest: input.manifest, receipt: preflight, requestCaptures: captures,
  });
  confirm('--confirm-preflight', bundle.receipt.receiptSha256);
  confirm('--confirm-capture-set', bundle.receipt.requestCaptureSetSha256);
  const authorizationPath = path.join(input.outputRoot, 'paid-authorization-v2.json');
  const existing = await readOptionalJson(authorizationPath);
  const now = new Date();
  const authorization = existing
    ? assertStage25LongFormProviderPaidAuthorizationV2({
        manifest: input.manifest, preflight: bundle.receipt,
        captures: bundle.requestCaptures, authorization: existing, now: now.toISOString(),
      })
    : issueStage25LongFormProviderPaidAuthorizationV2({
        manifest: input.manifest, preflight: bundle.receipt,
        captures: bundle.requestCaptures,
        approval: {
          operatorId: input.operatorId, approvedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1_000).toISOString(),
          confirmedManifestSha256: input.manifest.manifestSha256,
          confirmedPreflightReceiptSha256: bundle.receipt.receiptSha256,
          confirmedRequestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
          executeConfirmation: STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
          confirmedMaxSpendUsd: stage25LongFormProviderMaxSpendUsdV2(input.manifest),
        },
      });
  if (authorization.operatorId !== input.operatorId) fail('STAGE25_LONG_FORM_OPERATOR_DRIFT');
  if (!existing) await writeJson(authorizationPath, authorization);
  const durablePort = fileDurablePort(path.join(input.outputRoot, 'durable-events'));
  const result = await runStage25LongFormProviderPaidCohortV2({
    manifest: input.manifest, preflight: bundle.receipt,
    captures: bundle.requestCaptures, authorization, durablePort,
    environment: process.env, now: now.toISOString(),
  });
  const receiptPath = path.join(input.outputRoot, 'paid-cohort-receipt-v2.json');
  const prior = await readOptionalJson(receiptPath);
  if (prior && hashCanonicalJsonV1(prior) !== hashCanonicalJsonV1(result.receipt)) {
    fail('STAGE25_LONG_FORM_EXISTING_RECEIPT_DRIFT');
  }
  if (!prior) await writeJson(receiptPath, result.receipt);
  printSummary('PAID_COHORT_COMPLETE', input.outputRoot, input.manifest, {
    authorizationSha256: authorization.authorizationSha256,
    receiptSha256: result.receipt.receiptSha256,
    rows: result.rows.length,
    spentNanoUsd: result.receipt.spentNanoUsd,
    dispositions: result.receipt.dispositions,
  });
}

async function currentManifest() {
  const entries = stage25LongFormProviderSourceEntriesV2();
  const { stdout: dirty } = await execFileAsync('git', [
    'status', '--porcelain', '--', ...entries.map(({ path: filePath }) => filePath),
  ], { cwd: repoRoot, windowsHide: true });
  if (dirty.trim()) fail('STAGE25_LONG_FORM_EXECUTION_FILES_MUST_BE_COMMITTED');
  const { stdout: commit } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot, windowsHide: true,
  });
  const pairs = await Promise.all(entries.map(async ({ role, path: filePath }) => [
    role, createHash('sha256').update(await readFile(path.join(repoRoot, filePath))).digest('hex'),
  ] as const));
  return buildStage25LongFormProviderCohortManifestV2({
    sourceCommit: commit.trim(),
    sourceSha256: Object.fromEntries(pairs) as
      Stage25LongFormProviderSourceBindingInputV2['sourceSha256'],
  });
}

function fileDurablePort(root: string): Stage25LongFormProviderPaidDurablePortV2 {
  const append = async (rowId: string, kind: string, state: JsonRecord) => {
    const rowRoot = path.join(root, hashCanonicalJsonV1(rowId).slice(0, 24));
    await mkdir(rowRoot, { recursive: true });
    const names = (await readdir(rowRoot)).filter((name) => name.endsWith('.json')).sort();
    const ordinal = String(names.length + 1).padStart(4, '0');
    const material = { rowId, kind, state };
    await writeJson(path.join(rowRoot, `${ordinal}-${kind}.json`), {
      ...material, eventSha256: hashCanonicalJsonV1(material),
    });
  };
  return {
    load: async (rowId) => {
      const rowRoot = path.join(root, hashCanonicalJsonV1(rowId).slice(0, 24));
      try {
        const names = (await readdir(rowRoot)).filter((name) => name.endsWith('.json')).sort();
        if (!names.length) return {};
        const event = await readJson(path.join(rowRoot, names.at(-1)!)) as JsonRecord;
        const { eventSha256, ...material } = event;
        if (event.rowId !== rowId || eventSha256 !== hashCanonicalJsonV1(material)) {
          fail('STAGE25_LONG_FORM_DURABLE_EVENT_INVALID');
        }
        return event.state as {
          completedRow?: Stage25LongFormProviderPaidRowResultV2;
          resumeCheckpoint?: never;
        };
      } catch (error) {
        if (isEnoent(error)) return {};
        throw error;
      }
    },
    commitDispatch: async ({ rowId, checkpoint }) => append(
      rowId, 'dispatch', { resumeCheckpoint: checkpoint },
    ),
    commitAttempt: async ({ rowId, checkpoint }) => append(
      rowId, 'attempt', { resumeCheckpoint: checkpoint },
    ),
    commitRow: async ({ rowId, row }) => append(rowId, 'row', { completedRow: row }),
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
async function readOptionalJson(filePath: string): Promise<unknown | null> {
  try { return await readJson(filePath); } catch (error) { if (isEnoent(error)) return null; throw error; }
}
function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(name: string): string { const value = option(name)?.trim(); if (!value) fail(`STAGE25_LONG_FORM_OPTION_REQUIRED:${name}`); return value; }
function confirm(name: string, expected: string): void { if (option(name) !== expected) fail(`STAGE25_LONG_FORM_CONFIRMATION_MISMATCH:${name}`); }
function printSummary(mode: string, outputRoot: string,
  manifest: ReturnType<typeof buildStage25LongFormProviderCohortManifestV2>, details: JsonRecord): void {
  process.stdout.write(`${JSON.stringify({ mode, outputRoot,
    manifestSha256: manifest.manifestSha256,
    absoluteMaxSpendUsd: stage25LongFormProviderMaxSpendUsdV2(manifest), ...details }, null, 2)}\n`);
}
function fail(code: string): never { throw new Error(code); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
