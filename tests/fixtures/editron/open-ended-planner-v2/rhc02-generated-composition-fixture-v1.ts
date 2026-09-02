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
import type { Stage25Rhc02PreviewMediaFixtureReceiptV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-media-fixture-v1';

import {
  RHC02_PREVIEW_ASSET_IDS_V1,
  RHC02_PREVIEW_FONT_ID_V1,
  buildRhc02PreviewFixtureV1,
  type Rhc02PreviewFixtureIdentityV1,
} from './rhc02-preview-fixture-v1';

export const RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_GENERATED_COMPOSITION_FIXTURE_V1' as const;

export const RHC02_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const title = useCompositionParameter<string>('param-title');
  const color = useCompositionParameter<string>('param-title-color');
  const titleSize = useCompositionParameter<number>('param-title-size');
  const gutter = useCompositionParameter<number>('param-gutter');
  const background = useCompositionParameter<string>('param-background');
  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel layerId="panel-still-a" bounds={{ left: 0, top: 0, width: 0.5, height: 1 }} translateY={0}>
        <AssetSlot slotId="source-still-a" sourceFrame={0} crop="centre" />
      </Panel>
      <Panel layerId="panel-still-b" bounds={{ left: 0.5, top: 0, width: 0.5, height: 1 }} translateY={0}>
        <AssetSlot slotId="source-still-b" sourceFrame={0} crop="centre" />
      </Panel>
      <TextSlot slotId="title-main" fontSlotId="font-title" parameterId="param-title" value={title} color={color} size={titleSize} fixedToCanvas />
    </CompositionStage>
  );
};
`;

const sourceSha256 = sha256TextV1(RHC02_GENERATED_COMPOSITION_SOURCE_V1);

export const RHC02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1 = deepFreezeV1({
  bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  entryFile: 'GeneratedComposition.tsx',
  files: [{
    path: 'GeneratedComposition.tsx',
    sha256: sourceSha256,
    source: RHC02_GENERATED_COMPOSITION_SOURCE_V1,
  }],
} satisfies GeneratedCompositionSourceBundleV1);

export function buildRhc02PreviewIdentityFromMediaV1(
  media: Readonly<Stage25Rhc02PreviewMediaFixtureReceiptV1>,
): Readonly<Rhc02PreviewFixtureIdentityV1> {
  const assets = new Map(media.assets.map((asset) => [asset.assetId, asset]));
  const rights = new Map(media.provenance.map((receipt) => [receipt.assetId, receipt]));
  if (assets.size !== RHC02_PREVIEW_ASSET_IDS_V1.length
    || rights.size !== RHC02_PREVIEW_ASSET_IDS_V1.length
    || RHC02_PREVIEW_ASSET_IDS_V1.some((assetId) => (
      !assets.has(assetId) || !rights.has(assetId)
    ))) {
    fail('MEDIA_ASSET_SET_INVALID');
  }
  return deepFreezeV1({
    assetVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(assets.get(assetId)?.sha256, `ASSET_${assetId}`)}`,
    ])) as Rhc02PreviewFixtureIdentityV1['assetVersions'],
    rightsEvidenceVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(rights.get(assetId)?.receiptSha256, `RIGHTS_${assetId}`)}`,
    ])) as Rhc02PreviewFixtureIdentityV1['rightsEvidenceVersions'],
    fontVersion: `sha256:${media.font.sha256}`,
    fontFileSha256: media.font.sha256,
  });
}

export function buildRhc02GeneratedCompositionFixtureV1(
  identity: Rhc02PreviewFixtureIdentityV1,
): Readonly<{
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: Readonly<Record<string, unknown>>;
  referenceBlueprint: Readonly<Record<string, unknown>>;
  supplementalFacts: readonly Readonly<Record<string, unknown>>[];
  handoffs: ReturnType<typeof buildRhc02PreviewFixtureV1>['boundaryHandoff'];
}> {
  const routeFixture = buildRhc02PreviewFixtureV1(identity);
  const projectId = routeFixture.projectId;
  const rate = { numerator: '30', denominator: '1' } as const;
  const stillIds = ['rhc02-still-a', 'rhc02-still-b'] as const;
  const evidencePack = deepFreezeV1({
    version: RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-02',
    route: 'HYBRID',
    facts: [
      {
        factId: 'rhc02-project-revision', kind: 'PROJECT_REVISION',
        projectId, expectedProjectRevision: 'R1',
      },
      {
        factId: 'rhc02-project-timebase', kind: 'PROJECT_TIMEBASE',
        timebaseId: `${projectId}:timeline`, rate,
      },
      {
        factId: 'rhc02-canvas', kind: 'CANVAS', width: 1080, height: 1920,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
      },
      {
        factId: 'rhc02-authorized-target', kind: 'AUTHORIZED_TARGET_RANGE',
        start: '300', endExclusive: '390',
      },
      ...stillIds.map((assetId) => ({
        factId: `rhc02-source-${assetId}`,
        kind: 'SOURCE_MEDIA_IDENTITY',
        mediaKind: 'STILL_IMAGE',
        assetId,
        assetVersion: identity.assetVersions[assetId],
        rightsEvidenceVersion: identity.rightsEvidenceVersions[assetId],
        rightsStatus: 'INTERNAL_OWNED_FIXTURE',
        timebase: { timebaseId: `${assetId}:source`, rate },
      })),
      {
        factId: 'rhc02-source-windows', kind: 'ALLOWED_SOURCE_WINDOWS',
        windows: stillIds.map((assetId) => ({
          assetId, ranges: [{ start: '0', endExclusive: '1' }],
        })),
      },
      {
        factId: 'rhc02-rights', kind: 'RIGHTS_POLICY',
        allowedAssetIds: [...stillIds],
      },
      {
        factId: 'rhc02-font', kind: 'FONT_IDENTITY',
        fontAssetId: RHC02_PREVIEW_FONT_ID_V1,
        fontAssetVersion: identity.fontVersion,
        fileSha256: identity.fontFileSha256,
        family: 'Noto Sans', face: 'Regular', weight: 700,
        rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
        licenseId: 'OFL-1.1-NOTO-SANS',
      },
      {
        factId: 'rhc02-audio-baseline', kind: 'IMMUTABLE_AUDIO_BASELINE',
        owner: routeFixture.audioBaseline.owner,
        baselineHash: hashCanonicalJsonV1(routeFixture.audioBaseline),
      },
    ],
    proofRequirements: routeFixture.evidencePack.proofRequirements,
  });
  const referenceBlueprint = deepFreezeV1({
    version: RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-02',
    blueprintId: 'RHC-02-HYBRID-BLUEPRINT-V1',
    targetClaims: [
      { claimId: 'rhc02-claim-both-stills-title', target: 'BOTH_STILLS_AND_EXACT_TITLE' },
      { claimId: 'rhc02-claim-boundary', target: 'FRAME_390_RETURNS_TO_INTERVIEW_SOURCE_390' },
      { claimId: 'rhc02-claim-editability', target: 'SOURCE_AND_TEXT_BINDINGS_EDITABLE' },
      { claimId: 'rhc02-claim-audio', target: 'NATIVE_PCM_BASELINE_UNCHANGED' },
    ],
  });
  const supplementalFacts = deepFreezeV1([{
    factId: 'rhc02-generated-api',
    kind: 'GENERATED_COMPOSITION_API_IDENTITY',
    apiId: GENERATED_COMPOSITION_API_ID_V1,
    apiVersion: '1',
    supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
  }]);
  const program = deepFreezeV1({
    artifactType: 'GeneratedCompositionProgramV1',
    contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    programId: 'gcp-rhc02-hybrid-v1',
    taskId: 'RHC-02',
    sourceBundleHash:
      hashGeneratedCompositionSourceBundleV1(RHC02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1),
    generator: {
      kind: 'HUMAN_AUTHORED_FIXTURE', modelId: 'NONE', promptHash: 'NOT_APPLICABLE',
      toolVersions: ['typescript@5.9.3', 'remotion@4.0.509'],
    },
    projectBinding: {
      projectId, expectedProjectRevision: 'R1',
      evidencePackHash: hashCanonicalJsonV1(evidencePack),
    },
    referenceBinding: {
      blueprintId: referenceBlueprint.blueprintId,
      blueprintHash: hashCanonicalJsonV1(referenceBlueprint),
    },
    projectTimebase: {
      timebaseId: `${projectId}:timeline`, timebaseVersion: 'RHC02_V1', rate,
    },
    compositionTimebase: {
      timebaseId: 'gcp-rhc02-hybrid:local', timebaseVersion: 'GCP_V1', rate,
    },
    canvas: {
      width: 1080, height: 1920,
      pixelAspectRatio: { numerator: '1', denominator: '1' }, colorIntent: 'SDR_BT709',
    },
    duration: {
      compositionStartTick: '0', compositionEndExclusiveTick: '90',
      projectStartTick: '300', projectEndExclusiveTick: '390',
      headHandleTicks: '0', tailHandleTicks: '0',
      handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
    },
    sourceSlots: stillIds.map((assetId, index) => ({
      slotId: index === 0 ? 'source-still-a' : 'source-still-b',
      assetId,
      assetVersion: identity.assetVersions[assetId],
      coordinateDomain: 'SOURCE_FRAME' as const,
      timebase: { timebaseId: `${assetId}:source`, timebaseVersion: 'RHC02_V1', rate },
      sourceRange: { start: '0', endExclusive: '1' },
    })),
    fontSlots: [{
      slotId: 'font-title', fontAssetId: RHC02_PREVIEW_FONT_ID_V1,
      fontAssetVersion: identity.fontVersion, fileSha256: identity.fontFileSha256,
      family: 'Noto Sans', face: 'Regular', weight: 700, axes: {},
      glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS',
    }],
    textSlots: [{ slotId: 'title-main', fontSlotId: 'font-title', parameterId: 'param-title' }],
    declaredLayers: [
      { layerId: 'panel-still-a', kind: 'SOURCE_PANEL', sourceSlotId: 'source-still-a', zIndex: 10 },
      { layerId: 'panel-still-b', kind: 'SOURCE_PANEL', sourceSlotId: 'source-still-b', zIndex: 20 },
      { layerId: 'title-main', kind: 'TEXT', textSlotId: 'title-main', zIndex: 100 },
    ],
    exposedParameters: [
      { parameterId: 'param-title', kind: 'STRING', defaultValue: 'How we shipped it' },
      { parameterId: 'param-title-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#FFFFFF' },
      { parameterId: 'param-title-size', kind: 'INTEGER', defaultValue: 76, minimum: 48, maximum: 112 },
      { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 12, minimum: 0, maximum: 48 },
      { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#10141C' },
    ],
    allowedApi: {
      apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1',
      modules: [
        { specifier: 'react', version: '19.1.2' },
        { specifier: 'remotion', version: '4.0.509' },
        { specifier: GENERATED_COMPOSITION_API_ID_V1, version: '1' },
      ],
    },
    securityPolicy: {
      network: 'DENY', secrets: 'DENY', database: 'DENY', projectMutation: 'DENY',
      filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY',
    },
    resourceBudget: {
      maxSourceFiles: 1, maxSourceBytes: 96 * 1024, maxInputBytes: 64 * 1024 * 1024,
      maxOutputBytes: 512 * 1024 * 1024, maxFrames: 90, maxCpuMs: 120_000,
      maxWallTimeMs: 180_000, maxMemoryMiB: 2_048,
    },
    output: {
      kind: 'OPAQUE_NESTED_COMPOSITION', representation: 'EDITABLE_PROGRAM_AND_PROXY',
      flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY', audioDisposition: 'CUE_HANDOFF_ONLY',
    },
    stateEffects: [],
    proofObligationIds: evidencePack.proofRequirements.map(
      ({ proofObligationId }) => proofObligationId,
    ),
    expectedMeasurementRefs: referenceBlueprint.targetClaims.map(({ claimId }) => claimId),
    audioCueIntents: [
      { cueId: 'rhc02-native-audio-entry', localTick: '0', semanticEvent: 'NATIVE_AUDIO_CONTINUES' },
      { cueId: 'rhc02-native-audio-exit', localTick: '89', semanticEvent: 'NATIVE_AUDIO_REMAINS_CONTINUOUS' },
    ],
  } satisfies GeneratedCompositionProgramV1);
  return deepFreezeV1({
    program,
    sourceBundle: RHC02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack,
    referenceBlueprint,
    supplementalFacts,
    handoffs: routeFixture.boundaryHandoff,
  });
}

function required(value: string | undefined, label: string): string {
  return value ?? fail(`${label}_MISSING`);
}

function fail(code: string): never {
  throw new Error(`RHC02_GENERATED_COMPOSITION_FIXTURE_${code}`);
}
