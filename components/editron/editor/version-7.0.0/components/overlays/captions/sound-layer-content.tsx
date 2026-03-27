import { Audio, Sequence, useCurrentFrame } from "remotion";
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

    // Find all voiceover overlays — identify by assetId prefix OR row 4.
    // Using assetId prefix is more reliable than row number because users
    // can accidentally drag overlays to different rows.
    const voiceoverOverlays = allOverlays.filter((o) => {
      if (o.id === overlay.id) return false;
      if (o.type !== 'sound') return false;
      // Check assetId prefix first (most reliable)
      const aid = (o as any).assetId || '';
      if (aid.startsWith('voiceover_') || aid.startsWith('vo_')) return true;
      // Fallback to row 4 if no recognizable assetId
      return o.row === 4;
    });

    if (voiceoverOverlays.length === 0) return undefined;

    const baseVolume = overlay.styles?.volume ?? 1;
    return createDuckingVolume(baseVolume, voiceoverOverlays, fps, duckingConfig);
  }, [duckingConfig, allOverlays, overlay.id, overlay.styles?.volume, overlay.row, fps]);

  // L-cut/J-cut: audio boundaries can be decoupled from the visual overlay.
  // audioStartFrame < overlay.from → J-cut (audio starts before video)
  // audioEndFrame > overlay.from + durationInFrames → L-cut (audio extends after video)
  // Migration: startFromSound is the old audio in-point trim (source offset)
  const audioSourceOffset = overlay.startFromSound || 0;
  const hasDecoupledAudio = overlay.audioStartFrame !== undefined || overlay.audioEndFrame !== undefined;

  if (hasDecoupledAudio) {
    // audioStartFrame/audioEndFrame are ABSOLUTE global frame numbers (set by finalize.ts),
    // but this component is already inside a parent <Sequence from={overlay.from}>,
    // so we must convert to RELATIVE frame coordinates.
    const audioFrom = (overlay.audioStartFrame ?? overlay.from) - overlay.from;
    const audioEnd = (overlay.audioEndFrame ?? (overlay.from + overlay.durationInFrames)) - overlay.from;
    const audioDuration = Math.max(1, audioEnd - audioFrom);

    return (
      <Sequence from={audioFrom} durationInFrames={audioDuration} layout="none">
        <Audio
          src={audioSrc}
          startFrom={audioSourceOffset}
          volume={volumeCallback ?? (overlay.styles?.volume ?? 1)}
        />
      </Sequence>
    );
  }

  return (
    <Audio
      src={audioSrc}
      startFrom={audioSourceOffset}
      volume={volumeCallback ?? (overlay.styles?.volume ?? 1)}
    />
  );
};
