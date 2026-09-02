import {
  deepFreezeV1,
  hashCanonicalJsonV1,
  sha256TextV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  GENERATED_COMPOSITION_API_ID_V1,
  GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';

export const RHC01_PREVIEW_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC01_PREVIEW_FIXTURE_V1_1' as const;

export const RHC01_PREVIEW_ASSET_IDS_V1 = Object.freeze([
  'rhc01-product-a',
  'rhc01-product-b',
  'rhc01-product-c',
  'rhc01-following-shot',
] as const);

export const RHC01_PREVIEW_FONT_ID_V1 = 'rhc01-licensed-display' as const;

export const RHC01_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fast = useCompositionParameter<string>('param-fast');
  const quiet = useCompositionParameter<string>('param-quiet');
  const light = useCompositionParameter<string>('param-light');
  const color = useCompositionParameter<string>('param-title-color');
  const titleSize = useCompositionParameter<number>('param-title-size');
  const gutter = useCompositionParameter<number>('param-gutter');
  const background = useCompositionParameter<string>('param-background');
  const firstX = interpolate(frame, [0, 24], [-360, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const secondY = interpolate(frame, [24, 48], [1920, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const thirdX = interpolate(frame, [48, 72], [360, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const releaseStart = durationInFrames - 45;
  const takeoverProgress = interpolate(frame, [releaseStart, durationInFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const label = frame < 24 ? fast : frame < 48 ? fast + '   ' + quiet : fast + '   ' + quiet + '   ' + light;

  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel layerId="panel-fast" bounds={{ left: 0, top: 0, width: 0.333333, height: 1 }} translateX={firstX} translateY={0}>
        <AssetSlot slotId="source-fast" sourceFrame={frame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-quiet" bounds={{ left: 0.333333, top: 0, width: 0.333334, height: 1 }} translateY={secondY}>
        <AssetSlot slotId="source-quiet" sourceFrame={frame} crop="centre" />
      </Panel>
      <Panel layerId="panel-light" bounds={{ left: 0.666667, top: 0, width: 0.333333, height: 1 }} translateX={thirdX} translateY={0} takeoverProgress={takeoverProgress}>
        <AssetSlot slotId="source-light" sourceFrame={frame} crop="portrait-right" />
      </Panel>
      <TextSlot slotId="title-main" fontSlotId="font-title" parameterId="param-fast" value={label} color={color} size={titleSize} fixedToCanvas visibleUntilFrame={durationInFrames - 6} />
    </CompositionStage>
  );
};
`;

const sourceSha = sha256TextV1(RHC01_GENERATED_COMPOSITION_SOURCE_V1);
export const RHC01_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1 = deepFreezeV1({
  bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  entryFile: 'GeneratedComposition.tsx',
  files: [{
    path: 'GeneratedComposition.tsx',
    sha256: sourceSha,
    source: RHC01_GENERATED_COMPOSITION_SOURCE_V1,
  }],
} satisfies GeneratedCompositionSourceBundleV1);

export interface Rhc01PreviewFixtureIdentityV1 {
  assetVersions: Readonly<Record<typeof RHC01_PREVIEW_ASSET_IDS_V1[number], `sha256:${string}`>>;
  fontVersion: `sha256:${string}`;
  fontFileSha256: string;
}

export function buildRhc01GeneratedCompositionFixtureV1(input: {
  identity: Rhc01PreviewFixtureIdentityV1;
  route: 'GENERATED_COMPOSITION' | 'HYBRID';
}): Readonly<{
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: Readonly<Record<string, unknown>>;
  referenceBlueprint: Readonly<Record<string, unknown>>;
  supplementalFacts: readonly Readonly<Record<string, unknown>>[];
}> {
  const duration = input.route === 'HYBRID' ? 150 : 180;
  const projectId = 'stage25-rhc01-preview';
  const timebase = { numerator: '30', denominator: '1' } as const;
  const evidencePack = deepFreezeV1({
    version: RHC01_PREVIEW_FIXTURE_VERSION_V1,
    taskId: 'RHC-01',
    route: input.route,
    facts: [
      { factId: 'rhc01-project-revision', kind: 'PROJECT_REVISION', projectId, expectedProjectRevision: 'R1' },
      { factId: 'rhc01-project-timebase', kind: 'PROJECT_TIMEBASE', timebaseId: `${projectId}:timeline`, rate: timebase },
      { factId: 'rhc01-canvas', kind: 'CANVAS', width: 1080, height: 1920, pixelAspectRatio: { numerator: '1', denominator: '1' } },
      { factId: 'rhc01-target-range', kind: 'AUTHORIZED_TARGET_RANGE', start: '0', endExclusive: String(duration) },
      ...RHC01_PREVIEW_ASSET_IDS_V1.slice(0, 3).map((assetId) => ({
        factId: `rhc01-source-${assetId}`,
        kind: 'SOURCE_MEDIA_IDENTITY',
        assetId,
        assetVersion: input.identity.assetVersions[assetId],
        rightsStatus: 'INTERNAL_OWNED_FIXTURE',
        timebase: { timebaseId: `${assetId}:source`, rate: timebase },
      })),
      {
        factId: 'rhc01-source-windows',
        kind: 'ALLOWED_SOURCE_WINDOWS',
        windows: RHC01_PREVIEW_ASSET_IDS_V1.slice(0, 3).map((assetId) => ({
          assetId,
          ranges: [{ start: '0', endExclusive: '210' }],
        })),
      },
      {
        factId: 'rhc01-rights',
        kind: 'RIGHTS_POLICY',
        allowedAssetIds: [...RHC01_PREVIEW_ASSET_IDS_V1],
      },
    ],
    proofRequirements: [
      { proofObligationId: 'rhc01-proof-ordered-reveal' },
      { proofObligationId: 'rhc01-proof-simultaneous-hold' },
      { proofObligationId: 'rhc01-proof-boundary-continuity' },
      { proofObligationId: 'rhc01-proof-editability' },
      { proofObligationId: 'rhc01-proof-rights' },
    ],
  });
  const referenceBlueprint = deepFreezeV1({
    version: RHC01_PREVIEW_FIXTURE_VERSION_V1,
    taskId: 'RHC-01',
    blueprintId: `RHC-01-${input.route}-BLUEPRINT-V1`,
    targetClaims: [
      { claimId: 'rhc01-claim-ordered-reveal', target: 'FAST_THEN_QUIET_THEN_LIGHT' },
      { claimId: 'rhc01-claim-simultaneous-hold', target: 'THREE_LABELLED_SOURCES_VISIBLE' },
      { claimId: 'rhc01-claim-boundary-continuity', target: 'LIGHT_SOURCE_CONTINUES' },
      { claimId: 'rhc01-claim-editability', target: 'TEXT_COLOR_SPACING_SOURCES_EDITABLE' },
    ],
  });
  const supplementalFacts = deepFreezeV1([
    {
      factId: 'rhc01-font',
      kind: 'FONT_IDENTITY',
      fontAssetId: RHC01_PREVIEW_FONT_ID_V1,
      fontAssetVersion: input.identity.fontVersion,
      fileSha256: input.identity.fontFileSha256,
      rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
      licenseId: 'OFL-1.1-NOTO-SANS',
    },
    {
      factId: 'rhc01-generated-api',
      kind: 'GENERATED_COMPOSITION_API_IDENTITY',
      apiId: GENERATED_COMPOSITION_API_ID_V1,
      apiVersion: '1',
      supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
    },
  ]);
  const program = deepFreezeV1({
    artifactType: 'GeneratedCompositionProgramV1',
    contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    programId: `gcp-rhc01-${input.route.toLowerCase()}-v1`,
    taskId: 'RHC-01',
    sourceBundleHash: hashGeneratedCompositionSourceBundleV1(RHC01_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1),
    generator: {
      kind: 'HUMAN_AUTHORED_FIXTURE',
      modelId: 'NONE',
      promptHash: 'NOT_APPLICABLE',
      toolVersions: ['typescript@5.9.3', 'remotion@4.0.509'],
    },
    projectBinding: {
      projectId,
      expectedProjectRevision: 'R1',
      evidencePackHash: hashCanonicalJsonV1(evidencePack),
    },
    referenceBinding: {
      blueprintId: String(referenceBlueprint.blueprintId),
      blueprintHash: hashCanonicalJsonV1(referenceBlueprint),
    },
    projectTimebase: { timebaseId: `${projectId}:timeline`, timebaseVersion: 'RHC01_V1', rate: timebase },
    compositionTimebase: { timebaseId: `gcp-rhc01-${input.route.toLowerCase()}:local`, timebaseVersion: 'GCP_V1', rate: timebase },
    canvas: { width: 1080, height: 1920, pixelAspectRatio: { numerator: '1', denominator: '1' }, colorIntent: 'SDR_BT709' },
    duration: {
      compositionStartTick: '0',
      compositionEndExclusiveTick: String(duration),
      projectStartTick: '0',
      projectEndExclusiveTick: String(duration),
      headHandleTicks: '0',
      tailHandleTicks: '0',
      handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
    },
    sourceSlots: RHC01_PREVIEW_ASSET_IDS_V1.slice(0, 3).map((assetId, index) => ({
      slotId: ['source-fast', 'source-quiet', 'source-light'][index],
      assetId,
      assetVersion: input.identity.assetVersions[assetId],
      coordinateDomain: 'SOURCE_FRAME' as const,
      timebase: { timebaseId: `${assetId}:source`, timebaseVersion: 'RHC01_V1', rate: timebase },
      sourceRange: { start: '0', endExclusive: '210' },
    })),
    fontSlots: [{
      slotId: 'font-title',
      fontAssetId: RHC01_PREVIEW_FONT_ID_V1,
      fontAssetVersion: input.identity.fontVersion,
      fileSha256: input.identity.fontFileSha256,
      family: 'Noto Sans',
      face: 'Regular',
      weight: 700,
      axes: {},
      glyphCoverage: 'LATIN_V27',
      licenseId: 'OFL-1.1-NOTO-SANS',
    }],
    textSlots: [{ slotId: 'title-main', fontSlotId: 'font-title', parameterId: 'param-fast' }],
    declaredLayers: [
      { layerId: 'panel-fast', kind: 'SOURCE_PANEL', sourceSlotId: 'source-fast', zIndex: 10 },
      { layerId: 'panel-quiet', kind: 'SOURCE_PANEL', sourceSlotId: 'source-quiet', zIndex: 20 },
      { layerId: 'panel-light', kind: 'SOURCE_PANEL', sourceSlotId: 'source-light', zIndex: 30 },
      { layerId: 'title-main', kind: 'TEXT', textSlotId: 'title-main', zIndex: 100 },
    ],
    exposedParameters: [
      { parameterId: 'param-fast', kind: 'STRING', defaultValue: 'FAST' },
      { parameterId: 'param-quiet', kind: 'STRING', defaultValue: 'QUIET' },
      { parameterId: 'param-light', kind: 'STRING', defaultValue: 'LIGHT' },
      { parameterId: 'param-title-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#F4E8C1' },
      { parameterId: 'param-title-size', kind: 'INTEGER', defaultValue: 82, minimum: 48, maximum: 132 },
      { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 12, minimum: 0, maximum: 48 },
      { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#080808' },
    ],
    allowedApi: {
      apiId: GENERATED_COMPOSITION_API_ID_V1,
      apiVersion: '1',
      modules: [
        { specifier: 'react', version: '19.1.2' },
        { specifier: 'remotion', version: '4.0.509' },
        { specifier: GENERATED_COMPOSITION_API_ID_V1, version: '1' },
      ],
    },
    securityPolicy: {
      network: 'DENY',
      secrets: 'DENY',
      database: 'DENY',
      projectMutation: 'DENY',
      filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY',
    },
    resourceBudget: {
      maxSourceFiles: 1,
      maxSourceBytes: 96 * 1024,
      maxInputBytes: 64 * 1024 * 1024,
      maxOutputBytes: 512 * 1024 * 1024,
      maxFrames: 210,
      maxCpuMs: 120_000,
      maxWallTimeMs: 180_000,
      maxMemoryMiB: 2_048,
    },
    output: {
      kind: 'OPAQUE_NESTED_COMPOSITION',
      representation: 'EDITABLE_PROGRAM_AND_PROXY',
      flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY',
      audioDisposition: 'CUE_HANDOFF_ONLY',
    },
    stateEffects: [],
    proofObligationIds: evidencePack.proofRequirements.map(({ proofObligationId }) => proofObligationId),
    expectedMeasurementRefs: referenceBlueprint.targetClaims.map(({ claimId }) => claimId),
    audioCueIntents: [],
  } satisfies GeneratedCompositionProgramV1);
  return deepFreezeV1({
    program,
    sourceBundle: RHC01_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack,
    referenceBlueprint,
    supplementalFacts,
  });
}
