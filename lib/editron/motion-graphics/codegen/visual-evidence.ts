import { renderStillOnLambda } from '@remotion/lambda/client';
import sharp from 'sharp';

import {
  OverlayType,
  type Overlay,
} from '@/components/editron/editor/version-7.0.0/types';
import { REMOTION_COMPOSITION_ID } from '@/lib/editron/services/remotion-constants';
import { assertRemotionSiteFresh } from '@/lib/editron/services/remotion-site-version';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import { setAWSCredentials } from '@/lib/editron/utils/aws-credentials';
import type {
  MgAnchors,
  MgVisualEvidence,
  MgVisualEvidenceFrame,
  MgVisualEvidenceRole,
} from './types';
import { MAX_VISUAL_EVIDENCE_IMAGE_BYTES } from './worker-contract';

type RenderStill = typeof renderStillOnLambda;
type ResolveAssets = (overlays: Overlay[], forceGCS: boolean) => Promise<Overlay[]>;
type ReadStillBytes = (url: string) => Promise<Buffer>;
type EncodeStill = (bytes: Buffer) => Promise<string>;

interface MgVisualEvidenceWindow {
  startFrame: number;
  endFrame: number;
  fps: number;
}

export interface CaptureMgVisualEvidenceInput {
  overlays: Overlay[];
  window: MgVisualEvidenceWindow;
  canvas: { width: number; height: number };
  anchors?: MgAnchors;
}

export interface CaptureMgVisualEvidenceOptions {
  env?: Record<string, string | undefined>;
  renderStill?: RenderStill;
  prepareCredentials?: () => Promise<void>;
  resolveAssets?: ResolveAssets;
  readStillBytes?: ReadStillBytes;
  encodeStill?: EncodeStill;
}

const MAX_STILL_DOWNLOAD_BYTES = 32 * 1_024 * 1_024;

export function selectMgVisualEvidenceFrames(
  window: MgVisualEvidenceWindow,
  anchors?: MgAnchors,
): [number, number, number] {
  const start = Math.round(window.startFrame);
  const end = Math.round(window.endFrame);
  if (!Number.isFinite(window.fps) || window.fps <= 0) {
    throw new Error('MG visual evidence requires positive fps, got ' + window.fps);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 3) {
    throw new Error('MG visual evidence requires at least three edited-timeline frames, got [' + start + ', ' + end + ')');
  }

  const requestedAnchor = typeof anchors?.landingFrame === 'number' && Number.isFinite(anchors.landingFrame)
    ? start + Math.round(anchors.landingFrame)
    : start + Math.floor((end - start) / 2);
  const anchor = Math.max(start + 1, Math.min(end - 2, requestedAnchor));
  return [start, anchor, end - 1];
}

export async function captureMgVisualEvidence(
  input: CaptureMgVisualEvidenceInput,
  options: CaptureMgVisualEvidenceOptions = {},
): Promise<MgVisualEvidence> {
  const env = options.env ?? process.env;
  const functionName = env.REMOTION_LAMBDA_FUNCTION_NAME?.trim();
  const serveUrl = env.REMOTION_LAMBDA_SERVE_URL?.trim();
  const region = env.REMOTION_AWS_REGION?.trim() || 'us-east-1';
  if (!functionName) throw new Error('MG visual evidence: REMOTION_LAMBDA_FUNCTION_NAME is missing');
  if (!serveUrl) throw new Error('MG visual evidence: REMOTION_LAMBDA_SERVE_URL is missing');
  assertRemotionSiteFresh({ serveUrl, env });

  const frames = selectMgVisualEvidenceFrames(input.window, input.anchors);
  const sourceCanvasOverlays = input.overlays.filter((overlay) => (
    overlay.type !== OverlayType.MOTION_GRAPHIC && overlay.type !== OverlayType.MG_SEQUENCE
  ));
  const resolveAssets = options.resolveAssets ?? (async (overlays: Overlay[], forceGCS: boolean) => {
    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
    return assetResolver.resolveProjectAssets(overlays, forceGCS);
  });
  const resolvedOverlays = await resolveAssets(sourceCanvasOverlays, true);
  const durationInFrames = Math.max(
    input.window.endFrame,
    ...resolvedOverlays.map((overlay) => overlay.from + overlay.durationInFrames),
  );
  const inputProps = buildLambdaRenderInputProps({
    overlays: resolvedOverlays,
    durationInFrames,
    fps: input.window.fps,
    width: input.canvas.width,
    height: input.canvas.height,
    src: '',
    isRendering: true,
  });

  await (options.prepareCredentials ?? setAWSCredentials)();
  const renderStill = options.renderStill ?? renderStillOnLambda;
  const readStillBytes = options.readStillBytes ?? fetchRenderedStillBytes;
  const encodeStill = options.encodeStill ?? encodeMgVisualEvidenceImage;
  const renderEvidenceFrame = async <Role extends MgVisualEvidenceRole>(
    role: Role,
    timelineFrame: number,
  ): Promise<MgVisualEvidenceFrame<Role>> => {
    const still = await renderStill({
      region: region as any,
      functionName,
      serveUrl,
      composition: REMOTION_COMPOSITION_ID,
      inputProps,
      imageFormat: 'jpeg',
      jpegQuality: 72,
      privacy: 'public',
      frame: timelineFrame,
      maxRetries: 1,
      deleteAfter: '1-day',
    });
    return {
      role,
      coordinate: { kind: 'edited-timeline', timelineFrame },
      imageDataUrl: await encodeStill(await readStillBytes(still.url)),
    };
  };

  const before = await renderEvidenceFrame('context-before', frames[0]);
  const anchor = await renderEvidenceFrame('anchor', frames[1]);
  const after = await renderEvidenceFrame('context-after', frames[2]);
  return {
    space: 'edited-canvas',
    canvas: { ...input.canvas },
    frames: [before, anchor, after],
  };
}

