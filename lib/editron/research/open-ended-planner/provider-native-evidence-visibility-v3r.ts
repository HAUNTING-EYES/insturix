import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeEpisodeContextV2R } from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R =
  'EDITRON_PROVIDER_NATIVE_EVIDENCE_VISIBILITY_V3R_2' as const;

export const PROVIDER_NATIVE_DEV03_PRESENTATION_OPERATORS_V3R = [
  'read_project_file',
  'get_timeline_view',
  'find_audio_moment',
  'sync_cuts_to_beats',
  'apply_camera_shake',
] as const;

export type ProviderNativeEvidenceDeliveryModeV3R =
  | 'PRE_RESOLVED_EVIDENCE'
  | 'RESOLVER_HANDOFF_REQUIRED';

export interface ProviderNativeEvidenceVisibilityReceiptV3R {
  version: typeof PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R;
  authority: 'RESEARCH_CONTEXT_VISIBILITY_ONLY_NO_PROJECT_MUTATION';
  mode: ProviderNativeEvidenceDeliveryModeV3R;
  ownerEvidenceContextSha256: string;
  modelContextSha256: string;
  prerequisitePolicySha256: string;
  presentationPermutationsSha256: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface ProviderNativeEvidenceVisibilitySplitV3R {
  ownerEvidenceContext: Readonly<ProviderNativeEpisodeContextV2R>;
  modelContext: Readonly<ProviderNativeEpisodeContextV2R>;
  prerequisitePolicy: Readonly<JsonRecord>;
  presentationPermutations: readonly (readonly string[])[];
  receipt: Readonly<ProviderNativeEvidenceVisibilityReceiptV3R>;
}

export function buildProviderNativeDev03EvidenceVisibilityV3R(input: {
  ownerEvidenceContext: Readonly<ProviderNativeEpisodeContextV2R>;
  mode: ProviderNativeEvidenceDeliveryModeV3R;
  permutationSeed: string;
  permutationCount?: number;
}): Readonly<ProviderNativeEvidenceVisibilitySplitV3R> {
  assertOwnerContext(input.ownerEvidenceContext);
  const ownerEvidenceContext = clone(input.ownerEvidenceContext);
  const ownerEvidenceContextSha256 = hashCanonicalJsonV1(ownerEvidenceContext);
  const prerequisitePolicy = buildPrerequisitePolicy(input.mode);
  const presentationPermutations = buildProviderNativePresentationPermutationsV3R({
    operatorIds: PROVIDER_NATIVE_DEV03_PRESENTATION_OPERATORS_V3R,
    seed: input.permutationSeed,
    count: input.permutationCount ?? 3,
  });
  const modelContext = buildModelContext({
    ownerEvidenceContext,
    ownerEvidenceContextSha256,
    prerequisitePolicy,
    mode: input.mode,
  });
  assertVisibility(input.mode, ownerEvidenceContext, modelContext);
  const material = {
    version: PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R,
    authority: 'RESEARCH_CONTEXT_VISIBILITY_ONLY_NO_PROJECT_MUTATION' as const,
    mode: input.mode,
    ownerEvidenceContextSha256,
    modelContextSha256: hashCanonicalJsonV1(modelContext),
    prerequisitePolicySha256: hashCanonicalJsonV1(prerequisitePolicy),
    presentationPermutationsSha256: hashCanonicalJsonV1(presentationPermutations),
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
  return deepFreezeV1({
    ownerEvidenceContext,
    modelContext,
    prerequisitePolicy,
    presentationPermutations,
    receipt,
  });
}

export function buildProviderNativePresentationPermutationsV3R(input: {
  operatorIds: readonly string[];
  seed: string;
  count: number;
}): readonly (readonly string[])[] {
  const operatorIds = input.operatorIds.map((operatorId) => operatorId.trim());
  if (operatorIds.length < 2 || operatorIds.some((operatorId) => !operatorId)
    || new Set(operatorIds).size !== operatorIds.length) {
    throw new Error('PROVIDER_NATIVE_PRESENTATION_OPERATOR_SET_INVALID');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(input.seed)) {
    throw new Error('PROVIDER_NATIVE_PRESENTATION_SEED_INVALID');
  }
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 12) {
    throw new Error('PROVIDER_NATIVE_PRESENTATION_COUNT_INVALID');
  }
  const permutations = Array.from({ length: input.count }, (_, ordinal) => (
    [...operatorIds].sort((left, right) => compareUtf16(
      hashCanonicalJsonV1({ seed: input.seed, ordinal, operatorId: left }),
      hashCanonicalJsonV1({ seed: input.seed, ordinal, operatorId: right }),
    ))
  ));
  if (new Set(permutations.map((order) => order.join('\u0000'))).size !== permutations.length) {
    throw new Error('PROVIDER_NATIVE_PRESENTATION_PERMUTATION_COLLISION');
  }
  for (const order of permutations) assertPermutation(order, operatorIds);
  return deepFreezeV1(permutations);
}

function buildModelContext(input: {
  ownerEvidenceContext: Readonly<ProviderNativeEpisodeContextV2R>;
  ownerEvidenceContextSha256: string;
  prerequisitePolicy: Readonly<JsonRecord>;
  mode: ProviderNativeEvidenceDeliveryModeV3R;
}): Readonly<ProviderNativeEpisodeContextV2R> {
  const source = clone(input.ownerEvidenceContext);
  const evidence = input.mode === 'RESOLVER_HANDOFF_REQUIRED'
    ? source.evidence.map((fact) => (
      fact.kind === 'HASH_BOUND_MEASURED_AUDIO'
        ? {
            factId: fact.factId,
            kind: 'OWNER_EVIDENCE_AVAILABLE',
            evidenceId: fact.evidenceId,
            ownerOperatorId: 'find_audio_moment',
            availableOutput: 'result',
            coordinateDomain: 'PROJECT_TICK',
          }
        : fact
    ))
    : source.evidence;
  const sourceActiveTarget = record(source.activeTarget);
  const modelInput = record(sourceActiveTarget.modelInput);
  const availability = records(modelInput.evidenceAvailability).map((entry) => (
    entry.evidenceId === 'EV-DEV03-B1'
      ? {
          evidenceId: 'EV-DEV03-B1',
          kind: 'OWNER_RESOLVER_AVAILABLE',
          ownerOperatorId: 'find_audio_moment',
          availableOutput: 'result',
        }
      : entry
  ));
  const activeTarget = input.mode === 'RESOLVER_HANDOFF_REQUIRED'
    && Object.keys(modelInput).length
    ? {
        ...sourceActiveTarget,
        modelInput: { ...modelInput, evidenceAvailability: availability },
      }
    : source.activeTarget;
  const authorityAndPolicy = record(source.authorityAndPolicy);
  const completeCapabilityDossier = record(authorityAndPolicy.completeCapabilityDossier);
  const context: ProviderNativeEpisodeContextV2R = {
    ...source,
    activeTarget,
    evidence,
    authorityAndPolicy: {
      ...authorityAndPolicy,
      evidenceVisibility: {
        version: PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R,
        mode: input.mode,
        ownerEvidenceContextSha256: input.ownerEvidenceContextSha256,
      },
      completeCapabilityDossier: {
        ...completeCapabilityDossier,
        plannerRecordSupplements: records(input.prerequisitePolicy.records),
        prerequisitePolicySha256: hashCanonicalJsonV1(input.prerequisitePolicy),
      },
    },
  };
  return deepFreezeV1(context);
}

function buildPrerequisitePolicy(
  mode: ProviderNativeEvidenceDeliveryModeV3R,
): Readonly<JsonRecord> {
  const beatPlanOrigin = mode === 'PRE_RESOLVED_EVIDENCE'
    ? {
        origin: 'VERSIONED_MODEL_VISIBLE_EVIDENCE',
        factId: 'fact-measured-beats',
        evidenceId: 'EV-DEV03-B1',
      }
    : {
        origin: 'OPERATOR_OUTPUT',
        operatorId: 'find_audio_moment',
        outputField: 'result',
        evidenceId: 'EV-DEV03-B1',
      };
  return deepFreezeV1({
    version: PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R,
    mode,
    records: [
      {
        selectableOperatorId: 'sync_cuts_to_beats',
        inputOrigins: { beatPlan: [beatPlanOrigin] },
        prerequisites: mode === 'RESOLVER_HANDOFF_REQUIRED'
          ? ['find_audio_moment.result']
          : [],
      },
      {
        selectableOperatorId: 'apply_camera_shake',
        inputOrigins: {
          expectedProjectRevision: [{
            origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
            outputField: 'receipt.projectRevision',
          }],
          overlayId: [{
            origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
            outputField: 'result.finalHitOverlayId',
          }],
          targetFrame: [{
            origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
            outputField: 'result.finalStrongPeakFrame',
          }],
        },
        prerequisites: [
          'sync_cuts_to_beats.result',
          'sync_cuts_to_beats.receipt.projectRevision',
        ],
      },
    ],
  });
}

function assertOwnerContext(context: Readonly<ProviderNativeEpisodeContextV2R>): void {
  const target = record(context.activeTarget);
  const revision = record(context.revisionBinding);
  const measured = context.evidence.find((fact) => fact.kind === 'HASH_BOUND_MEASURED_AUDIO');
  if (target.taskId !== 'DEV-03' || target.conditionId !== 'BASELINE'
    || revision.projectId !== 'oe-dev-03' || revision.expectedProjectRevision !== 'R11'
    || !measured || !Array.isArray(measured.strongPeakFrames)
    || typeof measured.finalStrongPeakFrame !== 'number') {
    throw new Error('PROVIDER_NATIVE_OWNER_EVIDENCE_CONTEXT_INVALID');
  }
}

function assertVisibility(
  mode: ProviderNativeEvidenceDeliveryModeV3R,
  ownerContext: Readonly<ProviderNativeEpisodeContextV2R>,
  modelContext: Readonly<ProviderNativeEpisodeContextV2R>,
): void {
  const ownerMeasured = ownerContext.evidence.find((fact) => (
    fact.kind === 'HASH_BOUND_MEASURED_AUDIO'
  ));
  if (!ownerMeasured) throw new Error('PROVIDER_NATIVE_OWNER_MEASURED_EVIDENCE_MISSING');
  const modelText = JSON.stringify(modelContext);
  const exactFrames = JSON.stringify(ownerMeasured.strongPeakFrames);
  if (mode === 'RESOLVER_HANDOFF_REQUIRED') {
    if (modelText.includes(`"strongPeakFrames":${exactFrames}`)
      || modelText.includes(`"finalStrongPeakFrame":${ownerMeasured.finalStrongPeakFrame}`)
      || modelContext.evidence.some((fact) => fact.kind === 'HASH_BOUND_MEASURED_AUDIO')) {
      throw new Error('PROVIDER_NATIVE_RESOLVER_HANDOFF_EVIDENCE_LEAK');
    }
  } else if (!modelText.includes(`"strongPeakFrames":${exactFrames}`)) {
    throw new Error('PROVIDER_NATIVE_PRE_RESOLVED_EVIDENCE_MISSING');
  }
}

function assertPermutation(actual: readonly string[], expected: readonly string[]): void {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length
    || actual.some((operatorId) => !expected.includes(operatorId))) {
    throw new Error('PROVIDER_NATIVE_PRESENTATION_PERMUTATION_INVALID');
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}
