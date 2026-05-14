import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, Easing, OffthreadVideo, Video } from "remotion";
import { TransitionOverlay, TransitionStyle, ClipOverlay } from "../../../types";
import { useAllOverlays, useIsRendering } from "../../../contexts/rendering-context";
import { toAbsoluteUrl } from "../../../utils/url-helper";

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
    ? ((clipA as any).videoStartTime || 0) + (overlay.from - clipA.from)
    : 0;
  const clipBStartFrom = clipB
    ? ((clipB as any).videoStartTime || 0) + Math.max(0, overlay.from - clipB.from)
    : 0;

  const VideoComponent = isRendering ? OffthreadVideo : Video;

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
      {renderTransition(transitionStyle, progress, VideoComponent, videoPropsA, videoPropsB, clipASrc, clipBSrc)}
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

const ABS: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

function renderTransition(
  style: TransitionStyle,
  progress: number,
  VideoComp: typeof OffthreadVideo | typeof Video,
  propsA: any,
  propsB: any,
  srcA: string | null,
  srcB: string | null,
): React.ReactNode {
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
          <div style={{ ...ABS, backgroundColor: '#fff', opacity: Math.max(0, flashOpacity), pointerEvents: 'none' }} />
        </>
      );
    }

    case 'wipe-left':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, `inset(0 ${(1 - progress) * 100}% 0 0)`);

    case 'wipe-right':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, `inset(0 0 0 ${(1 - progress) * 100}%)`);

    case 'wipe-up':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, `inset(0 0 ${(1 - progress) * 100}% 0)`);

    case 'wipe-down':
      return renderWipe(progress, VideoComp, propsA, propsB, srcA, srcB, `inset(${(1 - progress) * 100}% 0 0 0)`);

    case 'slide-push': {
      const offset = (1 - progress) * 100;
      return (
        <>
          {srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `translateX(${-progress * 100}%)` }} volume={0} />}
          {srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, transform: `translateX(${offset}%)` }} volume={0} />}
        </>
      );
    }

    case 'zoom-punch': {
      const scaleA = 1 + progress * 0.3;
      const showB = progress > 0.5;
      return (
        <>
          {!showB && srcA && <VideoComp {...propsA} style={{ ...ABS, ...propsA.style, transform: `scale(${scaleA})`, opacity: 1 - progress }} volume={0} />}
          {showB && srcB && <VideoComp {...propsB} style={{ ...ABS, ...propsB.style, opacity: interpolate(progress, [0.5, 1], [0, 1]) }} volume={0} />}
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
      const blurA = progress * 20;
      const blurB = (1 - progress) * 20;
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
