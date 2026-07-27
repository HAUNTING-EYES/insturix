/**
 * MG Codegen — the per-moment orchestrator (Phase E, the SEAM's single entry). Turns ONE licensed moment
 * into a durable, playable, transparent WebP sequence by chaining the already-built steps:
 *
 *   generateMoment (scan→repair→compile→judge→decline/fallback)   [codegen-service, light]
 *     → renderMomentToWebpFrames (component → alpha WebP frames)   [frame-renderer, server-only — LAZY]
 *     → ingestSequence (frames → durable R2 URLs)                  [sequence-ingest, light]
 *     → SequencePlaybackAddress (the compact descriptor Codex persists + the player hydrates)
 *
 * The seam (edl-executor.applyGraphic) calls ONLY this: `renderMgMoment(input, deps)`. On 'generated' it
 * persists a MediaAsset('sequence') from `.sequence` and inserts the MG_SEQUENCE overlay; on 'declined' /
 * 'fallback' it shows the user notification + Vercel error log — NEVER a template card.
 *
 * Grounding / honesty (R18N, R2N): this step decides nothing creative and never silently substitutes a
 * graphic. Any render/ingest failure → status 'fallback' with a reason (not a fake success, not an opaque
 * frame). frame-renderer already asserts the frames carry alpha; here we additionally assert the compact
 * address reconstructs the exact uploaded URLs, so the player can never 404.
 *
 * SERVER-ONLY in prod (the default render path lazy-imports Remotion + sharp). The heavy import is deferred
 * so unit tests can inject fakes for every step without loading a browser/native module.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { CodegenDeps } from '../codegen-service';
import { generateMoment } from '../codegen-service';
import type { MgGenerateResult, MgMomentInput, MgReceipt } from '../types';
import type { MgImageGenerate } from '../design/imagery-client';
import type { MgRenderResult } from './frame-renderer';
import type { MgRenderInput } from './scaffold';
import { workspaceId } from './scaffold';
import type { FrameUploader, MgSequenceManifest } from './sequence-ingest';
import { ingestSequence } from './sequence-ingest';
import type { SequencePlaybackAddress } from './sequence-playback';
import { normalizeSequenceCdnBaseUrl, sequenceFrameKey, sequenceFrameUrls } from './sequence-playback';

/** What the seam persists as a MediaAsset('sequence') and hands the player. */
export interface MgSequenceOutput {
  /** The compact playback descriptor — {sequenceId, frameCount, cdnBaseUrl}. The player reconstructs every
   *  frame URL from this; the frameUrls[] array is deliberately NOT persisted (field-freeze). */
  address: SequencePlaybackAddress;
  /** The R2 key prefix for every frame — `mgseq_<sequenceId>_`. The delete route uses it to purge the set. */
  r2Prefix: string;
  fps: number;
  width: number;
  height: number;
  frameFormat: 'webp';
  transparent: true;
  /** Total bytes across all frames — the MediaAsset `size` (storage accounting). */
  sizeBytes: number;
  renderMs: number;
}

export type RenderMomentResult =
  | { status: 'generated'; sequence: MgSequenceOutput; receipt: MgReceipt }
  | { status: 'declined'; reason: string; receipt: MgReceipt }
  | { status: 'fallback'; reason: string; receipt: MgReceipt };

/** Structural signatures for the injectable steps (kept structural so the heavy module is never value-imported). */
type GenerateFn = (input: MgMomentInput, deps: CodegenDeps) => Promise<MgGenerateResult>;
type RenderFn = (input: MgRenderInput, opts?: { repoRoot?: string; workspaceRoot?: string; kitDir?: string }) => Promise<MgRenderResult>;
type IngestFn = (render: MgRenderResult, deps: { sequenceId: string; uploadFrame: FrameUploader; readFile?: (p: string) => Promise<Buffer>; concurrency?: number }) => Promise<MgSequenceManifest>;
type CleanupFn = (workspaceDir: string) => Promise<void>;

