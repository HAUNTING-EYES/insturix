import { Audio, Img, OffthreadVideo, Video, Sequence, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { ClipOverlay } from "../../../types";
import { computeSpeedSegments, evaluateAllTracks } from "../../../utils/keyframe-evaluator";
import { animationTemplates } from "../../../templates/animation-templates";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import {
  useAllOverlays,
  useIsRendering,
  useNativeMediaTimestampPreviewFrame,
  useRenderMediaMode,
} from "../../../contexts/rendering-context";
import { createVideoNativeAudioMixV1 } from "../../../utils/video-native-audio-mix-v1";
import { nativeMediaTimestampPreviewRoutePathV1 } from "../../../remotion/native-media-timestamp-preview-hydration-v1";

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
  const timestampPreviewSelection = useNativeMediaTimestampPreviewFrame({
    overlayId: overlay.id,
    overlayFromFrame: overlay.from,
    overlayDurationInFrames: overlay.durationInFrames,
    localFrame: frame,
  });
  const fps = 30; // Matches sound-layer-content.tsx

  const nativeAudioMix = useMemo(
    () => createVideoNativeAudioMixV1({ overlay, allOverlays, fps }),
    [allOverlays, fps, overlay],
  );
  const resolvedVolume = nativeAudioMix.remotionVolume;

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

  if (timestampPreviewSelection && isRendering) {
    throw new Error('NATIVE_MEDIA_PREVIEW_FINAL_RENDER_FORBIDDEN');
  }

  // Show placeholder if no valid source
  if (!videoSrc) {
    if (!timestampPreviewSelection) {
      return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#666', fontSize: '14px' }}>Video not available</span>
        </div>
      );
    }
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
  const speedSegments = hasSpeedCurve
    ? computeSpeedSegments(
        speedCurve,
        overlay.durationInFrames,
        availableSourceFrames,
      )
    : [];
  const renderNativeAudio = () => {
    if (!videoSrc) {
      throw new Error('NATIVE_MEDIA_PREVIEW_NATIVE_AUDIO_SOURCE_MISSING');
    }
    if (speedSegments.length > 0) {
      return (
        <>
          {speedSegments.map((segment, index) => (
            <Sequence
              key={index}
              from={segment.compositionStartFrame}
              durationInFrames={segment.compositionEndFrame - segment.compositionStartFrame}
              layout="none"
            >
              <Audio
                src={videoSrc}
                startFrom={sourceStartFrame + segment.sourceStartFrame}
                volume={resolvedVolume}
                playbackRate={segment.playbackRate}
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
  };

  if (renderMediaMode === "audio-only") {
    if (timestampPreviewSelection?.audioOwnership.disposition === 'NO_AUDIO_MAPPING_REQUESTED') {
      return null;
    }
    return renderNativeAudio();
  }

  if (timestampPreviewSelection) {
    const timestampPreviewFrame = timestampPreviewSelection.frame;
    return (
      <div style={containerStyle}>
        <Img
          src={nativeMediaTimestampPreviewRoutePathV1(timestampPreviewFrame.pictureHandle)}
          style={videoStyle}
          alt=""
          draggable={false}
          pauseWhenLoading={true}
          maxRetries={2}
          referrerPolicy="no-referrer"
          data-editron-native-timestamp-picture={timestampPreviewFrame.decodedPictureContentSha256}
          onError={() => {
            throw new Error('NATIVE_MEDIA_PREVIEW_PICTURE_LOAD_FAILED');
          }}
        />
      </div>
    );
  }

  if (hasSpeedCurve) {
    const VideoComponent = isRendering ? OffthreadVideo : Video;

    return (
      <div style={containerStyle}>
        {speedSegments.map((seg, i) => (
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
