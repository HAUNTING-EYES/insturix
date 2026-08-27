import {
  parseProjectGeneratedCompositionDraftV1,
  type ProjectGeneratedCompositionDraftV1,
} from '@/lib/editron/services/project-generated-composition-entry-v1';
import { PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1 }
  from '@/lib/editron/services/project-generated-composition-state-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';
import {
  resolveGeneratedCompositionVisualSourceKindV1,
  verifyGeneratedCompositionProgramV1,
  type VerifyGeneratedCompositionProgramInputV1,
} from './generated-composition-program-verifier-v1';

type JsonRecord = Record<string, unknown>;

export const GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_VERSION_V1 =
  'EDITRON_GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_V1' as const;

export interface GeneratedCompositionProjectDraftAdapterInputV1 {
  verificationInput: Readonly<VerifyGeneratedCompositionProgramInputV1>;
  sourceRightsReceipts: readonly Readonly<Record<string, unknown>>[];
  compositionId: string;
  runtimeDigestSha256: string;
  generatorBinding:
    | Readonly<{ kind: 'HUMAN_AUTHORED'; authorId: string }>
    | Readonly<{ kind: 'MODEL_GENERATED'; provider: string }>;
}

/**
 * Projects already-verified generated form into the sole ProjectService state
 * schema. This adapter chooses no layout, timing, typography, source or audio.
 */
