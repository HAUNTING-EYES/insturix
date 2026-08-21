import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_PREFLIGHT_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PREFLIGHT_V2R_1' as const;

export interface SealedHoldoutPreflightReceiptV2R {
  version: typeof SEALED_HOLDOUT_PREFLIGHT_VERSION_V2R;
  authority: 'RESEARCH_PREFLIGHT_NO_NETWORK_NO_INFERENCE_NO_PROJECT_ACCESS';
  manifestSha256: string;
  mediaManifestSha256: string;
  taskCount: 8;
  caseCount: 16;
  operatorCount: 40;
  callableOperatorCount: 33;
  nonCallableOperatorCount: 7;
  checks: readonly Readonly<JsonRecord>[];
  networkCalls: 0;
  inferenceCalls: 0;
  projectReads: 0;
  projectMutations: 0;
  dispatchAuthorized: false;
  assessment: 'PASS_READY_FOR_CREDENTIAL_PREFLIGHT';
  receiptSha256: string;
}

export function preflightSealedHoldoutCohortV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
}): Readonly<SealedHoldoutPreflightReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  assertMediaIdentity(manifest, input.mediaManifest);
  const shared = record(manifest.sharedModelContext);
  const operatorCatalog = record(shared.operatorCatalog);
  const operators = records(operatorCatalog.operators);
  const callable = strings(shared.callableOperatorIds);
  const unavailable = strings(shared.unavailableOperatorIds);
  if (operators.length !== 40 || callable.length !== 33 || unavailable.length !== 7) {
    fail('HOLDOUT_PREFLIGHT_OPERATOR_COVERAGE_INVALID');
  }
  const checks = manifest.cases.map((entry) => {
    const providerMaterial = { sharedModelContext: manifest.sharedModelContext, case: entry.publicCase };
    assertNoEvaluatorLeakV2(providerMaterial);
    const serialized = JSON.stringify(providerMaterial);
    const sourceConditionId = text(record(entry.ownerOnly).sourceConditionId);
    if (!sourceConditionId || serialized.includes(sourceConditionId)) {
      fail(`HOLDOUT_PREFLIGHT_CONDITION_LEAK:${entry.caseId}`);
    }
    if (serialized.includes(entry.ownerOnlySha256) || serialized.includes(entry.evaluatorOnlySha256)) {
      fail(`HOLDOUT_PREFLIGHT_PRIVATE_HASH_LEAK:${entry.caseId}`);
    }
    return deepFreezeV1({
      caseId: entry.caseId,
      publicRequestSha256: hashCanonicalJsonV1(providerMaterial),
      ownerEvidenceBoundSha256: entry.ownerOnlySha256,
      evaluatorPolicyBoundSha256: entry.evaluatorOnlySha256,
      publicPrivateSeparation: 'PASS',
      sharedToolContextEqual: record(entry.publicCase).sharedModelContextSha256
        === manifest.sharedModelContextSha256,
    });
  });
  if (checks.some((check) => check.sharedToolContextEqual !== true)) {
    fail('HOLDOUT_PREFLIGHT_TOOL_CONTEXT_DRIFT');
  }
  const material = {
    version: SEALED_HOLDOUT_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_PREFLIGHT_NO_NETWORK_NO_INFERENCE_NO_PROJECT_ACCESS' as const,
    manifestSha256: manifest.manifestSha256,
    mediaManifestSha256: input.mediaManifest.manifestSha256,
    taskCount: 8 as const,
    caseCount: 16 as const,
    operatorCount: 40 as const,
    callableOperatorCount: 33 as const,
    nonCallableOperatorCount: 7 as const,
    checks,
    networkCalls: 0 as const,
    inferenceCalls: 0 as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_READY_FOR_CREDENTIAL_PREFLIGHT' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertMediaIdentity(
  cohort: Readonly<SealedHoldoutCohortManifestV2R>,
  media: Readonly<HoldoutMediaManifestV2R>,
): void {
  const identity = record(cohort.mediaIdentity);
  if (media.version !== identity.manifestVersion
    || media.manifestSha256 !== identity.manifestSha256
    || media.artifacts.length !== identity.artifactCount
    || new Set(media.artifacts.map(({ taskId }) => taskId)).size !== identity.taskCount) {
    fail('HOLDOUT_PREFLIGHT_MEDIA_MANIFEST_DRIFT');
  }
  const expected = record(identity.artifactSha256ById);
  for (const artifact of media.artifacts) {
    if (artifact.artifactSha256 !== expected[artifact.assetId]) {
      fail(`HOLDOUT_PREFLIGHT_MEDIA_ARTIFACT_DRIFT:${artifact.assetId}`);
    }
  }
}

function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