export interface RenderMomentDeps {
  /** The codegen deps (model call, compile, judge) — passed straight through to generateMoment. */
  codegen: CodegenDeps;
  /** The video canvas the graphic renders into (pixels). Placement is fractional; this is the concrete size. */
  canvas: { width: number; height: number };
  /** Uploads one frame's bytes → durable URL. Prod: makeR2FrameUploader(userId). */
  uploadFrame: FrameUploader;
  /** Frame upload concurrency (default = ingestSequence's own default). */
  concurrency?: number;
  /** Passthrough to the renderer (repo root / scratch root / kit dir). */
  renderOpts?: { repoRoot?: string; workspaceRoot?: string; kitDir?: string };
  // Injectable seams — default to the real modules (frame-renderer is lazy-loaded so tests stay light).
  generate?: GenerateFn;
  render?: RenderFn;
  ingest?: IngestFn;
  cleanup?: CleanupFn;
  frameSize?: (webpDir: string, files: string[]) => Promise<number>;
  /** Authorize exact rendered bytes before any frame reaches durable storage. */
  authorizeStorage?: (sizeBytes: number) => Promise<void>;
  /** P5-3: injected backdrop image generator for illustrated-overlay lanes. Default (undefined) → imagery-client's
   *  live Gemini image call; tests inject a fake. */
  generateBackdrop?: MgImageGenerate;
  /** Tenant/owner namespace. Required by the live seam so identical outputs never share deletable R2 keys. */
  sequenceNamespace?: string;
}

const durationInFrames = (input: MgMomentInput): number =>
  Math.max(1, Math.round(input.window.endFrame - input.window.startFrame));

export function scopeMgSequenceId(baseId: string, namespace?: string): string {
  if (!namespace?.trim()) return baseId;
  const ownerHash = createHash('sha256').update(namespace.trim()).digest('hex').slice(0, 12);
  return `${ownerHash}_${baseId}`;
}

/** Sum the on-disk bytes of the rendered frames (before the workspace is cleaned). */
async function defaultFrameSize(webpDir: string, files: string[]): Promise<number> {
  let total = 0;
  for (const file of files) total += (await fs.stat(path.join(webpDir, file))).size;
  return total;
}

/**
 * Collapse the ingest manifest into the compact playback address AND prove it reconstructs the uploaded URLs.
 * The player only ever sees {sequenceId, frameCount, cdnBaseUrl}, so if the CDN/key convention ever drifts we
 * fail loud HERE (R18N) rather than shipping an address whose frames 404 at play time.
 */
function toPlaybackAddress(sequenceId: string, manifest: MgSequenceManifest): SequencePlaybackAddress {
  const first = manifest.frameUrls[0];
  if (!first) throw new Error('MG sequence: ingest returned zero frame URLs');
  const suffix = `/asset/${sequenceFrameKey(sequenceId, 0)}`;
  if (!first.endsWith(suffix)) {
    throw new Error(`MG sequence: frame URL "${first}" does not match the /asset/<key> convention (${suffix})`);
  }
  const cdnBaseUrl = normalizeSequenceCdnBaseUrl(first.slice(0, first.length - suffix.length));
  const address: SequencePlaybackAddress = { sequenceId, frameCount: manifest.count, cdnBaseUrl };
  const reconstructed = sequenceFrameUrls(address);
  if (reconstructed.length !== manifest.frameUrls.length || reconstructed.some((u, i) => u !== manifest.frameUrls[i])) {
    throw new Error('MG sequence: compact address does not reconstruct the uploaded frame URLs — refusing to persist');
  }
  return address;
}

/**
 * Render ONE licensed moment end-to-end. Returns:
 *  - 'generated' + the sequence (persist a MediaAsset, insert the MG_SEQUENCE overlay)
 *  - 'declined'  (the model found no faithful graphic — surface the notification, no overlay)
 *  - 'fallback'  (scan/compile/judge/render/ingest failed — surface the notification + Vercel error, no overlay)
 *
 * Never throws for a failed moment and never ships an opaque or unverified graphic. The render workspace is
 * always cleaned (finally), even on failure.
 */
