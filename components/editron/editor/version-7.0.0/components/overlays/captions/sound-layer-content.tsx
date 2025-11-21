import { Audio } from "remotion";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../../utils/url-helper";

interface SoundLayerContentProps {
  overlay: SoundOverlay;
  baseUrl?: string;
}

export const SoundLayerContent: React.FC<SoundLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  // Determine the audio source URL
  // Fallback to content if src is not defined (for backward compatibility)
  let audioSrc = overlay.src || overlay.content || '';

  // If it's a relative URL and baseUrl is provided, use baseUrl
  if (audioSrc && audioSrc.startsWith("/") && baseUrl) {
    audioSrc = `${baseUrl}${audioSrc}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (audioSrc && audioSrc.startsWith("/")) {
    audioSrc = toAbsoluteUrl(audioSrc);
  }

  // Don't render if no valid source
  if (!audioSrc) {
    console.warn('Sound overlay has no src or content:', overlay);
    return null;
  }

  return (
    <Audio
      src={audioSrc}
      startFrom={overlay.startFromSound || 0}
      volume={overlay.styles?.volume ?? 1}
    />
  );
};
