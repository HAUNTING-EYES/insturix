import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertStage25ProviderDependencyCohortManifestV1,
} from '../lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1';
import {
  buildStage25ProviderDependencyToolSetV1,
  STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
} from '../lib/editron/research/open-ended-planner/stage25-provider-dependency-holdout-v1';
import {
  projectProviderTraceForStage25ScheduleV1,
  STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_VERSION_V1,
} from '../lib/editron/research/open-ended-planner/stage25-provider-trace-schedule-binding-v1';

type JsonRecord = Record<string, unknown>;

const REPLAY_VERSION = 'EDITRON_STAGE25_PROVIDER_DEPENDENCY_REPLAY_V1' as const;
const CRITICAL_SOURCE_PATHS = [
  'scripts/replay-stage25-provider-dependency-cohort-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-holdout-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-trace-schedule-binding-v1.ts',
  'lib/editron/research/open-ended-planner/provider-native-result-references-v2r.ts',
] as const;

async function main(): Promise<void> {
  const runRoot = path.resolve(requiredOption('--run-root'));
  const outputPath = path.resolve(requiredOption('--output'));
  assertCriticalSourcesAtHead();
  const manifest = assertStage25ProviderDependencyCohortManifestV1(
    await readJson(path.join(runRoot, 'manifest.json')),
  );
  const sourceReceipt = record(await readJson(
    path.join(runRoot, 'cohort', 'cohort-receipt.json'),
  ));
  verifySourceReceipt(sourceReceipt, manifest.manifestSha256);
  const sourceRows = records(sourceReceipt.rows);
  verifyCompleteRowMatrix(sourceRows, manifest);

  const rows = sourceRows.map((row) => replayRow(row, manifest));
  const material = {
    version: REPLAY_VERSION,
    authority: 'OFFLINE_VALIDATOR_REPLAY_NO_PROVIDER_INFERENCE_NO_PROJECT_MUTATION' as const,
    replaySourceCommit: git(['rev-parse', 'HEAD']).trim(),
    sourceManifestSha256: manifest.manifestSha256,
    sourceCohortReceiptSha256: text(sourceReceipt.receiptSha256),
    scheduleBindingVersion: STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_VERSION_V1,
    rowCount: rows.length,
    rows,
    passCount: count(rows, 'PASS'),
    failCount: count(rows, 'FAIL'),
    providerInfrastructureUnverifiableCount:
      count(rows, 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'),
    providerInferenceCalls: 0 as const,
    stateEffects: [] as const,
  };
  const receipt = {
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({
    outputPath,
    sourceManifestSha256: manifest.manifestSha256,
    sourceCohortReceiptSha256: sourceReceipt.receiptSha256,
    replayReceiptSha256: receipt.receiptSha256,
    passCount: receipt.passCount,
    failCount: receipt.failCount,
    providerInfrastructureUnverifiableCount:
      receipt.providerInfrastructureUnverifiableCount,
    providerInferenceCalls: receipt.providerInferenceCalls,
    stateEffects: receipt.stateEffects,
  }, null, 2)}\n`);
}

function replayRow(
  row: JsonRecord,
  manifest: ReturnType<typeof assertStage25ProviderDependencyCohortManifestV1>,
): Readonly<JsonRecord> {
  const rowId = text(row.rowId);
  const episode = record(row.episode);
  const terminal = text(record(episode.terminal).disposition);
  const common = {
    rowId,
    routeId: text(row.routeId),
    model: text(row.model),
    presentationOrdinal: number(row.presentationOrdinal),
    sourceAssessment: text(row.assessment),
    sourceRowSha256: hashCanonicalJsonV1(row),
    sourceEpisodeReceiptSha256: text(episode.receiptSha256),
    sourceTraceArtifactSha256: text(record(row.trace).artifactSha256),
    sourceEvaluationReceiptSha256: text(record(row.evaluation).receiptSha256),
    sourceTransportReceiptSha256: text(record(row.transport).receiptSha256),
  };
  if (['PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR'].includes(terminal)) {
    return {
      ...common,
      replayAssessment: 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE' as const,
      terminalDisposition: terminal,
      replayScheduleReceiptHash: null,
      replayDiagnostic: null,
    };
  }
  const presentation = manifest.presentations.find(
    ({ ordinal }) => ordinal === common.presentationOrdinal,
  );
  if (!presentation) fail(`PRESENTATION_MISSING:${rowId}`);
  try {
    const projection = projectProviderTraceForStage25ScheduleV1({
      taskId: STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
      providerEpisode: episode as never,
      selectedOperationTrace: row.trace,
      episodeContext: manifest.context,
      toolSet: buildStage25ProviderDependencyToolSetV1(presentation.operatorOrder),
    });
    if (record(row.evaluation).assessment !== 'PASS'
      || record(projection.receipt).zeroAdd !== true
      || record(projection.receipt).zeroDrop !== true) {
      fail(`REPLAY_PASS_PRECONDITION_INVALID:${rowId}`);
    }
    return {
      ...common,
      replayAssessment: 'PASS' as const,
      terminalDisposition: terminal,
      selectedOperatorIds: strings(episode.selectedOperatorIds),
      replayScheduleReceiptHash: text(record(projection.receipt).receiptHash),
      replayDiagnostic: null,
    };
  } catch (error) {
    return {
      ...common,
      replayAssessment: 'FAIL' as const,
      terminalDisposition: terminal,
      selectedOperatorIds: strings(episode.selectedOperatorIds),
      replayScheduleReceiptHash: null,
      replayDiagnostic: boundedError(error),
    };
  }
}

function verifySourceReceipt(receipt: JsonRecord, manifestSha256: string): void {
  const unsigned = { ...receipt };
  delete unsigned.receiptSha256;
  if (text(receipt.receiptSha256) !== hashCanonicalJsonV1(unsigned)
    || receipt.manifestSha256 !== manifestSha256
    || receipt.rowCount !== records(receipt.rows).length
    || !Array.isArray(receipt.stateEffects) || receipt.stateEffects.length) {
    fail('SOURCE_COHORT_RECEIPT_INVALID');
  }
}

function verifyCompleteRowMatrix(
  rows: readonly JsonRecord[],
  manifest: ReturnType<typeof assertStage25ProviderDependencyCohortManifestV1>,
): void {
  const expected = manifest.routes.flatMap(({ route }) => manifest.presentations.map(
    ({ ordinal }) => `${route.routeId}:${route.model}:P${ordinal}`,
  )).sort(compareUtf16);
  const actual = rows.map((row) => (
    `${text(row.routeId)}:${text(row.model)}:P${number(row.presentationOrdinal)}`
  )).sort(compareUtf16);
  if (rows.length !== manifest.rowCount
    || new Set(actual).size !== actual.length
    || hashCanonicalJsonV1(actual) !== hashCanonicalJsonV1(expected)) {
    fail('SOURCE_ROW_MATRIX_INVALID');
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
function requiredOption(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length).trim();
  if (!value) fail(`REQUIRED_OPTION_MISSING:${name}`);
  return value;
}
function assertCriticalSourcesAtHead(): void {
  const dirty = git(['diff', '--name-only', 'HEAD', '--', ...CRITICAL_SOURCE_PATHS]).trim();
  const staged = git(['diff', '--cached', '--name-only', 'HEAD', '--', ...CRITICAL_SOURCE_PATHS]).trim();
  if (dirty || staged) fail('CRITICAL_SOURCE_NOT_AT_HEAD');
}
function git(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
}
function count(rows: readonly JsonRecord[], assessment: string): number {
  return rows.filter((row) => row.replayAssessment === assessment).length;
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )) : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0;
}
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(code: string): never {
  throw new Error(`STAGE25_PROVIDER_DEPENDENCY_REPLAY_${code}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${boundedError(error)}\n`);
  process.exitCode = 1;
});
