import {
  OffthreadVideo,
  useCurrentFrame,
  delayRender,
  continueRender,
} from "remotion";
import { ClipOverlay } from "../../../types";
import { animationTemplates } from "../../../templates/animation-templates";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import { useEffect } from "react";

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

  useEffect(() => {
    console.log(`Preparing to load video: ${overlay.src}`);
    const handle = delayRender("Loading video");

    // Create a video element to preload the video
    const video = document.createElement("video");
    video.src = videoSrc;

    const handleLoadedMetadata = () => {
      console.log(`Video metadata loaded: ${overlay.src}`);
      continueRender(handle);
    };

    const handleError = (error: ErrorEvent) => {
      console.error(`Error loading video ${overlay.src}:`, error);
      continueRender(handle);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      // Ensure we don't leave hanging render delays
      continueRender(handle);
    };
  }, [overlay.src]);

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

  const videoStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: overlay.styles.objectFit || "cover",
    opacity: overlay.styles.opacity,
    transform: overlay.styles.transform || "none",
    borderRadius: overlay.styles.borderRadius || "0px",
    filter: overlay.styles.filter || "none",
    boxShadow: overlay.styles.boxShadow || "none",
    border: overlay.styles.border || "none",
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Create a container style that includes padding and background color
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: overlay.styles.padding || "0px",
    backgroundColor: overlay.styles.paddingBackgroundColor || "transparent",
    display: "flex", // Use flexbox for centering
    alignItems: "center",
    justifyContent: "center",
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

  // Don't render if no valid source
  if (!videoSrc) {
    console.warn('Video overlay has no src or content:', overlay);
    return null;
  }

  return (
    <div style={containerStyle}>
      <OffthreadVideo
        src={videoSrc}
        startFrom={overlay.videoStartTime || 0}
        style={videoStyle}
        volume={overlay.styles.volume ?? 1}
        playbackRate={overlay.speed ?? 1}
      />
    </div>
  );
};
