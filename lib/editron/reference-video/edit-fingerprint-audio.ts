/**
 * EditFingerprint — audio layer assembler (§7.2 L1).
 *
 * Deterministically maps the DEPLOYED Essentia music analysis (MusicAnalysisResult, produced
 * by lib/editron/services/music-analysis-service.ts) into the fingerprint's audio layer. This
 * is the assembly half of the extractor — pure, no LLM, no new perception. The perception half
 * (recognition, stem separation, decisionStream detection) fills the fields left blank here.
 *
 * Thresholds are sourced from the Threshold Registry (not hardcoded):
 *   - audioAnchored uses `music-presence-threshold` (0.6, source=CRG, signal:composite.montage_mode).
 * Drop positions come from the CRG music_section label vocabulary ({chorus, verse, bridge, drop,
 * build, breakdown}) — a `drop`-labelled section start is a drop.
 *
 * Left for later phases (kept honest, not stubbed with fake data):
 *   - recognition / soundClass: needs the ACRCloud/AudD pass (soundClass = 'unknown' until then);
 *   - voiceWindows: derived from the Grok transcript + music-stem energy (its own phase);
 *   - stemRefs: set when Demucs-class stem separation runs.
 */

import type { MusicAnalysisResult } from '@/lib/editron/services/music-analysis-service';
import type { FingerprintAudioLayer } from '@/lib/editron/types/edit-fingerprint';
import { getThreshold } from '@/lib/editron/data/threshold-registry';

const MUSIC_PRESENCE_THRESHOLD_ID = 'music-presence-threshold';

/** Resolve a registry threshold, failing loud if it is missing (never silently default). */
function requireThresholdValue(id: string): number {
  const entry = getThreshold(id);
  if (!entry) {
    throw new Error(`[edit-fingerprint-audio] threshold '${id}' is missing from THRESHOLD_REGISTRY`);
  }
  return entry.value;
}

/** music_energy above this ⇒ music-dominant ⇒ the trend is anchored to the beat grid (§7.1). */
const MUSIC_PRESENCE_THRESHOLD = requireThresholdValue(MUSIC_PRESENCE_THRESHOLD_ID);

/**
 * A `drop`-labelled section (CRG music_section vocabulary {chorus,verse,bridge,drop,build,
 * breakdown}) marks a drop. Exact match (case-insensitive, trimmed): the endpoint emits
 * single-word vocabulary labels, so this matches 'drop'/'Drop'/'DROP' while rejecting
 * false positives like 'raindrop' or 'breakdown'.
 */
function isDropSection(label: string): boolean {
  return label.trim().toLowerCase() === 'drop';
}

/**
 * Build the fingerprint audio layer from an Essentia MusicAnalysisResult. Beats and sections
 * are reused verbatim (same MusicBeat/MusicSection types). audioAnchored is CRG-thresholded on
 * musicPresence; dropsMs are the starts of drop-labelled sections.
 */
export function audioLayerFromMusicAnalysis(music: MusicAnalysisResult): FingerprintAudioLayer {
  return {
    bpm: music.bpm,
    beats: music.beats,
    sections: music.sections,
    energyCurve: music.energyCurve,
    durationMs: music.durationMs,
    dropsMs: music.sections.filter((section) => isDropSection(section.label)).map((section) => section.startMs),
    audioAnchored: music.musicPresence >= MUSIC_PRESENCE_THRESHOLD,
    // Filled by the perception phases (kept blank, not faked):
    soundClass: 'unknown',
    voiceWindows: [],
  };
}
