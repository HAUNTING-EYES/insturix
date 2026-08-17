import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildDev02HybridStage7BlindReviewPackV2,
  type Dev02HybridStage7CandidateV2,
} from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage7-blind-review-v2';
import {
  DEV02_HYBRID_STAGE6_VERSION_V2,
  type Dev02HybridStage6ReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage6-contract-v2';

describe('open-ended planner V2 DEV-02 full hybrid Stage 7 blind review', () => {
  it('creates a three-candidate reviewer pack with model identity isolated in the operator key', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-stage7-'));
    try {
      const candidates = await Promise.all(['luna', 'terra', 'qwen'].map((id, index) => makeCandidate(scratch, id, index)));
      const pack = await buildDev02HybridStage7BlindReviewPackV2({
        outputRoot: path.join(scratch, 'pack'),
        createdAt: '2026-08-16T00:00:00.000Z',
        candidates: candidates as [Dev02HybridStage7CandidateV2, Dev02HybridStage7CandidateV2, Dev02HybridStage7CandidateV2],
        randomSource: () => Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      });
      const manifestText = await fs.readFile(pack.reviewerManifestPath, 'utf8');
      const manifest = JSON.parse(manifestText);
      const operator = JSON.parse(await fs.readFile(pack.operatorKeyPath, 'utf8'));
      expect(pack.reviewStatus).toBe('AWAITING_REAL_HUMAN_REVIEW');
      expect(pack.candidateVideos.map(({ candidateId }) => candidateId)).toEqual(['candidate-a', 'candidate-b', 'candidate-c']);
      expect(manifest.rubric.dimensions).toContain('generated-to-native-continuity');
      expect(manifest.rubric.dimensions).toContain('native-continuation-quality');
      expect(manifestText).not.toContain('luna');
      expect(manifestText).not.toContain('terra');
      expect(manifestText).not.toContain('qwen');
      expect(operator.mappings.map(({ modelIdentity }: { modelIdentity: string }) => modelIdentity).sort()).toEqual(['luna', 'qwen', 'terra']);
      expect(operator.disclosurePolicy).toBe('DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL');
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('rejects duplicate candidates and a receipt/video identity mismatch', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-stage7-bad-'));
    try {
      const candidates = await Promise.all(['luna', 'terra', 'qwen'].map((id, index) => makeCandidate(scratch, id, index)));
      await expect(buildDev02HybridStage7BlindReviewPackV2({
        outputRoot: path.join(scratch, 'duplicates'), createdAt: '2026-08-16T00:00:00.000Z',
        candidates: [candidates[0], candidates[0], candidates[2]],
      })).rejects.toThrow('SOURCE_CANDIDATE_SET_INVALID');
      await fs.appendFile(candidates[1].videoPath, 'tamper');
      await expect(buildDev02HybridStage7BlindReviewPackV2({
        outputRoot: path.join(scratch, 'tampered'), createdAt: '2026-08-16T00:00:00.000Z',
        candidates: candidates as [Dev02HybridStage7CandidateV2, Dev02HybridStage7CandidateV2, Dev02HybridStage7CandidateV2],
      })).rejects.toThrow('VIDEO_INVALID');
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });
});

async function makeCandidate(root: string, id: string, index: number): Promise<Dev02HybridStage7CandidateV2> {
  const candidateRoot = path.join(root, id); await fs.mkdir(candidateRoot);
  const videoPath = path.join(candidateRoot, 'dev02-full-hybrid-proxy.mp4');
  const video = Buffer.from(`synthetic-mp4-${id}-${index}`); await fs.writeFile(videoPath, video);
  const videoSha256 = sha(video); const programHash = String(index + 1).repeat(64);
  const continuationRange = {
    assetId: 'dev02-close' as const,
    sourceStartFrame: 180 as const,
    sourceEndExclusiveFrame: 345 as const,
    projectStartFrame: 180 as const,
    projectEndExclusiveFrame: 345 as const,
  };
  const continuationUnsigned = {
    nodeId: 'compile-resolve-native-continuation' as const,
    operatorId: 'resolve_user_asset_overlay' as const,
    ownerRef: 'v1:resolve_user_asset_overlay',
    scope: 'READ_ONLY' as const,
    overlayId: 'ov-next' as const,
    before: continuationRange,
    after: continuationRange,
    changedProxyPaths: [] as const,
    appliedStateEffects: [] as const,
    disposition: 'RESOLVED_EXISTING_BINDING' as const,
    sourceGraphNodeHash: '4'.repeat(64),
  };
  const nativeContinuation = {
    ...continuationUnsigned,
    receiptHash: hashCanonicalJsonV1(continuationUnsigned),
  };
  const unsigned = {
    schemaVersion: DEV02_HYBRID_STAGE6_VERSION_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: 'DEV-02' as const, executionId: `stage7-${id}-0001`, createdAt: '2026-08-16T00:00:00.000Z',
    stage4GraphHash: 'a'.repeat(64), stage5DecisionHash: 'b'.repeat(64),
    projectBinding: { projectId: 'oe-dev-02' as const, expectedProjectRevision: 'R3' as const, observedProjectRevision: 'NOT_READ' as const, changedProjectPaths: [] as const },
    inputs: {
      island: {
        programHash, sourceStage4GraphHash: '1'.repeat(64), upstreamStage6ReceiptHash: '2'.repeat(64),
        hostReceiptHash: 'c'.repeat(64), proxyReceiptHash: 'd'.repeat(64), localEvidenceHash: '3'.repeat(64),
        renderedProofHash: 'e'.repeat(64), hardGateDisposition: 'PASS' as const, videoSha256: 'f'.repeat(64),
      },
      nativeSource: { assetId: 'dev02-close' as const, assetVersion: `sha256:${'0'.repeat(64)}`, videoSha256: '0'.repeat(64), sourceStartFrame: 180 as const, sourceEndExclusiveFrame: 345 as const, projectStartFrame: 180 as const, projectEndExclusiveFrame: 345 as const },
      nativeContinuation,
    },
    operations: [
      { nodeId: 'compile-preview-generated-island' as const, owner: 'executeGeneratedCompositionInSandboxV1' as const },
      { nodeId: 'compile-resolve-native-continuation' as const, owner: 'resolve_user_asset_overlay' as const },
      { nodeId: 'compile-prove-dev02-hybrid-proxy' as const, owner: 'renderDev02HybridStage6ProxyV2' as const },
    ] as const,
    artifacts: [{ artifactId: 'FULL_HYBRID_PROXY' as const, path: videoPath, sha256: videoSha256, byteLength: video.length }],
    renderProof: {} as never,
    proof: { generatedIslandHardGates: 'PASS' as const, hybridTiming: 'PASS' as const, boundaryContinuity: 'PASS' as const, nativeContinuation: 'PASS' as const, creativeTaste: 'UNVERIFIABLE' as const, flashSafety: 'UNVERIFIABLE' as const, projectMutation: 'NONE' as const },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE' as const, stateEffects: [] as const,
  };
  const receipt: Dev02HybridStage6ReceiptV2 = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const stage6ReceiptPath = path.join(candidateRoot, 'dev02-hybrid-stage6-receipt-v2.json');
  await fs.writeFile(stage6ReceiptPath, JSON.stringify(receipt));
  return { sourceCandidateId: `source-${id}`, modelIdentity: id, stage6ReceiptPath, stage6ReceiptHash: receipt.receiptHash, videoPath, videoSha256 };
}

function sha(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
