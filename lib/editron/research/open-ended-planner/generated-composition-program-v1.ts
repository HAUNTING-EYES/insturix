import { hashCanonicalJsonV1 } from './contracts-v1';

export const GENERATED_COMPOSITION_PROGRAM_VERSION_V1 = 'EDITRON_GENERATED_COMPOSITION_PROGRAM_V1' as const;
export const GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1 = 'EDITRON_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1' as const;
export const GENERATED_COMPOSITION_API_ID_V1 = '@editron/generated-composition-api/v1' as const;

export interface RationalRateV1 { numerator: string; denominator: string }
export interface ProgramTimebaseV1 { timebaseId: string; timebaseVersion: string; rate: RationalRateV1 }
export interface ProgramSourceFileV1 { path: string; sha256: string; source: string }
export interface GeneratedCompositionSourceBundleV1 {
  bundleVersion: typeof GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1;
  entryFile: string;
  files: readonly ProgramSourceFileV1[];
}

export interface GeneratedCompositionProgramV1 {
  artifactType: 'GeneratedCompositionProgramV1';
  contractVersion: typeof GENERATED_COMPOSITION_PROGRAM_VERSION_V1;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  programId: string;
  taskId: string;
  sourceBundleHash: string;
  generator: { kind: 'HUMAN_AUTHORED_FIXTURE' | 'MODEL_GENERATED'; modelId: string; promptHash: string; toolVersions: readonly string[] };
  projectBinding: { projectId: string; expectedProjectRevision: string; evidencePackHash: string };
  referenceBinding: { blueprintId: string; blueprintHash: string };
  projectTimebase: ProgramTimebaseV1;
  compositionTimebase: ProgramTimebaseV1;
  canvas: { width: number; height: number; pixelAspectRatio: RationalRateV1; colorIntent: 'SDR_BT709' };
  duration: {
    compositionStartTick: string;
    compositionEndExclusiveTick: string;
    projectStartTick: string;
    projectEndExclusiveTick: string;
    headHandleTicks: string;
    tailHandleTicks: string;
    handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM' | 'DECLARED_HANDLES';
  };
  sourceSlots: readonly {
    slotId: string;
    assetId: string;
    assetVersion: string;
    coordinateDomain: 'SOURCE_FRAME';
    timebase: ProgramTimebaseV1;
    sourceRange: { start: string; endExclusive: string };
  }[];
  fontSlots: readonly {
    slotId: string;
    fontAssetId: string;
    fontAssetVersion: string;
    fileSha256: string;
    family: string;
    face: string;
    weight: number;
    axes: Readonly<Record<string, number>>;
    glyphCoverage: string;
    licenseId: string;
  }[];
  textSlots: readonly { slotId: string; fontSlotId: string; parameterId: string }[];
  declaredLayers: readonly {
    layerId: string;
    kind: 'SOURCE_PANEL' | 'TEXT';
    sourceSlotId?: string;
    textSlotId?: string;
    zIndex: number;
  }[];
  exposedParameters: readonly {
    parameterId: string;
    kind: 'STRING' | 'INTEGER' | 'COLOR_SRGB_HEX';
    defaultValue: string | number;
    minimum?: number;
    maximum?: number;
  }[];
  allowedApi: { apiId: typeof GENERATED_COMPOSITION_API_ID_V1; apiVersion: '1'; modules: readonly { specifier: string; version: string }[] };
  securityPolicy: {
    network: 'DENY';
    secrets: 'DENY';
    database: 'DENY';
    projectMutation: 'DENY';
    filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY';
  };
  resourceBudget: {
    maxSourceFiles: number;
    maxSourceBytes: number;
    maxInputBytes: number;
    maxOutputBytes: number;
    maxFrames: number;
    maxCpuMs: number;
    maxWallTimeMs: number;
    maxMemoryMiB: number;
  };
  output: {
    kind: 'OPAQUE_NESTED_COMPOSITION' | 'TRANSPARENT_NESTED_COMPOSITION';
    representation: 'EDITABLE_PROGRAM_AND_PROXY';
    flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY';
    audioDisposition: 'CUE_HANDOFF_ONLY';
  };
  stateEffects: readonly [];
  proofObligationIds: readonly string[];
  expectedMeasurementRefs: readonly string[];
  audioCueIntents: readonly { cueId: string; localTick: string; semanticEvent: string }[];
}

export interface GeneratedCompositionContractVerificationV1 {
  disposition: 'CONTRACT_PASS' | 'CONTRACT_FAIL' | 'UNVERIFIABLE';
  executionEligibility: 'NOT_EXECUTABLE';
  programHash: string | null;
  sourceBundleHash: string | null;
  diagnostics: readonly string[];
}

export function hashGeneratedCompositionSourceBundleV1(bundle: GeneratedCompositionSourceBundleV1): string {
  return hashCanonicalJsonV1({
    bundleVersion: bundle.bundleVersion,
    entryFile: bundle.entryFile,
    files: [...bundle.files]
      .map(({ path, sha256 }) => ({ path, sha256 }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  });
}
