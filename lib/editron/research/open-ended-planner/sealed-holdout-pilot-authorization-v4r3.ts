import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildNoSpendPilotPolicyV1,
} from './no-spend-readiness-policy-v1';
import type { NoSpendLaneIntegrityReceiptV2 }
  from './no-spend-lane-integrity-receipt-v2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  type SealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';
import {
  assertSealedHoldoutGeneralisationManifestV4R3,
  type SealedHoldoutGeneralisationManifestV4R3,
} from './sealed-holdout-generalisation-cohort-v4r3';
import {
  assertCurrentSealedHoldoutNoSpendReadinessV4R3,
} from './sealed-holdout-no-spend-readiness-v4r3';
import {
  assertFreshSealedHoldoutRouteHealthReceiptV4R3,
  type SealedHoldoutRouteHealthReceiptV4R3,
} from './sealed-holdout-route-health-v4r3';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_PILOT_AUTHORIZATION_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_PILOT_AUTHORIZATION_V4R3_1' as const;
export const SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3 =
  'CONFIRM V4R3 ONE NON-SCORED PILOT PER HEALTHY ROUTE MAX $3.000000 NO RETRY' as const;
export const SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3 = 3_000_000;

export interface SealedHoldoutPilotApprovalV4R3 {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedManifestSha256: string;
  confirmedReadinessReceiptSha256: string;
  confirmedRouteHealthReceiptSha256: string;
  confirmedPilotRowSetSha256: string;
  executeConfirmation: typeof SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3;
  confirmedMaxSpendUsd: '3.000000';
}

export interface SealedHoldoutPilotAuthorizedRowV4R3 {
  rowId: string;
  routeId: string;
  provider: string;
  requestedModel: string;
  confirmedReturnedModelIdentity: string;
  rowPlanSha256: string;
  absoluteMaxRowSpendMicroUsd: number;
  rowAuthorizationSha256: string;
}

export interface SealedHoldoutPilotAuthorizationV4R3 {
  version: typeof SEALED_HOLDOUT_PILOT_AUTHORIZATION_VERSION_V4R3;
  authority: 'EXPLICIT_CAPPED_RESEARCH_PILOT_NO_PROJECT_OR_MEDIA_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  manifestSha256: string;
  readinessReceiptSha256: string;
  routeHealthReceiptSha256: string;
  pilotRowSetSha256: string;
  pilotPolicySha256: string;
  authorizedRows: readonly Readonly<SealedHoldoutPilotAuthorizedRowV4R3>[];
  authorizedRowsSha256: string;
  limits: Readonly<{
    maximumProviderInferenceCalls: number;
    maximumAttemptsPerRow: 1;
    automaticRetry: false;
    absoluteMaxSpendMicroUsd: typeof SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3;
  }>;
  networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  mediaWritesAuthorized: 0;
  scoredRowsAuthorized: 0;
  stateEffects: readonly [];
  authorizationSha256: string;
}

interface ContextV4R3 {
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  readiness: Readonly<NoSpendLaneIntegrityReceiptV2>;
  routeHealth: Readonly<SealedHoldoutRouteHealthReceiptV4R3>;
  now: string;
  rootDir?: string;
}

export async function issueSealedHoldoutPilotAuthorizationV4R3(input: Readonly<
  ContextV4R3 & { approval: Readonly<SealedHoldoutPilotApprovalV4R3> }
>): Promise<Readonly<SealedHoldoutPilotAuthorizationV4R3>> {
  const context = await currentContext(input);
  assertApproval(context, input.approval);
  const built = buildAuthorization(context, input.approval);
  return assertSealedHoldoutPilotAuthorizationV4R3({
    ...context, authorization: built,
  });
}

export async function assertSealedHoldoutPilotAuthorizationV4R3(input: Readonly<
  ContextV4R3 & { authorization: unknown }
>): Promise<Readonly<SealedHoldoutPilotAuthorizationV4R3>> {
  const context = await currentContext(input);
  if (!isRecord(input.authorization)) fail('AUTHORIZATION_MISSING');
  const candidate = input.authorization as unknown as SealedHoldoutPilotAuthorizationV4R3;
  const { authorizationSha256, ...material } = candidate;
  const expectedRows = authorizedRows(context);
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt, context.now,
    context.routeHealth.expiresAt);
  if (candidate.version !== SEALED_HOLDOUT_PILOT_AUTHORIZATION_VERSION_V4R3
    || candidate.authority !== 'EXPLICIT_CAPPED_RESEARCH_PILOT_NO_PROJECT_OR_MEDIA_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/u.test(candidate.operatorId)
    || candidate.manifestSha256 !== context.manifest.manifestSha256
    || candidate.readinessReceiptSha256 !== context.readiness.receiptSha256
    || candidate.routeHealthReceiptSha256 !== context.routeHealth.receiptSha256
    || candidate.pilotRowSetSha256 !== context.manifest.pilotRowSetSha256
    || candidate.pilotPolicySha256 !== pilotPolicy(context.manifest).policySha256
    || hashCanonicalJsonV1(candidate.authorizedRows) !== hashCanonicalJsonV1(expectedRows)
    || candidate.authorizedRowsSha256 !== hashCanonicalJsonV1(expectedRows)
    || hashCanonicalJsonV1(candidate.limits) !== hashCanonicalJsonV1({
      maximumProviderInferenceCalls: expectedRows.length,
      maximumAttemptsPerRow: 1, automaticRetry: false,
      absoluteMaxSpendMicroUsd: SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3,
    })
    || candidate.networkPolicy !== 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || candidate.mediaWritesAuthorized !== 0 || candidate.scoredRowsAuthorized !== 0
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) fail('AUTHORIZATION_INVALID');
  return deepFreezeV1(structuredClone(candidate));
}

