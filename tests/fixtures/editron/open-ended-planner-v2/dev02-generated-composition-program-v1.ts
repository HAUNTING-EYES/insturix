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

export const DEV02_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const gutter = useCompositionParameter('param-gutter');
  const title = useCompositionParameter('param-title');
  const titleColor = useCompositionParameter('param-title-color');
  const titleSize = useCompositionParameter('param-title-size');
  const background = useCompositionParameter('param-background');
  const entryScale = interpolate(frame, [0, 24], [2.96, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const centreTravel = interpolate(frame, [24, 150], [0, 1320], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sideTravel = interpolate(frame, [24, 150], [0, -1008], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exitScale = interpolate(frame, [150, durationInFrames - 1], [1, 2.96], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exitSourceFrame = 180 + Math.max(0, frame - 150);

  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel column="left" translateY={sideTravel}>
        <AssetSlot slotId="source-wide" sourceFrame={frame} crop="portrait-left" />
      </Panel>
      <Panel column="centre" translateY={centreTravel} entryScale={entryScale} exitScale={exitScale}>
        <AssetSlot slotId="source-close" sourceFrame={exitSourceFrame} crop="centre" />
      </Panel>
      <Panel column="right" translateY={sideTravel}>
        <AssetSlot slotId="source-wide" sourceFrame={frame} crop="portrait-right" />
      </Panel>
      <TextSlot slotId="title-main" fontSlotId="font-title" parameterId="param-title" value={title} color={titleColor} size={titleSize} fixedToCanvas />
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

const fontSha = sha256TextV1('DEV02_CONTRACT_FIXTURE_FONT_IDENTITY_V1');
export const DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1 = deepFreezeV1([
  {
    factId: 'fact-font-dev02-title', kind: 'FONT_IDENTITY', fontAssetId: 'font-dev02-title',
    fontAssetVersion: `sha256:${fontSha}`, fileSha256: fontSha, family: 'Editron Fixture Sans', face: 'Bold',
    weight: 700, glyphCoverage: 'ASCII_BASIC', licenseId: 'INTERNAL_FIXTURE_LICENSE',
    rightsStatus: 'INTERNAL_OWNED_FIXTURE', materializationStatus: 'IDENTITY_ONLY_CONTRACT_FIXTURE',
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
  generator: { kind: 'HUMAN_AUTHORED_FIXTURE', modelId: 'NONE', promptHash: 'NOT_APPLICABLE', toolVersions: ['typescript@5.9.3', 'remotion@4.0.398'] },
  projectBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3', evidencePackHash: hashCanonicalJsonV1(evidencePack) },
  referenceBinding: { blueprintId: 'DEV-02-CANONICAL-REFERENCE-V2', blueprintHash: hashCanonicalJsonV1(blueprint) },
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
  fontSlots: [{ slotId: 'font-title', fontAssetId: 'font-dev02-title', fontAssetVersion: `sha256:${fontSha}`, fileSha256: fontSha, family: 'Editron Fixture Sans', face: 'Bold', weight: 700, axes: {}, glyphCoverage: 'ASCII_BASIC', licenseId: 'INTERNAL_FIXTURE_LICENSE' }],
  textSlots: [{ slotId: 'title-main', fontSlotId: 'font-title', parameterId: 'param-title' }],
  exposedParameters: [
    { parameterId: 'param-title', kind: 'STRING', defaultValue: 'YOUR EVENT RECAP' },
    { parameterId: 'param-title-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#F7E300' },
    { parameterId: 'param-title-size', kind: 'INTEGER', defaultValue: 112, minimum: 48, maximum: 180 },
    { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 10, minimum: 0, maximum: 48 },
    { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#000000' },
  ],
  allowedApi: { apiId: GENERATED_COMPOSITION_API_ID_V1, apiVersion: '1', modules: [{ specifier: 'react', version: '19.1.2' }, { specifier: 'remotion', version: '4.0.398' }, { specifier: GENERATED_COMPOSITION_API_ID_V1, version: '1' }] },
  securityPolicy: { network: 'DENY', secrets: 'DENY', database: 'DENY', projectMutation: 'DENY', filesystem: 'WORKSPACE_MATERIALIZED_INPUTS_ONLY' },
  resourceBudget: { maxSourceFiles: 1, maxSourceBytes: 64 * 1024, maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 512 * 1024 * 1024, maxFrames: 180, maxCpuMs: 60_000, maxWallTimeMs: 90_000, maxMemoryMiB: 1_024 },
  output: { kind: 'OPAQUE_NESTED_COMPOSITION', representation: 'EDITABLE_PROGRAM_AND_PROXY', flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY', audioDisposition: 'CUE_HANDOFF_ONLY' },
  stateEffects: [],
  proofObligationIds: evidencePack.proofRequirements.map(({ proofObligationId }) => proofObligationId),
  expectedMeasurementRefs: ['claim-ref-five-panels', 'claim-ref-black-gutters', 'claim-ref-yellow-two-line-title', 'claim-ref-opposed-motion', 'claim-ref-green-centre-takeover', 'claim-ref-temporal-progression'],
  audioCueIntents: [],
} satisfies GeneratedCompositionProgramV1);

export { blueprint as DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, evidencePack as DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1 };
