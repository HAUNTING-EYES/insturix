import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from './contracts-v1';
import {
  GENERATED_COMPOSITION_API_ID_V1,
  GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';

const FONT_SHA256 = 'd2a8188db7fdd567bbd94017cec0622373d47206d45281b7c501f0775cdee83a';
export const SEALED_H03_FONT_PATH_V2R =
  'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf' as const;

export const SEALED_H03_GENERATED_SOURCE_V2R = `import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const gutter = useCompositionParameter<number>('param-gutter');
  const title = useCompositionParameter<string>('param-title');
  const titleColor = useCompositionParameter<string>('param-title-color');
  const titleSize = useCompositionParameter<number>('param-title-size');
  const background = useCompositionParameter<string>('param-background');
  const entry = interpolate(frame, [0, 24], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [150, durationInFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = interpolate(Math.max(entry, exit), [0, 1], [1, 0.96]);
  const sourceAFrame = 90 + frame;
  const sourceBFrame = 60 + frame;
  const leftX = -24 * entry + 24 * exit;
  const rightX = 24 * entry - 24 * exit;
  const topY = -24 * entry + 24 * exit;
  const bottomY = 24 * entry - 24 * exit;

  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel layerId="panel-left-top" bounds={{ left: 0.03, top: 0.03, width: 0.27, height: 0.39 }} translateX={leftX} translateY={0} entryScale={scale}>
        <AssetSlot slotId="source-a" sourceFrame={sourceAFrame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-left-bottom" bounds={{ left: 0.03, top: 0.60, width: 0.27, height: 0.37 }} translateX={leftX} translateY={0} entryScale={scale}>
        <AssetSlot slotId="source-b" sourceFrame={sourceBFrame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-centre-top" bounds={{ left: 0.33, top: 0.03, width: 0.34, height: 0.29 }} translateY={topY} entryScale={scale}>
        <AssetSlot slotId="source-b" sourceFrame={sourceBFrame} crop="centre" />
      </Panel>
      <Panel layerId="panel-centre-bottom" bounds={{ left: 0.33, top: 0.60, width: 0.34, height: 0.37 }} translateY={bottomY} entryScale={scale}>
        <AssetSlot slotId="source-a" sourceFrame={sourceAFrame} crop="centre" />
      </Panel>
      <Panel layerId="panel-right-top" bounds={{ left: 0.70, top: 0.03, width: 0.27, height: 0.39 }} translateX={rightX} translateY={0} entryScale={scale}>
        <AssetSlot slotId="source-a" sourceFrame={sourceAFrame} crop="portrait-right" />
      </Panel>
      <Panel layerId="panel-right-bottom" bounds={{ left: 0.70, top: 0.60, width: 0.27, height: 0.37 }} translateX={rightX} translateY={0} entryScale={scale}>
        <AssetSlot slotId="source-b" sourceFrame={sourceBFrame} crop="portrait-right" />
      </Panel>
      <TextSlot slotId="title-main" fontSlotId="font-title" parameterId="param-title" value={title} color={titleColor} size={titleSize} fixedToCanvas />
    </CompositionStage>
  );
};
`;

export interface SealedH03GeneratedProgramArtifactsV2R {
  evidencePack: Readonly<Record<string, unknown>>;
  referenceBlueprint: Readonly<Record<string, unknown>>;
  supplementalFacts: readonly Readonly<Record<string, unknown>>[];
  sourceBundle: Readonly<GeneratedCompositionSourceBundleV1>;
  program: Readonly<GeneratedCompositionProgramV1>;
}

export function buildSealedH03GeneratedProgramArtifactsV2R(input: {
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
}): Readonly<SealedH03GeneratedProgramArtifactsV2R> {
  requireArtifactSha(input.sourceAArtifactSha256);
  requireArtifactSha(input.sourceBArtifactSha256);
  const referenceBlueprint = deepFreezeV1({
    blueprintId: 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1', taskId: 'HOLD-03',
    targetClaims: [
      { claimId: 'claim-h03-six-asymmetric-windows', disposition: 'MUST' },
      { claimId: 'claim-h03-centred-title-safe-band', disposition: 'MUST' },
      { claimId: 'claim-h03-bounded-entry-exit', disposition: 'MUST' },
      { claimId: 'claim-h03-native-return-frame-270', disposition: 'MUST' },
      { claimId: 'claim-h03-reference-is-evidence-only', disposition: 'MUST_NOT_RENDER' },
    ],
  });
  const sourceFacts = [
    sourceFact('h03-a', input.sourceAArtifactSha256),
    sourceFact('h03-b', input.sourceBArtifactSha256),
  ];
  const proofRequirements = [
    'proof-h03-layout', 'proof-h03-face-title-separation', 'proof-h03-motion',
    'proof-h03-native-return', 'proof-h03-reference-exclusion',
  ].map((proofObligationId) => ({ proofObligationId }));
  const evidencePack = deepFreezeV1({
    evidencePackId: 'HOLD-03-GENERATED-EVIDENCE-PACK-V2R-1', taskId: 'HOLD-03',
    evidenceRefs: ['E1', 'E2', 'E3'],
    facts: [
      { factId: 'fact-h03-project', kind: 'PROJECT_REVISION', projectId: 'oe-hold-03', expectedProjectRevision: 'R12' },
      { factId: 'fact-h03-timebase', kind: 'PROJECT_TIMEBASE', timebaseId: 'oe-hold-03:timeline', rate: { numerator: '30', denominator: '1' } },
      { factId: 'fact-h03-canvas', kind: 'CANVAS', width: 1080, height: 1920, pixelAspectRatio: { numerator: '1', denominator: '1' } },
      { factId: 'fact-h03-range', kind: 'AUTHORIZED_TARGET_RANGE', start: '90', endExclusive: '270' },
      { factId: 'fact-h03-rights', kind: 'RIGHTS_POLICY', allowedAssetIds: ['h03-a', 'h03-b'], deniedAssetIds: ['h03-ref'] },
      { factId: 'fact-h03-windows', kind: 'ALLOWED_SOURCE_WINDOWS', windows: [
        { assetId: 'h03-a', ranges: [{ start: 0, endExclusive: 420 }] },
        { assetId: 'h03-b', ranges: [{ start: 0, endExclusive: 420 }] },
      ] },
      ...sourceFacts,
    ],
    proofRequirements,
  });
  const supplementalFacts = deepFreezeV1([
    {
      factId: 'fact-font-h03-title', kind: 'FONT_IDENTITY',
      fontAssetId: 'font-noto-sans-v27-regular', fontAssetVersion: `sha256:${FONT_SHA256}`,
      fileSha256: FONT_SHA256, family: 'Noto Sans', face: 'Regular', weight: 400,
      glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS',
      rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
    },
    {
      factId: 'fact-generated-api-h03', kind: 'GENERATED_COMPOSITION_API_IDENTITY',
      apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1',
      supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
    },
  ]);
  const sourceBundle = deepFreezeV1({
    bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
    entryFile: 'GeneratedComposition.tsx',
    files: [{
      path: 'GeneratedComposition.tsx', sha256: sha256TextV1(SEALED_H03_GENERATED_SOURCE_V2R),
      source: SEALED_H03_GENERATED_SOURCE_V2R,
    }],
  } satisfies GeneratedCompositionSourceBundleV1);
  const program = deepFreezeV1({
    artifactType: 'GeneratedCompositionProgramV1',
    contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    programId: 'gcp-hold-03-six-window-v2r-1', taskId: 'HOLD-03',
    sourceBundleHash: hashGeneratedCompositionSourceBundleV1(sourceBundle),
    generator: { kind: 'HUMAN_AUTHORED_FIXTURE', modelId: 'NONE', promptHash: 'NOT_APPLICABLE', toolVersions: ['typescript@5.9.3', 'remotion@4.0.509'] },
    projectBinding: { projectId: 'oe-hold-03', expectedProjectRevision: 'R12', evidencePackHash: hashCanonicalJsonV1(evidencePack) },
    referenceBinding: { blueprintId: 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1', blueprintHash: hashCanonicalJsonV1(referenceBlueprint) },
    projectTimebase: { timebaseId: 'oe-hold-03:timeline', timebaseVersion: 'V2R', rate: { numerator: '30', denominator: '1' } },
    compositionTimebase: { timebaseId: 'gcp-hold-03-six-window-v2r-1:local', timebaseVersion: 'GCP_V1', rate: { numerator: '30', denominator: '1' } },
    canvas: { width: 1080, height: 1920, pixelAspectRatio: { numerator: '1', denominator: '1' }, colorIntent: 'SDR_BT709' },
    duration: { compositionStartTick: '0', compositionEndExclusiveTick: '180', projectStartTick: '90', projectEndExclusiveTick: '270', headHandleTicks: '0', tailHandleTicks: '0', handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM' },
    sourceSlots: [
      sourceSlot('source-a', 'h03-a', input.sourceAArtifactSha256),
      sourceSlot('source-b', 'h03-b', input.sourceBArtifactSha256),
    ],
    fontSlots: [{ slotId: 'font-title', fontAssetId: 'font-noto-sans-v27-regular', fontAssetVersion: `sha256:${FONT_SHA256}`, fileSha256: FONT_SHA256, family: 'Noto Sans', face: 'Regular', weight: 400, axes: {}, glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS' }],
    textSlots: [{ slotId: 'title-main', fontSlotId: 'font-title', parameterId: 'param-title' }],
    declaredLayers: [
      layer('panel-left-top', 'source-a', 10), layer('panel-left-bottom', 'source-b', 20),
      layer('panel-centre-top', 'source-b', 30), layer('panel-centre-bottom', 'source-a', 40),
      layer('panel-right-top', 'source-a', 50), layer('panel-right-bottom', 'source-b', 60),
      { layerId: 'title-main', kind: 'TEXT', textSlotId: 'title-main', zIndex: 100 },
    ],
    exposedParameters: [
      { parameterId: 'param-title', kind: 'STRING', defaultValue: 'EVENT\nMOMENT' },
      { parameterId: 'param-title-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#FCDA2D' },
      { parameterId: 'param-title-size', kind: 'INTEGER', defaultValue: 112, minimum: 64, maximum: 160 },
      { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 10, minimum: 4, maximum: 32 },
      { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#000000' },
    ],
    allowedApi: { apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1', modules: [
      { specifier: 'react', version: '19.1.2' }, { specifier: 'remotion', version: '4.0.509' },
      { specifier: GENERATED_COMPOSITION_API_ID_V1, version: '1' },
    ] },
    securityPolicy: { network: 'DENY', secrets: 'DENY', database: 'DENY', projectMutation: 'DENY', filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY' },
    resourceBudget: { maxSourceFiles: 1, maxSourceBytes: 64 * 1024, maxInputBytes: 64 * 1024 * 1024, maxOutputBytes: 1024 * 1024 * 1024, maxFrames: 180, maxCpuMs: 120_000, maxWallTimeMs: 180_000, maxMemoryMiB: 2_048 },
    output: { kind: 'OPAQUE_NESTED_COMPOSITION', representation: 'EDITABLE_PROGRAM_AND_PROXY', flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY', audioDisposition: 'CUE_HANDOFF_ONLY' },
    stateEffects: [], proofObligationIds: proofRequirements.map(({ proofObligationId }) => proofObligationId),
    expectedMeasurementRefs: referenceBlueprint.targetClaims.map(({ claimId }) => claimId), audioCueIntents: [],
  } satisfies GeneratedCompositionProgramV1);
  return deepFreezeV1({ evidencePack, referenceBlueprint, supplementalFacts, sourceBundle, program });
}

function sourceFact(assetId: string, assetVersion: string) {
  return { factId: `fact-source-${assetId}`, kind: 'SOURCE_MEDIA_IDENTITY', assetId, assetVersion,
    timebase: { timebaseId: `${assetId}:source`, timebaseVersion: 'V2R', rate: { numerator: '30', denominator: '1' } } };
}
function sourceSlot(slotId: string, assetId: string, assetVersion: string) {
  return { slotId, assetId, assetVersion, coordinateDomain: 'SOURCE_FRAME' as const,
    timebase: { timebaseId: `${assetId}:source`, timebaseVersion: 'V2R', rate: { numerator: '30', denominator: '1' } },
    sourceRange: { start: '0', endExclusive: '420' } };
}
function layer(layerId: string, sourceSlotId: string, zIndex: number) {
  return { layerId, kind: 'SOURCE_PANEL' as const, sourceSlotId, zIndex };
}
function requireArtifactSha(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('SEALED_H03_SOURCE_ARTIFACT_IDENTITY_INVALID');
}
