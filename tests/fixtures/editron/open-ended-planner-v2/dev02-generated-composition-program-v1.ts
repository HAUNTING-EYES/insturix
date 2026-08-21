import blueprint from './dev02-canonical-reference-blueprint-v2.json';
import evidencePack from './dev02-stage3-evidence-pack-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  GENERATED_COMPOSITION_API_ID_V1,
  GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';

export const DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1 = deepFreezeV1({
  blueprintId: 'DEV-02-CANONICAL-REFERENCE-V2',
  blueprintHash: hashCanonicalJsonV1(blueprint),
});

export const DEV02_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
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
  const entryScale = interpolate(frame, [0, 24], [0.7, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const centreTravel = interpolate(frame, [0, 108], [1320, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sideTravel = interpolate(frame, [0, 108], [-1008, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const takeoverProgress = interpolate(frame, [145, durationInFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exitSourceFrame = 180;
  const heldFrame = frame >= 108 && frame <= 144 ? 108 : frame;
  const wideOffsetFrame = (heldFrame + 60) % 180;
  const closeOffsetFrame = 180 + ((heldFrame + 30) % 165);

  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel layerId="panel-left-top" column="left" row="top" translateY={sideTravel}>
        <AssetSlot slotId="source-wide" sourceFrame={heldFrame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-left-bottom" column="left" row="bottom" translateY={sideTravel}>
        <AssetSlot slotId="source-close" sourceFrame={closeOffsetFrame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-centre" column="centre" row="centre" translateY={centreTravel} entryScale={entryScale} takeoverProgress={takeoverProgress}>
        <AssetSlot slotId="source-close" sourceFrame={exitSourceFrame} crop="centre" />
      </Panel>
      <Panel layerId="panel-right-top" column="right" row="top" translateY={sideTravel}>
        <AssetSlot slotId="source-wide" sourceFrame={wideOffsetFrame} crop="portrait-right" />
      </Panel>
      <Panel layerId="panel-right-bottom" column="right" row="bottom" translateY={sideTravel}>
        <AssetSlot slotId="source-close" sourceFrame={closeOffsetFrame} crop="portrait-right" />
      </Panel>
      <TextSlot slotId="title-main" fontSlotId="font-title" parameterId="param-title" value={title} color={titleColor} size={titleSize} fixedToCanvas visibleUntilFrame={172} />
    </CompositionStage>
  );
};
`;

const sourceSha = sha256TextV1(DEV02_GENERATED_COMPOSITION_SOURCE_V1);
export const DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1 = deepFreezeV1({
  bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  entryFile: 'GeneratedComposition.tsx',
  files: [{ path: 'GeneratedComposition.tsx', sha256: sourceSha, source: DEV02_GENERATED_COMPOSITION_SOURCE_V1 }],
} satisfies GeneratedCompositionSourceBundleV1);

const fontSha = 'd2a8188db7fdd567bbd94017cec0622373d47206d45281b7c501f0775cdee83a';
export const DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1 = deepFreezeV1([
  {
    factId: 'fact-font-dev02-title', kind: 'FONT_IDENTITY', fontAssetId: 'font-noto-sans-v27-regular',
    fontAssetVersion: `sha256:${fontSha}`, fileSha256: fontSha, family: 'Noto Sans', face: 'Regular',
    weight: 400, glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS',
    rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE', materializationStatus: 'MATERIALIZED_LOCAL_DEPENDENCY',
    materializedPath: 'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf',
  },
  {
    factId: 'fact-generated-composition-api-v1', kind: 'GENERATED_COMPOSITION_API_IDENTITY',
    apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1', supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
  },
]);

export const DEV02_GENERATED_COMPOSITION_PROGRAM_V1 = deepFreezeV1({
  artifactType: 'GeneratedCompositionProgramV1',
  contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
  programId: 'gcp-dev02-filmstrip-v1',
  taskId: 'DEV-02',
  sourceBundleHash: hashGeneratedCompositionSourceBundleV1(DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1),
  generator: { kind: 'HUMAN_AUTHORED_FIXTURE', modelId: 'NONE', promptHash: 'NOT_APPLICABLE', toolVersions: ['typescript@5.9.3', 'remotion@4.0.509'] },
  projectBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3', evidencePackHash: hashCanonicalJsonV1(evidencePack) },
  referenceBinding: DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
  projectTimebase: { timebaseId: 'oe-dev-02:timeline', timebaseVersion: 'V2_1F', rate: { numerator: '30', denominator: '1' } },
  compositionTimebase: { timebaseId: 'gcp-dev02-filmstrip-v1:local', timebaseVersion: 'GCP_V1', rate: { numerator: '30', denominator: '1' } },
  canvas: { width: 1080, height: 1920, pixelAspectRatio: { numerator: '1', denominator: '1' }, colorIntent: 'SDR_BT709' },
  duration: {
    compositionStartTick: '0', compositionEndExclusiveTick: '180', projectStartTick: '0', projectEndExclusiveTick: '180',
    headHandleTicks: '0', tailHandleTicks: '0', handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
  },
  sourceSlots: [
    { slotId: 'source-wide', assetId: 'dev02-wide', assetVersion: 'sha256:dacb93870b9050251ebcd285fae783f378af66301813b47f074f44ed75b97219', coordinateDomain: 'SOURCE_FRAME', timebase: { timebaseId: 'dev02-wide:source', timebaseVersion: 'V2_1F', rate: { numerator: '30', denominator: '1' } }, sourceRange: { start: '0', endExclusive: '180' } },
    { slotId: 'source-close', assetId: 'dev02-close', assetVersion: 'sha256:645d5ecbf7cec49f837768cee0fa2469c9fec79f54f4928160920c3a1a22782a', coordinateDomain: 'SOURCE_FRAME', timebase: { timebaseId: 'dev02-close:source', timebaseVersion: 'V2_1F', rate: { numerator: '30', denominator: '1' } }, sourceRange: { start: '180', endExclusive: '345' } },
  ],
  fontSlots: [{ slotId: 'font-title', fontAssetId: 'font-noto-sans-v27-regular', fontAssetVersion: `sha256:${fontSha}`, fileSha256: fontSha, family: 'Noto Sans', face: 'Regular', weight: 400, axes: {}, glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS' }],
  textSlots: [{ slotId: 'title-main', fontSlotId: 'font-title', parameterId: 'param-title' }],
  declaredLayers: [
    { layerId: 'panel-left-top', kind: 'SOURCE_PANEL', sourceSlotId: 'source-wide', zIndex: 10 },
    { layerId: 'panel-left-bottom', kind: 'SOURCE_PANEL', sourceSlotId: 'source-close', zIndex: 20 },
    { layerId: 'panel-centre', kind: 'SOURCE_PANEL', sourceSlotId: 'source-close', zIndex: 90 },
    { layerId: 'panel-right-top', kind: 'SOURCE_PANEL', sourceSlotId: 'source-wide', zIndex: 40 },
    { layerId: 'panel-right-bottom', kind: 'SOURCE_PANEL', sourceSlotId: 'source-close', zIndex: 50 },
    { layerId: 'title-main', kind: 'TEXT', textSlotId: 'title-main', zIndex: 100 },
  ],
  exposedParameters: [
    { parameterId: 'param-title', kind: 'STRING', defaultValue: 'YOUR EVENT\nRECAP' },
    { parameterId: 'param-title-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#F7E300' },
    { parameterId: 'param-title-size', kind: 'INTEGER', defaultValue: 112, minimum: 48, maximum: 180 },
    { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 10, minimum: 0, maximum: 48 },
    { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#000000' },
  ],
  allowedApi: { apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1', modules: [{ specifier: 'react', version: '19.1.2' }, { specifier: 'remotion', version: '4.0.509' }, { specifier: GENERATED_COMPOSITION_API_ID_V1, version: '1' }] },
  securityPolicy: { network: 'DENY', secrets: 'DENY', database: 'DENY', projectMutation: 'DENY', filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY' },
  resourceBudget: { maxSourceFiles: 1, maxSourceBytes: 64 * 1024, maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 512 * 1024 * 1024, maxFrames: 180, maxCpuMs: 120_000, maxWallTimeMs: 180_000, maxMemoryMiB: 2_048 },
  output: { kind: 'OPAQUE_NESTED_COMPOSITION', representation: 'EDITABLE_PROGRAM_AND_PROXY', flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY', audioDisposition: 'CUE_HANDOFF_ONLY' },
  stateEffects: [],
  proofObligationIds: evidencePack.proofRequirements.map(({ proofObligationId }) => proofObligationId),
  expectedMeasurementRefs: ['claim-ref-five-panels', 'claim-ref-black-gutters', 'claim-ref-yellow-two-line-title', 'claim-ref-opposed-motion', 'claim-ref-green-centre-takeover', 'claim-ref-temporal-progression'],
  audioCueIntents: [],
} satisfies GeneratedCompositionProgramV1);

export { blueprint as DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, evidencePack as DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1 };
