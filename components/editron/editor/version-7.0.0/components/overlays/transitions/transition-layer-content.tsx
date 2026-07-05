import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, Easing, OffthreadVideo, Video } from "remotion";
import { TransitionOverlay, TransitionStyle, ClipOverlay } from "../../../types";
import { useAllOverlays, useIsRendering } from "../../../contexts/rendering-context";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import {
  isAtomicTransitionForm,
  resolveDirectionalWipeClipPath,
  resolveTransitionRenderParams,
  resolveTransitionRenderStyle,
} from "@/lib/editron/services/transition-render-form";
import type { AtomicTransitionForm } from "@/lib/editron/services/transition-form";

/**
 * TransitionLayerContent — DaVinci-style transition renderer.
 *
 * The tile IS the visual effect. It renders both adjacent clips internally
 * and composites them using CSS (opacity, clip-path, transform, filter).
 * The original clips beneath are covered by the tile's higher z-index.
 *
 * Each transition type has its own compositing logic:
 * - dissolve: cross-fade via opacity
 * - dip-to-black/white: three-layer fade through solid color
 * - wipe-*: clip-path reveal
 * - slide-push: transform push
 * - zoom-punch: scale + reveal
 * - iris-wipe: circular clip-path
 * - blur-transition: filter blur crossfade
 * - flash: quick opacity burst
 */
export const TransitionLayerContent: React.FC<{
  overlay: TransitionOverlay;
}> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const allOverlays = useAllOverlays();
  const isRendering = useIsRendering();
  const { transitionStyle, durationInFrames, clipAId, clipBId, easing } = overlay;

  const easingFn = getEasingFunction(easing);
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingFn,
  });

  const clipA = useMemo(() => allOverlays.find(o => o.id === clipAId) as ClipOverlay | undefined, [allOverlays, clipAId]);
  const clipB = useMemo(() => allOverlays.find(o => o.id === clipBId) as ClipOverlay | undefined, [allOverlays, clipBId]);

  const clipASrc = resolveVideoSrc(clipA);
  const clipBSrc = resolveVideoSrc(clipB);

  if (!clipASrc && !clipBSrc) {
    return <div style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />;
  }

  const clipAStartFrom = clipA
    ? resolveTransitionClipStartFrom(clipA, overlay.from)
    : 0;
  const clipBStartFrom = clipB
    ? resolveTransitionClipStartFrom(clipB, overlay.from)
    : 0;

  const VideoComponent = isRendering ? OffthreadVideo : Video;
  const atomicTransitionForm = resolveOverlayTransitionForm(overlay);
  const effectiveTransitionStyle = resolveTransitionRenderStyle(transitionStyle, atomicTransitionForm);

  const videoPropsA = {
    src: clipASrc || '',
    startFrom: clipAStartFrom,
    style: { width: '100%', height: '100%', objectFit: 'cover' as const },
    ...(isRendering ? { toneMapped: false } : { pauseWhenBuffering: false }),
  };

  const videoPropsB = {
    src: clipBSrc || '',
    startFrom: clipBStartFrom,
    style: { width: '100%', height: '100%', objectFit: 'cover' as const },
    ...(isRendering ? { toneMapped: false } : { pauseWhenBuffering: false }),
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {renderTransition(effectiveTransitionStyle, progress, VideoComponent, videoPropsA, videoPropsB, clipASrc, clipBSrc, atomicTransitionForm)}
    </div>
  );
};

function getEasingFunction(easing: string | undefined): ((t: number) => number) | undefined {
  switch (easing) {
    case 'ease-in': return Easing.bezier(0.42, 0, 1, 1);
    case 'ease-out': return Easing.bezier(0, 0, 0.58, 1);
    case 'ease-in-out': return Easing.bezier(0.42, 0, 0.58, 1);
    default: return undefined;
  }
}

function resolveVideoSrc(clip: ClipOverlay | undefined): string | null {
  if (!clip) return null;
  const src = clip.src || clip.content || '';
  if (!src) return null;
  if (src.startsWith('/')) return toAbsoluteUrl(src);
  return src;
}

export function resolveTransitionClipStartFrom(
  clip: Pick<ClipOverlay, 'from'> & { sourceStartFrame?: number; videoStartTime?: number },
  transitionFrom: number,
): number {
  const sourceStart = typeof clip.sourceStartFrame === 'number' && Number.isFinite(clip.sourceStartFrame)
    ? clip.sourceStartFrame
    : typeof clip.videoStartTime === 'number' && Number.isFinite(clip.videoStartTime)
      ? clip.videoStartTime
      : 0;
  return Math.max(0, sourceStart + (transitionFrom - clip.from));
}