export async function renderMgMoment(input: MgMomentInput, deps: RenderMomentDeps): Promise<RenderMomentResult> {
  const generate = deps.generate ?? generateMoment;
  const ingest = deps.ingest ?? ingestSequence;
  const render: RenderFn = deps.render ?? (async (ri, opts) => (await import('./frame-renderer')).renderMomentToWebpFrames(ri, opts));
  const cleanup: CleanupFn = deps.cleanup ?? (async (dir) => (await import('./frame-renderer')).cleanupWorkspace(dir));
  const frameSize = deps.frameSize ?? defaultFrameSize;

  // 1. Codegen. A decline or fallback stops here — no render, no partial asset.
  const gen = await generate(input, deps.codegen);
  if (gen.status === 'declined') {
    return { status: 'declined', reason: gen.reason ?? 'no faithful graphic', receipt: gen.receipt };
  }
  if (gen.status !== 'generated' || !gen.code) {
    // 'fallback', or the impossible 'generated'-without-code — an honest fallback either way (R18N).
    const reason = gen.reason ?? 'no component produced';
    return { status: 'fallback', reason, receipt: { ...gen.receipt, outcome: 'fallback', reason } };
  }

  // 2a. P5-3: illustrated-overlay lanes composite a GENERATED backdrop. Produce it HERE (worker-side: Gemini image
  // → bytes → base64 data URI) so the coder's <Scene src={data.backdropSrc}> renders it with NO sandbox network
  // round-trip and no allowlist widening (Gemini image generation is already permitted in the sandbox; the R2 CDN
  // host is not). A backdrop failure → fallback: an illustrated design cannot render without its backdrop, and we
  // never ship a blank Scene (R18N/R2N). overlay-kit / free-form paths never enter here (no imagery).
  let backdropSrc: string | undefined;
  const designPlan = input.design?.plan;
  if (designPlan?.lane === 'illustrated-overlay' && designPlan.imagery) {
    try {
      const { generateStillBackdrop } = await import('../design/imagery-client');
      const backdrop = await generateStillBackdrop(
        { ...designPlan.imagery, mode: 'still' },
        { brand: input.brand, canvas: deps.canvas, generate: deps.generateBackdrop },
      );
      backdropSrc = `data:${backdrop.mimeType};base64,${backdrop.bytes.toString('base64')}`;
    } catch (error) {
      const reason = `illustrated backdrop generation failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200);
      return { status: 'fallback', reason, receipt: { ...gen.receipt, outcome: 'fallback', reason } };
    }
  }

  // 2b. Render the validated component to alpha WebP frames (Law 5: the fact's values flow as `data`, never baked).
  // Reserved system props merge AFTER the fact content so model-authored content can never shadow them
  // (P5-1: closes the dead path where data.wordFrames / data.motionIntensity existed only in harnesses —
  // the coder contract binds both; production anchors already carry wordFrames). data.backdropSrc (P5-3) is the
  // reserved illustrated-overlay backdrop the coder binds on <Scene src>.
  const renderInput: MgRenderInput = {
    componentSource: gen.code,
    brand: input.brand,
    data: {
      ...input.candidate.content,
      ...(input.anchors?.wordFrames?.length ? { wordFrames: input.anchors.wordFrames } : {}),
      ...(typeof input.motionIntensity === 'number' ? { motionIntensity: input.motionIntensity } : {}),
      ...(backdropSrc ? { backdropSrc } : {}),
    },
    width: deps.canvas.width,
    height: deps.canvas.height,
    fps: input.window.fps,
    durationInFrames: durationInFrames(input),
  };
  // Deterministic + URL-safe id: identical code+data+dims reuse the same R2 keys (idempotent); any change → new id.
  const sequenceId = scopeMgSequenceId(workspaceId(renderInput), deps.sequenceNamespace);

  let rendered: MgRenderResult | undefined;
  try {
    rendered = await render(renderInput, deps.renderOpts);
    const sizeBytes = await frameSize(rendered.webpDir, rendered.files);
    await deps.authorizeStorage?.(sizeBytes);
    const manifest = await ingest(rendered, { sequenceId, uploadFrame: deps.uploadFrame, concurrency: deps.concurrency });
    const address = toPlaybackAddress(sequenceId, manifest);
    return {
      status: 'generated',
      sequence: {
        address,
        r2Prefix: `mgseq_${sequenceId}_`,
        fps: manifest.fps,
        width: manifest.width,
        height: manifest.height,
        frameFormat: 'webp',
        transparent: true,
        sizeBytes,
        renderMs: rendered.renderMs,
      },
      receipt: gen.receipt,
    };
  } catch (err) {
    // The component was valid but rendering/ingesting it failed — an honest fallback, not a silent success (R18N).
    const reason = `MG render/ingest failed: ${(err as Error).message}`;
    return { status: 'fallback', reason, receipt: { ...gen.receipt, outcome: 'fallback', reason } };
  } finally {
    if (rendered) await cleanup(rendered.workspaceDir);
  }
}
