import { z } from 'zod';

export const PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1 =
  'EDITRON_PROJECT_GENERATED_COMPOSITION_STATE_V1' as const;

const identifier = z.string().trim().min(1).max(256);
const nonNegativeIntegerText = z.string().regex(/^(0|[1-9]\d*)$/);
const positiveIntegerText = z.string().regex(/^[1-9]\d*$/);
const stateToken = z.string().regex(/^gcp-state-v1:[a-f0-9]{64}$/);

const digest = z.object({
  algorithm: z.literal('sha-256'),
  value: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const immutableArtifact = z.object({
  artifactId: identifier,
  version: identifier,
  digest,
}).strict();

const rationalRate = z.object({
  numerator: positiveIntegerText,
  denominator: positiveIntegerText,
}).strict();

const timebase = z.object({
  timebaseId: identifier,
  version: identifier,
  scope: z.enum(['PROJECT', 'COMPOSITION', 'SOURCE']),
  scopeId: identifier,
  rate: rationalRate,
}).strict();

const tickRange = z.object({
  startTick: nonNegativeIntegerText,
  endExclusiveTick: nonNegativeIntegerText,
}).strict();

const sourceBindingBase = z.object({
  slotId: identifier,
  asset: immutableArtifact,
  rightsReceipt: immutableArtifact,
});

const sourceBinding = z.discriminatedUnion('mediaKind', [
  sourceBindingBase.extend({
    mediaKind: z.literal('VIDEO'),
    coordinateDomain: z.literal('SOURCE_TICK'),
    sourceTimebase: timebase,
    sourceRange: tickRange,
  }).strict(),
  sourceBindingBase.extend({
    mediaKind: z.literal('IMAGE'),
    coordinateDomain: z.literal('STATIC'),
  }).strict(),
]);

const dependencyBinding = z.object({
  dependencyId: identifier,
  kind: z.enum(['MASK', 'TRACK']),
  ownerId: identifier,
  sourceSlotId: identifier,
  artifact: immutableArtifact,
  sourceTimebase: timebase,
  sourceRange: tickRange,
}).strict();

const fontBinding = z.object({
  slotId: identifier,
  fontAsset: immutableArtifact,
  family: identifier,
  face: identifier,
  weight: z.number().int().min(1).max(1000),
  axes: z.record(z.string().min(1), z.number().finite()),
  glyphCoverage: z.array(identifier).min(1),
  licenseReceipt: immutableArtifact,
}).strict();

const exposedControl = z.discriminatedUnion('kind', [
  z.object({
    parameterId: identifier,
    kind: z.literal('STRING'),
    value: z.string(),
    maximumLength: z.number().int().positive(),
  }).strict(),
  z.object({
    parameterId: identifier,
    kind: z.literal('NUMBER'),
    value: z.number().finite(),
    minimum: z.number().finite(),
    maximum: z.number().finite(),
  }).strict(),
  z.object({
    parameterId: identifier,
    kind: z.literal('BOOLEAN'),
    value: z.boolean(),
  }).strict(),
  z.object({
    parameterId: identifier,
    kind: z.literal('COLOR_SRGB_HEX'),
    value: z.string().regex(/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/),
  }).strict(),
]);

const renderArtifact = z.object({
  stage: z.enum(['PREVIEW', 'FINAL']),
  artifact: immutableArtifact,
  boundStateToken: stateToken,
  programDigest: digest,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: rationalRate,
  durationTicks: positiveIntegerText,
  contentOffsetTicks: nonNegativeIntegerText,
  outputKind: z.enum([
    'OPAQUE_NESTED_COMPOSITION',
    'TRANSPARENT_NESTED_COMPOSITION',
  ]),
}).strict();

const proofStatus = z.enum(['PASS', 'FAIL', 'UNVERIFIABLE']);
const proofBinding = z.object({
  ownerId: identifier,
  receipt: immutableArtifact,
  boundStateToken: stateToken,
  programDigest: digest,
  status: proofStatus,
  observations: z.array(z.object({
    obligationId: identifier,
    required: z.boolean(),
    status: proofStatus,
    evidence: z.array(immutableArtifact),
  }).strict()).min(1),
}).strict();

/**
 * Editable nested-composition state intended for the existing ProjectService
 * project authority. This module declares no writer and accepts no raw URLs,
 * generated source text, ambient paths, project revision, or persistence port.
 */
export const projectGeneratedCompositionStateSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1),
  kind: z.literal('generated-composition'),
  ownership: z.object({
    projectStateOwner: z.literal('PROJECT_SERVICE'),
    executionAuthority: z.literal('ISOLATED_SANDBOX_ONLY'),
    directProjectMutation: z.literal('DENY'),
  }).strict(),
  projectId: identifier,
  compositionId: identifier,
  stateIdentity: z.object({
    issuer: z.literal('PROJECT_SERVICE'),
    token: stateToken,
  }).strict(),
  programRef: z.object({
    artifactType: z.literal('GeneratedCompositionProgramV1'),
    contractVersion: identifier,
    programId: identifier,
    boundProjectId: identifier,
    programArtifact: immutableArtifact,
    sourceBundleArtifact: immutableArtifact,
    generator: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('HUMAN_AUTHORED'), authorId: identifier }).strict(),
      z.object({
        kind: z.literal('MODEL_GENERATED'),
        provider: identifier,
        modelId: identifier,
        promptDigest: digest,
      }).strict(),
    ]),
    allowedApi: z.object({
      apiId: identifier,
      apiVersion: identifier,
      runtimeDigest: digest,
    }).strict(),
  }).strict(),
  referenceBinding: z.object({
    blueprintId: identifier,
    blueprintArtifact: immutableArtifact,
  }).strict().nullable(),
  placement: z.object({
    projectTimebase: timebase,
    compositionTimebase: timebase,
    projectRange: tickRange,
    compositionRange: tickRange,
    headHandleTicks: nonNegativeIntegerText,
    tailHandleTicks: nonNegativeIntegerText,
    handlePolicy: z.enum(['LOCKED_BOUNDARY_NO_TRIM', 'DECLARED_HANDLES']),
  }).strict(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixelAspectRatio: rationalRate,
    colorIntent: z.literal('SDR_BT709'),
  }).strict(),
  sourceBindings: z.array(sourceBinding),
  dependencyBindings: z.array(dependencyBinding),
  fontBindings: z.array(fontBinding),
  exposedControls: z.array(exposedControl),
  output: z.object({
    kind: z.enum([
      'OPAQUE_NESTED_COMPOSITION',
      'TRANSPARENT_NESTED_COMPOSITION',
    ]),
    representation: z.literal('EDITABLE_PROGRAM_AND_PROXY'),
    flatteningDisposition: z.literal('EXPLICIT_HANDOFF_ONLY'),
    audioDisposition: z.literal('CUE_HANDOFF_ONLY'),
  }).strict(),
  audioCueIntents: z.array(z.object({
    cueId: identifier,
    localTick: nonNegativeIntegerText,
    semanticEvent: identifier,
  }).strict()),
  renderArtifacts: z.array(renderArtifact),
  verificationDisposition: z.enum(['PENDING', 'PASS', 'FAIL', 'UNVERIFIABLE']),
  proof: proofBinding.nullable(),
}).strict();

export type ProjectGeneratedCompositionStateV1 = z.infer<
  typeof projectGeneratedCompositionStateSchemaV1
>;
