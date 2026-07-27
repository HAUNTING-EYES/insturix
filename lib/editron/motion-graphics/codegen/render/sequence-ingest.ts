/**
 * MG Codegen — sequence ingest (E0 Phase D, the R2 half). Takes the on-disk transparent WebP frame
 * sequence from renderMomentToWebpFrames and uploads each frame's bytes to durable storage, returning an
 * ordered manifest the timeline layer will play by frame index.
 *
 * WHY a manifest of per-frame URLs (not one container, not a sprite sheet): a transparent MG clip can ONLY
 * ship as individual alpha frames. Every transparent VIDEO codec drops the alpha channel (proven end-to-end:
 * Remotion webm/prores AND direct ffmpeg libvpx — tmp/mg-alpha-probe/bench-webp.mjs), and a single sprite
 * sheet of full-res frames blows past browser canvas/texture limits. So frames stay individual and
 * index-addressable. This module is the un-skippable "get the frames to durable URLs" step; it is
 * consumed by the compact MG_SEQUENCE playback descriptor without persisting the URL array.
 *
 * PURE of any storage SDK: the uploader is INJECTED (prod = R2 via makeR2FrameUploader in the sibling
 * adapter; tests = a fake). So this is unit-testable without touching the network or the prod CDN bucket.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { MgRenderResult } from './frame-renderer';
import { sequenceFrameKey } from './sequence-playback';

export { sequenceFrameKey as frameKey } from './sequence-playback';

/** Uploads one frame's bytes under `key`, returns a durable public URL. */
export type FrameUploader = (bytes: Buffer, key: string, contentType: string) => Promise<string>;

export interface MgSequenceManifest {
  sequenceId: string;
  /** Ordered — frameUrls[i] is frame i (what the layer indexes with useCurrentFrame()). */
  frameUrls: string[];
  fps: number;
  width: number;
  height: number;
  count: number;
  /** Always true — this lane only ever ships alpha frames (renderMomentToWebpFrames asserts it). */
  transparent: true;
}

const FRAME_CONTENT_TYPE = 'image/webp';
const DEFAULT_CONCURRENCY = 8;
/** Bounded-concurrency map that preserves index → result order regardless of completion order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Upload a rendered frame sequence to durable storage and return its manifest. Frames are uploaded in
 * parallel but the manifest is strictly ordered (frameUrls[i] === frame i). Throws if the upload count
 * doesn't match the render (R18N — never ship a half-uploaded, silently-truncated sequence).
 */
export async function ingestSequence(
  render: MgRenderResult,
  deps: {
    sequenceId: string;
    uploadFrame: FrameUploader;
    readFile?: (filePath: string) => Promise<Buffer>;
    concurrency?: number;
  },
): Promise<MgSequenceManifest> {
  const read = deps.readFile ?? ((p: string) => fs.readFile(p));
  const limit = deps.concurrency ?? DEFAULT_CONCURRENCY;

  const frameUrls = await mapPool(render.files, limit, async (file, i) => {
    const bytes = await read(path.join(render.webpDir, file));
    return deps.uploadFrame(bytes, sequenceFrameKey(deps.sequenceId, i), FRAME_CONTENT_TYPE);
  });

  if (frameUrls.length !== render.count) {
    throw new Error(`MG ingest: uploaded ${frameUrls.length} frames, expected ${render.count}`);
  }
  return {
    sequenceId: deps.sequenceId,
    frameUrls,
    fps: render.fps,
    width: render.width,
    height: render.height,
    count: render.count,
    transparent: true,
  };
}
