/**
 * R2: Measured evidence for a reference video.
 *
 * Composes the objective measurements named by the R2 spec into ONE versioned
 * artifact owned by the reference's canonical asset:
 *
 *   - cuts         (detect-cuts-ffmpeg + score-aware adaptive post-process R0)
 *   - beats/bpm/downbeats/onsets/energy  (beat-detection-service on decoded audio)
 *   - silence      (measure-silence on decoded audio)
 *   - sections     (opt-in, via an injected provider e.g. Essentia/Modal)
 *
 * Inputs are R1-A demuxed artifacts: a local video path (or its bytes) and the
 * demuxed audio bytes. Every function is injected so the core is testable with
 * no binary/network. Deterministic; fail-loud on a source it cannot measure.
 *
 * This module ONLY MEASURES. It never decides cuts, placements, or edits — the
 * adaptive template (R5) and the final timeline resolver own adaptation.
 */

import { SILENCE_MEASUREMENT_VERSION, measureSilence, type SilenceMeasurement } from './measure-silence';
import { mergeCloseCuts, DEFAULT_MERGE_WINDOW_MS, DEFAULT_STRONG_CUT_FLOOR } from './adaptive-cut-postprocess';
import { resolveSoundtrackIdentity, SoundtrackIdentityError, type SoundtrackIdentity } from './soundtrack-identity';
import type { BeatAnalysis } from '@/lib/editron/services/media/types';

export const MEASURED_EVIDENCE_VERSION = 'editron-r2-measured-evidence-v1' as const;

export interface MeasuredSection {
  startMs: number;
  endMs: number;
  label: string;
}

export interface MeasuredCut {
  tMs: number;
  /** Scene score of the boundary; present when the detector scored it. */
  sceneScore?: number;
  /** Whether this cut came from a collapsed weak cluster (whip/blur burst). */
  merged?: boolean;
}

/** Non-fatal measurement warnings (e.g. optional provider outages). Fail-loud but decoupled. */
export interface MeasuredEvidenceWarning {
  code: string;
  source: 'section' | 'soundtrack';
  message: string;
}

export interface MeasuredReferenceEvidence {
  version: typeof MEASURED_EVIDENCE_VERSION;
  referenceAssetId: string;
  durationMs: number | null;
  /** Objective hard-cut times after the score-aware adaptive merge. */
  cuts: MeasuredCut[];
  /** Beats + BPM + downbeats + onsets + energy from decoded audio. */
  beats: BeatAnalysis;
  /** Silence windows measured from decoded audio. */
  silence: SilenceMeasurement;
  /** Structural sections (verse/chorus/drop/...). Empty when no provider. */
  sections: MeasuredSection[];
  /** R3 canonical recording identity. null when no recognizer configured or no match. */
  soundtrackIdentity: SoundtrackIdentity | null;
  /** Non-fatal provider outages (identity/sections) surfaced loudly, not swallowed. */
  warnings: MeasuredEvidenceWarning[];
  /** Objectively derived rhythm summary for the fingerprint. */
  rhythm: {
    avgCutsPerMinute: number;
    avgClipDurationMs: number;
    bpm: number;
  };
}

export interface MeasureReferenceEvidenceDeps {
  /** Decode audio bytes into an AudioBuffer-shaped object. Injected for tests. */
  decodeAudio?: (bytes: Uint8Array) => Promise<{
    sampleRate: number;
    length: number;
    numberOfChannels: number;
    getChannelData: (ch: number) => Float32Array;
    duration: number;
  }>;
  /** Run the beat analysis on a decoded buffer. Defaults to the repo's analyzer. */
  analyzeBeats?: typeof import('@/lib/editron/services/media/beat-detection-service').analyzeBeatsFull;
  /** Detect objective cuts from local video bytes. Injected for tests. */
  detectCuts?: (videoBytes: Uint8Array, durationMs: number) => Promise<{
    cuts: Array<{ tMs: number; sceneScore?: number }>;
    durationMs: number;
  }>;
  /** Measure silence from mono PCM. Defaults to the R2 silence module. */
  measureSilenceFn?: typeof measureSilence;
  /** Optional section provider (Essentia/Modal/etc). Injected; skip when absent. */
  measureSections?: (audioBytes: Uint8Array) => Promise<MeasuredSection[]>;
  /** Optional R3 audio recognizer (AudD/ACRCloud). Skip -> soundtrackIdentity null. */
  soundtrackRecognizer?: (audioBytes: Uint8Array) => Promise<import('./soundtrack-identity').RecognizedTrack | null>;
}

