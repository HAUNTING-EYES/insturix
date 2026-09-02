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
import { STAGE25_RHC04_ASSET_IDS_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc04-preview-media-fixture-v1';

export const RHC04_GENERATED_COMPOSITION_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC04_GENERATED_COMPOSITION_FIXTURE_V1' as const;
export const RHC04_FONT_ASSET_ID_V1 = 'rhc04-licensed-numerals' as const;

export type Rhc04FixtureVariantV1 = 'INITIAL' | 'CORRECTED';

export interface Rhc04PreviewFixtureIdentityV1 {
  assetVersions: Readonly<Record<
    typeof STAGE25_RHC04_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  rightsEvidenceVersions: Readonly<Record<
    typeof STAGE25_RHC04_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  fontVersion: `sha256:${string}`;
  fontFileSha256: string;
}

export const RHC04_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
import { useCurrentFrame } from 'remotion';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const frame = useCurrentFrame();
  const number60 = useCompositionParameter<string>('param-number-60');
  const numberMiddle = useCompositionParameter<string>('param-number-middle');
  const number10 = useCompositionParameter<string>('param-number-10');
  const finalHold = useCompositionParameter<number>('param-final-hold');
  if (!Number.isSafeInteger(finalHold) || finalHold < 60 || finalHold > 105) {
    throw new Error('RHC04 final hold is outside the declared editable range');
  }
  const middleEnd = 180 - finalHold;
  const show60 = frame < 45;
  const showMiddle = frame >= 45 && frame < middleEnd;
  const show10 = frame >= middleEnd;
  return (
    <CompositionStage background="#05070A" gutter={0}>
      {show60 && (
        <Panel layerId="panel-60" bounds={{ left: 0.04, top: 0.04, width: 0.92, height: 0.92 }} translateY={0}>
          <AssetSlot slotId="source-60" sourceFrame={0} crop="centre" />
        </Panel>
      )}
      {showMiddle && (
        <Panel layerId="panel-middle" bounds={{ left: 0.04, top: 0.04, width: 0.92, height: 0.92 }} translateY={0}>
          <AssetSlot slotId="source-middle" sourceFrame={0} crop="centre" />
        </Panel>
      )}
      {show10 && (
        <Panel layerId="panel-10" bounds={{ left: 0.04, top: 0.04, width: 0.92, height: 0.92 }} translateY={0}>
          <AssetSlot slotId="source-10" sourceFrame={0} crop="centre" />
        </Panel>
      )}
      {show60 && <TextSlot slotId="number-60" fontSlotId="font-numerals" parameterId="param-number-60" value={number60} color="#FFFFFF" size={128} fixedToCanvas />}
      {showMiddle && <TextSlot slotId="number-middle" fontSlotId="font-numerals" parameterId="param-number-middle" value={numberMiddle} color="#FFFFFF" size={128} fixedToCanvas />}
      {show10 && <TextSlot slotId="number-10" fontSlotId="font-numerals" parameterId="param-number-10" value={number10} color="#FFFFFF" size={128} fixedToCanvas />}
    </CompositionStage>
  );
};
`;

const sourceSha256 = sha256TextV1(RHC04_GENERATED_COMPOSITION_SOURCE_V1);

export const RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1 = deepFreezeV1({
  bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  entryFile: 'GeneratedComposition.tsx',
  files: [{
    path: 'GeneratedComposition.tsx',
    sha256: sourceSha256,
    source: RHC04_GENERATED_COMPOSITION_SOURCE_V1,
  }],
} satisfies GeneratedCompositionSourceBundleV1);

export function buildRhc04GeneratedCompositionFixtureV1(
  identity: Readonly<Rhc04PreviewFixtureIdentityV1>,
  input: Readonly<{
    variant: Rhc04FixtureVariantV1;
    expectedProjectRevision: string;
  }>,
) {
  assertIdentity(identity);
  if (!input.expectedProjectRevision.trim()) fail('PROJECT_REVISION_INVALID');
  const values = input.variant === 'INITIAL'
    ? {
        number60: '60%', numberMiddle: '30%', number10: '10%',
        middleAssetId: 'rhc04-closeup-30' as const, finalHoldFrames: 90,
      }
    : {
        number60: '60%', numberMiddle: '35%', number10: '10%',
        middleAssetId: 'rhc04-correction-source' as const, finalHoldFrames: 75,
      };
  const projectId = 'stage25-rhc04-preview';
  const rate = { numerator: '30', denominator: '1' } as const;
  const target = { startFrame: 0, endExclusiveFrame: 180 } as const;
  const sourceSlots = [
    { slotId: 'source-60' as const, assetId: 'rhc04-closeup-60' as const },
    { slotId: 'source-middle' as const, assetId: values.middleAssetId },
    { slotId: 'source-10' as const, assetId: 'rhc04-closeup-10' as const },
  ];
  const timingContract = deepFreezeV1({
    frameRate: rate,
    totalFrames: 180,
    first: { startFrame: 0, endExclusiveFrame: 45, assetId: 'rhc04-closeup-60', number: values.number60 },
    middle: {
      startFrame: 45,
      endExclusiveFrame: 180 - values.finalHoldFrames,
      assetId: values.middleAssetId,
      number: values.numberMiddle,
    },
    final: {
      startFrame: 180 - values.finalHoldFrames,
      endExclusiveFrame: 180,
      holdFrames: values.finalHoldFrames,
      assetId: 'rhc04-closeup-10',
      number: values.number10,
    },
  });
  const layoutContract = deepFreezeV1({
    canvas: { width: 1080, height: 1920 },
    panelBounds: { left: 0.04, top: 0.04, width: 0.92, height: 0.92 },
    numerals: {
      fontSizePx: 128,
      minimumFontSizePx: 64,
      foreground: '#FFFFFF' as const,
      minimumContrastRatio: 4.5,
    },
    knowledgeGraphBindings: [
      'mapping:entity.quantitative_claim',
      'technique:graphic.stat_counter',
      'constant:typography.stat_counter_min_font',
      'constant:animation.full_title_card',
      'intent:authority.safe_zone_enforcement',
      'constraint:accessibility.text_contrast_failure',
    ] as const,
  });
  const correctionContract = deepFreezeV1({
    instruction:
      'Change one number, its paired source and the final hold length while preserving all other approved state.',
    initial: {
      numberMiddle: '30%', middleAssetId: 'rhc04-closeup-30', finalHoldFrames: 90,
    },
    corrected: {
      numberMiddle: '35%', middleAssetId: 'rhc04-correction-source', finalHoldFrames: 75,
    },
    mustRemainExact: {
      sourceBundleSha256: hashGeneratedCompositionSourceBundleV1(
        RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
      ),
      number60: '60%',
      asset60: 'rhc04-closeup-60',
      number10: '10%',
      asset10: 'rhc04-closeup-10',
      canvas: { width: 1080, height: 1920 },
      durationFrames: 180,
    },
    humanMeasurementDisposition: 'MEASURED_HANDS_ON_REQUIRED' as const,
  });
  const evidencePack = deepFreezeV1({
    version: RHC04_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-04' as const,
    route: 'GENERATED_COMPOSITION' as const,
    variant: input.variant,
    materializationDisposition: 'MATERIALIZED_MEDIA_RECEIPT_BOUND' as const,
    facts: [
      {
        factId: 'rhc04-project-revision', kind: 'PROJECT_REVISION',
        projectId, expectedProjectRevision: input.expectedProjectRevision,
      },
      {
        factId: 'rhc04-project-timebase', kind: 'PROJECT_TIMEBASE',
        timebaseId: `${projectId}:timeline`, rate,
      },
      {
        factId: 'rhc04-canvas', kind: 'CANVAS', width: 1080, height: 1920,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
      },
      {
        factId: 'rhc04-authorized-target', kind: 'AUTHORIZED_TARGET_RANGE',
        start: String(target.startFrame), endExclusive: String(target.endExclusiveFrame),
      },
      ...STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => ({
        factId: `rhc04-source-${assetId}`,
        kind: 'SOURCE_MEDIA_IDENTITY',
        mediaKind: 'STILL_IMAGE',
        assetId,
        assetVersion: identity.assetVersions[assetId],
        rightsEvidenceVersion: identity.rightsEvidenceVersions[assetId],
        rightsStatus: 'INTERNAL_OWNED_FIXTURE',
        timebase: { timebaseId: `${assetId}:source`, rate },
        extent: { start: '0', endExclusive: '1' },
      })),
      {
        factId: 'rhc04-source-windows', kind: 'ALLOWED_SOURCE_WINDOWS',
        windows: STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => ({
          assetId, ranges: [{ start: '0', endExclusive: '1' }],
        })),
      },
      {
        factId: 'rhc04-rights', kind: 'RIGHTS_POLICY',
        allowedAssetIds: [...STAGE25_RHC04_ASSET_IDS_V1],
      },
      {
        factId: 'rhc04-font', kind: 'FONT_IDENTITY',
        fontAssetId: RHC04_FONT_ASSET_ID_V1,
        fontAssetVersion: identity.fontVersion,
        fileSha256: identity.fontFileSha256,
        family: 'Noto Sans', face: 'Regular', weight: 400,
        rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
        licenseId: 'OFL-1.1-NOTO-SANS',
      },
      {
        factId: 'rhc04-timing-and-pairing', kind: 'RESULTS_PAIRING_TIMING_CONTRACT',
        contractHash: hashCanonicalJsonV1(timingContract),
      },
      {
        factId: 'rhc04-correction', kind: 'BOUNDED_CORRECTION_CONTRACT',
        contractHash: hashCanonicalJsonV1(correctionContract),
      },
    ],
    proofRequirements: [
      { proofObligationId: 'rhc04-proof-number-source-pairings' },
      { proofObligationId: 'rhc04-proof-final-10-hold' },
      { proofObligationId: 'rhc04-proof-independent-editability' },
      { proofObligationId: 'rhc04-proof-source-font-rights' },
      { proofObligationId: 'rhc04-proof-correction-bounded' },
      { proofObligationId: 'rhc04-proof-unrelated-state-exact' },
    ],
  });
  const referenceBlueprint = deepFreezeV1({
    version: RHC04_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-04' as const,
    blueprintId: `RHC-04-${input.variant}-BLUEPRINT-V1`,
    targetClaims: [
      { claimId: 'rhc04-claim-pairings', target: 'DECLARED_NUMBER_AND_SOURCE_PAIR_AT_EVERY_FRAME' },
      { claimId: 'rhc04-claim-final', target: 'FINAL_STATE_IS_10_PERCENT_CLOSEUP' },
      { claimId: 'rhc04-claim-editability', target: 'NUMBERS_SOURCE_BINDINGS_AND_HOLD_ARE_SEPARATE' },
      { claimId: 'rhc04-claim-correction', target: 'ONLY_DECLARED_CORRECTION_SCOPE_CHANGES' },
    ],
  });
  const supplementalFacts = deepFreezeV1([{
    factId: 'rhc04-generated-api',
    kind: 'GENERATED_COMPOSITION_API_IDENTITY',
    apiId: GENERATED_COMPOSITION_API_ID_V1,
    apiVersion: '1',
    supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
  }]);
  const program = deepFreezeV1({
    artifactType: 'GeneratedCompositionProgramV1',
    contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    programId: 'gcp-rhc04-results-card-v1',
    taskId: 'RHC-04',
    sourceBundleHash: hashGeneratedCompositionSourceBundleV1(
      RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    ),
    generator: {
      kind: 'HUMAN_AUTHORED_FIXTURE', modelId: 'NONE', promptHash: 'NOT_APPLICABLE',
      toolVersions: ['typescript@5.9.3', 'remotion@4.0.509'],
    },
    projectBinding: {
      projectId,
      expectedProjectRevision: input.expectedProjectRevision,
      evidencePackHash: hashCanonicalJsonV1(evidencePack),
    },
    referenceBinding: {
      blueprintId: referenceBlueprint.blueprintId,
      blueprintHash: hashCanonicalJsonV1(referenceBlueprint),
    },
    projectTimebase: {
      timebaseId: `${projectId}:timeline`, timebaseVersion: 'RHC04_V1', rate,
    },
    compositionTimebase: {
      timebaseId: 'gcp-rhc04-results-card:local', timebaseVersion: 'GCP_V1', rate,
    },
    canvas: {
      width: 1080, height: 1920,
      pixelAspectRatio: { numerator: '1', denominator: '1' },
      colorIntent: 'SDR_BT709',
    },
    duration: {
      compositionStartTick: '0', compositionEndExclusiveTick: '180',
      projectStartTick: '0', projectEndExclusiveTick: '180',
      headHandleTicks: '0', tailHandleTicks: '0',
      handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
    },
    sourceSlots: sourceSlots.map(({ slotId, assetId }) => ({
      slotId,
      assetId,
      assetVersion: identity.assetVersions[assetId],
      coordinateDomain: 'SOURCE_FRAME' as const,
      timebase: {
        timebaseId: `${assetId}:source`, timebaseVersion: 'RHC04_V1', rate,
      },
      sourceRange: { start: '0', endExclusive: '1' },
    })),
    fontSlots: [{
      slotId: 'font-numerals', fontAssetId: RHC04_FONT_ASSET_ID_V1,
      fontAssetVersion: identity.fontVersion, fileSha256: identity.fontFileSha256,
      family: 'Noto Sans', face: 'Regular', weight: 400, axes: {},
      glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS',
    }],
    textSlots: [
      { slotId: 'number-60', fontSlotId: 'font-numerals', parameterId: 'param-number-60' },
      { slotId: 'number-middle', fontSlotId: 'font-numerals', parameterId: 'param-number-middle' },
      { slotId: 'number-10', fontSlotId: 'font-numerals', parameterId: 'param-number-10' },
    ],
    declaredLayers: [
      { layerId: 'panel-60', kind: 'SOURCE_PANEL', sourceSlotId: 'source-60', zIndex: 10 },
      { layerId: 'panel-middle', kind: 'SOURCE_PANEL', sourceSlotId: 'source-middle', zIndex: 20 },
      { layerId: 'panel-10', kind: 'SOURCE_PANEL', sourceSlotId: 'source-10', zIndex: 30 },
      { layerId: 'number-60', kind: 'TEXT', textSlotId: 'number-60', zIndex: 100 },
      { layerId: 'number-middle', kind: 'TEXT', textSlotId: 'number-middle', zIndex: 110 },
      { layerId: 'number-10', kind: 'TEXT', textSlotId: 'number-10', zIndex: 120 },
    ],
    exposedParameters: [
      { parameterId: 'param-number-60', kind: 'STRING', defaultValue: values.number60 },
      { parameterId: 'param-number-middle', kind: 'STRING', defaultValue: values.numberMiddle },
      { parameterId: 'param-number-10', kind: 'STRING', defaultValue: values.number10 },
      {
        parameterId: 'param-final-hold', kind: 'INTEGER',
        defaultValue: values.finalHoldFrames, minimum: 60, maximum: 105,
      },
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
      maxSourceFiles: 1, maxSourceBytes: 96 * 1024,
      maxInputBytes: 64 * 1024 * 1024, maxOutputBytes: 512 * 1024 * 1024,
      maxFrames: 180, maxCpuMs: 120_000, maxWallTimeMs: 180_000,
      maxMemoryMiB: 2_048,
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
    audioCueIntents: [],
  } satisfies GeneratedCompositionProgramV1);
  const material = {
    version: RHC04_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    artifactType: 'Rhc04GeneratedCompositionFixtureV1' as const,
    taskId: 'RHC-04' as const,
    variant: input.variant,
    program,
    sourceBundle: RHC04_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack,
    referenceBlueprint,
    supplementalFacts,
    timingContract,
    layoutContract,
    correctionContract,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, fixtureSha256: hashCanonicalJsonV1(material) });
}

function assertIdentity(identity: Readonly<Rhc04PreviewFixtureIdentityV1>): void {
  for (const assetId of STAGE25_RHC04_ASSET_IDS_V1) {
    assertShaVersion(identity.assetVersions[assetId], `ASSET_${assetId}`);
    assertShaVersion(identity.rightsEvidenceVersions[assetId], `RIGHTS_${assetId}`);
  }
  assertShaVersion(identity.fontVersion, 'FONT_VERSION');
  if (!/^[a-f0-9]{64}$/.test(identity.fontFileSha256)) fail('FONT_HASH_INVALID');
}

function assertShaVersion(value: unknown, code: string): void {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${code}_INVALID`);
  }
}
function fail(code: string): never {
  throw new Error(`RHC04_GENERATED_COMPOSITION_FIXTURE_${code}`);
}
