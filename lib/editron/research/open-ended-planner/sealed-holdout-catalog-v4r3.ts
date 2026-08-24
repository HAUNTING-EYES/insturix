import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2,
  assertSealedHoldoutOperationEvidenceV4R2,
  resolveExactHoldoutTranscriptCutRangeV4R2,
  sealedHoldoutOperatorCatalogIdentityV4R2,
} from './sealed-holdout-catalog-v4r2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCaseV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  authorizeSealedHoldoutH04CutPlanV4R3,
  type SealedHoldoutH04CutPlanAuthorizationV4R3,
} from './sealed-holdout-h04-cut-plan-v4r3';
import type { SealedHoldoutOwnerSemanticPolicyV2R }
  from './sealed-holdout-owner-session-v2r';

type JsonRecord = Record<string, unknown>;
type FrameRange = Readonly<{ startFrame: number; endFrame: number }>;
type OperationEvidenceInput = Parameters<NonNullable<
  SealedHoldoutOwnerSemanticPolicyV2R['assertOperationEvidence']
>>[0];
type TranscriptResolverInput = Parameters<NonNullable<
  SealedHoldoutOwnerSemanticPolicyV2R['resolveTranscriptEdit']
>>[0];

export { authorizeSealedHoldoutH04CutPlanV4R3 };
export type { SealedHoldoutH04CutPlanAuthorizationV4R3 };

export const SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3_1' as const;
export const SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R3_1' as const;
export const SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R3_1' as const;

export const SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R3 = deepFreezeV1({
  version: SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_VERSION_V4R3,
  authority: 'PUBLIC_PRE_EXECUTION_EVIDENCE_AND_EFFECT_POLICY_NO_CREATIVE_LOWERING' as const,
  predecessor: sealedHoldoutOperatorCatalogIdentityV4R2(),
  addedRules: [
    {
      operationClass: 'SOURCE_WINDOW_PLACEMENT_MUTATION',
      requirement:
        'The owner-resolved asset role, source window and equal target/source duration must validate before each placement mutation.',
    },
    {
      operationClass: 'PARTITIONED_TRANSCRIPT_RANGE_MUTATION',
      requirement:
        'The complete ordered cut plan must remove exactly the owner-resolved source range before any constituent timeline-coordinate cut can execute.',
    },
  ],
  missingAmbiguousOrForgedDisposition: 'UNVERIFIABLE' as const,
  fallbackEditAllowed: false as const,
});

const v4r2 = structuredClone(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2) as JsonRecord;
delete v4r2.catalogSha256;
const catalogMaterial: JsonRecord = {
  ...v4r2,
  version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R3,
  catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R3,
  derivedFrom: {
    ...sealedHoldoutOperatorCatalogIdentityV4R2(),
    correctionScope: [
      'H02 asset-scoped source-window pre-execution enforcement',
      'H04 graph-aware source-effect authorization',
    ],
  },
  operationEvidencePolicy: SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R3,
};

export const SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3: Readonly<JsonRecord> =
  deepFreezeV1({
    ...catalogMaterial,
    catalogSha256: hashCanonicalJsonV1(catalogMaterial),
  });

export function sealedHoldoutOperatorCatalogIdentityV4R3(): Readonly<JsonRecord> {
  return deepFreezeV1({
    version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R3,
    catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V4R3,
    catalogSha256: text(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3.catalogSha256),
    derivedFromCatalogSha256:
      text(sealedHoldoutOperatorCatalogIdentityV4R2().catalogSha256),
    operationEvidencePolicySha256:
      hashCanonicalJsonV1(SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R3),
  });
}

export function buildSealedHoldoutOwnerSemanticPolicyV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  h04CutPlanAuthorizations?: readonly Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3>[];
}>): Readonly<SealedHoldoutOwnerSemanticPolicyV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const plans = new Map<string, {
    authorization: Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3>;
    nextCutIndex: number;
  }>();
  for (const candidate of input.h04CutPlanAuthorizations ?? []) {
    const rebuilt = authorizeSealedHoldoutH04CutPlanV4R3({
      manifest,
      caseId: candidate.caseId,
      evidenceRefs: candidate.evidenceRefs,
      currentTimelineCuts: candidate.currentTimelineCuts,
    });
    if (hashCanonicalJsonV1(rebuilt) !== hashCanonicalJsonV1(candidate)) {
      fail('H04_CUT_PLAN_AUTHORIZATION_FORGED');
    }
    plans.set(candidate.authorizationRef, { authorization: candidate, nextCutIndex: 0 });
  }
  return Object.freeze({
    version: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V4R3,
    operatorCatalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3,
    assertOperationEvidence: (operation: OperationEvidenceInput) => {
      if (operation.caseId.startsWith('HOLD-02:')
        && operation.operatorId === 'add_overlay') {
        assertH02Placement(manifest, operation);
        return;
      }
      if (operation.caseId.startsWith('HOLD-04:')
        && operation.operatorId === 'cut_section') {
        assertH04AuthorizedCut(operation, plans);
        return;
      }
      assertSealedHoldoutOperationEvidenceV4R2(operation);
    },
    resolveTranscriptEdit: (resolverInput: TranscriptResolverInput) => {
      if (!resolverInput.caseId.startsWith('HOLD-04:')) return null;
      const expected = resolveExactHoldoutTranscriptCutRangeV4R2(resolverInput.observations);
      const authorization = authorizeSealedHoldoutH04CutPlanV4R3({
        manifest,
        caseId: resolverInput.caseId as 'HOLD-04:C1' | 'HOLD-04:C2',
        evidenceRefs: resolverInput.evidenceRefs,
        currentTimelineCuts: [expected],
      });
      plans.set(authorization.authorizationRef, { authorization, nextCutIndex: 0 });
      return deepFreezeV1({
        targetOperatorId: 'cut_section',
        arguments: {
          projectId: resolverInput.arguments.projectId,
          expectedProjectRevision: resolverInput.currentProjectRevision,
          targetRange: expected,
          evidenceIds: resolverInput.evidenceRefs,
          editPlanRef: authorization.authorizationRef,
        },
      });
    },
  });
}