export class MeasureReferenceEvidenceError extends Error {
  constructor(
    public readonly code: 'audio_decode_failed' | 'no_video_evidence' | 'cut_detection_failed',
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'MeasureReferenceEvidenceError';
  }
}

/**
 * Measure all R2 signals for a canonical reference.
 *
 * @param referenceAssetId  Canonical asset id (R1) owning the evidence.
 * @param videoBytes        R1 demuxed video bytes (user's own artifact, not a URL).
 * @param audioBytes        R1 demuxed audio bytes; may be empty if no audio track.
 * @param opts              Injectable camera/algorithm deps.
 */
export async function measureReferenceEvidence(
  referenceAssetId: string,
  videoBytes: Uint8Array,
  audioBytes: Uint8Array | null,
  opts: MeasureReferenceEvidenceDeps = {},
): Promise<MeasuredReferenceEvidence> {
  const decodeAudio = opts.decodeAudio ?? decodeAudioBytes;
  const analyzeBeats = opts.analyzeBeats ?? (await import('@/lib/editron/services/media/beat-detection-service')).analyzeBeatsFull;
  const detectCuts = opts.detectCuts ?? detectCutsLocal;
  const measureSilenceFn = opts.measureSilenceFn ?? measureSilence;

  if (!(videoBytes instanceof Uint8Array) || videoBytes.byteLength === 0) {
    throw new MeasureReferenceEvidenceError('no_video_evidence', 'No demuxed video bytes provided for measurement.');
  }

  // ── Cuts: objective detector + R0 score-aware merge ─────────────
  let cutResult: { cuts: Array<{ tMs: number; sceneScore?: number }>; durationMs: number };
  try {
    cutResult = await detectCuts(videoBytes, 0);
  } catch (error) {
    throw new MeasureReferenceEvidenceError(
      'cut_detection_failed',
      'Cut detection failed: ' + (error instanceof Error ? error.message : String(error)),
    );
  }
  const merged = mergeCloseCuts(cutResult.cuts);
  const durationMs = cutResult.durationMs || null;

  // Tag members that were collapsed from a weak cluster as merged. The merge
  // result returns only survivors, so any cut that landed inside a weak
  // multi-member cluster (i.e. where the cluster collapsed) is flagged.
  const originalCuts = [...cutResult.cuts].sort((a, b) => a.tMs - b.tMs);
  const mergedMembers = new Set<number>();
  findWeakClusterMembers(originalCuts, mergedMembers);

  const cuts: MeasuredCut[] = merged.cuts.map((cut) => ({
    tMs: cut.tMs,
    ...(cut.sceneScore !== undefined && { sceneScore: cut.sceneScore }),
    ...(mergedMembers.has(cut.tMs) && { merged: true }),
  }));

  // ── Beats + silence from decoded audio ──────────────────────────
  let beats: BeatAnalysis = emptyBeats();
  let silence: SilenceMeasurement = {
    windows: [],
    totalSilentMs: 0,
    silentRatio: 0,
    durationMs: durationMs ?? 0,
    version: SILENCE_MEASUREMENT_VERSION,
  };
  let sections: MeasuredSection[] = [];
  let soundtrackIdentity: SoundtrackIdentity | null = null;
  const recordingWarnings: MeasuredEvidenceWarning[] = [];
  if (audioBytes && audioBytes.byteLength > 0) {
    try {
      const decoded = await decodeAudio(audioBytes);
      const primary = decoded.getChannelData(0);
      beats = await analyzeBeats({
        sampleRate: decoded.sampleRate,
        length: decoded.length,
        numberOfChannels: decoded.numberOfChannels,
        getChannelData: (ch: number) => decoded.getChannelData(ch) ?? primary,
        duration: decoded.duration,
      });
      silence = measureSilenceFn(primary, decoded.sampleRate);
    } catch (error) {
      throw new MeasureReferenceEvidenceError(
        'audio_decode_failed',
        'Could not decode demuxed audio: ' + (error instanceof Error ? error.message : String(error)),
      );
    }
    if (opts.measureSections) {
      try {
        sections = await opts.measureSections(audioBytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[MeasureEvidence] Section provider failed — evidence continues without sections:', error);
        recordingWarnings.push({ code: 'section_provider_failed', source: 'section', message });
      }
    }
    if (opts.soundtrackRecognizer) {
      // R3 identity is supplementary: a recognizer outage must NOT nullify the
      // measured evidence (beats/silence/cuts). Report it loudly, keep the rest.
      try {
        soundtrackIdentity = await resolveSoundtrackIdentity(referenceAssetId, audioBytes, {
          recognize: opts.soundtrackRecognizer,
        });
      } catch (error) {
        const code = error instanceof SoundtrackIdentityError ? error.code : 'recognizer_failed';
        console.warn(`[MeasureEvidence] Soundtrack identity failed (${code}) — evidence continues without identity:`,
          error instanceof Error ? error.message : error);
        recordingWarnings.push({ code, source: 'soundtrack', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // ── Rhythm summary (objective, derived — Director adapts later) ─
  const effectiveDurationMs = durationMs ?? beats.durationMs ?? silence.durationMs ?? 0;
  const avgCutsPerMinute = effectiveDurationMs > 0 ? (cuts.length / effectiveDurationMs) * 60_000 : 0;
  const avgClipDurationMs = cuts.length > 1
    ? cuts.slice(1).reduce((sum, cut, i) => sum + (cut.tMs - cuts[i].tMs), 0) / (cuts.length - 1)
    : effectiveDurationMs;

  return {
    version: MEASURED_EVIDENCE_VERSION,
    referenceAssetId,
    durationMs: effectiveDurationMs > 0 ? Math.round(effectiveDurationMs) : null,
    cuts,
    beats,
    silence,
    sections,
    soundtrackIdentity,
    warnings: recordingWarnings,
    rhythm: {
      avgCutsPerMinute: round(avgCutsPerMinute),
      avgClipDurationMs: Math.round(avgClipDurationMs),
      bpm: beats.bpm || 0,
    },
  };
}

async function decodeAudioBytes(bytes: Uint8Array): Promise<{
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData: (ch: number) => Float32Array;
  duration: number;
}> {
  const decode = (await import('audio-decode')).default;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const decoded = await decode(arrayBuffer);
  const channelData = Array.isArray(decoded?.channelData) ? decoded.channelData : [];
  const primary = channelData[0];
  if (!Number.isFinite(decoded?.sampleRate) || decoded.sampleRate <= 0 || !(primary instanceof Float32Array) || primary.length === 0) {
    throw new Error('Decoded audio had no valid PCM channel');
  }
  return {
    sampleRate: decoded.sampleRate,
    length: primary.length,
    numberOfChannels: channelData.length,
    getChannelData: (ch: number) => channelData[ch] ?? primary,
    duration: primary.length / decoded.sampleRate,
  };
}

async function detectCutsLocal(
  videoBytes: Uint8Array,
  _durationMs: number,
): Promise<{ cuts: Array<{ tMs: number; sceneScore?: number }>; durationMs: number }> {
  const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { detectCutsFfmpeg } = await import('./detect-cuts-ffmpeg');
  const dir = await mkdtemp(path.join(tmpdir(), 'editron-measure-'));
  const file = path.join(dir, 'video.mp4');
  try {
    await writeFile(file, videoBytes);
    return await detectCutsFfmpeg(file);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function emptyBeats(): BeatAnalysis {
  return {
    beats: [],
    bpm: 0,
    bpmConfidence: 0,
    durationMs: 0,
    timeSignatureNumerator: 4,
    energyPeaks: [],
    rawOnsets: [],
  };
}

/**
 * Collect tMs of every member inside a collapsed WEAK cluster. Mirrors the
 * clustering + weak-floor test used by mergeCloseCuts so the merged flag on the
 * evidence matches exactly which detections were deemed part of a blur/whip
 * burst (i.e. collapsed to one survivor) — including members that did not
 * survive. Replicated here to avoid two merges drifting apart; both use the
 * same DEFAULT_MERGE_WINDOW_MS + DEFAULT_STRONG_CUT_FLOOR.
 */
function findWeakClusterMembers(
  sortedCuts: Array<{ tMs: number; sceneScore?: number }>,
  out: Set<number>,
): void {
  let clusterStart = 0;
  for (let i = 1; i <= sortedCuts.length; i++) {
    const prev = sortedCuts[i - 1];
    const curr = sortedCuts[i];
    if (curr && curr.tMs - prev.tMs <= DEFAULT_MERGE_WINDOW_MS) {
      continue; // still inside a cluster
    }
    // Cluster = [clusterStart, i).
    if (i - clusterStart > 1) {
      let maxScore = -1;
      for (let m = clusterStart; m < i; m++) {
        const score = sortedCuts[m].sceneScore ?? -1;
        if (score > maxScore) maxScore = score;
      }
      if (maxScore < DEFAULT_STRONG_CUT_FLOOR) {
        for (let m = clusterStart; m < i; m++) {
          out.add(sortedCuts[m].tMs);
        }
      }
    }
    clusterStart = i;
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
