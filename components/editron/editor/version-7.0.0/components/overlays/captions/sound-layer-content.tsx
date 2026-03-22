import { Audio, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import { useAllOverlays } from "../../../contexts/rendering-context";
import { createDuckingVolume, type DuckingConfig } from "../../../utils/audio-ducking";

interface SoundLayerContentProps {
  overlay: SoundOverlay;
  baseUrl?: string;
}

export const SoundLayerContent: React.FC<SoundLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const allOverlays = useAllOverlays();
  const fps = 30; // TODO: get from composition if needed

  // Determine the audio source URL
  let audioSrc = overlay.src || overlay.content || '';
  if (audioSrc && audioSrc.startsWith("/") && baseUrl) {
    audioSrc = `${baseUrl}${audioSrc}`;
  } else if (audioSrc && audioSrc.startsWith("/")) {
    audioSrc = toAbsoluteUrl(audioSrc);
  }

  if (!audioSrc) {
    console.warn('Sound overlay has no src or content:', overlay);
    return null;
  }

  // Build ducking volume callback if ducking is enabled on this overlay
  const duckingConfig = (overlay.styles as any)?.duckingConfig as DuckingConfig | undefined;

  const volumeCallback = useMemo(() => {
    if (!duckingConfig?.enabled) return undefined;

    // Find all voiceover overlays (row 4 sound overlays, excluding this overlay)
    const voiceoverOverlays = allOverlays.filter(
      (o) => o.type === 'sound' && o.row === 4 && o.id !== overlay.id,
    );

    if (voiceoverOverlays.length === 0) return undefined;

    const baseVolume = overlay.styles?.volume ?? 1;
    return createDuckingVolume(baseVolume, voiceoverOverlays, fps, duckingConfig);
  }, [duckingConfig, allOverlays, overlay.id, overlay.styles?.volume, overlay.row, fps]);

  return (
    <Audio
      src={audioSrc}
      startFrom={overlay.startFromSound || 0}
      volume={volumeCallback ?? (overlay.styles?.volume ?? 1)}
    />
  );
};