function assertH02Placement(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  input: OperationEvidenceInput,
): void {
  const taskCase = requiredCase(manifest, input.caseId);
  assertEvidenceBinding(input.observations, input.evidenceRefs);
  const windows = record(requiredObservation(input.observations, 'SOURCE_WINDOWS').value);
  const narrative = record(requiredObservation(input.observations, 'NARRATIVE').value);
  const doorAssetId = text(narrative.requiredCallbackAssetId);
  const mediaIds = records(record(taskCase.publicCase).media)
    .map(({ assetId }) => text(assetId)).filter(Boolean);
  const processAssets = mediaIds.filter((assetId) => assetId !== doorAssetId);
  if (!doorAssetId || doorAssetId === 'UNKNOWN' || processAssets.length !== 1
    || hashCanonicalJsonV1(narrative.requiredOrder)
      !== hashCanonicalJsonV1(['open', 'process', 'close'])) {
    fail('H02_NARRATIVE_EVIDENCE_AMBIGUOUS');
  }
  const assetId = requiredText(input.arguments.assetId, 'H02_ASSET_ID_MISSING');
  const source = frameRange(input.arguments.sourceRange);
  const target = frameRange(input.arguments.targetRange);
  if (source.endFrame - source.startFrame !== target.endFrame - target.startFrame) {
    fail('H02_SOURCE_TARGET_DURATION_MISMATCH');
  }
  const allowed = assetId === doorAssetId
    ? [frameRange(target.startFrame === 0 ? windows.doorOpen : windows.doorClose)]
    : assetId === processAssets[0]
      ? values(windows.process).map(frameRange)
      : fail('H02_ASSET_ROLE_UNRESOLVED');
  if (!allowed.some((range) => contains(range, source))) {
    fail('H02_SOURCE_RANGE_OUTSIDE_OWNER_WINDOW');
  }
}

function assertH04AuthorizedCut(
  input: OperationEvidenceInput,
  plans: Map<string, {
    authorization: Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3>;
    nextCutIndex: number;
  }>,
): void {
  assertEvidenceBinding(input.observations, input.evidenceRefs);
  resolveExactHoldoutTranscriptCutRangeV4R2(input.observations);
  const editPlanRef = requiredText(input.arguments.editPlanRef, 'H04_EDIT_PLAN_REF_REQUIRED');
  const state = plans.get(editPlanRef) ?? fail('H04_EDIT_PLAN_REF_UNKNOWN');
  const expected = state.authorization.currentTimelineCuts[state.nextCutIndex]
    ?? fail('H04_EDIT_PLAN_ALREADY_COMPLETE');
  if (state.authorization.caseId !== input.caseId
    || hashCanonicalJsonV1(state.authorization.evidenceRefs)
      !== hashCanonicalJsonV1(sortedUnique(input.evidenceRefs))
    || hashCanonicalJsonV1(expected) !== hashCanonicalJsonV1(frameRange(input.arguments.targetRange))) {
    fail('H04_EDIT_PLAN_STEP_MISMATCH');
  }
  state.nextCutIndex += 1;
}

function requiredCase(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>, caseId: string,
): Readonly<SealedHoldoutCaseV2R> {
  return manifest.cases.find((entry) => entry.caseId === caseId)
    ?? fail(`CASE_MISSING:${caseId}`);
}
function requiredObservation(observations: readonly JsonRecord[], kind: string): JsonRecord {
  const matches = observations.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) fail(`REQUIRED_KIND_MISSING_OR_DUPLICATED:${kind}`);
  return matches[0];
}
function assertEvidenceBinding(observations: readonly JsonRecord[], refs: readonly string[]): void {
  if (!refs.length || new Set(refs).size !== refs.length || observations.length !== refs.length
    || observations.some(({ evidenceRef }) => !refs.includes(text(evidenceRef)))) {
    fail('REFERENCE_BINDING_INVALID');
  }
}
function frameRange(value: unknown): FrameRange {
  const range = Array.isArray(value)
    ? { startFrame: value[0], endFrame: value[1] } : record(value);
  const startFrame = nonNegativeInteger(range.startFrame, 'RANGE_START_INVALID');
  const endFrame = positiveInteger(range.endFrame, 'RANGE_END_INVALID');
  if (endFrame <= startFrame) fail('RANGE_ORDER_INVALID');
  return { startFrame, endFrame };
}
function contains(outer: FrameRange, inner: FrameRange): boolean {
  return inner.startFrame >= outer.startFrame && inner.endFrame <= outer.endFrame;
}
function sortedUnique(valuesInput: readonly string[]): string[] {
  const result = [...new Set(valuesInput)].sort(compare);
  if (!result.length || result.length !== valuesInput.length) fail('EVIDENCE_REFS_INVALID');
  return result;
}
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function requiredText(value: unknown, code: string): string {
  const result = text(value); if (!result) fail(code); return result;
}
function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(code); return Number(value);
}
function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(code); return Number(value);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(code: string): never { throw new Error(`SEALED_V4R3_EVIDENCE_${code}`); }
