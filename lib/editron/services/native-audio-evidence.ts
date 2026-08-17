import type { RawFootageAnalysis } from './raw-footage-processor';

export interface NativeSpeechRegion {
  sourceStartFrame: number;
  sourceEndFrame: number;
  startMs: number;
  endMs: number;
}

export interface NativeAudioEvidence {
  evidenceId?: string;
  sourceAssetId?: string;
  sourceVersion?: string;
  hasNativeAudio: boolean;
  hasSpeech: boolean;
  source: 'transcription' | 'none';
  wordCount: number;
  speechCoverage: number;
  speechRegions: NativeSpeechRegion[];
  regionCount: number;
}

const MAX_SPEECH_GAP_MS = 750;
const SPEECH_PAD_MS = 120;
const MAX_STORED_REGIONS = 180;

export function deriveNativeAudioEvidence(
  rawFootageAnalysis: Pick<RawFootageAnalysis, 'transcription' | 'speechCoverage'> | null | undefined,
  fps = 30,
): NativeAudioEvidence {
  const words = rawFootageAnalysis?.transcription?.words ?? [];
  const speechCoverage = clamp01(
    typeof rawFootageAnalysis?.speechCoverage === 'number'
      ? rawFootageAnalysis.speechCoverage
      : 0,
  );
  if (words.length === 0) {
    return {
      hasNativeAudio: false,
      hasSpeech: false,
      source: 'none',
      wordCount: 0,
      speechCoverage,
      speechRegions: [],
      regionCount: 0,
    };
  }

  const sortedWords = [...words]
    .filter((word) => (
      typeof word.startMs === 'number'
      && typeof word.endMs === 'number'
      && Number.isFinite(word.startMs)
      && Number.isFinite(word.endMs)
      && word.endMs > word.startMs
    ))
    .sort((a, b) => a.startMs - b.startMs);

  const speechRegions: NativeSpeechRegion[] = [];
  let currentStartMs: number | null = null;
  let currentEndMs = 0;

  for (const word of sortedWords) {
    if (currentStartMs == null) {
      currentStartMs = word.startMs;
      currentEndMs = word.endMs;
      continue;
    }

    if (word.startMs - currentEndMs <= MAX_SPEECH_GAP_MS) {
      currentEndMs = Math.max(currentEndMs, word.endMs);
      continue;
    }

    speechRegions.push(toSpeechRegion(currentStartMs, currentEndMs, fps));
    currentStartMs = word.startMs;
    currentEndMs = word.endMs;
  }

  if (currentStartMs != null) {
    speechRegions.push(toSpeechRegion(currentStartMs, currentEndMs, fps));
  }

  const boundedRegions = boundRegions(speechRegions);

  return {
    hasNativeAudio: boundedRegions.length > 0,
    hasSpeech: boundedRegions.length > 0,
    source: 'transcription',
    wordCount: sortedWords.length,
    speechCoverage,
    speechRegions: boundedRegions,
    regionCount: boundedRegions.length,
  };
}

export function getNativeAudioDuckRegions(overlay: any): Array<{ from: number; durationInFrames: number }> {
  if (!overlay || overlay.type !== 'video') return [];

  const evidence = overlay.metadata?.nativeAudioEvidence as NativeAudioEvidence | undefined;
  if (evidence && evidence.hasSpeech === false) return [];
  const regions = Array.isArray(evidence?.speechRegions) ? evidence.speechRegions : [];
  if (regions.length === 0) {
    const clipStart = finiteNumber(overlay.from) ?? 0;
    const clipDuration = Math.max(0, finiteNumber(overlay.durationInFrames) ?? 0);
    return overlay.hasNativeAudio === true
      ? [{ from: clipStart, durationInFrames: clipDuration }]
      : [];
  }

  return projectSpeechRegionsToTimeline(
    overlay,
    regions,
    finiteNumber(overlay.sourceStartFrame) ?? finiteNumber(overlay.videoStartTime) ?? 0,
  );
}

