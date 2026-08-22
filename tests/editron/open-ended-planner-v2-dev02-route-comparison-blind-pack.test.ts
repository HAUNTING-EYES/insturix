import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV02_FORCED_NATIVE_BASELINE_HASH_V1, DEV02_FORCED_NATIVE_BASELINE_VERSION_V1 } from '@/lib/editron/research/open-ended-planner/dev02-forced-native-baseline-v1';
import { DEV02_HYBRID_STAGE6_VERSION_V2, type Dev02HybridStage6ReceiptV2 } from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage6-contract-v2';
import { DEV02_RENDERED_PROOF_POLICY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import { buildDev02RouteComparisonBlindPackV1 } from '@/lib/editron/research/open-ended-planner/dev02-route-comparison-blind-pack-v1';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('DEV-02 native versus generated-hybrid blind route comparison', () => {
  it('blinds route identity while preserving an operator-only technical comparison', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-route-'));
    try {
      const nativeReceiptPath = await makeNative(scratch); const hybridReceiptPath = await makeHybrid(scratch);
      const pack = await buildDev02RouteComparisonBlindPackV1({
        outputRoot: path.join(scratch, 'pack'), createdAt: '2026-08-22T17:30:00.000Z', nativeReceiptPath, hybridReceiptPath,
        randomSource: () => Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      });
      const manifestText = await fs.readFile(pack.reviewerManifestPath, 'utf8');
      const operator = JSON.parse(await fs.readFile(pack.operatorKeyPath, 'utf8'));
      const technical = JSON.parse(await fs.readFile(pack.technicalComparisonPath, 'utf8'));
      expect(pack.reviewStatus).toBe('AWAITING_SOLE_REVIEWER_EXPLORATORY_REVIEW');
      expect(pack.candidateVideos.map(({ candidateId }) => candidateId)).toEqual(['candidate-a', 'candidate-b']);
      expect(manifestText).not.toMatch(/FORCED_NATIVE|GENERATED_HYBRID|receiptHash/);
      expect(operator.mappings.map(({ routeId }: { routeId: string }) => routeId).sort()).toEqual(['FORCED_NATIVE', 'GENERATED_HYBRID']);
      expect(operator.disclosurePolicy).toBe('DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL');
      expect(technical.sharedScope).toMatchObject({ decodedFrameCount: 345, frameRate: '30/1', targetHardGates: 'PASS' });
      expect(technical.forcedNative).toMatchObject({ overlayCount: 16, crossElementRelationshipCount: 0 });
      expect(technical.generatedHybrid).toMatchObject({ generatedDeclaredLayerCount: 6, exposedParameterCount: 5 });
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('rejects video tampering and receipt drift before creating a public pack', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-route-bad-'));
    try {
      const nativeReceiptPath = await makeNative(scratch); const hybridReceiptPath = await makeHybrid(scratch);
      const native = JSON.parse(await fs.readFile(nativeReceiptPath, 'utf8'));
      await fs.appendFile(native.output.path, 'tamper');
      await expect(buildDev02RouteComparisonBlindPackV1({ outputRoot: path.join(scratch, 'tampered'), createdAt: '2026-08-22T17:30:00.000Z', nativeReceiptPath, hybridReceiptPath }))
        .rejects.toThrow('FORCED_NATIVE_VIDEO_INVALID');
      await fs.writeFile(native.output.path, 'native-video');
      const hybrid = JSON.parse(await fs.readFile(hybridReceiptPath, 'utf8')); hybrid.proof.boundaryContinuity = 'FAIL';
      await fs.writeFile(hybridReceiptPath, JSON.stringify(hybrid));
      await expect(buildDev02RouteComparisonBlindPackV1({ outputRoot: path.join(scratch, 'drifted'), createdAt: '2026-08-22T17:30:00.000Z', nativeReceiptPath, hybridReceiptPath }))
        .rejects.toThrow('HYBRID_RECEIPT_INVALID');
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('rejects a coherently rehashed forged nested native proof', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-route-forged-'));
    try {
      const nativeReceiptPath = await makeNative(scratch); const hybridReceiptPath = await makeHybrid(scratch);
      const native = JSON.parse(await fs.readFile(nativeReceiptPath, 'utf8'));
      native.targetProof.candidateHash = 'f'.repeat(64);
      const { proofHash: _oldProofHash, ...proofUnsigned } = native.targetProof;
      native.targetProof.proofHash = hashCanonicalJsonV1(proofUnsigned);
      const { receiptHash: _oldReceiptHash, ...receiptUnsigned } = native;
      native.receiptHash = hashCanonicalJsonV1(receiptUnsigned);
      await fs.writeFile(nativeReceiptPath, JSON.stringify(native));
      await expect(buildDev02RouteComparisonBlindPackV1({ outputRoot: path.join(scratch, 'forged'), createdAt: '2026-08-22T17:30:00.000Z', nativeReceiptPath, hybridReceiptPath }))
        .rejects.toThrow('NATIVE_RECEIPT_INVALID');
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });
});

async function makeNative(root: string): Promise<string> {
  const videoPath = path.join(root, 'native.mp4'); const video = Buffer.from('native-video'); await fs.writeFile(videoPath, video);
  const proofUnsigned = { artifactType: 'Dev02RenderedTargetCandidateProofV1' as const, policyId: DEV02_RENDERED_PROOF_POLICY_V1.policyId, taskId: 'DEV-02' as const, candidateId: 'dev02-forced-native-v1', candidateKind: 'NATIVE' as const, candidateHash: DEV02_FORCED_NATIVE_BASELINE_HASH_V1, hardGateDisposition: 'PASS' as const, technicalDisposition: 'UNVERIFIABLE' as const, creativeDisposition: 'UNVERIFIABLE' as const, checks: [
    ['FRAME_INTEGRITY', 'PASS'], ['SETTLED_PANEL_GEOMETRY', 'PASS'], ['TITLE_FORM', 'PASS'], ['OPPOSED_PANEL_MOTION', 'PASS'],
    ['PHASE_STRUCTURE', 'PASS'], ['FULL_CANVAS_RELEASE', 'PASS'], ['BOUNDARY_CONTINUITY', 'PASS'], ['FLASH_SAFETY', 'UNVERIFIABLE'],
  ].map(([checkId, status]) => ({ checkId, status })) };
  const unsigned = {
    schemaVersion: DEV02_FORCED_NATIVE_BASELINE_VERSION_V1, authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
    executionId: 'native-test', createdAt: '2026-08-22T17:30:00.000Z', baselineHash: DEV02_FORCED_NATIVE_BASELINE_HASH_V1,
    sourceBindings: [{ assetId: 'dev02-wide', sha256: '1'.repeat(64) }, { assetId: 'dev02-close', sha256: '2'.repeat(64) }],
    overlayPlan: { overlayCount: 16, keyframeTrackCount: 7, keyframeCount: 14, crossElementRelationshipCount: 0, limitation: 'Current native state stores independent values/keyframes; shared panel relationships and animated width/height are not represented.', overlayPlanHash: 'ee73a20de033d968f9f05392ae18e3af7858dc888231ec4b84b71b2c0f24fba6' },
    output: { path: videoPath, sha256: sha(video), codec: 'h264', width: 1080, height: 1920, frameRate: '30/1', decodedFrameCount: 345, durationSeconds: 11.5, audioStreamCount: 0 },
    targetProof: { ...proofUnsigned, proofHash: hashCanonicalJsonV1(proofUnsigned) }, browserErrors: [], externalCalls: { providerApiCalls: 0 as const, cloudRenderCalls: 0 as const, projectServiceCalls: 0 as const, databaseCalls: 0 as const }, stateEffects: [] as const,
  };
  const receiptPath = path.join(root, 'native-receipt.json'); await fs.writeFile(receiptPath, JSON.stringify({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) })); return receiptPath;
}

async function makeHybrid(root: string): Promise<string> {
  const videoPath = path.join(root, 'hybrid.mp4'); const video = Buffer.from('hybrid-video'); await fs.writeFile(videoPath, video); const videoSha = sha(video);
  const continuation = { nodeId: 'compile-resolve-native-continuation' as const, operatorId: 'resolve_user_asset_overlay' as const, ownerRef: 'v1:resolve_user_asset_overlay', scope: 'READ_ONLY' as const, overlayId: 'ov-next' as const, before: { assetId: 'dev02-close' as const, sourceStartFrame: 180 as const, sourceEndExclusiveFrame: 345 as const, projectStartFrame: 180 as const, projectEndExclusiveFrame: 345 as const }, after: { assetId: 'dev02-close' as const, sourceStartFrame: 180 as const, sourceEndExclusiveFrame: 345 as const, projectStartFrame: 180 as const, projectEndExclusiveFrame: 345 as const }, changedProxyPaths: [] as const, appliedStateEffects: [] as const, disposition: 'RESOLVED_EXISTING_BINDING' as const, sourceGraphNodeHash: '4'.repeat(64) };
  const unsigned = {
    schemaVersion: DEV02_HYBRID_STAGE6_VERSION_V2, authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const, taskId: 'DEV-02' as const, executionId: 'hybrid-test', createdAt: '2026-08-22T17:30:00.000Z', stage4GraphHash: '5'.repeat(64), stage5DecisionHash: '6'.repeat(64), projectBinding: { projectId: 'oe-dev-02' as const, expectedProjectRevision: 'R3' as const, observedProjectRevision: 'NOT_READ' as const, changedProjectPaths: [] as const },
    inputs: { island: { programHash: hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1), sourceStage4GraphHash: '7'.repeat(64), upstreamStage6ReceiptHash: '8'.repeat(64), hostReceiptHash: '9'.repeat(64), proxyReceiptHash: 'a'.repeat(64), localEvidenceHash: 'b'.repeat(64), renderedProofHash: 'c'.repeat(64), hardGateDisposition: 'PASS' as const, videoSha256: 'd'.repeat(64) }, nativeSource: { assetId: 'dev02-close' as const, assetVersion: `sha256:${'e'.repeat(64)}`, videoSha256: 'e'.repeat(64), sourceStartFrame: 180 as const, sourceEndExclusiveFrame: 345 as const, projectStartFrame: 180 as const, projectEndExclusiveFrame: 345 as const }, nativeContinuation: { ...continuation, receiptHash: hashCanonicalJsonV1(continuation) } },
    operations: [{ nodeId: 'compile-preview-generated-island' as const, owner: 'executeGeneratedCompositionInSandboxV1' as const }, { nodeId: 'compile-resolve-native-continuation' as const, owner: 'resolve_user_asset_overlay' as const }, { nodeId: 'compile-prove-dev02-hybrid-proxy' as const, owner: 'renderDev02HybridStage6ProxyV2' as const }] as const,
    artifacts: [{ artifactId: 'FULL_HYBRID_PROXY' as const, path: videoPath, sha256: videoSha, byteLength: video.length }], renderProof: { schemaVersion: DEV02_HYBRID_STAGE6_VERSION_V2, assembler: 'FFMPEG_FILTER_GRAPH_BOUND_TO_STAGE4_TIME_ANCHOR' as const, composition: { width: 1080 as const, height: 1920 as const, fpsNumerator: 30 as const, fpsDenominator: 1 as const, generatedFrames: 180 as const, nativeFrames: 165 as const, totalFrames: 345 as const }, inputVideo: { islandCodec: 'h264', islandFrameRate: '30/1', islandFrameCount: 180, islandAudioStreams: 0, nativeCodec: 'h264', nativeFrameRate: '30/1', nativeFrameCount: 360, nativeAudioStreams: 0 }, outputVideo: { codec: 'h264', width: 1080, height: 1920, averageFrameRate: '30/1', decodedFrameCount: 345, durationSeconds: 11.5, audioStreamCount: 0 }, decodedFrameEvidence: { generatedSegmentNormalizedDifference: 0, generatedExitToNativeSourceNormalizedDifference: 0, nativeEntryToSourceNormalizedDifference: 0, nativeFinalToSourceNormalizedDifference: 0, outputBoundaryNormalizedDifference: 0 }, externalCalls: { providerApiCalls: 0 as const, cloudRenderCalls: 0 as const, projectServiceCalls: 0 as const, databaseCalls: 0 as const } },
    proof: { generatedIslandHardGates: 'PASS' as const, hybridTiming: 'PASS' as const, boundaryContinuity: 'PASS' as const, nativeContinuation: 'PASS' as const, creativeTaste: 'UNVERIFIABLE' as const, flashSafety: 'UNVERIFIABLE' as const, projectMutation: 'NONE' as const }, fullProjectExecutionEligibility: 'NOT_EXECUTABLE' as const, stateEffects: [] as const,
  } satisfies Omit<Dev02HybridStage6ReceiptV2, 'receiptHash'>;
  const receiptPath = path.join(root, 'hybrid-receipt.json'); await fs.writeFile(receiptPath, JSON.stringify({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) })); return receiptPath;
}
function sha(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