export async function fetchRenderedStillBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      'MG visual evidence: still download failed ' + response.status + ' ' + response.statusText,
    );
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_STILL_DOWNLOAD_BYTES) {
    throw new Error('MG visual evidence: still exceeds download limit (' + contentLength + ' bytes)');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_STILL_DOWNLOAD_BYTES) {
    throw new Error('MG visual evidence: invalid still size (' + bytes.byteLength + ' bytes)');
  }
  return bytes;
}

/** Pick `count` evenly-spread frame indices across a video's duration, avoiding the exact head/tail (often a
 *  black frame or a transition). Deterministic; deduped when the duration is tiny. Pure — unit-testable. */
export function selectDesignerFrameIndices(durationInFrames: number, count: number): number[] {
  const total = Math.floor(durationInFrames);
  if (!Number.isFinite(total) || total < 2) return [];
  const n = Math.max(1, Math.min(8, Math.floor(count)));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const frame = Math.round(((i + 1) / (n + 1)) * total);
    out.push(Math.max(0, Math.min(total - 1, frame)));
  }
  return [...new Set(out)];
}

/**
 * DESIGNER footage frames (P5-1 Phase D): a few real stills spread ACROSS THE WHOLE VIDEO for the video-level
 * design session — so the director designs for the actual palette, negative space, and scene the graphics live over
 * (buildDesignerParts.footageFrames). Reuses the same Lambda still machinery as captureMgVisualEvidence, but samples
 * the whole timeline instead of one moment window and returns raw {mimeType, data} (Gemini inlineData), not a data
 * URL. BEST-EFFORT by contract: the caller runs this in a try/catch — any failure (missing Lambda env, a bad still)
 * degrades the session to text-only, never breaks the pre-pass.
 */
export async function captureMgDesignerFootageFrames(
  input: { overlays: Overlay[]; canvas: { width: number; height: number }; fps: number; count?: number },
  options: CaptureMgVisualEvidenceOptions = {},
): Promise<Array<{ mimeType: string; data: string }>> {
  const env = options.env ?? process.env;
  const functionName = env.REMOTION_LAMBDA_FUNCTION_NAME?.trim();
  const serveUrl = env.REMOTION_LAMBDA_SERVE_URL?.trim();
  const region = env.REMOTION_AWS_REGION?.trim() || 'us-east-1';
  if (!functionName) throw new Error('MG designer frames: REMOTION_LAMBDA_FUNCTION_NAME is missing');
  if (!serveUrl) throw new Error('MG designer frames: REMOTION_LAMBDA_SERVE_URL is missing');
  if (!Number.isFinite(input.fps) || input.fps <= 0) throw new Error('MG designer frames: positive fps required');
  assertRemotionSiteFresh({ serveUrl, env });

  const sourceCanvasOverlays = input.overlays.filter((overlay) => (
    overlay.type !== OverlayType.MOTION_GRAPHIC && overlay.type !== OverlayType.MG_SEQUENCE
  ));
  const resolveAssets = options.resolveAssets ?? (async (overlays: Overlay[], forceGCS: boolean) => {
    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
    return assetResolver.resolveProjectAssets(overlays, forceGCS);
  });
  const resolvedOverlays = await resolveAssets(sourceCanvasOverlays, true);
  const durationInFrames = Math.max(1, ...resolvedOverlays.map((overlay) => overlay.from + overlay.durationInFrames));
  const indices = selectDesignerFrameIndices(durationInFrames, input.count ?? 4);
  if (indices.length === 0) return [];

  const inputProps = buildLambdaRenderInputProps({
    overlays: resolvedOverlays,
    durationInFrames,
    fps: input.fps,
    width: input.canvas.width,
    height: input.canvas.height,
    src: '',
    isRendering: true,
  });

  await (options.prepareCredentials ?? setAWSCredentials)();
  const renderStill = options.renderStill ?? renderStillOnLambda;
  const readStillBytes = options.readStillBytes ?? fetchRenderedStillBytes;
  const encodeStill = options.encodeStill ?? encodeMgVisualEvidenceImage;

  const frames: Array<{ mimeType: string; data: string }> = [];
  for (const timelineFrame of indices) {
    const still = await renderStill({
      region: region as any,
      functionName,
      serveUrl,
      composition: REMOTION_COMPOSITION_ID,
      inputProps,
      imageFormat: 'jpeg',
      jpegQuality: 72,
      privacy: 'public',
      frame: timelineFrame,
      maxRetries: 1,
      deleteAfter: '1-day',
    });
    const dataUrl = await encodeStill(await readStillBytes(still.url));
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    if (match) frames.push({ mimeType: match[1], data: match[2] });
  }
  return frames;
}

export async function encodeMgVisualEvidenceImage(bytes: Buffer): Promise<string> {
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('MG visual evidence: rendered still has no decodable dimensions');
  }

  let width = metadata.width;
  let quality = 72;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const encoded = await sharp(bytes)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (encoded.byteLength <= MAX_VISUAL_EVIDENCE_IMAGE_BYTES) {
      return 'data:image/webp;base64,' + encoded.toString('base64');
    }

    const scale = Math.min(
      0.9,
      Math.sqrt(MAX_VISUAL_EVIDENCE_IMAGE_BYTES / encoded.byteLength) * 0.92,
    );
    width = Math.max(64, Math.floor(width * scale));
    quality = Math.max(20, quality - 6);
  }

  throw new Error(
    'MG visual evidence: could not encode still under ' + MAX_VISUAL_EVIDENCE_IMAGE_BYTES + ' bytes',
  );
}