async function currentContext(input: Readonly<ContextV4R3>): Promise<Readonly<ContextV4R3>> {
  const baseManifest = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessorManifest = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest, baseManifest,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest, baseManifest, predecessorManifest,
  });
  const readiness = await assertCurrentSealedHoldoutNoSpendReadinessV4R3({
    value: input.readiness, manifest, baseManifest, predecessorManifest, rootDir: input.rootDir,
  });
  const routeHealth = assertFreshSealedHoldoutRouteHealthReceiptV4R3({
    value: input.routeHealth, manifest, baseManifest, predecessorManifest, now: input.now,
  });
  if (!routeHealth.availableRouteIds.length) fail('NO_HEALTHY_ROUTE');
  return { manifest, baseManifest, predecessorManifest, readiness, routeHealth,
    now: input.now, rootDir: input.rootDir };
}

function buildAuthorization(context: Readonly<ContextV4R3>, approval: SealedHoldoutPilotApprovalV4R3) {
  const rows = authorizedRows(context);
  const policy = pilotPolicy(context.manifest);
  const material = {
    version: SEALED_HOLDOUT_PILOT_AUTHORIZATION_VERSION_V4R3,
    authority: 'EXPLICIT_CAPPED_RESEARCH_PILOT_NO_PROJECT_OR_MEDIA_AUTHORITY' as const,
    operatorId: approval.operatorId, approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt, manifestSha256: context.manifest.manifestSha256,
    readinessReceiptSha256: context.readiness.receiptSha256,
    routeHealthReceiptSha256: context.routeHealth.receiptSha256,
    pilotRowSetSha256: context.manifest.pilotRowSetSha256,
    pilotPolicySha256: policy.policySha256, authorizedRows: rows,
    authorizedRowsSha256: hashCanonicalJsonV1(rows),
    limits: { maximumProviderInferenceCalls: rows.length, maximumAttemptsPerRow: 1 as const,
      automaticRetry: false as const,
      absoluteMaxSpendMicroUsd: SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3 },
    networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY' as const,
    projectReadsAuthorized: 0 as const, projectMutationsAuthorized: 0 as const,
    mediaWritesAuthorized: 0 as const, scoredRowsAuthorized: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, authorizationSha256: hashCanonicalJsonV1(material) });
}

function authorizedRows(context: Readonly<ContextV4R3>): SealedHoldoutPilotAuthorizedRowV4R3[] {
  const available = new Set(context.routeHealth.availableRouteIds);
  const rows = context.manifest.pilotRows.filter((row) =>
    available.has(text(record(row.route).routeId)));
  const share = Math.floor(SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3 / rows.length);
  let remaining = SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3;
  return rows.map((row, index) => {
    const route = record(row.route);
    const health = context.routeHealth.routeHealth.find(({ routeId }) => routeId === route.routeId)
      ?? fail('HEALTHY_ROUTE_BINDING_MISSING');
    const absoluteMaxRowSpendMicroUsd = index === rows.length - 1 ? remaining : share;
    remaining -= absoluteMaxRowSpendMicroUsd;
    const material = { rowId: text(row.rowId), routeId: text(route.routeId),
      provider: text(route.provider), requestedModel: text(route.model),
      confirmedReturnedModelIdentity: health.returnedModelIdentity ?? '',
      rowPlanSha256: text(row.rowPlanSha256), absoluteMaxRowSpendMicroUsd };
    if (!material.rowId || !material.provider || !material.requestedModel
      || !material.confirmedReturnedModelIdentity || !isSha(material.rowPlanSha256)
      || row.stage !== 'PILOT') fail('AUTHORIZED_ROW_INVALID');
    return { ...material, rowAuthorizationSha256: hashCanonicalJsonV1(material) };
  });
}

function pilotPolicy(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>) {
  const routes = manifest.routeSet.map((route) => text(route.routeId));
  const mapRow = (row: Readonly<JsonRecord>) => ({
    rowId: text(row.rowId), routeId: text(record(row.route).routeId),
  });
  return buildNoSpendPilotPolicyV1({ providerRouteIds: routes,
    pilotRows: manifest.pilotRows.map(mapRow), scoredRows: manifest.scoredRows.map(mapRow),
    absoluteMaxPilotSpendMicroUsd: SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3,
    absoluteMaxScoredCohortSpendMicroUsd: SEALED_HOLDOUT_PILOT_MAX_SPEND_MICRO_USD_V4R3,
    pilotAuditReceiptSha256: null });
}

function assertApproval(context: Readonly<ContextV4R3>, approval: SealedHoldoutPilotApprovalV4R3) {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt,
    context.routeHealth.expiresAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(approval.operatorId)
    || approval.confirmedManifestSha256 !== context.manifest.manifestSha256
    || approval.confirmedReadinessReceiptSha256 !== context.readiness.receiptSha256
    || approval.confirmedRouteHealthReceiptSha256 !== context.routeHealth.receiptSha256
    || approval.confirmedPilotRowSetSha256 !== context.manifest.pilotRowSetSha256
    || approval.executeConfirmation !== SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3
    || approval.confirmedMaxSpendUsd !== '3.000000') fail('APPROVAL_INVALID');
}
function assertTimeWindow(approvedAt: string, expiresAt: string, now: string,
  healthExpiresAt: string) {
  const approved = timestamp(approvedAt); const expires = timestamp(expiresAt);
  const current = timestamp(now); const healthExpires = timestamp(healthExpiresAt);
  if (expires <= approved || current < approved || current >= expires || expires > healthExpires) {
    fail('AUTHORIZATION_EXPIRED');
  }
}
function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('TIME_INVALID');
  return parsed;
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/u.test(value); }
function fail(code: string): never { throw new Error(`SEALED_V4R3_PILOT_AUTH_${code}`); }
