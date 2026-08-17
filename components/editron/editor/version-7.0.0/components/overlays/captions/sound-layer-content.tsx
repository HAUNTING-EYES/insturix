import { Audio, Sequence, useVideoConfig } from "remotion";
import { useMemo } from "react";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../../utils/url-helper";
import { useAllOverlays } from "../../../contexts/rendering-context";
import {
  createAudioFadeEnvelope,
  createDuckingVolume,
  resolveAtomicSfxRenderMix,
  toOverlayLocalRanges,
  type DuckingConfig,
} from "../../../utils/audio-ducking";
import {
  getNativeAudioDuckRegions,
  getSoundAudioDuckRegions,
} from "@/lib/editron/services/native-audio-evidence";

const CANONICAL_VOICEOVER_ROW = 3;
const LEGACY_VOICEOVER_ROW = 4;

type DuckSourceRange = { from: number; durationInFrames: number };
type VolumeValue = number | ((frame: number) => number);

export function resolveSoundPlaybackRate(value: unknown): number {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0.0625 && rate <= 16 ? rate : 1;
}

function resolveFadeOutFrames(styles: SoundOverlay["styles"] | undefined, durationInFrames: number, fps: number): number | null {
  const animation = (styles as { animation?: { exit?: string; duration?: number } } | undefined)?.animation;
  if (animation?.exit !== 'fade') return null;

  const durationSeconds = typeof animation.duration === 'number' && Number.isFinite(animation.duration) && animation.duration > 0
    ? animation.duration
    : 1;
  return Math.max(1, Math.min(durationInFrames, Math.round(durationSeconds * fps)));
}

function applyFadeEnvelope(
  volume: VolumeValue,
  styles: SoundOverlay["styles"] | undefined,
  durationInFrames: number,
  fps: number,
  atomicFadeInFrames: number,
  atomicFadeOutFrames: number,
): VolumeValue {
  const legacyFadeOutFrames = resolveFadeOutFrames(styles, durationInFrames, fps) ?? 0;
  const fadeOutFrames = Math.max(legacyFadeOutFrames, atomicFadeOutFrames);
  if (atomicFadeInFrames === 0 && fadeOutFrames === 0) return volume;
  return createAudioFadeEnvelope(volume, durationInFrames, {
    fadeInFrames: atomicFadeInFrames,
    fadeOutFrames,
  });
}

interface SoundLayerContentProps {
  overlay: SoundOverlay;
  baseUrl?: string;
}

export const SoundLayerContent: React.FC<SoundLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const allOverlays = useAllOverlays();
  const { fps } = useVideoConfig();
  const metadata = (overlay as SoundOverlay & { metadata?: unknown }).metadata;
  const persistedVolume = typeof overlay.styles?.volume === 'number' ? overlay.styles.volume : undefined;
  const atomicSfxMix = resolveAtomicSfxRenderMix(metadata, persistedVolume);
  const baseVolume = atomicSfxMix?.baseVolume ?? persistedVolume ?? 1;

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
  const explicitDuckingConfig = (overlay.styles as { duckingConfig?: DuckingConfig } | undefined)?.duckingConfig;
  const duckingConfig = explicitDuckingConfig ?? atomicSfxMix?.duckingConfig;

  const volumeCallback = useMemo(() => {
    if (!duckingConfig?.enabled) return undefined;

    // Find all overlays that produce audio the BGM should duck under.
    // Two sources:
    //   1. Separate voiceover sound overlays (assetId prefix 'voiceover_'/'vo_' or voiceover row)
    //   2. Video overlays with hasNativeAudio:true (Seedance 1.5/2.0 embedded audio)
    //      These play audio from the <Video> element directly, not as sound overlays.
    //      Without including them, BGM plays at full volume alongside Seedance audio.
    const voiceoverOverlays: DuckSourceRange[] = allOverlays.flatMap<DuckSourceRange>((o) => {
      if (o.id === overlay.id) return [];

      // Source 1: separate voiceover sound overlays
      if (o.type === 'sound') {
        const evidencedRanges = getSoundAudioDuckRegions(o);
        if (evidencedRanges !== null) return evidencedRanges;

        const aid = (o as any).assetId || '';
        if (aid.startsWith('voiceover_') || aid.startsWith('vo_')) return [{ from: o.from, durationInFrames: o.durationInFrames }];
        if (o.row === CANONICAL_VOICEOVER_ROW || o.row === LEGACY_VOICEOVER_ROW) return [{ from: o.from, durationInFrames: o.durationInFrames }];
      }

      // Source 2: video overlays with native speech/audio.
      // New upload-to-edit clips carry source-frame speech regions so BGM ducks
      // only under the spoken parts even after silence removal splits the clip.
      // Legacy generated clips with hasNativeAudio but no evidence keep the old
      // full-clip behavior.
      if (o.type === 'video') {
        return getNativeAudioDuckRegions(o).map((region) => ({
          ...region,
          id: `${o.id}:native-audio:${region.from}`,
        }));
      }

      return [];
    });

    if (voiceoverOverlays.length === 0) return undefined;

    const audioTimelineStart = overlay.audioStartFrame ?? overlay.from;
    return createDuckingVolume(
      baseVolume,
      toOverlayLocalRanges(voiceoverOverlays, audioTimelineStart),
      fps,
      duckingConfig,
    );
  }, [duckingConfig, allOverlays, overlay.id, overlay.audioStartFrame, overlay.from, overlay.row, baseVolume, fps]);

  // L-cut/J-cut: audio boundaries can be decoupled from the visual overlay.
  // audioStartFrame < overlay.from -> J-cut (audio starts before video)
  // audioEndFrame > overlay.from + durationInFrames -> L-cut (audio extends after video)
  // Migration: startFromSound is the old audio in-point trim (source offset)
  const audioSourceOffset = overlay.startFromSound || 0;
  const hasDecoupledAudio = overlay.audioStartFrame !== undefined || overlay.audioEndFrame !== undefined;

  // Resolve volume: if ducking callback exists AND is a valid function, use it.
  // Remotion's <Audio volume> accepts either a number or a frame=>number callback.
  // If createDuckingVolume returns something unexpected, fall back to static number.
  const resolvedVolume = volumeCallback && typeof volumeCallback === 'function'
    ? volumeCallback
    : baseVolume;
  const playbackRate = resolveSoundPlaybackRate(overlay.playbackRate);
  const atomicFadeInFrames = atomicSfxMix?.fadeInFrames ?? 0;
  const atomicFadeOutFrames = atomicSfxMix?.fadeOutFrames ?? 0;

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
          playbackRate={playbackRate}
          volume={applyFadeEnvelope(
            resolvedVolume,
            overlay.styles,
            audioDuration,
            fps,
            atomicFadeInFrames,
            atomicFadeOutFrames,
          )}
        />
      </Sequence>
    );
  }

  return (
    <Audio
      src={audioSrc}
      startFrom={audioSourceOffset}
      playbackRate={playbackRate}
      volume={applyFadeEnvelope(
        resolvedVolume,
        overlay.styles,
        overlay.durationInFrames,
        fps,
        atomicFadeInFrames,
        atomicFadeOutFrames,
      )}
    />
  );
};
