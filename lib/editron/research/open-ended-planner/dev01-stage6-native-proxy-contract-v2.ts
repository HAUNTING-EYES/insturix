import { hashCanonicalJsonV1 } from './contracts-v1';

export const DEV01_STAGE6_NATIVE_PROXY_V2 = 'EDITRON_OE_DEV01_STAGE6_NATIVE_PROXY_V2' as const;

export const DEV01_STAGE6_ARTIFACT_IDS_V2 = [
  'SOURCE_VIDEO',
  'SOURCE_DIALOGUE_WAV',
  'SOURCE_BGM_WAV',
  'PRE_REVEAL_STILL',
  'REVEAL_STILL',
  'ZOOMED_STILL',
  'FULL_AV_PROXY',
  'BGM_GAIN_PROOF_WAV',
] as const;

export type Dev01Stage6ArtifactIdV2 = typeof DEV01_STAGE6_ARTIFACT_IDS_V2[number];
export type Dev01Stage6ProjectSnapshotV2 = Record<string, unknown>;

export interface Dev01Stage6ArtifactBindingV2 {
  artifactId: Dev01Stage6ArtifactIdV2;
  path: string;
  sha256: string;
  byteLength: number;
}

export interface Dev01Stage6RenderProofV2 {
  schemaVersion: typeof DEV01_STAGE6_NATIVE_PROXY_V2;
  renderer: {
    root: 'components/editron/editor/version-7.0.0/remotion/index.ts';
    assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps';
    visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx';
    audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx';
  };
  composition: { width: 320; height: 180; fpsNumerator: 30; fpsDenominator: 1; durationInFrames: 435 };
  sourceBindings: {
    hostVideoAssetId: 'dev01-host-truth-v2';
    dialogueAssetId: 'dev01-dialogue-truth-v2';
    bgmAssetId: 'dev01-bgm-truth-v2';
  };
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
    preRevealFrame: 159;
    revealFrame: 160;
    zoomedFrame: 171;
    preRevealYellowPixels: number;
    revealYellowPixels: number;
    revealBounds: { left: number; top: number; width: number; height: number; centerX: number; centerY: number };
    zoomedBounds: { left: number; top: number; width: number; height: number; centerX: number; centerY: number };
    widthScale: number;
    heightScale: number;
    centerDriftPixels: number;
  };
  audio: {
    sampleRateHz: 48000;
    bgmProofSampleFrames: number;
    fullMixSampleFrames: number;
    bgmSoloBeforeRms: number;
    bgmDuckedRms: number;
    bgmSoloAfterRms: number;
    duckReductionDb: number;
    soloRecoveryRatio: number;
    fullSpeechRms: number;
    dialogueLiftOverDuckedBgmDb: number;
    fullMixPeak: number;
  };
  browserErrors: readonly string[];
  externalCalls: { providerApiCalls: 0; cloudRenderCalls: 0; projectServiceCalls: 0; databaseCalls: 0 };
}

export interface Dev01Stage6RenderResultV2 {
  artifactPaths: Readonly<Record<Dev01Stage6ArtifactIdV2, string>>;
  proof: Dev01Stage6RenderProofV2;
}

export type Dev01Stage6RendererV2 = (input: {
  projectSnapshot: Dev01Stage6ProjectSnapshotV2;
  outputDir: string;
}) => Promise<Dev01Stage6RenderResultV2>;

export interface Dev01Stage6ReceiptV2 {
  schemaVersion: typeof DEV01_STAGE6_NATIVE_PROXY_V2;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-01';
  executionId: string;
  createdAt: string;
  stage4GraphHash: string;
  stage5DecisionHash: string;
  projectBinding: {
    projectId: 'oe-dev-01';
    expectedProjectRevision: 'R7';
    observedProjectRevision: 'NOT_READ';
    changedProjectPaths: readonly [];
  };
  isolatedClone: {
    beforeStateHash: string;
    afterCutStateHash: string;
    afterPushStateHash: string;
    afterDuckStateHash: string;
    changedPaths: readonly string[];
  };
  operations: readonly [
    { nodeId: 'compile-cut'; owner: 'timeline-range-cut'; resultStateHash: string },
    { nodeId: 'compile-push'; owner: 'resolveAtomicZoomForm+buildKeyframeMutationPatch'; resultStateHash: string },
    { nodeId: 'compile-duck'; owner: 'applyAudioDuckingToProject'; resultStateHash: string },
  ];
  artifacts: readonly Dev01Stage6ArtifactBindingV2[];
  renderProof: Dev01Stage6RenderProofV2;
  proof: {
    state: 'PASS';
    reloadEquivalent: 'PASS';
    renderedVisual: 'PASS';
    renderedAudio: 'PASS';
    projectMutation: 'NONE';
  };
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE';
  stateEffects: readonly [];
  receiptHash: string;
}

export interface Dev01Stage6ExecutionEvidenceV2 {
  snapshots: {
    before: Dev01Stage6ProjectSnapshotV2;
    afterCut: Dev01Stage6ProjectSnapshotV2;
    afterPush: Dev01Stage6ProjectSnapshotV2;
    afterDuck: Dev01Stage6ProjectSnapshotV2;
  };
  receipt: Dev01Stage6ReceiptV2;
  receiptPath: string;
}

export function hasValidDev01Stage6ReceiptHashV2(receipt: Dev01Stage6ReceiptV2): boolean {
  const unsigned = { ...receipt } as Record<string, unknown>;
  delete unsigned.receiptHash;
  return receipt.receiptHash === hashCanonicalJsonV1(unsigned);
}
