import { computeExecutableImportClosureV1 }
  from '../../services/executable-import-closure-v1';
import type { ExecutableImportClosureReceiptV1 }
  from '../../services/executable-import-closure-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { NoSpendLaneIntegrityReceiptV2 }
  from './no-spend-lane-integrity-receipt-v2';
import {
  assertSealedHoldoutPilotAuthorizationV4R3,
  type SealedHoldoutPilotAuthorizationV4R3,
  type SealedHoldoutPilotAuthorizedRowV4R3,
} from './sealed-holdout-pilot-authorization-v4r3';
import type { SealedHoldoutCohortManifestV2R }
  from './sealed-holdout-cohort-v2r';
import type { SealedHoldoutGeneralisationManifestV4R2 }
  from './sealed-holdout-generalisation-cohort-v4r2';
import type { SealedHoldoutGeneralisationManifestV4R3 }
  from './sealed-holdout-generalisation-cohort-v4r3';
import type { SealedHoldoutRouteHealthReceiptV4R3 }
  from './sealed-holdout-route-health-v4r3';

export const SEALED_HOLDOUT_PILOT_RUNNER_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_PILOT_RUNNER_V4R3_2_LIVE_ADAPTER_BOUND' as const;
export const SEALED_HOLDOUT_PILOT_RUNNER_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-runner-v4r3.ts' as const;
export const SEALED_HOLDOUT_PILOT_RUNNER_ROOTS_V4R3 = Object.freeze([
  SEALED_HOLDOUT_PILOT_RUNNER_PATH_V4R3,
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-adapter-v4r3.ts',
] as const);

export interface SealedHoldoutPilotPortResultV4R3 {
  rowId: string;
  routeId: string;
  provider: string;
  requestedModel: string;
  returnedModelIdentity: string;
  rowAuthorizationSha256: string;
  requestSha256: string;
  responseSha256: string;
  transportReceiptSha256: string;
  providerUsageSha256: string;
  accountedCostNanoUsd: number;
  accountingBasis: 'PROVIDER_REPORTED_USAGE_X_FROZEN_ROUTE_PRICE';
  accountingReceiptSha256: string;
  episodeReceiptSha256: string;
  transcriptSha256: string;
  terminalDisposition: string;
  selectedOperatorIds: readonly string[];
  providerAttemptCount: 1;
  inferenceCalls: 1;
  networkCalls: 1;
  billedMicroUsd: number;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
}

export interface SealedHoldoutPilotExecutionPortV4R3 {
  authority: 'PROVIDER_NATIVE_LIVE_TRANSPORT_RECEIPT_REQUIRED';
  execute(input: Readonly<{
    row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3>;
    manifestSha256: string;
    authorizationSha256: string;
    maximumProviderAttempts: 1;
    automaticRetry: false;
  }>): Promise<Readonly<SealedHoldoutPilotPortResultV4R3>>;
}

export interface SealedHoldoutPilotRunReceiptV4R3 {
  version: typeof SEALED_HOLDOUT_PILOT_RUNNER_VERSION_V4R3;
  authority: 'RESEARCH_CAPPED_PILOT_RECEIPT_NO_PROJECT_OR_MEDIA_AUTHORITY';
  manifestSha256: string;
  authorizationSha256: string;
  readinessReceiptSha256: string;
  routeHealthReceiptSha256: string;
  executableClosure: Readonly<ExecutableImportClosureReceiptV1>;
  results: readonly Readonly<SealedHoldoutPilotPortResultV4R3>[];
  resultSetSha256: string;
  providerInferenceCalls: number;
  networkCalls: number;
  billedMicroUsd: number;
  maximumAttemptsPerRow: 1;
  automaticRetry: false;
  scoredRowsExecuted: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
  assessment: 'PILOT_EXECUTED_NOT_SCORED_AUDIT_REQUIRED';
  receiptSha256: string;
}

