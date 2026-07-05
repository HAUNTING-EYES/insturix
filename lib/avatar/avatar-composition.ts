/**
 * Avatar composition stage: turn the raw OmniHuman face video into a finished,
 * Editron-owned MP4 by rendering it through the existing Remotion Lambda pipeline
 * (the same `renderMediaOnLambda` path the editor's /cloudrun/render route uses).
 *
 * MVP: one full-frame video overlay. OmniHuman output already has the spoken audio
 * muxed in (hasNativeAudio), so no separate audio track is needed yet. Background,
 * captions, and product overlays are the next visual pass, not this slice.
 *
 * The AWS/Remotion calls are injectable deps so the logic is unit-testable without
 * hitting Lambda.
 */

import { REMOTION_COMPOSITION_ID } from '@/lib/editron/services/remotion-constants';

// Mirrors the fields of ClipOverlay in components/editron/editor/version-7.0.0/types.ts.
// Kept local so this module doesn't import the editor's heavy types graph (which pulls
// zod and breaks the avatar test loader). The emitted JSON is identical.
interface AvatarVideoOverlay {
  id: number;
  type: 'video';
  content: string;
  src: string;
  from: number;
  durationInFrames: number;
  left: number;
  top: number;
  width: number;
  height: number;
  row: number;
  isDragging: boolean;
  rotation: number;
  hasNativeAudio: boolean;
  styles: { objectFit: 'cover' };
}

// Mirrors the region union the /cloudrun/render route casts to.
type RemotionRegion =
  | 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'eu-central-1' | 'eu-west-1' | 'eu-west-2' | 'ap-south-1'
  | 'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1';

const FPS = 30;

export interface AvatarCompositionInput {
  faceVideoUrl: string;
  durationSeconds: number;
  aspectRatio: string; // '9:16' | '16:9' | '1:1' | '4:5'
  resolution: string; // '720p' | '1080p'
  displayName?: string;
}

export interface AvatarCompositionRenderProps {
  compositionId: string;
  inputProps: {
    overlays: AvatarVideoOverlay[];
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
  };
}

export interface AvatarCompositionRenderRef {
  renderId: string;
  bucketName: string;
  region: string;
}

export interface AvatarCompositionStatus {
  done: boolean;
  progress: number;
  outputUrl?: string;
  errorMessage?: string;
}

/** Pure: build the Remotion render props for an avatar composition. */
export function buildAvatarCompositionProps(input: AvatarCompositionInput): AvatarCompositionRenderProps {
  const fps = FPS;
  const durationInFrames = Math.max(1, Math.round(input.durationSeconds * fps));
  const { width, height } = compositionDimensions(input.resolution, input.aspectRatio);

  const faceOverlay: AvatarVideoOverlay = {
    id: 1,
    type: 'video',
    content: input.displayName?.trim() || 'Avatar',
    src: input.faceVideoUrl,
    from: 0,
    durationInFrames,
    left: 0,
    top: 0,
    width,
    height,
    row: 0,
    isDragging: false,
    rotation: 0,
    hasNativeAudio: true, // OmniHuman muxes the spoken audio into the clip.
    styles: { objectFit: 'cover' },
  };

  return {
    compositionId: REMOTION_COMPOSITION_ID,
    inputProps: { overlays: [faceOverlay], durationInFrames, fps, width, height },
  };
}

/** Even-numbered W/H (h264 requires even dimensions) for the target format. */
export function compositionDimensions(resolution: string, aspectRatio: string): { width: number; height: number } {
  const shortEdge = resolution === '1080p' ? 1080 : 720;
  const [aw, ah] = parseAspectRatio(aspectRatio);
  if (ah >= aw) {
    return { width: even(shortEdge), height: even((shortEdge * ah) / aw) };
  }
  return { width: even((shortEdge * aw) / ah), height: even(shortEdge) };
}

function parseAspectRatio(aspectRatio: string): [number, number] {
  const [w, h] = aspectRatio.split(':').map((part) => Number(part.trim()));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [w, h];
  return [9, 16];
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export interface AvatarCompositionDeps {
  render?: (props: AvatarCompositionRenderProps) => Promise<AvatarCompositionRenderRef>;
  getProgress?: (ref: AvatarCompositionRenderRef) => Promise<AvatarCompositionStatus>;
}

export async function dispatchAvatarComposition(
  input: AvatarCompositionInput,
  deps: AvatarCompositionDeps = {},
): Promise<AvatarCompositionRenderRef> {
  const render = deps.render ?? defaultRender;
  return render(buildAvatarCompositionProps(input));
}

export async function pollAvatarComposition(
  ref: AvatarCompositionRenderRef,
  deps: AvatarCompositionDeps = {},
): Promise<AvatarCompositionStatus> {
  const getProgress = deps.getProgress ?? defaultGetProgress;
  return getProgress(ref);
}

async function defaultRender(props: AvatarCompositionRenderProps): Promise<AvatarCompositionRenderRef> {
  const { renderMediaOnLambda } = await import('@remotion/lambda/client');
  const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
  const { REMOTION_FRAMES_PER_LAMBDA } = await import('@/lib/editron/services/remotion-constants');

  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
  const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as RemotionRegion;
  if (!functionName) throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');
  if (!serveUrl) throw new Error('REMOTION_LAMBDA_SERVE_URL is not defined');

  await setAWSCredentials();
  const { bucketName, renderId } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: props.compositionId,
    inputProps: { ...props.inputProps, isRendering: true },
    codec: 'h264',
    audioCodec: 'mp3',
    privacy: 'public',
    framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
    timeoutInMilliseconds: 600000,
  });
  return { renderId, bucketName, region };
}

async function defaultGetProgress(ref: AvatarCompositionRenderRef): Promise<AvatarCompositionStatus> {
  const { getRenderProgress } = await import('@remotion/lambda/client');
  const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  if (!functionName) throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');

  await setAWSCredentials();
  const progress = await getRenderProgress({
    renderId: ref.renderId,
    bucketName: ref.bucketName,
    functionName,
    region: ref.region as RemotionRegion,
  });
  if (progress.fatalErrorEncountered) {
    return {
      done: false,
      progress: progress.overallProgress ?? 0,
      errorMessage: progress.errors?.[0]?.message ?? 'Composition render failed.',
    };
  }
  if (progress.done) {
    return { done: true, progress: 1, outputUrl: progress.outputFile ?? undefined };
  }
  return { done: false, progress: progress.overallProgress ?? 0 };
}
