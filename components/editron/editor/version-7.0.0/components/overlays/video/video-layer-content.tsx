import { Audio, OffthreadVideo, Video, Sequence, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { ClipOverlay } from "../../../types";
import { computeSpeedSegments, evaluateAllTracks } from "../../../utils/keyframe-evaluator";
import { animationTemplates } from "../../../templates/animation-templates";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import {
  useAllOverlays,
  useIsRendering,
  useRenderMediaMode,
} from "../../../contexts/rendering-context";
import { createDuckingVolume } from "../../../utils/audio-ducking";

const CANONICAL_VOICEOVER_ROW = 3;
const LEGACY_VOICEOVER_ROW = 4;

function clampFocalPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Interface defining the props for the VideoLayerContent component
 */
interface VideoLayerContentProps {
  /** The overlay configuration object containing video properties and styles */
  overlay: ClipOverlay;
  /** The base URL for the video */
  baseUrl?: string;
}

/**
 * VideoLayerContent component renders a video layer with animations and styling
 *
 * This component handles:
 * - Video playback using Remotion's OffthreadVideo
 * - Enter/exit animations based on the current frame
 * - Styling including transform, opacity, border radius, etc.
 * - Video timing and volume controls
 *
 * @param props.overlay - Configuration object for the video overlay including:
 *   - src: Video source URL
 *   - videoStartTime: Start time offset for the video
 *   - durationInFrames: Total duration of the overlay
 *   - styles: Object containing visual styling properties and animations
 */
export const VideoLayerContent: React.FC<VideoLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const frame = useCurrentFrame();
  const isRendering = useIsRendering();
  const renderMediaMode = useRenderMediaMode();
  const allOverlays = useAllOverlays();
  const fps = 30; // Matches sound-layer-content.tsx

  // Native Audio Ducking
  // When a video has native audio (Seedance 1.5/2.0) AND voiceover overlaps,
  // duck the video's embedded audio under the voiceover. This preserves
  // ambient/foley sounds at a low level while keeping narration clear.
  //
  // OLD approach (f31e4d55, reverted): disabled generate_audio entirely when
  // voiceover was present - killed all ambient/foley, left dead silence.
  // NEW approach: keep native audio, duck it under VO using the same
  // professional ducking system BGM already uses.
  const nativeAudioVolume = useMemo(() => {
    if (!overlay.hasNativeAudio) return undefined;

    // Find voiceover overlays that might overlap with this video
    const voiceoverOverlays = allOverlays.filter((o) => {
      if (o.id === overlay.id) return false;
      // Voiceover sound overlays (same detection as sound-layer-content.tsx)
      if (o.type === 'sound') {
        const aid = o.assetId || '';
        if (aid.startsWith('voiceover_') || aid.startsWith('vo_')) return true;
        if (o.row === CANONICAL_VOICEOVER_ROW || o.row === LEGACY_VOICEOVER_ROW) return true;
      }
      return false;
    });

    if (voiceoverOverlays.length === 0) {
      // No voiceover - play native audio at configured volume
      return undefined;
    }

    // Convert absolute VO overlay positions to positions relative to this video's start
    // because the volume callback receives frame numbers relative to the video overlay
    const relativeVoOverlays = voiceoverOverlays.map((vo) => ({
      from: vo.from - overlay.from,
      durationInFrames: vo.durationInFrames,
    }));

    const baseVolume = overlay.styles.volume ?? 1;
    return createDuckingVolume(baseVolume, relativeVoOverlays, fps, {
      enabled: true,
      duckLevel: 0.12,    // ~-18 dB - ambient bed level, audible but not competing
      rampDownMs: 250,     // Slightly faster than BGM ducking (video ambient is less noticeable)
      rampUpMs: 500,       // Smooth return after VO ends
      lookAheadMs: 150,    // Start ducking just before VO begins
    });
  }, [overlay.hasNativeAudio, overlay.id, overlay.from, overlay.styles.volume, allOverlays, fps]);

  // Resolve volume: use ducking callback for native audio videos with VO overlap,
  // otherwise use static volume from overlay styles
  const resolvedVolume = nativeAudioVolume ?? (overlay.styles.volume ?? 1);

  // Calculate if we're in the exit phase (last 30 frames)
  const isExitPhase = frame >= overlay.durationInFrames - 30;

  // Apply enter animation only during entry phase
  const enterAnimation =
    !isExitPhase && overlay.styles.animation?.enter
      ? animationTemplates[overlay.styles.animation.enter]?.enter(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply exit animation only during exit phase
  const exitAnimation =
    isExitPhase && overlay.styles.animation?.exit
      ? animationTemplates[overlay.styles.animation.exit]?.exit(
          frame,
          overlay.durationInFrames
        )
      : {};

  const keyframedValues = overlay.keyframeTracks?.length
    ? evaluateAllTracks(overlay.keyframeTracks, frame)
    : {};
  const hasKeyframedFocalPoint = keyframedValues.objectPositionX !== undefined
    || keyframedValues.objectPositionY !== undefined;
  const objectPosition = hasKeyframedFocalPoint
    ? `${clampFocalPercent(keyframedValues.objectPositionX ?? 50)}% ${clampFocalPercent(keyframedValues.objectPositionY ?? 50)}%`
    : overlay.styles.objectPosition;

  const videoStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: overlay.styles.objectFit || "cover",
    objectPosition: objectPosition || "50% 50%",
    opacity: overlay.styles.opacity,
    transform: overlay.styles.transform || "none",
    borderRadius: overlay.styles.borderRadius || "0px",
    filter: overlay.styles.filter || "none",
    boxShadow: overlay.styles.boxShadow || "none",
    border: overlay.styles.border || "none",
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Create a container style that includes padding and background color.
  // posterUrl (storyboard image) as CSS background - shows through if video fails to load.
  const posterUrl = overlay.posterUrl;
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: overlay.styles.padding || "0px",
    backgroundColor: overlay.styles.paddingBackgroundColor || "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...(posterUrl ? {
      backgroundImage: `url(${posterUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    } : {}),
  };

  // Determine the video source URL
  // Fallback to content if src is not defined (for backward compatibility)
  let videoSrc = overlay.src || overlay.content || '';

  // If it's a relative URL and baseUrl is provided, use baseUrl
  if (videoSrc && videoSrc.startsWith("/") && baseUrl) {
    videoSrc = `${baseUrl}${videoSrc}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (videoSrc && videoSrc.startsWith("/")) {
    videoSrc = toAbsoluteUrl(videoSrc);
  }

  // Show placeholder if no valid source
  if (!videoSrc) {
    console.warn('Video overlay has no src or content:', overlay);
    return (
      <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#666', fontSize: '14px' }}>Video not available</span>
      </div>
    );
  }

  // In the editor, use <Video> (native HTML5 decoder) for faster, smoother
  // preview playback. <OffthreadVideo> is designed for server-side rendering
  // where frame-accuracy matters more than real-time performance.
  //
  // CORS note: GCS signed URLs don't include Access-Control-Allow-Origin
  // headers unless the bucket has CORS configured. For editor preview, we
  // skip crossOrigin to allow playback. For server rendering, OffthreadVideo
  // uses ffmpeg (not browser) so CORS doesn't apply.
  // Speed Ramping
  // If speedCurve is present, split into segments with different playback rates.
  // Each segment is a separate <Video> in a <Sequence> with correct source offset.
  const speedCurve = overlay.speedCurve ?? [];
  const hasSpeedCurve = speedCurve.length > 1;
  const sourceStartFrame = Number.isSafeInteger(overlay.sourceStartFrame)
    ? overlay.sourceStartFrame!
    : (overlay.videoStartTime || 0);
  const availableSourceFrames = Number.isSafeInteger(overlay.sourceEndFrame)
    && overlay.sourceEndFrame! > sourceStartFrame
    ? overlay.sourceEndFrame! - sourceStartFrame
    : overlay.durationInFrames;

  if (renderMediaMode === "audio-only") {
    if (hasSpeedCurve) {
      const segments = computeSpeedSegments(
        speedCurve,
        overlay.durationInFrames,
        availableSourceFrames,
      );
      return (
        <>
          {segments.map((seg, i) => (
            <Sequence
              key={i}
              from={seg.compositionStartFrame}
              durationInFrames={seg.compositionEndFrame - seg.compositionStartFrame}
              layout="none"
            >
              <Audio
                src={videoSrc}
                startFrom={sourceStartFrame + seg.sourceStartFrame}
                volume={resolvedVolume}
                playbackRate={seg.playbackRate}
              />
            </Sequence>
          ))}
        </>
      );
    }

    return (
      <Audio
        src={videoSrc}
        startFrom={sourceStartFrame}
        volume={resolvedVolume}
        playbackRate={overlay.speed ?? 1}
      />
    );
  }

  if (hasSpeedCurve) {
    const segments = computeSpeedSegments(
      speedCurve,
      overlay.durationInFrames,
      availableSourceFrames,
    );
    const VideoComponent = isRendering ? OffthreadVideo : Video;

    return (
      <div style={containerStyle}>
        {segments.map((seg, i) => (
          <Sequence
            key={i}
            from={seg.compositionStartFrame}
            durationInFrames={seg.compositionEndFrame - seg.compositionStartFrame}
            layout="none"
          >
            <VideoComponent
              src={videoSrc}
              startFrom={sourceStartFrame + seg.sourceStartFrame}
              style={videoStyle}
              volume={resolvedVolume}
              playbackRate={seg.playbackRate}
              {...(isRendering ? { toneMapped: false } : { pauseWhenBuffering: true })}
            />
          </Sequence>
        ))}
      </div>
    );
  }

  // Constant Speed (default)
  if (isRendering) {
    return (
      <div style={containerStyle}>
        <OffthreadVideo
          src={videoSrc}
          startFrom={sourceStartFrame}
          style={videoStyle}
          volume={resolvedVolume}
          playbackRate={overlay.speed ?? 1}
          toneMapped={false}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <Video
        src={videoSrc}
        startFrom={sourceStartFrame}
        style={videoStyle}
        playbackRate={overlay.speed ?? 1}
        volume={resolvedVolume}
        // pauseWhenBuffering=true: the preview WAITS for a clip to seek instead of showing black+silent while
        // the player advances (the "video+sound vanish at a cut/MG, but captions keep moving" bug). The proxy
        // now has 1s keyframes so seeks are brief. The render path (OffthreadVideo) is frame-exact + unaffected.
        pauseWhenBuffering={true}
      />
    </div>
  );
};
