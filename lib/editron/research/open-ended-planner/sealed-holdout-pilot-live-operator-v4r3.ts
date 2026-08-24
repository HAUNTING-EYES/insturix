import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  createSealedHoldoutPilotLiveExecutionPortV4R3,
} from './sealed-holdout-pilot-live-adapter-v4r3';
import {
  assertSealedHoldoutPilotNoSecretsV4R3,
  type SealedHoldoutPilotAttemptIntentV4R3,
  type SealedHoldoutPilotLiveAuditOwnerV4R3,
  type SealedHoldoutPilotLiveAuditReceiptV4R3,
} from './sealed-holdout-pilot-live-support-v4r3';
import {
  SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
  issueSealedHoldoutPilotAuthorizationV4R3,
} from './sealed-holdout-pilot-authorization-v4r3';
import {
  runSealedHoldoutPilotV4R3,
  type SealedHoldoutPilotRunReceiptV4R3,
} from './sealed-holdout-pilot-runner-v4r3';
import {
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
  buildSealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
  buildSealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';
import {
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
  buildSealedHoldoutGeneralisationManifestV4R3,
} from './sealed-holdout-generalisation-cohort-v4r3';
import { issueSealedHoldoutNoSpendReadinessV4R3 }
  from './sealed-holdout-no-spend-readiness-v4r3';
import { preflightSealedHoldoutRouteHealthV4R3 }
  from './sealed-holdout-route-health-v4r3';

export const SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_V4R3_1' as const;
export const SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-operator-v4r3.ts' as const;
export const SEALED_HOLDOUT_PILOT_LIVE_SCRIPT_PATH_V4R3 =
  'scripts/run-editron-v4r3-pilot.ts' as const;

export interface SealedHoldoutPilotLiveOperatorReceiptV4R3 {
  version: typeof SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_VERSION_V4R3;
  authority: 'ONE_NON_SCORED_PILOT_PER_HEALTHY_ROUTE_NO_RETRY';
  runId: string;
  operatorId: string;
  completedAt: string;
  implementationCommitSha: string;
  manifestSha256: string;
  readinessReceiptSha256: string;
  routeHealthReceiptSha256: string;
  authorizationSha256: string;
  pilotRunReceiptSha256: string;
  availableRouteIds: readonly string[];
  unavailableRouteIds: readonly string[];
  attemptIntentSha256s: readonly string[];
  completedAttemptSha256s: readonly string[];
  providerInferenceCalls: number;
  networkCalls: Readonly<{ modelMetadataGets: 3; inferenceCalls: number }>;
  accountedCostNanoUsd: number;
  billedMicroUsd: number;
  maximumAttemptsPerRow: 1;
  automaticRetry: false;
  scoredRowsExecuted: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
  assessment: 'PILOT_EXECUTED_NOT_SCORED_POST_RUN_AUDIT_REQUIRED';
  receiptSha256: string;
}

export async function runSealedHoldoutPilotLiveOperatorV4R3(input: Readonly<{
  rootDir?: string;
  outputRoot: string;
  operatorId: string;
  executeConfirmation: typeof SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}>): Promise<Readonly<SealedHoldoutPilotLiveOperatorReceiptV4R3>> {
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const outputRoot = assertOutputRoot(rootDir, input.outputRoot);
  const runId = path.basename(outputRoot);
  let outputCreated = false;
  const intentSha256s: string[] = [];
  const completedSha256s: string[] = [];
  try {
    await mkdir(path.dirname(outputRoot), { recursive: true });
    await mkdir(outputRoot, { recursive: false });
    outputCreated = true;
    await mkdir(path.join(outputRoot, 'attempts'), { recursive: false });
    await writeJson(path.join(outputRoot, 'run-start.json'), {
      version: SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_VERSION_V4R3,
      authority: 'WRITE_AHEAD_LIVE_PILOT_START_NO_INFERENCE_YET',
      runId, operatorId: input.operatorId,
      confirmationSha256: hashCanonicalJsonV1(input.executeConfirmation),
      absoluteMaxSpendUsd: '3.000000', automaticRetry: false,
    });

    const baseManifest = buildSealedHoldoutCohortManifestV2R(
      await fileSha(rootDir, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
    );
    const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
      contractSourceSha256: await fileSha(rootDir, SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
      baseManifest,
    });
    const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
      contractSourceSha256: await fileSha(rootDir, SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
      baseManifest, predecessorManifest,
    });
    const readiness = await issueSealedHoldoutNoSpendReadinessV4R3({
      manifest, baseManifest, predecessorManifest, rootDir,
    });
    await Promise.all([
      writeJson(path.join(outputRoot, 'base-manifest.json'), baseManifest),
      writeJson(path.join(outputRoot, 'predecessor-manifest.json'), predecessorManifest),
      writeJson(path.join(outputRoot, 'manifest.json'), manifest),
      writeJson(path.join(outputRoot, 'readiness.json'), readiness),
    ]);

    const routeHealth = await preflightSealedHoldoutRouteHealthV4R3({
      manifest, baseManifest, predecessorManifest, environment: input.environment,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      now: input.now,
    });
    await writeJson(path.join(outputRoot, 'route-health.json'), routeHealth);
    const approvedAt = canonicalNow(input.now);
    const expiresAt = authorizationExpiry(approvedAt, routeHealth.expiresAt);
    const authorization = await issueSealedHoldoutPilotAuthorizationV4R3({
      manifest, baseManifest, predecessorManifest, readiness, routeHealth,
      now: approvedAt, rootDir,
      approval: {
        operatorId: input.operatorId, approvedAt, expiresAt,
        confirmedManifestSha256: manifest.manifestSha256,
        confirmedReadinessReceiptSha256: readiness.receiptSha256,
        confirmedRouteHealthReceiptSha256: routeHealth.receiptSha256,
        confirmedPilotRowSetSha256: manifest.pilotRowSetSha256,
        executeConfirmation: input.executeConfirmation,
        confirmedMaxSpendUsd: '3.000000',
      },
    });
    await writeJson(path.join(outputRoot, 'authorization.json'), authorization);
    const auditOwner = filesystemAuditOwner({ outputRoot, input,
      intentSha256s, completedSha256s });
    const executionPort = createSealedHoldoutPilotLiveExecutionPortV4R3({
      manifest, baseManifest, predecessorManifest, environment: input.environment,
      auditOwner, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      now: () => canonicalNow(input.now),
    });
    const runReceipt = await runSealedHoldoutPilotV4R3({
      manifest, baseManifest, predecessorManifest, readiness, routeHealth,
      authorization, executionPort, now: approvedAt,
      currentTime: () => canonicalNow(input.now), rootDir,
    });
    await writeJson(path.join(outputRoot, 'pilot-run-receipt.json'), runReceipt);
    const receipt = operatorReceipt({ input, runId, manifestSha256: manifest.manifestSha256,
      readinessSha256: readiness.receiptSha256, routeHealth, authorizationSha256:
      authorization.authorizationSha256, runReceipt, intentSha256s, completedSha256s });
    assertSealedHoldoutPilotNoSecretsV4R3(receipt, input.environment);
    await writeJson(path.join(outputRoot, 'operator-receipt.json'), receipt);
    return receipt;
  } catch (error) {
    if (outputCreated) await writeFailure(outputRoot, runId, error).catch(() => undefined);
    throw error;
  }
}

