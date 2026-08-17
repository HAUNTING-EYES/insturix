import { hashCanonicalJsonV1 } from './contracts-v1';

export const DEV02_HYBRID_STAGE6_VERSION_V2 =
  'EDITRON_OE_DEV02_HYBRID_STAGE6_V2' as const;

export const DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2 = [
  'FULL_HYBRID_PROXY',
  'ISLAND_SAMPLE_0108',
  'HYBRID_SAMPLE_0108',
  'HYBRID_EXIT_0179',
  'HYBRID_NATIVE_ENTRY_0180',
  'NATIVE_SOURCE_ENTRY_0180',
  'HYBRID_NATIVE_FINAL_0344',
  'NATIVE_SOURCE_FINAL_0344',
] as const;

export type Dev02HybridStage6ArtifactIdV2 =
  typeof DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2[number];

export interface Dev02HybridIslandBindingV2 {
  programHash: string;
  sourceStage4GraphHash: string;
  upstreamStage6ReceiptHash: string;
  hostReceiptHash: string;
  proxyReceiptHash: string;
  localEvidenceHash: string;
  renderedProofHash: string;
  hardGateDisposition: 'PASS';
  videoPath: string;
  videoSha256: string;
}

export interface Dev02HybridNativeSourceBindingV2 {
  assetId: 'dev02-close';
  assetVersion: string;
  videoPath: string;
  videoSha256: string;
  sourceStartFrame: 180;
  sourceEndExclusiveFrame: 345;
  projectStartFrame: 180;
  projectEndExclusiveFrame: 345;
}

export interface Dev02HybridNativeContinuationReceiptV2 {
  nodeId: 'compile-resolve-native-continuation';
  operatorId: 'resolve_user_asset_overlay' | 'move_retime_overlay';
  ownerRef: string;
  scope: 'READ_ONLY' | 'ISOLATED_PROXY_CLONE';
  overlayId: 'ov-next';
  before: Omit<Dev02HybridNativeSourceBindingV2, 'videoPath' | 'videoSha256' | 'assetVersion'>;
  after: Omit<Dev02HybridNativeSourceBindingV2, 'videoPath' | 'videoSha256' | 'assetVersion'>;
  changedProxyPaths: readonly [];
  appliedStateEffects: readonly [];
  disposition: 'RESOLVED_EXISTING_BINDING' | 'APPLIED_IDEMPOTENT';
  sourceGraphNodeHash: string;
  receiptHash: string;
}

export interface Dev02HybridStage6ArtifactBindingV2 {
  artifactId: Dev02HybridStage6ArtifactIdV2;
  path: string;
  sha256: string;
  byteLength: number;
}

export interface Dev02HybridStage6RenderProofV2 {
  schemaVersion: typeof DEV02_HYBRID_STAGE6_VERSION_V2;
  assembler: 'FFMPEG_FILTER_GRAPH_BOUND_TO_STAGE4_TIME_ANCHOR';
  composition: {
    width: 1080;
    height: 1920;
    fpsNumerator: 30;
    fpsDenominator: 1;
    generatedFrames: 180;
    nativeFrames: 165;
    totalFrames: 345;
  };
  inputVideo: {
    islandCodec: string;
    islandFrameRate: string;
    islandFrameCount: number;
    islandAudioStreams: number;
    nativeCodec: string;
    nativeFrameRate: string;
    nativeFrameCount: number;
    nativeAudioStreams: number;
  };
  outputVideo: {
    codec: string;
    width: number;
    height: number;
    averageFrameRate: string;
    decodedFrameCount: number;
    durationSeconds: number;
    audioStreamCount: number;
  };
  decodedFrameEvidence: {
    generatedSegmentNormalizedDifference: number;
    generatedExitToNativeSourceNormalizedDifference: number;
    nativeEntryToSourceNormalizedDifference: number;
    nativeFinalToSourceNormalizedDifference: number;
    outputBoundaryNormalizedDifference: number;
  };
  externalCalls: {
    providerApiCalls: 0;
    cloudRenderCalls: 0;
    projectServiceCalls: 0;
    databaseCalls: 0;
  };
}

export interface Dev02HybridStage6RenderResultV2 {
  artifactPaths: Readonly<Record<Dev02HybridStage6ArtifactIdV2, string>>;
  proof: Dev02HybridStage6RenderProofV2;
}

export type Dev02HybridStage6RendererV2 = (input: {
  island: Dev02HybridIslandBindingV2;
  nativeSource: Dev02HybridNativeSourceBindingV2;
  outputDir: string;
}) => Promise<Dev02HybridStage6RenderResultV2>;

export interface Dev02HybridStage6ReceiptV2 {
  schemaVersion: typeof DEV02_HYBRID_STAGE6_VERSION_V2;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-02';
  executionId: string;
  createdAt: string;
  stage4GraphHash: string;
  stage5DecisionHash: string;
  projectBinding: {
    projectId: 'oe-dev-02';
    expectedProjectRevision: 'R3';
    observedProjectRevision: 'NOT_READ';
    changedProjectPaths: readonly [];
  };
  inputs: {
    island: Omit<Dev02HybridIslandBindingV2, 'videoPath'>;
    nativeSource: Omit<Dev02HybridNativeSourceBindingV2, 'videoPath'>;
    nativeContinuation: Dev02HybridNativeContinuationReceiptV2;
  };
  operations: readonly [
    { nodeId: 'compile-preview-generated-island'; owner: 'executeGeneratedCompositionInSandboxV1' },
    {
      nodeId: 'compile-resolve-native-continuation';
      owner: 'resolve_user_asset_overlay' | 'move_retime_overlay';
    },
    { nodeId: 'compile-prove-dev02-hybrid-proxy'; owner: 'renderDev02HybridStage6ProxyV2' },
  ];
  artifacts: readonly Dev02HybridStage6ArtifactBindingV2[];
  renderProof: Dev02HybridStage6RenderProofV2;
  proof: {
    generatedIslandHardGates: 'PASS';
    hybridTiming: 'PASS';
    boundaryContinuity: 'PASS';
    nativeContinuation: 'PASS';
    creativeTaste: 'UNVERIFIABLE';
    flashSafety: 'UNVERIFIABLE';
    projectMutation: 'NONE';
  };
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE';
  stateEffects: readonly [];
  receiptHash: string;
}

export interface Dev02HybridStage6ExecutionEvidenceV2 {
  sourcePaths: { island: string; nativeSource: string };
  receipt: Dev02HybridStage6ReceiptV2;
  receiptPath: string;
}

export function hasValidDev02HybridStage6ReceiptHashV2(
  receipt: Dev02HybridStage6ReceiptV2,
): boolean {
  const unsigned = { ...receipt } as Record<string, unknown>;
  delete unsigned.receiptHash;
  return receipt.receiptHash === hashCanonicalJsonV1(unsigned);
}