export function adaptGeneratedCompositionProgramToProjectDraftV1(
  input: Readonly<GeneratedCompositionProjectDraftAdapterInputV1>,
) {
  const verification = verifyGeneratedCompositionProgramV1(input.verificationInput);
  if (verification.disposition !== 'CONTRACT_PASS'
    || !verification.programHash || !verification.sourceBundleHash) {
    fail(`PROGRAM_NOT_VERIFIED:${verification.diagnostics.join('|')}`);
  }
  const program = input.verificationInput.program as GeneratedCompositionProgramV1;
  const sourceBundle = input.verificationInput.sourceBundle as GeneratedCompositionSourceBundleV1;
  const evidencePack = requiredRecord(input.verificationInput.evidencePack, 'EVIDENCE_PACK');
  const referenceBlueprint = requiredRecord(
    input.verificationInput.referenceBlueprint,
    'REFERENCE_BLUEPRINT',
  );
  const facts = [
    ...records(evidencePack.facts),
    ...records(input.verificationInput.supplementalFacts),
  ];
  const requiredEvidenceIds = facts.map((fact) => requiredText(fact.factId, 'FACT_ID'));
  if (new Set(requiredEvidenceIds).size !== requiredEvidenceIds.length) {
    fail('EVIDENCE_FACT_ID_DUPLICATE');
  }
  requiredEvidenceIds.sort(compareCodeUnits);
  const sourceAssetIds = new Set(program.sourceSlots.map(({ assetId }) => assetId));
  const sourceRightsReceipts = records(input.sourceRightsReceipts)
    .filter((receipt) => sourceAssetIds.has(requiredText(
      receipt.assetId,
      'SOURCE_RIGHTS_ASSET_ID',
    )))
    .sort((left, right) => compareCodeUnits(
      requiredText(left.assetId, 'SOURCE_RIGHTS_ASSET_ID'),
      requiredText(right.assetId, 'SOURCE_RIGHTS_ASSET_ID'),
    ));
  if (sourceRightsReceipts.length !== program.sourceSlots.length) {
    fail('BOUND_SOURCE_RIGHTS_RECEIPT_SET_INVALID');
  }
  const runtimeDigest = digest(input.runtimeDigestSha256, 'RUNTIME_DIGEST');
  const sourceBindings = program.sourceSlots.map((slot) => {
    const identity = uniqueFact(
      facts,
      (fact) => fact.kind === 'SOURCE_MEDIA_IDENTITY' && fact.assetId === slot.assetId,
      `SOURCE_IDENTITY:${slot.slotId}`,
    );
    if (!['INTERNAL_OWNED_FIXTURE', 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE']
      .includes(requiredText(identity.rightsStatus, `SOURCE_RIGHTS_STATUS:${slot.slotId}`))) {
      fail(`SOURCE_RIGHTS_STATUS_UNSUPPORTED:${slot.slotId}`);
    }
    const rightsVersion = requiredShaVersion(
      identity.rightsEvidenceVersion,
      `SOURCE_RIGHTS_EVIDENCE:${slot.slotId}`,
    );
    const rightsReceipt = uniqueFact(
      sourceRightsReceipts,
      (receipt) => receipt.assetId === slot.assetId,
      `SOURCE_RIGHTS_RECEIPT:${slot.slotId}`,
    );
    const { receiptSha256, ...rightsMaterial } = rightsReceipt;
    const rightsReceiptSha256 = requiredText(
      receiptSha256,
      `SOURCE_RIGHTS_RECEIPT_SHA:${slot.slotId}`,
    );
    if (hashCanonicalJsonV1(rightsMaterial) !== rightsReceiptSha256
      || rightsVersion !== `sha256:${rightsReceiptSha256}`
      || rightsReceipt.rightsStatus !== identity.rightsStatus) {
      fail(`SOURCE_RIGHTS_RECEIPT_HASH_DRIFT:${slot.slotId}`);
    }
    const base = {
      slotId: slot.slotId,
      asset: immutableArtifact(slot.assetId, slot.assetVersion),
      rightsReceipt: immutableArtifact(`${slot.assetId}:rights`, rightsVersion),
    };
    const mediaKind = resolveGeneratedCompositionVisualSourceKindV1(
      identity,
      slot.sourceRange,
    );
    if (mediaKind === 'STILL_IMAGE') {
      return { ...base, mediaKind: 'IMAGE' as const, coordinateDomain: 'STATIC' as const };
    }
    if (mediaKind === 'VIDEO') {
      return {
        ...base,
        mediaKind: 'VIDEO' as const,
        coordinateDomain: 'SOURCE_TICK' as const,
        sourceTimebase: timebase(slot.timebase, 'SOURCE', slot.assetId),
        sourceRange: tickRange(slot.sourceRange.start, slot.sourceRange.endExclusive),
      };
    }
    return fail(`SOURCE_MEDIA_KIND_UNSUPPORTED:${slot.slotId}`);
  });
  const fontBindings = program.fontSlots.map((font) => {
    const identity = uniqueFact(
      facts,
      (fact) => fact.kind === 'FONT_IDENTITY' && fact.fontAssetId === font.fontAssetId,
      `FONT_IDENTITY:${font.slotId}`,
    );
    if (identity.rightsStatus !== 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE') {
      fail(`FONT_RIGHTS_STATUS_UNSUPPORTED:${font.slotId}`);
    }
    const licenseFactSha256 = hashCanonicalJsonV1(identity);
    return {
      slotId: font.slotId,
      fontAsset: immutableArtifact(font.fontAssetId, font.fontAssetVersion),
      family: font.family,
      face: font.face,
      weight: font.weight,
      axes: { ...font.axes },
      glyphCoverage: [font.glyphCoverage],
      licenseReceipt: {
        artifactId: `${font.fontAssetId}:license:${font.licenseId}`,
        version: `sha256:${licenseFactSha256}`,
        digest: digest(licenseFactSha256, `FONT_LICENSE:${font.slotId}`),
      },
    };
  });
  const exposedControls = program.exposedParameters.map((parameter) => {
    if (parameter.kind === 'STRING') {
      if (typeof parameter.defaultValue !== 'string') {
        fail(`CONTROL_STRING_VALUE_INVALID:${parameter.parameterId}`);
      }
      return {
        parameterId: parameter.parameterId,
        kind: 'STRING' as const,
        value: parameter.defaultValue,
        maximumLength: Math.max(1, parameter.defaultValue.length),
      };
    }
    if (parameter.kind === 'INTEGER') {
      if (!Number.isInteger(parameter.defaultValue)
        || !Number.isInteger(parameter.minimum)
        || !Number.isInteger(parameter.maximum)) {
        fail(`CONTROL_INTEGER_BOUNDS_INVALID:${parameter.parameterId}`);
      }
      return {
        parameterId: parameter.parameterId,
        kind: 'NUMBER' as const,
        value: parameter.defaultValue as number,
        minimum: parameter.minimum as number,
        maximum: parameter.maximum as number,
      };
    }
    if (typeof parameter.defaultValue !== 'string'
      || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(parameter.defaultValue)) {
      fail(`CONTROL_COLOR_VALUE_INVALID:${parameter.parameterId}`);
    }
    return {
      parameterId: parameter.parameterId,
      kind: 'COLOR_SRGB_HEX' as const,
      value: parameter.defaultValue,
    };
  });
  const generator = generatorBinding(program, input.generatorBinding);
  const blueprintId = requiredText(referenceBlueprint.blueprintId, 'BLUEPRINT_ID');
  const blueprintVersion = requiredText(referenceBlueprint.version, 'BLUEPRINT_VERSION');
  const draft = parseProjectGeneratedCompositionDraftV1({
    schemaVersion: 1,
    contractVersion: PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
    kind: 'generated-composition',
    compositionId: input.compositionId,
    programRef: {
      artifactType: 'GeneratedCompositionProgramV1',
      contractVersion: program.contractVersion,
      programId: program.programId,
      boundProjectId: program.projectBinding.projectId,
      programArtifact: {
        artifactId: program.programId,
        version: program.contractVersion,
        digest: digest(verification.programHash, 'PROGRAM_DIGEST'),
      },
      sourceBundleArtifact: {
        artifactId: `${program.programId}:source-bundle`,
        version: sourceBundle.bundleVersion,
        digest: digest(verification.sourceBundleHash, 'SOURCE_BUNDLE_DIGEST'),
      },
      generator,
      allowedApi: {
        apiId: program.allowedApi.apiId,
        apiVersion: program.allowedApi.apiVersion,
        runtimeDigest,
      },
    },
    referenceBinding: {
      blueprintId,
      blueprintArtifact: {
        artifactId: blueprintId,
        version: blueprintVersion,
        digest: digest(hashCanonicalJsonV1(referenceBlueprint), 'BLUEPRINT_DIGEST'),
      },
    },
    placement: {
      projectTimebase: timebase(program.projectTimebase, 'PROJECT', program.projectBinding.projectId),
      compositionTimebase: timebase(program.compositionTimebase, 'COMPOSITION', input.compositionId),
      projectRange: tickRange(program.duration.projectStartTick, program.duration.projectEndExclusiveTick),
      compositionRange: tickRange(program.duration.compositionStartTick, program.duration.compositionEndExclusiveTick),
      headHandleTicks: program.duration.headHandleTicks,
      tailHandleTicks: program.duration.tailHandleTicks,
      handlePolicy: program.duration.handlePolicy,
    },
    canvas: structuredClone(program.canvas),
    sourceBindings,
    dependencyBindings: [],
    fontBindings,
    exposedControls,
    output: structuredClone(program.output),
    audioCueIntents: structuredClone(program.audioCueIntents),
  });
  const binding = {
    programSha256: verification.programHash,
    sourceBundleSha256: hashGeneratedCompositionSourceBundleV1(sourceBundle),
    evidencePackSha256: hashCanonicalJsonV1(evidencePack),
    sourceRightsReceiptsSha256: hashCanonicalJsonV1(sourceRightsReceipts),
    referenceBlueprintSha256: hashCanonicalJsonV1(referenceBlueprint),
    runtimeDigestSha256: input.runtimeDigestSha256,
    draftSha256: hashCanonicalJsonV1(draft),
    programExpectedProjectRevision: program.projectBinding.expectedProjectRevision,
  };
  const receiptMaterial = {
    version: GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_VERSION_V1,
    authority: 'VERIFIED_PROGRAM_TO_PROJECTSERVICE_DRAFT_PROJECTION_ONLY' as const,
    compositionId: input.compositionId,
    binding,
    requiredEvidenceIds,
    sourceCoordinateHandoff:
      'STILL_IMAGE_TO_STATIC_OR_SOURCE_FRAME_TO_SOURCE_TICK_AT_BOUND_RATE' as const,
    sourceRightsResolution: 'RECEIPT_CONTENT_HASH_VERIFIED' as const,
    stringControlPolicy: 'EXACT_AUTHORED_VALUE_LENGTH_NO_CREATIVE_EXPANSION' as const,
    canonicalMutationOwnerCalled: false as const,
  };
  const receipt = deepFreezeV1({
    ...receiptMaterial,
    receiptSha256: hashCanonicalJsonV1(receiptMaterial),
  });
  return deepFreezeV1({
    draft,
    binding: { ...binding, adapterReceiptSha256: receipt.receiptSha256 },
    requiredEvidenceIds,
    receipt,
  });
}

export type GeneratedCompositionProjectDraftAdaptationV1 = ReturnType<
  typeof adaptGeneratedCompositionProgramToProjectDraftV1
>;

function generatorBinding(
  program: GeneratedCompositionProgramV1,
  binding: GeneratedCompositionProjectDraftAdapterInputV1['generatorBinding'],
): ProjectGeneratedCompositionDraftV1['programRef']['generator'] {
  if (program.generator.kind === 'HUMAN_AUTHORED_FIXTURE') {
    if (binding.kind !== 'HUMAN_AUTHORED') fail('GENERATOR_BINDING_KIND_DRIFT');
    return { kind: 'HUMAN_AUTHORED', authorId: binding.authorId };
  }
  if (binding.kind !== 'MODEL_GENERATED') fail('GENERATOR_BINDING_KIND_DRIFT');
  return {
    kind: 'MODEL_GENERATED',
    provider: binding.provider,
    modelId: program.generator.modelId,
    promptDigest: digest(program.generator.promptHash, 'GENERATOR_PROMPT_DIGEST'),
  };
}

function immutableArtifact(artifactId: string, versionValue: string) {
  return { artifactId, version: versionValue, digest: digestFromShaVersion(versionValue) };
}

function timebase(
  value: { timebaseId: string; timebaseVersion: string; rate: { numerator: string; denominator: string } },
  scope: 'PROJECT' | 'COMPOSITION' | 'SOURCE',
  scopeId: string,
) {
  return {
    timebaseId: value.timebaseId,
    version: value.timebaseVersion,
    scope,
    scopeId,
    rate: { ...value.rate },
  };
}

function tickRange(startTick: string, endExclusiveTick: string) {
  return { startTick, endExclusiveTick };
}

function digestFromShaVersion(value: unknown) {
  const versionValue = requiredShaVersion(value, 'ARTIFACT_VERSION');
  return digest(versionValue.slice('sha256:'.length), 'ARTIFACT_DIGEST');
}

function requiredShaVersion(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(value: unknown, code: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${code}_INVALID`);
  return { algorithm: 'sha-256' as const, value };
}

function uniqueFact(
  facts: readonly JsonRecord[],
  predicate: (fact: JsonRecord) => boolean,
  code: string,
): JsonRecord {
  const matches = facts.filter(predicate);
  if (matches.length !== 1) fail(`${code}_COUNT_INVALID`);
  return matches[0]!;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requiredRecord(value: unknown, code: string): JsonRecord {
  if (!isRecord(value)) fail(`${code}_INVALID`);
  return value;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${code}_INVALID`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function fail(code: string): never {
  throw new Error(`GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_${code}`);
}