const ABS: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

function resolveOverlayTransitionForm(overlay: TransitionOverlay): AtomicTransitionForm | undefined {
  const form = (overlay as any).metadata?.atomicTransitionForm;
  return isAtomicTransitionForm(form) ? form : undefined;
}

function renderTransition(
  style: TransitionStyle,
  progress: number,
  VideoComp: typeof OffthreadVideo | typeof Video,
  propsA: any,
  propsB: any,
  srcA: string | null,
  srcB: string | null,
  atomicForm?: AtomicTransitionForm,
): React.ReactNode {
  const renderParams = resolveTransitionRenderParams(style, atomicForm);

  switch (style) {
    case 'dissolve':
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, opacity: 1 - progress }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: progress }} volume={0} />}
        </>
      );

    case 'dip-to-black':
      return renderDipTransition(progress, VideoComp, propsA, propsB, srcA, srcB, '#000');

    case 'dip-to-white':
      return renderDipTransition(progress, VideoComp, propsA, propsB, srcA, srcB, '#fff');

    case 'flash': {
      const flashOpacity = progress < 0.3
        ? interpolate(progress, [0, 0.15], [0, 1], { extrapolateRight: 'clamp' })
        : interpolate(progress, [0.3, 1], [1, 0], { extrapolateLeft: 'clamp' });
      const showB = progress > 0.2;
      return (
        <>
          {!showB && srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style }} volume={0} />}
          {showB && srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style }} volume={0} />}
          <div style={{ ...ABS, backgroundColor: '#fff', opacity: Math.max(0, flashOpacity) * renderParams.flashOpacityCap, pointerEvents: 'none' }} />
        </>
      );
    }

    case 'wipe-left':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, resolveDirectionalWipeClipPath(progress, renderParams, 'left'));

    case 'wipe-right':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, resolveDirectionalWipeClipPath(progress, renderParams, 'right'));

    case 'wipe-up':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, resolveDirectionalWipeClipPath(progress, renderParams, 'up'));

    case 'wipe-down':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, resolveDirectionalWipeClipPath(progress, renderParams, 'down'));

    case 'soft-cut':
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, opacity: 1 - progress, filter: `blur(${progress * renderParams.blurPx}px)` }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: progress, filter: `blur(${(1 - progress) * renderParams.blurPx}px)` }} volume={0} />}
        </>
      );

    case 'whip-pan': {
      const blurAmount = Math.sin(progress * Math.PI) * renderParams.blurPx;
      const offsetAX = -progress * renderParams.motionDistancePct * renderParams.directionX;
      const offsetAY = -progress * renderParams.motionDistancePct * renderParams.directionY;
      const offsetBX = (1 - progress) * renderParams.motionDistancePct * renderParams.directionX;
      const offsetBY = (1 - progress) * renderParams.motionDistancePct * renderParams.directionY;
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `translate(${offsetAX}%, ${offsetAY}%)`, filter: `blur(${blurAmount}px)`, opacity: 1 - progress }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, transform: `translate(${offsetBX}%, ${offsetBY}%)`, filter: `blur(${blurAmount}px)`, opacity: progress }} volume={0} />}
        </>
      );
    }

    case 'slide-up': {
      return renderDirectionalSlide(progress, VideoComp, propsA, propsB, srcA, srcB, renderParams);
    }

    case 'slide-down':
      return renderDirectionalSlide(progress, VideoComp, propsA, propsB, srcA, srcB, renderParams);

    case 'glitch': {
      const glitchOffset = Math.sin(progress * Math.PI * 6) * 5;
      const showB = progress > 0.4;
      const rgbShift = Math.sin(progress * Math.PI) * 8;
      return (
        <>
          {!showB && srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `translateX(${glitchOffset}px)` }} volume={0} />}
          {showB && srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, transform: `translateX(${-glitchOffset}px)` }} volume={0} />}
          <div style={{ ...ABS, background: `rgba(255,0,0,${Math.abs(rgbShift) * 0.02})`, mixBlendMode: 'screen', transform: `translateX(${rgbShift}px)`, pointerEvents: 'none' }} />
        </>
      );
    }

    case 'film-burn': {
      const burnOpacity = Math.sin(progress * Math.PI) * 0.6;
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, opacity: 1 - progress, filter: `brightness(${1 + progress * 0.5}) saturate(${1 + progress * 0.3})` }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: progress, filter: `brightness(${1 + (1 - progress) * 0.5}) saturate(${1 + (1 - progress) * 0.3})` }} volume={0} />}
          <div style={{ ...ABS, background: `radial-gradient(circle at ${50 + progress * 20}% ${50 - progress * 10}%, rgba(255,140,0,${burnOpacity}), transparent 70%)`, mixBlendMode: 'screen', pointerEvents: 'none' }} />
        </>
      );
    }

    // Editorial cuts — no visual effect. The cut IS the transition.
    // Return null so the tile is invisible. The original clips handle the boundary.
    case 'hard-cut':
    case 'smash-cut':
    case 'match-cut':
    case 'jump-cut':
    case 'cut-on-action':
      return null;

    case 'zoom-punch': {
      const scaleA = 1 + progress * renderParams.zoomScaleDelta;
      const showB = progress > 0.5;
      const exposureOpacity = Math.sin(progress * Math.PI) * renderParams.exposure;
      return (
        <>
          {!showB && srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `scale(${scaleA})`, opacity: 1 - progress }} volume={0} />}
          {showB && srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: interpolate(progress, [0.5, 1], [0, 1]) }} volume={0} />}
          {exposureOpacity > 0 && <div style={{ ...ABS, backgroundColor: '#fff', opacity: exposureOpacity, mixBlendMode: 'screen', pointerEvents: 'none' }} />}
        </>
      );
    }

    case 'iris-wipe': {
      const radius = progress * 75;
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, clipPath: `circle(${radius}% at 50% 50%)` }} volume={0} />}
        </>
      );
    }

    case 'blur-transition': {
      const blurA = progress * renderParams.blurPx;
      const blurB = (1 - progress) * renderParams.blurPx;
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, filter: `blur(${blurA}px)`, opacity: 1 - progress }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, filter: `blur(${blurB}px)`, opacity: progress }} volume={0} />}
        </>
      );
    }

    default:
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, opacity: 1 - progress }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: progress }} volume={0} />}
        </>
      );
  }
}