function filesystemAuditOwner(input: Readonly<{
  outputRoot: string;
  input: Readonly<{ environment: Readonly<Record<string, string | undefined>> }>;
  intentSha256s: string[];
  completedSha256s: string[];
}>): Readonly<SealedHoldoutPilotLiveAuditOwnerV4R3> {
  const intents = new Map<string, Readonly<SealedHoldoutPilotAttemptIntentV4R3>>();
  return {
    commitAttemptIntent: async (intent) => {
      if (intents.has(intent.rowId)) fail('DUPLICATE_ATTEMPT_INTENT');
      assertSealedHoldoutPilotNoSecretsV4R3(intent, input.input.environment);
      await writeJson(attemptPath(input.outputRoot, intent.rowId, 'intent'), intent);
      intents.set(intent.rowId, intent); input.intentSha256s.push(intent.intentSha256);
    },
    commitCompletedAttempt: async (receipt) => {
      const intent = intents.get(receipt.portResult.rowId);
      if (!intent || receipt.intentSha256 !== intent.intentSha256) fail('AUDIT_INTENT_MISMATCH');
      assertSealedHoldoutPilotNoSecretsV4R3(receipt, input.input.environment);
      await writeJson(attemptPath(input.outputRoot, receipt.portResult.rowId, 'completed'), receipt);
      input.completedSha256s.push(receipt.receiptSha256);
    },
  };
}

