import { Audio, Sequence, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import { useAllOverlays } from "../../../contexts/rendering-context";
import { createDuckingVolume, type DuckingConfig } from "../../../utils/audio-ducking";

const CANONICAL_VOICEOVER_ROW = 3;
const LEGACY_VOICEOVER_ROW = 4;

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

    // Find all overlays that produce audio the BGM should duck under.
    // Two sources:
    //   1. Separate voiceover sound overlays (assetId prefix 'voiceover_'/'vo_' or voiceover row)
    //   2. Video overlays with hasNativeAudio:true (Seedance 1.5/2.0 embedded audio)
    //      These play audio from the <Video> element directly, not as sound overlays.
    //      Without including them, BGM plays at full volume alongside Seedance audio.
    const voiceoverOverlays = allOverlays.filter((o) => {
      if (o.id === overlay.id) return false;

      // Source 1: separate voiceover sound overlays
      if (o.type === 'sound') {
        const aid = (o as any).assetId || '';
        if (aid.startsWith('voiceover_') || aid.startsWith('vo_')) return true;
        if (o.row === CANONICAL_VOICEOVER_ROW || o.row === LEGACY_VOICEOVER_ROW) return true;
      }

      // Source 2: video overlays with native audio (Seedance)
      if (o.type === 'video' && (o as any).hasNativeAudio) return true;

      return false;
    });

    if (voiceoverOverlays.length === 0) return undefined;

    const baseVolume = overlay.styles?.volume ?? 1;
    return createDuckingVolume(baseVolume, voiceoverOverlays, fps, duckingConfig);
  }, [duckingConfig, allOverlays, overlay.id, overlay.styles?.volume, overlay.row, fps]);

  // L-cut/J-cut: audio boundaries can be decoupled from the visual overlay.
  // audioStartFrame < overlay.from -> J-cut (audio starts before video)
  // audioEndFrame > overlay.from + durationInFrames -> L-cut (audio extends after video)
  // Migration: startFromSound is the old audio in-point trim (source offset)
  const audioSourceOffset = overlay.startFromSound || 0;
  const hasDecoupledAudio = overlay.audioStartFrame !== undefined || overlay.audioEndFrame !== undefined;

  // Resolve volume: if ducking callback exists AND is a valid function, use it.
  // Remotion's <Audio volume> accepts either a number or a frame=>number callback.
  // If createDuckingVolume returns something unexpected, fall back to static number.
  const baseVolume = typeof overlay.styles?.volume === 'number' ? overlay.styles.volume : 1;
  const resolvedVolume = volumeCallback && typeof volumeCallback === 'function'
    ? volumeCallback
    : baseVolume;

  if (hasDecoupledAudio) {
    // audioStartFrame/audioEndFrame are ABSOLUTE global frame numbers (set by finalize.ts),
    // but this component is already inside a parent <Sequence from={overlay.from}>,
    // so we must convert to RELATIVE frame coordinates.
    const audioFrom = (overlay.audioStartFrame ?? overlay.from) - overlay.from;
    const audioEnd = (overlay.audioEndFrame ?? (overlay.from + overlay.durationInFrames)) - overlay.from;
    const audioDuration = Math.max(1, audioEnd - audioFrom);

    return (
      <Sequence from={Math.max(0, audioFrom)} durationInFrames={audioDuration} layout="none">
        <Audio
          src={audioSrc}
          startFrom={audioSourceOffset}
          volume={resolvedVolume}
        />
      </Sequence>
    );
  }

  return (
    <Audio
      src={audioSrc}
      startFrom={audioSourceOffset}
      volume={resolvedVolume}
    />
  );
};
