/**
 * useBeatSync — React hook for beat detection + timeline integration.
 *
 * Fetches audio, decodes it, runs multi-band spectral flux beat detection,
 * and returns beat positions converted to timeline frames.
 *
 * Follows the same pattern as use-waveform-processor.tsx:
 * fetch → decode with AudioContext → process → return state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  analyzeBeatsFull,
  requantizeBeats,
  beatAnalysisToFrames,
} from '@/lib/editron/services/media/beat-detection-service';
import type {
  BeatAnalysis,
  BeatDetectionOptions,
} from '@/lib/editron/services/media/types';

// ─── Types ───────────────────────────────────────────────────────

export interface BeatFrame {
  frame: number;
  strength: number;
  isDownbeat: boolean;
}

export interface EnergyPeakFrame {
  frame: number;
  magnitude: number;
}

export interface UseBeatSyncOptions {
  /** Whether beat detection is enabled (default: true) */
  enabled?: boolean;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Timeline offset in ms where the audio overlay begins (default: 0) */
  audioStartOffsetMs?: number;
  /** Beat detection algorithm options */
  detectionOptions?: BeatDetectionOptions;
}

export interface UseBeatSyncResult {
  /** Full beat analysis data, null while loading or disabled */
  analysis: BeatAnalysis | null;
  /** Beat positions converted to timeline frames */
  beatFrames: BeatFrame[] | null;
  /** Energy peak positions converted to timeline frames */
  energyPeakFrames: EnergyPeakFrame[] | null;
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Error message if analysis failed */
  error: string | null;
  /** Re-run analysis (e.g., after audio changes) */
  reanalyze: () => void;
  /** Override the detected BPM — re-quantizes grid, keeps raw onset data */
  setBpmOverride: (bpm: number | null) => void;
  /** Current BPM override value (null = auto-detected) */
  bpmOverride: number | null;
  /** Half-time the current BPM (÷2) */
  halfTime: () => void;
  /** Double-time the current BPM (×2) */
  doubleTime: () => void;
}

// ─── Cache ───────────────────────────────────────────────────────
// Keyed by audio URL — avoids re-analysis when component re-renders
const analysisCache = new Map<string, BeatAnalysis>();

// ─── Hook ────────────────────────────────────────────────────────

export function useBeatSync(
  /** Audio source URL (signed GCS URL, blob URL, or CDN URL) */
  src: string | undefined,
  options: UseBeatSyncOptions = {},
): UseBeatSyncResult {
  const {
    enabled = true,
    fps = 30,
    audioStartOffsetMs = 0,
    detectionOptions,
  } = options;

  const [analysis, setAnalysis] = useState<BeatAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bpmOverride, setBpmOverrideState] = useState<number | null>(null);
  const [version, setVersion] = useState(0); // bumped by reanalyze()

  // Ref to track active analysis (for cleanup)
  const isActiveRef = useRef(true);

  // ─── Core analysis effect ──────────────────────────────────────
  useEffect(() => {
    if (!enabled || !src) {
      setAnalysis(null);
      setError(null);
      return;
    }

    // Check cache
    const cached = analysisCache.get(src);
    if (cached) {
      setAnalysis(cached);
      setIsAnalyzing(false);
      setError(null);
      return;
    }

    let active = true;
    isActiveRef.current = true;

    const runAnalysis = async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        // Fetch audio
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        if (!active) return;

        // Decode with AudioContext
        const audioContext = new AudioContext();
        let audioBuffer: AudioBuffer;
        try {
          audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } finally {
          await audioContext.close();
        }

        if (!active) return;

        // Run beat detection
        const result = await analyzeBeatsFull(audioBuffer, detectionOptions);

        if (!active) return;

        // Cache and set
        analysisCache.set(src, result);
        setAnalysis(result);
        setBpmOverrideState(null); // Reset override on new analysis
      } catch (err: any) {
        if (active) {
          console.error('[useBeatSync] Analysis failed:', err);
          setError(err.message || 'Beat detection failed');
        }
      } finally {
        if (active) setIsAnalyzing(false);
      }
    };

    runAnalysis();

    return () => {
      active = false;
      isActiveRef.current = false;
    };
  }, [src, enabled, version]); // version triggers re-analysis

  // ─── BPM override ─────────────────────────────────────────────
  const setBpmOverride = useCallback(
    (bpm: number | null) => {
      setBpmOverrideState(bpm);
      if (bpm !== null && analysis) {
        // Re-quantize beats at the new BPM, keeping raw onset data
        const newBeats = requantizeBeats(
          analysis.rawOnsets,
          bpm,
          analysis.timeSignatureNumerator,
          analysis.durationMs,
        );
        setAnalysis({
          ...analysis,
          beats: newBeats,
          bpm,
          bpmConfidence: 1.0, // Manual override = full confidence
        });
      } else if (bpm === null && src) {
        // Reset to cached auto-detected analysis
        const cached = analysisCache.get(src);
        if (cached) setAnalysis(cached);
      }
    },
    [analysis, src],
  );

  const halfTime = useCallback(() => {
    const currentBpm = bpmOverride ?? analysis?.bpm;
    if (currentBpm) setBpmOverride(currentBpm / 2);
  }, [bpmOverride, analysis?.bpm, setBpmOverride]);

  const doubleTime = useCallback(() => {
    const currentBpm = bpmOverride ?? analysis?.bpm;
    if (currentBpm) setBpmOverride(currentBpm * 2);
  }, [bpmOverride, analysis?.bpm, setBpmOverride]);

  const reanalyze = useCallback(() => {
    if (src) analysisCache.delete(src);
    setVersion((v) => v + 1);
  }, [src]);

  // ─── Convert to frames ────────────────────────────────────────
  let beatFrames: BeatFrame[] | null = null;
  let energyPeakFrames: EnergyPeakFrame[] | null = null;

  if (analysis) {
    const converted = beatAnalysisToFrames(analysis, fps, audioStartOffsetMs);
    beatFrames = converted.beatFrames;
    energyPeakFrames = converted.energyPeakFrames;
  }

  return {
    analysis,
    beatFrames,
    energyPeakFrames,
    isAnalyzing,
    error,
    reanalyze,
    setBpmOverride,
    bpmOverride,
    halfTime,
    doubleTime,
  };
}
