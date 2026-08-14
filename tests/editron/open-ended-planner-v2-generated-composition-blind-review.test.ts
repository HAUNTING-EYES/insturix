import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildGeneratedCompositionBlindReviewPackV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-blind-review-v1';

describe('generated-composition blind review pack', () => {
  it('creates hash-distinct review copies without leaking model, candidate, or source-video identity', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-blind-review-'));
    try {
      const left = await candidate(scratch, 'terra-source', 'gpt-terra', 'left-video', 'a');
      const right = await candidate(scratch, 'gemini-source', 'gemini-flash', 'right-video', 'b');
      const pack = await buildGeneratedCompositionBlindReviewPackV1({ outputRoot: path.join(scratch, 'pack'), createdAt: '2026-08-14T12:00:00.000Z', candidates: [left, right], randomSource: () => Uint8Array.from({ length: 32 }, () => 1) });
      const manifest = await fs.readFile(pack.reviewerManifestPath, 'utf8');
      const form = await fs.readFile(pack.reviewFormTemplatePath, 'utf8');
      const operatorKey = await fs.readFile(pack.operatorKeyPath, 'utf8');
      expect(manifest + form).not.toContain('gpt-terra'); expect(manifest + form).not.toContain('gemini-flash');
      expect(manifest + form).not.toContain('terra-source'); expect(manifest + form).not.toContain('gemini-source');
      expect(manifest + form).not.toContain(left.videoSha256); expect(manifest + form).not.toContain(right.videoSha256);
      expect(operatorKey).toContain('gpt-terra'); expect(operatorKey).toContain('gemini-flash');
      expect(operatorKey).toContain(left.videoSha256); expect(operatorKey).toContain(right.videoSha256);
      expect(pack.reviewStatus).toBe('AWAITING_REAL_HUMAN_REVIEW');
      expect(pack.candidateVideos.map(({ candidateId }) => candidateId)).toEqual(['candidate-a', 'candidate-b']);
      expect(pack.candidateVideos[0].sha256).not.toBe(right.videoSha256);
      const reviewCopy = await fs.readFile(pack.candidateVideos[0].path);
      expect(reviewCopy.subarray(0, -40).toString('utf8')).toBe('right-video');
      expect(reviewCopy.readUInt32BE(reviewCopy.length - 40)).toBe(40);
      expect(reviewCopy.subarray(reviewCopy.length - 36, reviewCopy.length - 32).toString('ascii')).toBe('free');
      expect(pack.stateEffects).toEqual([]);
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('rejects bad video hashes, duplicate candidates, and an existing pack directory', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-blind-review-adversarial-'));
    try {
      const left = await candidate(scratch, 'left-source', 'model-left', 'left-video', 'a');
      const right = await candidate(scratch, 'right-source', 'model-right', 'right-video', 'b');
      await expect(buildGeneratedCompositionBlindReviewPackV1({ outputRoot: path.join(scratch, 'bad-hash'), createdAt: '2026-08-14T12:00:00.000Z', candidates: [{ ...left, videoSha256: '0'.repeat(64) }, right] })).rejects.toThrow(/VIDEO_INVALID/);
      await expect(buildGeneratedCompositionBlindReviewPackV1({ outputRoot: path.join(scratch, 'duplicate'), createdAt: '2026-08-14T12:00:00.000Z', candidates: [left, { ...right, sourceCandidateId: left.sourceCandidateId }] })).rejects.toThrow(/NOT_DISTINCT/);
      const existing = path.join(scratch, 'existing'); await fs.mkdir(existing);
      await expect(buildGeneratedCompositionBlindReviewPackV1({ outputRoot: existing, createdAt: '2026-08-14T12:00:00.000Z', candidates: [left, right] })).rejects.toThrow();
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });
});

async function candidate(root: string, sourceCandidateId: string, modelIdentity: string, bytes: string, identity: string) {
  const videoPath = path.join(root, `${sourceCandidateId}.mp4`); await fs.writeFile(videoPath, bytes);
  return { sourceCandidateId, modelIdentity, programHash: identity.repeat(64), hostReceiptHash: (identity === 'a' ? 'c' : 'd').repeat(64), proofHash: (identity === 'a' ? 'e' : 'f').repeat(64), videoPath, videoSha256: sha(Buffer.from(bytes)) };
}
function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
