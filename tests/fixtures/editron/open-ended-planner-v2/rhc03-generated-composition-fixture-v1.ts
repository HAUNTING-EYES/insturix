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
import { STAGE25_RHC03_ASSET_IDS_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc03-preview-media-fixture-v1';

export const RHC03_GENERATED_COMPOSITION_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC03_GENERATED_COMPOSITION_FIXTURE_V1' as const;

export const RHC03_FONT_ASSET_ID_V1 = 'rhc03-licensed-label' as const;
export const RHC03_LABEL_TEXT_V1 = 'SYNC' as const;

export interface Rhc03PreviewFixtureIdentityV1 {
  assetVersions: Readonly<Record<
    typeof STAGE25_RHC03_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  rightsEvidenceVersions: Readonly<Record<
    typeof STAGE25_RHC03_ASSET_IDS_V1[number],
    `sha256:${string}`
  >>;
  fontVersion: `sha256:${string}`;
  fontFileSha256: string;
  nativeAudioPcmSha256: string;
}

export const RHC03_GENERATED_COMPOSITION_SOURCE_V1 = `import React from 'react';
import { useCurrentFrame } from 'remotion';
import { AssetSlot, CompositionStage, Panel, TextSlot, useCompositionParameter } from '@editron/generated-composition-api/v1';

export const GeneratedComposition = () => {
  const frame = useCurrentFrame();
  const label = useCompositionParameter<string>('param-label');
  const labelColor = useCompositionParameter<string>('param-label-color');
  const labelSize = useCompositionParameter<number>('param-label-size');
  const gutter = useCompositionParameter<number>('param-gutter');
  const background = useCompositionParameter<string>('param-background');
  return (
    <CompositionStage background={background} gutter={gutter}>
      <Panel layerId="panel-left" bounds={{ left: 0.04, top: 0.04, width: 0.41, height: 0.92 }} translateY={0}>
        <AssetSlot slotId="source-left" sourceFrame={frame} crop="portrait-left" />
      </Panel>
      <Panel layerId="panel-right" bounds={{ left: 0.55, top: 0.04, width: 0.41, height: 0.92 }} translateY={0}>
        <AssetSlot slotId="source-right" sourceFrame={frame} crop="portrait-right" />
      </Panel>
      <TextSlot slotId="label-main" fontSlotId="font-label" parameterId="param-label" value={label} color={labelColor} size={labelSize} fixedToCanvas />
    </CompositionStage>
  );
};
`;

const sourceSha256 = sha256TextV1(RHC03_GENERATED_COMPOSITION_SOURCE_V1);

export const RHC03_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1 = deepFreezeV1({
  bundleVersion: GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  entryFile: 'GeneratedComposition.tsx',
  files: [{
    path: 'GeneratedComposition.tsx',
    sha256: sourceSha256,
    source: RHC03_GENERATED_COMPOSITION_SOURCE_V1,
  }],
} satisfies GeneratedCompositionSourceBundleV1);

export function buildRhc03GeneratedCompositionFixtureV1(
  identity: Readonly<Rhc03PreviewFixtureIdentityV1>,
) {
  assertIdentity(identity);
  const projectId = 'stage25-rhc03-preview';
  const rate = { numerator: '30', denominator: '1' } as const;
  const target = { startFrame: 450, endExclusiveFrame: 600 } as const;
  const proofWindow = { startFrame: 420, endExclusiveFrame: 630 } as const;
  const actionAssetIds = ['rhc03-action-left', 'rhc03-action-right'] as const;
  const audioBaseline = deepFreezeV1({
    owner: 'NATIVE_TIMELINE_PRODUCTION_AUDIO' as const,
    assetId: 'rhc03-production-audio' as const,
    assetVersion: identity.assetVersions['rhc03-production-audio'],
    decodedPcmSha256: identity.nativeAudioPcmSha256,
    projectRange: { startFrame: 0, endExclusiveFrame: 900 },
    candidateMayMutateAudio: false as const,
    requiredProof: 'DECODED_PCM_BASELINE_EQUIVALENCE' as const,
  });
  const layoutContract = deepFreezeV1({
    canvas: { width: 1920, height: 1080 },
    leftPanelBounds: { left: 0.04, top: 0.04, width: 0.41, height: 0.92 },
    rightPanelBounds: { left: 0.55, top: 0.04, width: 0.41, height: 0.92 },
    conservativeTrackedSubjectRegions: [
      { view: 'LEFT' as const, left: 0.04, top: 0.04, right: 0.45, bottom: 0.96 },
      { view: 'RIGHT' as const, left: 0.55, top: 0.04, right: 0.96, bottom: 0.96 },
    ],
    centeredLabelGap: { left: 0.45, right: 0.55 },
    label: {
      text: RHC03_LABEL_TEXT_V1,
      defaultFontSizePx: 40,
      minimumFontSizePx: 36,
      foreground: '#FFFFFF' as const,
      background: '#05070A' as const,
      minimumContrastRatio: 4.5,
      defaultContrastRatio: 20.17,
      renderedGlyphBoundsProof: 'REQUIRED_AFTER_RENDER' as const,
    },
    knowledgeGraphBindings: [
      'intent:authority.safe_zone_enforcement',
      'constant:safe_zone.action_safe',
      'constant:safe_zone.title_safe',
      'constant:typography.callout_label_min_font',
      'constraint:accessibility.text_contrast_failure',
      'theory:structure.versus_comparison',
    ] as const,
    danglingKnowledgeGraphEdgeExcluded: 'technique:layout.split_screen' as const,
  });
  const handoffs = deepFreezeV1({
    timebase: {
      project: rate,
      composition: rate,
      actionSources: rate,
      conversion: 'IDENTITY_30_OVER_1_CFR' as const,
    },
    proofWindow,
    target,
    sourceMapping: {
      left: 'LOCAL_FRAME_N_TO_ACTION_LEFT_FRAME_N' as const,
      right: 'LOCAL_FRAME_N_TO_ACTION_RIGHT_FRAME_N' as const,
      sharedTemporalBytes: true as const,
      actionLocalToWideOffsetFrames: 450,
    },
    entry: {
      previousProjectFrame: 449,
      previousAuthoredWideFrame: 449,
      firstTargetProjectFrame: 450,
      firstCompositionFrame: 0,
      correspondingAuthoredWideFrame: 450,
    },
    exit: {
      lastTargetProjectFrame: 599,
      lastCompositionFrame: 149,
      correspondingAuthoredWideFrame: 599,
      firstReturnProjectFrame: 600,
      firstReturnAuthoredWideFrame: 600,
    },
    audio: {
      owner: audioBaseline.owner,
      baselineHash: hashCanonicalJsonV1(audioBaseline),
      mutationAllowed: false as const,
      exactPcmEquivalenceRequired: true as const,
    },
    outsideTargetState: 'BYTE_IDENTICAL_CANONICAL_STATE_REQUIRED' as const,
  });
  const evidencePack = deepFreezeV1({
    version: RHC03_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-03' as const,
    route: 'HYBRID' as const,
    materializationDisposition: 'MATERIALIZED_MEDIA_RECEIPT_BOUND' as const,
    facts: [
      {
        factId: 'rhc03-project-revision', kind: 'PROJECT_REVISION',
        projectId, expectedProjectRevision: 'R1',
      },
      {
        factId: 'rhc03-project-timebase', kind: 'PROJECT_TIMEBASE',
        timebaseId: `${projectId}:timeline`, rate,
      },
      {
        factId: 'rhc03-canvas', kind: 'CANVAS', width: 1920, height: 1080,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
      },
      {
        factId: 'rhc03-authorized-target', kind: 'AUTHORIZED_TARGET_RANGE',
        start: String(target.startFrame), endExclusive: String(target.endExclusiveFrame),
      },
      ...actionAssetIds.map((assetId) => ({
        factId: `rhc03-source-${assetId}`,
        kind: 'SOURCE_MEDIA_IDENTITY',
        mediaKind: 'VIDEO',
        assetId,
        assetVersion: identity.assetVersions[assetId],
        rightsEvidenceVersion: identity.rightsEvidenceVersions[assetId],
        rightsStatus: 'INTERNAL_OWNED_FIXTURE',
        timebase: { timebaseId: `${assetId}:source`, rate },
        extent: { start: '0', endExclusive: '150' },
      })),
      {
        factId: 'rhc03-source-windows', kind: 'ALLOWED_SOURCE_WINDOWS',
        windows: actionAssetIds.map((assetId) => ({
          assetId, ranges: [{ start: '0', endExclusive: '150' }],
        })),
      },
      {
        factId: 'rhc03-rights', kind: 'RIGHTS_POLICY',
        allowedAssetIds: [...actionAssetIds],
      },
      {
        factId: 'rhc03-font', kind: 'FONT_IDENTITY',
        fontAssetId: RHC03_FONT_ASSET_ID_V1,
        fontAssetVersion: identity.fontVersion,
        fileSha256: identity.fontFileSha256,
        family: 'Noto Sans', face: 'Regular', weight: 400,
        rightsStatus: 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE',
        licenseId: 'OFL-1.1-NOTO-SANS',
      },
      {
        factId: 'rhc03-audio-baseline', kind: 'IMMUTABLE_AUDIO_BASELINE',
        owner: audioBaseline.owner,
        baselineHash: hashCanonicalJsonV1(audioBaseline),
      },
      {
        factId: 'rhc03-synchronization', kind: 'SOURCE_FRAME_SYNCHRONIZATION',
        handoffHash: hashCanonicalJsonV1(handoffs.sourceMapping),
      },
      {
        factId: 'rhc03-label-safety', kind: 'SUBJECT_SAFE_LABEL_LAYOUT',
        layoutHash: hashCanonicalJsonV1(layoutContract),
      },
    ],
    proofRequirements: [
      { proofObligationId: 'rhc03-proof-same-action-phase' },
      { proofObligationId: 'rhc03-proof-subject-safe-readable-label' },
      { proofObligationId: 'rhc03-proof-return-frame' },
      { proofObligationId: 'rhc03-proof-editable-bindings' },
      { proofObligationId: 'rhc03-proof-production-audio-pcm' },
      { proofObligationId: 'rhc03-proof-outside-range-unchanged' },
      { proofObligationId: 'rhc03-proof-source-font-rights' },
    ],
  });
  const referenceBlueprint = deepFreezeV1({
    version: RHC03_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    taskId: 'RHC-03' as const,
    blueprintId: 'RHC-03-HYBRID-BLUEPRINT-V1' as const,
    targetClaims: [
      { claimId: 'rhc03-claim-sync', target: 'TWO_VIEWS_SAME_LOCAL_ACTION_FRAME' },
      { claimId: 'rhc03-claim-label', target: 'CENTER_GAP_LABEL_NO_SUBJECT_OVERLAP' },
      { claimId: 'rhc03-claim-return', target: 'PROJECT_600_TO_AUTHORED_WIDE_600' },
      { claimId: 'rhc03-claim-editability', target: 'VIEW_LABEL_LAYOUT_CONTROLS_EDITABLE' },
      { claimId: 'rhc03-claim-audio', target: 'NATIVE_PRODUCTION_PCM_UNCHANGED' },
    ],
  });
  const supplementalFacts = deepFreezeV1([{
    factId: 'rhc03-generated-api',
    kind: 'GENERATED_COMPOSITION_API_IDENTITY',
    apiId: GENERATED_COMPOSITION_API_ID_V1,
    apiVersion: '1',
    supportStatus: 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED',
  }]);
  const program = deepFreezeV1({
    artifactType: 'GeneratedCompositionProgramV1',
    contractVersion: GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    programId: 'gcp-rhc03-hybrid-v1',
    taskId: 'RHC-03',
    sourceBundleHash:
      hashGeneratedCompositionSourceBundleV1(RHC03_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1),
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
      timebaseId: `${projectId}:timeline`, timebaseVersion: 'RHC03_V1', rate,
    },
    compositionTimebase: {
      timebaseId: 'gcp-rhc03-hybrid:local', timebaseVersion: 'GCP_V1', rate,
    },
    canvas: {
      width: 1920, height: 1080,
      pixelAspectRatio: { numerator: '1', denominator: '1' }, colorIntent: 'SDR_BT709',
    },
    duration: {
      compositionStartTick: '0', compositionEndExclusiveTick: '150',
      projectStartTick: '450', projectEndExclusiveTick: '600',
      headHandleTicks: '0', tailHandleTicks: '0',
      handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
    },
    sourceSlots: actionAssetIds.map((assetId, index) => ({
      slotId: index === 0 ? 'source-left' : 'source-right',
      assetId,
      assetVersion: identity.assetVersions[assetId],
      coordinateDomain: 'SOURCE_FRAME' as const,
      timebase: { timebaseId: `${assetId}:source`, timebaseVersion: 'RHC03_V1', rate },
      sourceRange: { start: '0', endExclusive: '150' },
    })),
    fontSlots: [{
      slotId: 'font-label', fontAssetId: RHC03_FONT_ASSET_ID_V1,
      fontAssetVersion: identity.fontVersion, fileSha256: identity.fontFileSha256,
      family: 'Noto Sans', face: 'Regular', weight: 400, axes: {},
      glyphCoverage: 'LATIN_V27', licenseId: 'OFL-1.1-NOTO-SANS',
    }],
    textSlots: [{
      slotId: 'label-main', fontSlotId: 'font-label', parameterId: 'param-label',
    }],
    declaredLayers: [
      { layerId: 'panel-left', kind: 'SOURCE_PANEL', sourceSlotId: 'source-left', zIndex: 10 },
      { layerId: 'panel-right', kind: 'SOURCE_PANEL', sourceSlotId: 'source-right', zIndex: 20 },
      { layerId: 'label-main', kind: 'TEXT', textSlotId: 'label-main', zIndex: 100 },
    ],
    exposedParameters: [
      { parameterId: 'param-label', kind: 'STRING', defaultValue: RHC03_LABEL_TEXT_V1 },
      { parameterId: 'param-label-color', kind: 'COLOR_SRGB_HEX', defaultValue: '#FFFFFF' },
      { parameterId: 'param-label-size', kind: 'INTEGER', defaultValue: 40, minimum: 36, maximum: 48 },
      { parameterId: 'param-gutter', kind: 'INTEGER', defaultValue: 10, minimum: 0, maximum: 24 },
      { parameterId: 'param-background', kind: 'COLOR_SRGB_HEX', defaultValue: '#05070A' },
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
      maxFrames: 150, maxCpuMs: 120_000, maxWallTimeMs: 180_000,
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
    audioCueIntents: [
      { cueId: 'rhc03-native-audio-entry', localTick: '0', semanticEvent: 'NATIVE_AUDIO_CONTINUES' },
      { cueId: 'rhc03-native-audio-exit', localTick: '149', semanticEvent: 'NATIVE_AUDIO_REMAINS_CONTINUOUS' },
    ],
  } satisfies GeneratedCompositionProgramV1);
  const material = {
    version: RHC03_GENERATED_COMPOSITION_FIXTURE_VERSION_V1,
    artifactType: 'Rhc03GeneratedCompositionFixtureV1' as const,
    taskId: 'RHC-03' as const,
    program,
    sourceBundle: RHC03_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack,
    referenceBlueprint,
    supplementalFacts,
    audioBaseline,
    layoutContract,
    handoffs,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, fixtureSha256: hashCanonicalJsonV1(material) });
}

function assertIdentity(identity: Readonly<Rhc03PreviewFixtureIdentityV1>): void {
  for (const assetId of STAGE25_RHC03_ASSET_IDS_V1) {
    assertShaVersion(identity.assetVersions[assetId], `ASSET_${assetId}`);
    assertShaVersion(identity.rightsEvidenceVersions[assetId], `RIGHTS_${assetId}`);
  }
  assertShaVersion(identity.fontVersion, 'FONT_VERSION');
  if (!/^[a-f0-9]{64}$/.test(identity.fontFileSha256)
    || !/^[a-f0-9]{64}$/.test(identity.nativeAudioPcmSha256)) {
    fail('CONTENT_HASH_INVALID');
  }
}

function assertShaVersion(value: unknown, code: string): void {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${code}_INVALID`);
  }
}

function fail(code: string): never {
  throw new Error(`RHC03_GENERATED_COMPOSITION_FIXTURE_${code}`);
}