/**
 * Project source-bound speech evidence for a separate dialogue/voice sound.
 * `null` means the overlay has no bound evidence and the caller may retain its
 * legacy full-overlay fallback. An empty array means evidence explicitly says
 * there is no speech, so callers must not invent a voice range.
 */
export function getSoundAudioDuckRegions(
  overlay: any,
): Array<{ from: number; durationInFrames: number }> | null {
  if (!overlay || overlay.type !== 'sound') return null;

  const evidence = overlay.metadata?.nativeAudioEvidence as NativeAudioEvidence | undefined;
  if (!evidence) return null;
  if (evidence.hasSpeech === false) return [];

  if (
    typeof overlay.assetId !== 'string'
    || evidence.sourceAssetId !== overlay.assetId
    || typeof evidence.sourceVersion !== 'string'
    || evidence.sourceVersion.length === 0
  ) {
    throw new Error('UNBOUND_SOUND_SPEECH_EVIDENCE');
  }

  const regions = Array.isArray(evidence.speechRegions) ? evidence.speechRegions : [];
  if (regions.length === 0 || regions.some((region) => !isValidSpeechRegion(region))) {
    throw new Error('INVALID_BOUND_SOUND_SPEECH_EVIDENCE');
  }

  return projectSpeechRegionsToTimeline(
    overlay,
    regions,
    finiteNumber(overlay.startFromSound) ?? 0,
  );
}

function isValidSpeechRegion(region: NativeSpeechRegion): boolean {
  const start = finiteNumber(region?.sourceStartFrame);
  const end = finiteNumber(region?.sourceEndFrame);
  return start != null && end != null && start >= 0 && end > start;
}

function projectSpeechRegionsToTimeline(
  overlay: any,
  regions: readonly NativeSpeechRegion[],
  sourceStart: number,
): Array<{ from: number; durationInFrames: number }> {
  const clipStart = finiteNumber(overlay.from) ?? 0;
  const clipDuration = Math.max(0, finiteNumber(overlay.durationInFrames) ?? 0);
  if (clipDuration <= 0) return [];
  const sourceEnd = sourceStart + clipDuration;

  return regions
    .map((region) => {
      const regionStart = finiteNumber(region.sourceStartFrame);
      const regionEnd = finiteNumber(region.sourceEndFrame);
      if (regionStart == null || regionEnd == null || regionEnd <= regionStart) return null;

      const start = Math.max(sourceStart, regionStart);
      const end = Math.min(sourceEnd, regionEnd);
      if (end <= start) return null;

      return {
        from: clipStart + (start - sourceStart),
        durationInFrames: end - start,
      };
    })
    .filter((region): region is { from: number; durationInFrames: number } => Boolean(region));
}

function toSpeechRegion(startMs: number, endMs: number, fps: number): NativeSpeechRegion {
  const paddedStartMs = Math.max(0, startMs - SPEECH_PAD_MS);
  const paddedEndMs = Math.max(paddedStartMs + 1, endMs + SPEECH_PAD_MS);
  const sourceStartFrame = Math.max(0, Math.floor((paddedStartMs / 1000) * fps));
  const sourceEndFrame = Math.max(sourceStartFrame + 1, Math.ceil((paddedEndMs / 1000) * fps));
  return {
    sourceStartFrame,
    sourceEndFrame,
    startMs: paddedStartMs,
    endMs: paddedEndMs,
  };
}

function boundRegions(regions: NativeSpeechRegion[]): NativeSpeechRegion[] {
  if (regions.length <= MAX_STORED_REGIONS) return regions;
  const first = regions[0];
  const last = regions[regions.length - 1];
  return [{
    sourceStartFrame: first.sourceStartFrame,
    sourceEndFrame: last.sourceEndFrame,
    startMs: first.startMs,
    endMs: last.endMs,
  }];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
