/**
 * MG Codegen — the R2 FrameUploader adapter (Phase D). Wraps Editron's existing uploadToR2 (bytes-only,
 * NO Mongo mediaAssets doc — we do not want one row per frame) as the injected uploader for ingestSequence.
 *
 * Kept separate from sequence-ingest.ts so the ingest core stays free of the AWS SDK and unit-testable.
 * Server-only.
 */

import { uploadToR2 } from '@/lib/editron/services/r2-service';

import type { FrameUploader } from './sequence-ingest';

/**
 * Build a FrameUploader that stores frames on R2 under the given owner. The frame `key` doubles as the R2
 * object key and asset id, so the returned publicUrl is the durable CDN url (`/asset/<key>`). No mediaAssets
 * document is written — the caller persists ONE manifest record for the whole sequence, not one per frame.
 */
export function makeR2FrameUploader(userId: string): FrameUploader {
  return async (bytes, key, contentType) => {
    const res = await uploadToR2(bytes, userId, `${key}.webp`, contentType, key);
    return res.publicUrl;
  };
}
