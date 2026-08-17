import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { bindVerifiedDev02HybridIslandV2 } from '@/lib/editron/research/open-ended-planner/dev02-hybrid-island-binding-v2';
import { buildDev02VerifiedIslandUpstreamFixtureV2 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-verified-island-upstream-v2';

const roots: string[] = [];

describe('DEV-02 verified generated-island handoff', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('derives the hybrid input only from a complete sandbox, byte, and rendered-proof chain', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-upstream-'));
    roots.push(root);
    const fixture = await buildDev02VerifiedIslandUpstreamFixtureV2({ root });
    const binding = await bindVerifiedDev02HybridIslandV2(fixture);
    expect(binding).toMatchObject({
      programHash: fixture.stage6Evidence.receipt.programHash,
      sourceStage4GraphHash: hashCanonicalJsonV1(fixture.sourceGraph),
      upstreamStage6ReceiptHash: fixture.stage6Evidence.receipt.receiptHash,
      hostReceiptHash: fixture.stage6Evidence.sandboxHostReceipt.receiptHash,
      proxyReceiptHash: fixture.stage6Evidence.sandboxHostReceipt.proxyReceiptHash,
      localEvidenceHash: fixture.localEvidence.evidenceHash,
      renderedProofHash: fixture.renderedProof.proofHash,
      hardGateDisposition: 'PASS',
      videoSha256: fixture.localEvidence.localEvaluationReceipt.playableProxy?.sha256,
    });

    const outputDrift = structuredClone(fixture.stage6Evidence);
    const playableRemote = Object.keys(outputDrift.outputBytes).find((entry) => entry.endsWith('/playable-proxy.mp4'))!;
    const tamperedOutputDrift = {
      ...outputDrift,
      outputBytes: { ...outputDrift.outputBytes, [playableRemote]: Buffer.from('tampered') },
    };
    await expect(bindVerifiedDev02HybridIslandV2({ ...fixture, stage6Evidence: tamperedOutputDrift }))
      .rejects.toThrow('UPSTREAM_STAGE6_INVALID');

    await expect(bindVerifiedDev02HybridIslandV2({
      ...fixture,
      renderedProof: { ...fixture.renderedProof, proofHash: 'f'.repeat(64) },
    })).rejects.toThrow('UPSTREAM_RENDERED_PROOF_INVALID');

    await fs.appendFile(binding.videoPath, 'tamper');
    await expect(bindVerifiedDev02HybridIslandV2(fixture)).rejects.toThrow('PLAYABLE_HASH_DRIFT');
  });
});