function renderDirectionalSlide(
  progress: number,
  VideoComp: typeof OffthreadVideo | typeof Video,
  propsA: any,
  propsB: any,
  srcA: string | null,
  srcB: string | null,
  renderParams: ReturnType<typeof resolveTransitionRenderParams>,
): React.ReactNode {
  const offsetAX = -progress * 100 * renderParams.directionX;
  const offsetAY = -progress * 100 * renderParams.directionY;
  const offsetBX = (1 - progress) * 100 * renderParams.directionX;
  const offsetBY = (1 - progress) * 100 * renderParams.directionY;

  return (
    <>
      {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `translate(${offsetAX}%, ${offsetAY}%)` }} volume={0} />}
      {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, transform: `translate(${offsetBX}%, ${offsetBY}%)` }} volume={0} />}
    </>
  );
}

function renderDipTransition(
  progress: number,
  VideoComp: typeof OffthreadVideo | typeof Video,
  propsA: any,
  propsB: any,
  srcA: string | null,
  srcB: string | null,
  color: string,
): React.ReactNode {
  const colorOpacity = progress < 0.5
    ? interpolate(progress, [0, 0.5], [0, 1])
    : interpolate(progress, [0.5, 1], [1, 0]);
  const showA = progress < 0.6;
  const showB = progress > 0.4;
  const opacityA = showA ? interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: 'clamp' }) : 0;
  const opacityB = showB ? interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp' }) : 0;

  return (
    <>
      {showA && srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, opacity: opacityA }} volume={0} />}
      {showB && srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: opacityB }} volume={0} />}
      <div style={{ ...ABS, backgroundColor: color, opacity: colorOpacity, pointerEvents: 'none' }} />
    </>
  );
}

function renderWipe(
  progress: number,
  VideoComp: typeof OffthreadVideo | typeof Video,
  propsA: any,
  propsB: any,
  srcA: string | null,
  srcB: string | null,
  clipPath: string,
): React.ReactNode {
  return (
    <>
      {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style }} volume={0} />}
      {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, clipPath }} volume={0} />}
    </>
  );
}