function operatorReceipt(input: Readonly<{
  input: Readonly<{ operatorId: string; environment: Readonly<Record<string, string | undefined>>;
    now?: () => Date }>;
  runId: string; manifestSha256: string; readinessSha256: string;
  routeHealth: Readonly<{ receiptSha256: string; availableRouteIds: readonly string[];
    unavailableRouteIds: readonly string[] }>;
  authorizationSha256: string; runReceipt: Readonly<SealedHoldoutPilotRunReceiptV4R3>;
  intentSha256s: readonly string[]; completedSha256s: readonly string[];
}>): Readonly<SealedHoldoutPilotLiveOperatorReceiptV4R3> {
  const accountedCostNanoUsd = input.runReceipt.results.reduce(
    (sum, result) => sum + result.accountedCostNanoUsd, 0,
  );
  const implementationCommitSha = input.runReceipt.executableClosure.sourceControl.headSha;
  if (!implementationCommitSha || input.intentSha256s.length !== input.runReceipt.results.length
    || input.completedSha256s.length !== input.runReceipt.results.length) fail('AUDIT_SET_INCOMPLETE');
  const material = {
    version: SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_VERSION_V4R3,
    authority: 'ONE_NON_SCORED_PILOT_PER_HEALTHY_ROUTE_NO_RETRY' as const,
    runId: input.runId, operatorId: input.input.operatorId,
    completedAt: canonicalNow(input.input.now), implementationCommitSha,
    manifestSha256: input.manifestSha256, readinessReceiptSha256: input.readinessSha256,
    routeHealthReceiptSha256: input.routeHealth.receiptSha256,
    authorizationSha256: input.authorizationSha256,
    pilotRunReceiptSha256: input.runReceipt.receiptSha256,
    availableRouteIds: input.routeHealth.availableRouteIds,
    unavailableRouteIds: input.routeHealth.unavailableRouteIds,
    attemptIntentSha256s: input.intentSha256s,
    completedAttemptSha256s: input.completedSha256s,
    providerInferenceCalls: input.runReceipt.providerInferenceCalls,
    networkCalls: { modelMetadataGets: 3 as const,
      inferenceCalls: input.runReceipt.networkCalls },
    accountedCostNanoUsd, billedMicroUsd: input.runReceipt.billedMicroUsd,
    maximumAttemptsPerRow: 1 as const, automaticRetry: false as const,
    scoredRowsExecuted: 0 as const, projectReads: 0 as const,
    projectMutations: 0 as const, mediaWrites: 0 as const,
    secretsPersisted: false as const, stateEffects: [] as const,
    assessment: 'PILOT_EXECUTED_NOT_SCORED_POST_RUN_AUDIT_REQUIRED' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertOutputRoot(rootDir: string, candidate: string): string {
  const allowed = path.resolve(rootDir, '.calibration-temp', 'editron-v4r3-pilot');
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(`${allowed}${path.sep}`)) fail('OUTPUT_ROOT_OUTSIDE_ALLOWED_DIRECTORY');
  return resolved;
}
function authorizationExpiry(approvedAt: string, healthExpiresAt: string): string {
  const expires = Math.min(Date.parse(approvedAt) + 4 * 60_000, Date.parse(healthExpiresAt) - 1_000);
  if (!Number.isFinite(expires) || expires <= Date.parse(approvedAt)) fail('HEALTH_WINDOW_TOO_SHORT');
  return new Date(expires).toISOString();
}
function canonicalNow(now?: () => Date): string {
  const value = now?.() ?? new Date();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('CLOCK_INVALID');
  return value.toISOString();
}
function attemptPath(root: string, rowId: string, kind: 'intent' | 'completed'): string {
  const safe = rowId.replace(/[^A-Za-z0-9._-]/gu, '_');
  return path.join(root, 'attempts', `${safe}.${kind}.json`);
}
async function fileSha(root: string, file: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}
async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  });
}
async function writeFailure(root: string, runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await writeJson(path.join(root, 'pilot-failure.json'), {
    version: SEALED_HOLDOUT_PILOT_LIVE_OPERATOR_VERSION_V4R3,
    authority: 'NON_SCORED_PILOT_FAILURE_NO_RETRY', runId,
    failedAt: new Date().toISOString(), failureCode: safeFailureCode(message),
    errorSha256: hashCanonicalJsonV1({ name: error instanceof Error ? error.name : 'Error', message }),
    automaticRetry: false, stateEffects: [],
  });
}
function safeFailureCode(message: string): string {
  return /^[A-Z0-9_:.-]{1,200}$/u.test(message) ? message : 'UNCLASSIFIED_FAILURE';
}
function fail(code: string): never { throw new Error(`SEALED_V4R3_PILOT_OPERATOR_${code}`); }
