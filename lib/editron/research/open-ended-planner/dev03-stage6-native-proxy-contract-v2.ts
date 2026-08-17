import { hashCanonicalJsonV1 } from './contracts-v1';

export const DEV03_STAGE6_NATIVE_PROXY_V2 = 'EDITRON_OE_DEV03_STAGE6_NATIVE_PROXY_V2' as const;

export const DEV03_STAGE6_ARTIFACT_IDS_V2 = [
  'SOURCE_VIDEO', 'SOURCE_AUDIO',
  'CUT1_BEFORE', 'CUT1_AFTER', 'CUT2_BEFORE', 'CUT2_AFTER', 'CUT3_BEFORE', 'CUT3_AFTER',
  'SHAKE_ACTIVE_BASELINE', 'SHAKE_ACTIVE', 'SHAKE_NEUTRAL_BASELINE', 'SHAKE_NEUTRAL',
  'FULL_AV_PROXY', 'PROTECTED_AUDIO_BASELINE_WAV', 'PROTECTED_AUDIO_WAV',
] as const;

export const DEV03_STAGE6_CHANGED_PATHS_V2 = [
  'overlays.dev03-card-1.durationInFrames',
  'overlays.dev03-card-2.from', 'overlays.dev03-card-2.durationInFrames', 'overlays.dev03-card-2.sourceStartFrame', 'overlays.dev03-card-2.videoStartTime',
  'overlays.dev03-card-3.from', 'overlays.dev03-card-3.durationInFrames', 'overlays.dev03-card-3.sourceStartFrame', 'overlays.dev03-card-3.videoStartTime',
  'overlays.dev03-card-4.from', 'overlays.dev03-card-4.durationInFrames', 'overlays.dev03-card-4.sourceStartFrame', 'overlays.dev03-card-4.videoStartTime',
  'overlays.dev03-card-4.keyframeTracks.x', 'overlays.dev03-card-4.keyframeTracks.y',
] as const;

export type Dev03Stage6ArtifactIdV2 = typeof DEV03_STAGE6_ARTIFACT_IDS_V2[number];
export type Dev03Stage6ProjectSnapshotV2 = Record<string, unknown>;

export interface Dev03Stage6ArtifactBindingV2 {
  artifactId: Dev03Stage6ArtifactIdV2;
  path: string;
  sha256: string;
  byteLength: number;
}

export interface Dev03Stage6RenderProofV2 {
  schemaVersion: typeof DEV03_STAGE6_NATIVE_PROXY_V2;
  renderer: {
    root: 'components/editron/editor/version-7.0.0/remotion/index.ts';
    assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps';
    visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx';
    audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx';
  };
  composition: { width: 320; height: 180; fpsNumerator: 30; fpsDenominator: 1; durationInFrames: 600 };
  sourceBindings: { videoAssetId: 'dev03-cards'; audioAssetId: 'dev03-beats' };
  video: {
    codec: string;
    width: number;
    height: number;
    averageFrameRate: string;
    decodedFrameCount: number;
    durationSeconds: number;
    audioStreamCount: number;
  };
  visual: {
    boundarySamples: readonly { frame: 118 | 119 | 238 | 239 | 478 | 479; rgb: readonly [number, number, number] }[];
    boundaryMeanAbsDiffs: readonly [number, number, number];
    shakeActiveFrame: 480;
    shakeNeutralFrame: 490;
    shakeActiveMeanAbsDiff: number;
    shakeNeutralMeanAbsDiff: number;
  };
  audio: {
    sampleRateHz: 48000;
    sourceChannels: 1;
    baselineChannels: 2;
    renderedChannels: 2;
    sourceSampleFrames: number;
    baselineSampleFrames: number;
    renderedSampleFrames: number;
    protectedStartFrame: 250;
    protectedEndFrame: 350;
    sourceProtectedRms: number;
    baselineProtectedRms: number;
    renderedProtectedRms: number;
    sourceToRenderedGainRatio: number;
    sourceToRenderedCorrelation: number;
    baselineToRenderedGainRatio: number;
    baselineToRenderedCorrelation: number;
    renderedPeak: number;
  };
  browserErrors: readonly string[];
  externalCalls: { providerApiCalls: 0; cloudRenderCalls: 0; projectServiceCalls: 0; databaseCalls: 0 };
}

export interface Dev03Stage6RenderResultV2 {
  artifactPaths: Readonly<Record<Dev03Stage6ArtifactIdV2, string>>;
  proof: Dev03Stage6RenderProofV2;
}

export type Dev03Stage6RendererV2 = (input: {
  alignedProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
  shakenProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
  outputDir: string;
}) => Promise<Dev03Stage6RenderResultV2>;

export interface Dev03Stage6ReceiptV2 {
  schemaVersion: typeof DEV03_STAGE6_NATIVE_PROXY_V2;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-03';
  executionId: string;
  createdAt: string;
  stage4GraphHash: string;
  stage5DecisionHash: string;
  projectBinding: { projectId: 'oe-dev-03'; expectedProjectRevision: 'R11'; observedProjectRevision: 'NOT_READ'; changedProjectPaths: readonly [] };
  isolatedClone: { beforeStateHash: string; alignedStateHash: string; shakenStateHash: string; changedPaths: readonly string[] };
  operations: readonly [
    { nodeId: 'compile-sync'; owner: 'alignCutsToBeatsWithEvidence'; resultStateHash: string },
    { nodeId: 'compile-shake'; owner: 'applyCameraShakeToProject'; resultStateHash: string },
  ];
  artifacts: readonly Dev03Stage6ArtifactBindingV2[];
  renderProof: Dev03Stage6RenderProofV2;
  proof: { state: 'PASS'; reloadEquivalent: 'PASS'; renderedVisual: 'PASS'; renderedAudio: 'PASS'; projectMutation: 'NONE' };
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE';
  stateEffects: readonly [];
  receiptHash: string;
}

export interface Dev03Stage6ExecutionEvidenceV2 {
  snapshots: { before: Dev03Stage6ProjectSnapshotV2; aligned: Dev03Stage6ProjectSnapshotV2; shaken: Dev03Stage6ProjectSnapshotV2 };
  receipt: Dev03Stage6ReceiptV2;
  receiptPath: string;
}

export function hasValidDev03Stage6ReceiptHashV2(receipt: Dev03Stage6ReceiptV2): boolean {
  const unsigned = { ...receipt } as Record<string, unknown>;
  delete unsigned.receiptHash;
  return receipt.receiptHash === hashCanonicalJsonV1(unsigned);
}
