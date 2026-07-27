import type { BGMResult, ConditionedBGMResult } from '@/lib/pipeline/bgm-service';
import { resolveAudioLoudnessTarget } from '@/lib/editron/constants/audio-standards';
import {
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';
import {
  resolveEditorialDecisionPolicy,
  type EditorialDecisionPolicy,
} from '@/lib/editron/services/editorial-decision-policy';

const UNRESOLVED_PLATFORM_SOURCE = 'unresolved';
const UNRESOLVED_PREFERENCE_SOURCE = 'unresolved';
const PLACEHOLDER_PLATFORM_VALUES = new Set(['auto', 'unknown', 'unspecified']);

export interface AudioPlatformCandidate {
  value: unknown;
  source: string;
}

export interface AudioPlatformEvidence {
  platform: string | null;
  source: string;
}

export interface MusicPreferenceCandidate {
  value: unknown;
  source: string;
}

export interface EditorialPreferencesCandidate {
  value: unknown;
  source: string;
}

export interface MusicGenerationPolicy {
  version: 'music-generation-policy-v1';
  allowed: boolean;
  reason: 'music-preference-none' | 'user-policy-off:music' | 'music-enabled';
  musicPreference: string | null;
  musicPreferenceSource: string;
  editorialPreferences: EditorialPreferences | null;
  editorialPreferencesSource: string;
  editorialPolicy: EditorialDecisionPolicy;
}

export function resolveAudioPlatformEvidence(
  candidates: readonly AudioPlatformCandidate[],
): AudioPlatformEvidence {
  for (const candidate of candidates) {
    if (typeof candidate.value !== 'string') continue;
    const platform = candidate.value.trim();
    if (!platform || PLACEHOLDER_PLATFORM_VALUES.has(platform.toLowerCase())) continue;
    return { platform, source: candidate.source };
  }

  return {
    platform: null,
    source: UNRESOLVED_PLATFORM_SOURCE,
  };
}

export function resolveMusicGenerationPolicy(params: {
  musicPreferences: readonly MusicPreferenceCandidate[];
  editorialPreferences: readonly EditorialPreferencesCandidate[];
}): MusicGenerationPolicy {
  const musicPreferenceEvidence = params.musicPreferences
    .map(candidate => ({
      preference: typeof candidate.value === 'string'
        ? candidate.value.trim().toLowerCase()
        : '',
      source: candidate.source,
    }))
    .find(candidate => candidate.preference.length > 0);

  const editorialEvidence = params.editorialPreferences
    .map(candidate => ({
      preferences: normalizeEditorialPreferences(candidate.value),
      source: candidate.source,
    }))
    .find(candidate => candidate.preferences?.families?.music);

  const editorialPreferences = editorialEvidence?.preferences;
  const editorialPolicy = resolveEditorialDecisionPolicy(editorialPreferences, 'music');
  const blockedByLegacyPreference = musicPreferenceEvidence?.preference === 'none';
  const allowed = !blockedByLegacyPreference && editorialPolicy.executionAllowed;

  return {
    version: 'music-generation-policy-v1',
    allowed,
    reason: blockedByLegacyPreference
      ? 'music-preference-none'
      : editorialPolicy.executionAllowed
        ? 'music-enabled'
        : 'user-policy-off:music',
    musicPreference: musicPreferenceEvidence?.preference || null,
    musicPreferenceSource: musicPreferenceEvidence?.source || UNRESOLVED_PREFERENCE_SOURCE,
    editorialPreferences: editorialPreferences || null,
    editorialPreferencesSource: editorialEvidence?.source || UNRESOLVED_PREFERENCE_SOURCE,
    editorialPolicy,
  };
}

export function assertConditionedBGMResult(
  result: BGMResult,
  expectedTargetFrames: number,
  expectedPlatform?: string | null,
): asserts result is ConditionedBGMResult {
  const evidence = result?.conditioning;
  const loudnessTarget = resolveAudioLoudnessTarget(expectedPlatform);
  const contractIsValid = Boolean(
    evidence
    && typeof result.audioUrl === 'string'
    && result.audioUrl.length > 0
    && typeof result.audioAssetId === 'string'
    && result.audioAssetId.length > 0
    && result.contentType === 'audio/flac'
    && typeof result.filename === 'string'
    && result.filename.endsWith('.flac')
    && Buffer.isBuffer(result.buffer)
    && result.buffer.length > 0
    && evidence.targetFrames === expectedTargetFrames
    && Number.isFinite(evidence.durationMs)
    && evidence.durationMs > 0
    && result.durationMs === evidence.durationMs
    && Number.isFinite(evidence.measuredOutputLufs)
    && Number.isFinite(evidence.truePeakDbtp)
    && evidence.loudnessPlatform === loudnessTarget.platform
    && evidence.targetLufs === loudnessTarget.integratedLufs
    && evidence.targetTruePeakDbtp === loudnessTarget.truePeakDbtp,
  );

  if (!contractIsValid) {
    throw new Error(
      `BGM conditioning contract failed for ${expectedTargetFrames} frames; refusing to mutate the project`,
    );
  }
}
