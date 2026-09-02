import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildStage25Rhc01BlindReviewPackV1,
  type Stage25Rhc01BlindCandidateV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc01-blind-review-pack-v1';
import {
  buildStage25Rhc01PreviewIdentityV1,
  executeStage25Rhc01PreviewV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc01-preview-renderer-v1';
import type { Stage25PreviewMediaFixtureReceiptV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-preview-media-fixture-v1';

describe('Stage 2.5 RHC-01 preview execution and blind review', () => {
  it('derives exact generated-program identities from materialized media receipts', () => {
    const media = fakeMediaReceipt();
    expect(buildStage25Rhc01PreviewIdentityV1(media)).toEqual({
      assetVersions: {
        'rhc01-product-a': `sha256:${'1'.repeat(64)}`,
        'rhc01-product-b': `sha256:${'2'.repeat(64)}`,
        'rhc01-product-c': `sha256:${'3'.repeat(64)}`,
        'rhc01-following-shot': `sha256:${'4'.repeat(64)}`,
      },
      fontVersion: `sha256:${'f'.repeat(64)}`,
      fontFileSha256: 'f'.repeat(64),
    });
    const missing = {
      ...structuredClone(media),
      assets: media.assets.slice(0, -1),
    } as Stage25PreviewMediaFixtureReceiptV1;
    expect(() => buildStage25Rhc01PreviewIdentityV1(missing))
      .toThrow('STAGE25_RHC01_PREVIEW_EXECUTION_MEDIA_ASSET_SET_INVALID');
  });

  it('builds a hash-bound three-way pack without exposing routes to the reviewer', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'editron-rhc01-blind-'));
    try {
      const candidates = await materializeDummyCandidates(root);
      const pack = await buildStage25Rhc01BlindReviewPackV1({
        outputRoot: path.join(root, 'pack'),
        createdAt: '2026-08-26T00:00:00.000Z',
        taskSha256: 'a'.repeat(64),
        candidateSetHash: 'b'.repeat(64),
        publicBrief: 'Reveal three labels and continue the final source.',
        targetPredicates: [{ predicateId: 'T1' }],
        preservationPredicates: [{ predicateId: 'P1' }],
        candidates,
        randomSource: () => Uint8Array.from({ length: 32 }, (_, index) => index),
      });
      expect(pack).toMatchObject({
        reviewStatus: 'AWAITING_ONE_QUALIFIED_HUMAN_REVIEW',
        independentAgreement: 'UNAVAILABLE_SINGLE_REVIEWER',
      });
      const publicText = await readFile(pack.reviewerManifestPath, 'utf8');
      expect(publicText).not.toContain('"route"');
      expect(publicText).not.toContain('RHC-01:NATIVE');
      expect(publicText).not.toContain('GENERATED_COMPOSITION');
      const publicManifest = JSON.parse(publicText) as { candidates: Array<{ candidateId: string }> };
      expect(publicManifest.candidates.map(({ candidateId }) => candidateId)).toEqual(['A', 'B', 'C']);
      const operator = JSON.parse(await readFile(pack.operatorKeyPath, 'utf8')) as {
        mappings: Array<{ route: string }>;
      };
      expect(new Set(operator.mappings.map(({ route }) => route))).toEqual(new Set([
        'NATIVE', 'GENERATED_COMPOSITION', 'HYBRID',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects copied, duplicate, and malformed evidence before creating a review pack', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'editron-rhc01-blind-bad-'));
    try {
      const candidates = await materializeDummyCandidates(root);
      const forged = [...candidates] as [
        Stage25Rhc01BlindCandidateV1,
        Stage25Rhc01BlindCandidateV1,
        Stage25Rhc01BlindCandidateV1,
      ];
      forged[0] = { ...forged[0], videoSha256: '0'.repeat(64) };
      await expect(buildStage25Rhc01BlindReviewPackV1({
        outputRoot: path.join(root, 'forged'),
        createdAt: '2026-08-26T00:00:00.000Z',
        taskSha256: 'a'.repeat(64),
        candidateSetHash: 'b'.repeat(64),
        publicBrief: 'brief',
        targetPredicates: [],
        preservationPredicates: [],
        candidates: forged,
      })).rejects.toThrow('CANDIDATE_EVIDENCE_INVALID');
      const duplicateRoutes = [candidates[0], { ...candidates[1], route: 'NATIVE' as const }, candidates[2]] as const;
      await expect(buildStage25Rhc01BlindReviewPackV1({
        outputRoot: path.join(root, 'duplicate'),
        createdAt: '2026-08-26T00:00:00.000Z',
        taskSha256: 'a'.repeat(64),
        candidateSetHash: 'b'.repeat(64),
        publicBrief: 'brief',
        targetPredicates: [],
        preservationPredicates: [],
        candidates: duplicateRoutes,
      })).rejects.toThrow('CANDIDATES_NOT_DISTINCT');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed execution identity before creating or rendering anything', async () => {
    await expect(executeStage25Rhc01PreviewV1({
      outputDir: path.join(tmpdir(), 'must-not-exist'),
      executionId: 'bad',
      createdAt: 'invalid',
      sourceCommitSha: 'forged',
    })).rejects.toThrow('STAGE25_RHC01_PREVIEW_EXECUTION_EXECUTION_ID_INVALID');
  });
});

function fakeMediaReceipt(): Stage25PreviewMediaFixtureReceiptV1 {
  return {
    assets: [
      ['rhc01-product-a', '1'],
      ['rhc01-product-b', '2'],
      ['rhc01-product-c', '3'],
      ['rhc01-following-shot', '4'],
    ].map(([assetId, digit]) => ({ assetId, sha256: digit.repeat(64) })),
    font: { sha256: 'f'.repeat(64) },
  } as unknown as Stage25PreviewMediaFixtureReceiptV1;
}

async function materializeDummyCandidates(root: string): Promise<readonly [
  Stage25Rhc01BlindCandidateV1,
  Stage25Rhc01BlindCandidateV1,
  Stage25Rhc01BlindCandidateV1,
]> {
  const routes = ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'] as const;
  const candidates = [];
  for (let index = 0; index < routes.length; index += 1) {
    const video = Buffer.from(`video-${index}`);
    const sheet = Buffer.from(`sheet-${index}`);
    const videoPath = path.join(root, `candidate-${index}.mp4`);
    const contactSheetPath = path.join(root, `candidate-${index}.png`);
    await Promise.all([writeFile(videoPath, video), writeFile(contactSheetPath, sheet)]);
    candidates.push({
      sourceCandidateId: `source-${index}`,
      route: routes[index],
      videoPath,
      videoSha256: sha256(video),
      contactSheetPath,
      contactSheetSha256: sha256(sheet),
      boundaryEvidence: { frame: 150 + index },
      structuralEditabilityDisposition: 'PASS_TEST_FIXTURE',
    });
  }
  return candidates as unknown as readonly [
    Stage25Rhc01BlindCandidateV1,
    Stage25Rhc01BlindCandidateV1,
    Stage25Rhc01BlindCandidateV1,
  ];
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
