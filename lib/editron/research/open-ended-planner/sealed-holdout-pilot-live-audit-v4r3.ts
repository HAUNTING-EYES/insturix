import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { computeExecutableImportClosureV1 } from '../../services/executable-import-closure-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { assertNoSpendLaneIntegrityReceiptV2 } from './no-spend-lane-integrity-receipt-v2';
import { assertSealedHoldoutPilotNoSecretsV4R3 } from './sealed-holdout-pilot-live-support-v4r3';
import { SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3 }
  from './sealed-holdout-pilot-authorization-v4r3';
import { SEALED_HOLDOUT_PILOT_RUNNER_ROOTS_V4R3 } from './sealed-holdout-pilot-runner-v4r3';
import { assertSealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import { assertSealedHoldoutGeneralisationManifestV4R2 }
  from './sealed-holdout-generalisation-cohort-v4r2';
import { assertSealedHoldoutGeneralisationManifestV4R3 }
  from './sealed-holdout-generalisation-cohort-v4r3';
import { SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3 } from './sealed-holdout-no-spend-readiness-v4r3';
import { assertSealedHoldoutRouteHealthReceiptV4R3 } from './sealed-holdout-route-health-v4r3';
type JsonRecord = Record<string, unknown>;
export const SEALED_HOLDOUT_PILOT_LIVE_AUDIT_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_PILOT_LIVE_POST_RUN_AUDIT_V4R3_1' as const;
export const SEALED_HOLDOUT_PILOT_LIVE_AUDIT_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-audit-v4r3.ts' as const;
export const SEALED_HOLDOUT_PILOT_LIVE_AUDIT_SCRIPT_PATH_V4R3 = 'scripts/audit-editron-v4r3-pilot.ts' as const;
const AUDIT_ROOTS = Object.freeze([
  SEALED_HOLDOUT_PILOT_LIVE_AUDIT_PATH_V4R3,
  SEALED_HOLDOUT_PILOT_LIVE_AUDIT_SCRIPT_PATH_V4R3,
] as const);
const TOP_LEVEL_INPUTS = Object.freeze([
  'run-start.json', 'base-manifest.json', 'predecessor-manifest.json', 'manifest.json',
  'readiness.json', 'route-health.json', 'authorization.json',
  'pilot-run-receipt.json', 'operator-receipt.json',
] as const);
export async function auditSealedHoldoutPilotLiveArtifactsV4R3(input: Readonly<{
  rootDir?: string;
  runRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
}>): Promise<Readonly<JsonRecord>> {
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const runRoot = assertRunRoot(rootDir, input.runRoot);
  const values = Object.fromEntries(await Promise.all(TOP_LEVEL_INPUTS.map(async (name) =>
    [name, await readJson(path.join(runRoot, name))]))) as Record<string, JsonRecord>;
  const base = assertSealedHoldoutCohortManifestV2R(values['base-manifest.json']);
  const predecessor = assertSealedHoldoutGeneralisationManifestV4R2({
    value: values['predecessor-manifest.json'], baseManifest: base,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: values['manifest.json'], baseManifest: base, predecessorManifest: predecessor,
  });
  const readinessCandidate = values['readiness.json'];
  const readiness = assertNoSpendLaneIntegrityReceiptV2({
    value: readinessCandidate, lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3',
    successorManifestSha256: manifest.manifestSha256,
    sentinelExecution: readinessCandidate.sentinelExecution as never,
    expectedRoots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3,
  });
  const routeHealth = assertSealedHoldoutRouteHealthReceiptV4R3({
    value: values['route-health.json'], manifest, baseManifest: base,
    predecessorManifest: predecessor,
  });
  const authorization = values['authorization.json'];
  const runReceipt = values['pilot-run-receipt.json'];
  const operatorReceipt = values['operator-receipt.json'];
  [authorization, runReceipt, operatorReceipt].forEach((value) => assertOwnHash(value));
  const rows = records(authorization.authorizedRows);
  const results = records(runReceipt.results);
  assertAuthorizationRows(manifest, routeHealth, authorization, rows);
  assertTopLevelBindings({ manifest, readiness, routeHealth, authorization,
    runReceipt, operatorReceipt, rows, results });

  const expectedAttemptFiles = results.flatMap((result) => {
    const stem = safeRowId(text(result.rowId));
    return [`${stem}.intent.json`, `${stem}.completed.json`];
  }).sort(compare);
  const attemptRoot = path.join(runRoot, 'attempts');
  const actualAttemptFiles = (await readdir(attemptRoot)).sort(compare);
  if (!sameStrings(actualAttemptFiles, expectedAttemptFiles)) fail('ATTEMPT_FILE_SET_DRIFT');
  const artifactNames = [...TOP_LEVEL_INPUTS.map(String),
    ...actualAttemptFiles.map((name) => `attempts/${name}`)];
  const terminalCounts: Record<string, number> = {};
  for (const result of results) {
    const row = rows.find((candidate) => candidate.rowId === result.rowId)
      ?? fail('RESULT_ROW_NOT_AUTHORIZED');
    assertResult(row, result);
    const stem = safeRowId(text(result.rowId));
    const intent = await readJson(path.join(attemptRoot, `${stem}.intent.json`));
    const completed = await readJson(path.join(attemptRoot, `${stem}.completed.json`));
    assertAttemptPair({ intent, completed, result });
    assertSealedHoldoutPilotNoSecretsV4R3({ intent, completed }, input.environment);
    const terminal = text(result.terminalDisposition);
    terminalCounts[terminal] = (terminalCounts[terminal] ?? 0) + 1;
  }
  assertSealedHoldoutPilotNoSecretsV4R3(values, input.environment);
  const artifactIndex = await Promise.all(artifactNames.sort(compare).map(async (name) => ({
    path: name, sha256: sha(await readFile(path.join(runRoot, name))),
  })));
  const auditorExecutableClosure = computeExecutableImportClosureV1({
    rootDir, roots: AUDIT_ROOTS, mode: 'verification', strictGit: true,
  });
  const accountedCostNanoUsd = results.reduce(
    (sum, result) => sum + integer(result.accountedCostNanoUsd), 0,
  );
  const material = {
    version: SEALED_HOLDOUT_PILOT_LIVE_AUDIT_VERSION_V4R3,
    authority: 'INDEPENDENT_ZERO_NETWORK_POST_RUN_AUDIT_NO_MODEL_SCORE' as const,
    runId: path.basename(runRoot), auditedAt: canonicalNow(input.now),
    executionCommitSha: text(operatorReceipt.implementationCommitSha),
    operatorReceiptSha256: text(operatorReceipt.receiptSha256),
    pilotRunReceiptSha256: text(runReceipt.receiptSha256),
    artifactIndex, artifactSetSha256: hashCanonicalJsonV1(artifactIndex),
    auditorExecutableClosure,
    availableRouteIds: routeHealth.availableRouteIds,
    unavailableRouteIds: routeHealth.unavailableRouteIds,
    validRawAttemptCount: results.length,
    providerInfrastructureNonEvaluationCount: routeHealth.unavailableRouteIds.length,
    terminalCounts, accountedCostNanoUsd,
    billedMicroUsd: integer(runReceipt.billedMicroUsd),
    providerInferenceCalls: integer(runReceipt.providerInferenceCalls),
    networkCallsDuringAudit: 0 as const, automaticRetry: false as const,
    modelQualityScoreAuthorized: false as const,
    fullCohortDispatchAuthorized: false as const,
    projectReads: 0 as const, projectMutations: 0 as const, mediaWrites: 0 as const,
    secretsPersisted: false as const, stateEffects: [] as const,
    assessment: 'PASS_VALID_NON_SCORED_PILOT_EVIDENCE_NO_MODEL_RANKING' as const,
  };
  const audit = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  assertSealedHoldoutPilotNoSecretsV4R3(audit, input.environment);
  await writeFile(path.join(runRoot, 'post-run-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  });
  return audit;
}
function assertTopLevelBindings(input: Readonly<{
  manifest: Readonly<{ manifestSha256: string }>;
  readiness: Readonly<{ receiptSha256: string }>;
  routeHealth: Readonly<{ receiptSha256: string; availableRouteIds: readonly string[];
    unavailableRouteIds: readonly string[] }>;
  authorization: JsonRecord; runReceipt: JsonRecord; operatorReceipt: JsonRecord;
  rows: JsonRecord[]; results: JsonRecord[];
}>): void {
  const { authorization: auth, runReceipt: run, operatorReceipt: operator } = input;
  if (auth.manifestSha256 !== input.manifest.manifestSha256
    || auth.readinessReceiptSha256 !== input.readiness.receiptSha256
    || auth.routeHealthReceiptSha256 !== input.routeHealth.receiptSha256
    || run.manifestSha256 !== input.manifest.manifestSha256
    || run.authorizationSha256 !== auth.authorizationSha256
    || run.readinessReceiptSha256 !== input.readiness.receiptSha256
    || run.routeHealthReceiptSha256 !== input.routeHealth.receiptSha256
    || operator.manifestSha256 !== input.manifest.manifestSha256
    || operator.authorizationSha256 !== auth.authorizationSha256
    || operator.pilotRunReceiptSha256 !== run.receiptSha256
    || !sameStrings(strings(operator.availableRouteIds), input.routeHealth.availableRouteIds)
    || !sameStrings(strings(operator.unavailableRouteIds), input.routeHealth.unavailableRouteIds)
    || integer(operator.providerInferenceCalls) !== input.results.length
    || integer(operator.accountedCostNanoUsd) !== input.results.reduce(
      (sum, result) => sum + integer(result.accountedCostNanoUsd), 0)
    || integer(operator.billedMicroUsd) !== integer(run.billedMicroUsd)
    || integer(run.providerInferenceCalls) !== input.results.length
    || integer(run.networkCalls) !== input.results.length
    || input.rows.length !== input.results.length
    || input.results.length !== input.routeHealth.availableRouteIds.length
    || run.maximumAttemptsPerRow !== 1 || run.automaticRetry !== false
    || run.scoredRowsExecuted !== 0 || run.projectReads !== 0
    || run.projectMutations !== 0 || run.mediaWrites !== 0
    || run.secretsPersisted !== false || array(run.stateEffects).length !== 0
    || text(record(run.executableClosure).contentSource) !== 'GIT_HEAD_BLOB'
    || record(record(run.executableClosure).sourceControl).strict !== true
    || text(record(record(run.executableClosure).sourceControl).headSha)
      !== operator.implementationCommitSha
    || hashCanonicalJsonV1(input.results) !== run.resultSetSha256
    || integer(run.billedMicroUsd) > SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3) {
    fail('TOP_LEVEL_BINDING_DRIFT');
  }
  if (!sameStrings(strings(record(run.executableClosure).roots).sort(compare),
    [...SEALED_HOLDOUT_PILOT_RUNNER_ROOTS_V4R3].sort(compare))) fail('RUNNER_ROOT_DRIFT');
}
function assertResult(row: JsonRecord, result: JsonRecord): void {
  const hashes = ['requestSha256', 'responseSha256', 'transportReceiptSha256',
    'providerUsageSha256', 'accountingReceiptSha256', 'episodeReceiptSha256',
    'transcriptSha256'];
  const accounting = { requestSha256: result.requestSha256,
    responseSha256: result.responseSha256, providerUsageSha256: result.providerUsageSha256,
    accountedCostNanoUsd: result.accountedCostNanoUsd,
    accountingBasis: result.accountingBasis };
  if (result.rowId !== row.rowId || result.routeId !== row.routeId
    || result.requestedModel !== row.requestedModel
    || result.returnedModelIdentity !== row.confirmedReturnedModelIdentity
    || result.rowAuthorizationSha256 !== row.rowAuthorizationSha256
    || hashes.some((key) => !isSha(result[key]))
    || result.accountingReceiptSha256 !== hashCanonicalJsonV1(accounting)
    || integer(result.billedMicroUsd) !== Math.ceil(integer(result.accountedCostNanoUsd) / 1_000)
    || result.providerAttemptCount !== 1 || result.inferenceCalls !== 1
    || result.networkCalls !== 1 || result.projectReads !== 0
    || result.projectMutations !== 0 || result.mediaWrites !== 0
    || result.secretsPersisted !== false || array(result.stateEffects).length !== 0
    || !text(result.terminalDisposition)) fail('RESULT_BINDING_DRIFT');
  assertOwnHash(row, 'rowAuthorizationSha256');
}
function assertAttemptPair(input: Readonly<{
  intent: JsonRecord; completed: JsonRecord; result: JsonRecord;
}>): void {
  assertOwnHash(input.intent, 'intentSha256');
  assertOwnHash(input.completed);
  const episode = record(input.completed.providerEpisode);
  const transport = record(input.completed.transportReceipt);
  assertOwnHash(episode);
  assertOwnHash(transport);
  const calls = records(transport.calls); const call = calls[0] ?? fail('TRANSPORT_CALL_MISSING');
  if (calls.length !== 1 || input.completed.intentSha256 !== input.intent.intentSha256
    || input.intent.rowId !== input.result.rowId || input.intent.routeId !== input.result.routeId
    || input.intent.maximumProviderAttempts !== 1 || input.intent.automaticRetry !== false
    || input.completed.projectReads !== 0 || input.completed.projectMutations !== 0
    || input.completed.mediaWrites !== 0 || input.completed.secretsPersisted !== false
    || array(input.completed.stateEffects).length !== 0
    || hashCanonicalJsonV1(input.completed.portResult) !== hashCanonicalJsonV1(input.result)
    || episode.receiptSha256 !== input.result.episodeReceiptSha256
    || episode.transcriptSha256 !== input.result.transcriptSha256
    || hashCanonicalJsonV1(episode.selectedOperatorIds) !== hashCanonicalJsonV1(input.result.selectedOperatorIds)
    || record(episode.terminal).disposition !== input.result.terminalDisposition
    || transport.receiptSha256 !== input.result.transportReceiptSha256
    || call.attempt !== 1 || call.requestHash !== input.result.requestSha256
    || call.responseSha256 !== input.result.responseSha256
    || call.returnedModelIdentity !== input.result.returnedModelIdentity
    || hashCanonicalJsonV1(call.usage) !== input.result.providerUsageSha256
    || record(input.completed.accounting).accountingReceiptSha256
      !== input.result.accountingReceiptSha256) fail('ATTEMPT_BINDING_DRIFT');
}
function assertAuthorizationRows(manifest: Readonly<{ pilotRows: readonly Readonly<JsonRecord>[] }>,
  health: Readonly<{ availableRouteIds: readonly string[]; observedAt: string; expiresAt: string }>,
  authorization: JsonRecord, rows: JsonRecord[]): void {
  const limits = record(authorization.limits);
  if (!sameStrings(rows.map((row) => text(row.routeId)), health.availableRouteIds)
    || integer(limits.maximumProviderInferenceCalls) !== rows.length
    || limits.maximumAttemptsPerRow !== 1 || limits.automaticRetry !== false
    || limits.absoluteMaxSpendMicroUsd !== SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3
    || rows.reduce((sum, row) => sum + integer(row.absoluteMaxRowSpendMicroUsd), 0)
      !== SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3
    || Date.parse(text(authorization.approvedAt)) < Date.parse(health.observedAt)
    || Date.parse(text(authorization.expiresAt)) > Date.parse(health.expiresAt)) {
    fail('AUTHORIZATION_BINDING_DRIFT');
  }
  for (const row of rows) {
    const plan = manifest.pilotRows.find((candidate) => candidate.rowId === row.rowId);
    const route = record(plan?.route);
    if (!plan || plan.stage !== 'PILOT' || row.rowPlanSha256 !== plan.rowPlanSha256
      || row.routeId !== route.routeId || row.provider !== route.provider
      || row.requestedModel !== route.model
      || row.confirmedReturnedModelIdentity !== route.claimedModelIdentity) {
      fail('AUTHORIZED_ROW_BINDING_DRIFT');
    }
    assertOwnHash(row, 'rowAuthorizationSha256');
  }
}

function assertOwnHash(value: JsonRecord, key = 'receiptSha256'): void {
  const claimed = value[key]; const material = { ...value }; delete material[key];
  if (!isSha(claimed) || claimed !== hashCanonicalJsonV1(material)) fail(`HASH_DRIFT:${key}`);
}
function assertRunRoot(rootDir: string, candidate: string): string {
  const allowed = path.resolve(rootDir, '.calibration-temp', 'editron-v4r3-pilot');
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(`${allowed}${path.sep}`)) fail('RUN_ROOT_OUTSIDE_ALLOWED_DIRECTORY');
  return resolved;
}
async function readJson(file: string): Promise<JsonRecord> {
  const value: unknown = JSON.parse((await readFile(file)).toString('utf8'));
  if (!isRecord(value)) fail(`JSON_OBJECT_REQUIRED:${path.basename(file)}`);
  return value;
}
function safeRowId(value: string): string { return value.replace(/[^A-Za-z0-9._-]/gu, '_'); }
function canonicalNow(now?: () => Date): string {
  const value = now?.() ?? new Date();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('CLOCK_INVALID');
  return value.toISOString();
}
function sha(value: Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('NONNEGATIVE_INTEGER_REQUIRED');
  return Number(value);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function fail(code: string): never { throw new Error(`SEALED_V4R3_PILOT_AUDIT_${code}`); }