export async function runSealedHoldoutPilotV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  readiness: Readonly<NoSpendLaneIntegrityReceiptV2>;
  routeHealth: Readonly<SealedHoldoutRouteHealthReceiptV4R3>;
  authorization: Readonly<SealedHoldoutPilotAuthorizationV4R3>;
  executionPort: Readonly<SealedHoldoutPilotExecutionPortV4R3>;
  now: string;
  currentTime?: () => string;
  rootDir?: string;
}>): Promise<Readonly<SealedHoldoutPilotRunReceiptV4R3>> {
  const authorization = await assertSealedHoldoutPilotAuthorizationV4R3({
    manifest: input.manifest, baseManifest: input.baseManifest,
    predecessorManifest: input.predecessorManifest, readiness: input.readiness,
    routeHealth: input.routeHealth, authorization: input.authorization,
    now: input.now, rootDir: input.rootDir,
  });
  if (input.executionPort.authority !== 'PROVIDER_NATIVE_LIVE_TRANSPORT_RECEIPT_REQUIRED') {
    fail('EXECUTION_PORT_AUTHORITY_INVALID');
  }
  const executableClosure = computeExecutableImportClosureV1({
    rootDir: input.rootDir, roots: SEALED_HOLDOUT_PILOT_RUNNER_ROOTS_V4R3,
    mode: 'verification', strictGit: true,
  });
  const results: SealedHoldoutPilotPortResultV4R3[] = [];
  for (const row of authorization.authorizedRows) {
    await assertSealedHoldoutPilotAuthorizationV4R3({
      manifest: input.manifest, baseManifest: input.baseManifest,
      predecessorManifest: input.predecessorManifest, readiness: input.readiness,
      routeHealth: input.routeHealth, authorization,
      now: input.currentTime?.() ?? input.now, rootDir: input.rootDir,
    });
    const result = await input.executionPort.execute({ row,
      manifestSha256: authorization.manifestSha256,
      authorizationSha256: authorization.authorizationSha256,
      maximumProviderAttempts: 1, automaticRetry: false });
    assertPortResult(row, result);
    results.push(result);
  }
  const billedMicroUsd = results.reduce((sum, result) => sum + result.billedMicroUsd, 0);
  if (billedMicroUsd > authorization.limits.absoluteMaxSpendMicroUsd) fail('SPEND_CAP_EXCEEDED');
  const material = {
    version: SEALED_HOLDOUT_PILOT_RUNNER_VERSION_V4R3,
    authority: 'RESEARCH_CAPPED_PILOT_RECEIPT_NO_PROJECT_OR_MEDIA_AUTHORITY' as const,
    manifestSha256: authorization.manifestSha256,
    authorizationSha256: authorization.authorizationSha256,
    readinessReceiptSha256: input.readiness.receiptSha256,
    routeHealthReceiptSha256: input.routeHealth.receiptSha256,
    executableClosure, results,
    resultSetSha256: hashCanonicalJsonV1(results),
    providerInferenceCalls: results.length, networkCalls: results.length, billedMicroUsd,
    maximumAttemptsPerRow: 1 as const, automaticRetry: false as const,
    scoredRowsExecuted: 0 as const, projectReads: 0 as const, projectMutations: 0 as const,
    mediaWrites: 0 as const, secretsPersisted: false as const, stateEffects: [] as const,
    assessment: 'PILOT_EXECUTED_NOT_SCORED_AUDIT_REQUIRED' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertPortResult(row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3>,
  result: Readonly<SealedHoldoutPilotPortResultV4R3>): void {
  if (result.rowId !== row.rowId || result.routeId !== row.routeId
    || result.provider !== row.provider || result.requestedModel !== row.requestedModel
    || result.returnedModelIdentity !== row.confirmedReturnedModelIdentity
    || result.rowAuthorizationSha256 !== row.rowAuthorizationSha256
    || ![result.requestSha256, result.responseSha256,
      result.transportReceiptSha256, result.providerUsageSha256,
      result.accountingReceiptSha256, result.episodeReceiptSha256,
      result.transcriptSha256].every(isSha)
    || result.providerAttemptCount !== 1 || result.inferenceCalls !== 1
    || result.networkCalls !== 1 || !Number.isSafeInteger(result.billedMicroUsd)
    || !Number.isSafeInteger(result.accountedCostNanoUsd)
    || result.accountedCostNanoUsd < 0
    || result.billedMicroUsd !== Math.ceil(result.accountedCostNanoUsd / 1_000)
    || result.accountingBasis !== 'PROVIDER_REPORTED_USAGE_X_FROZEN_ROUTE_PRICE'
    || result.accountingReceiptSha256 !== hashCanonicalJsonV1({
      requestSha256: result.requestSha256,
      responseSha256: result.responseSha256,
      providerUsageSha256: result.providerUsageSha256,
      accountedCostNanoUsd: result.accountedCostNanoUsd,
      accountingBasis: result.accountingBasis,
    })
    || !result.terminalDisposition.trim()
    || !Array.isArray(result.selectedOperatorIds)
    || result.selectedOperatorIds.some((operatorId) =>
      typeof operatorId !== 'string' || !operatorId.trim())
    || new Set(result.selectedOperatorIds).size !== result.selectedOperatorIds.length
    || result.billedMicroUsd < 0
    || result.billedMicroUsd > row.absoluteMaxRowSpendMicroUsd
    || result.projectReads !== 0 || result.projectMutations !== 0 || result.mediaWrites !== 0
    || result.secretsPersisted !== false || !Array.isArray(result.stateEffects)
    || result.stateEffects.length !== 0) fail(`PORT_RESULT_INVALID:${row.rowId}`);
}
function isSha(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function fail(code: string): never { throw new Error(`SEALED_V4R3_PILOT_RUNNER_${code}`); }
