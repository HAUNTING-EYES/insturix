/**
 * R4: Build the canonical EditFingerprint from measured evidence.
 *
 * Unifies the R2 measured evidence (cuts/beats/silence/rhythm) and the R3
 * soundtrack identity into the ONE canonical EditFingerprint that ThinkForge
 * and Editron both consume (docs/REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN R4).
 *
 * Every layer carries the R4 metadata: source, algorithm version, coordinate
 * space, and units, recorded in layerConfidence so consumers can distinguish
 * "coordinates that are wall-clock ms" from "beat-indexed" without guessing.
 *
 * This module is PURE. It records measured facts into the contract; it never
 * decides cuts/placement/form (R36 — the final timeline resolver owns that).
 */

import {
  assembleEditFingerprint,
  type AssembleFingerprintInput,
} from './edit-fingerprint-assembler';
import {
  MEASURED_EVIDENCE_VERSION,
  type MeasuredReferenceEvidence,
} from './measure-reference-evidence';
import {
  identityToFingerprintRecognition,
  type SoundtrackIdentity,
} from './soundtrack-identity';
import type {
  EditFingerprint,
  FingerprintAudioLayer,
  FingerprintDecision,
  FingerprintLayerConfidence,
  FingerprintLayer,
} from '@/lib/editron/types/edit-fingerprint';

/** R4: the coordinate space + units each layer actually carries. */
const LAYER_META: Record<string, { coordinateSpace: 'beat' | 'slot' | 'wall-clock'; units: string }> = {
  audio: { coordinateSpace: 'beat', units: 'ms' },
  decision: { coordinateSpace: 'wall-clock', units: 'ms' },
  structure: { coordinateSpace: 'wall-clock', units: 'ms' },
};

export interface BuildCanonicalFingerprintOptions {
  /** Confidence attributed to the cut/beat/silence measurements (0..1). Default 0.9. ⚠️ INVENTED. */
  measuredConfidence?: number;
  /** Override the alignment frame. Defaults from audio.audioAnchored. */
  alignmentFrame?: AssembleFingerprintInput['alignmentFrame'];
  /** Stamp the extraction (kept injectable for deterministic tests). */
  extractedAt?: string;
  /** Explicit fingerprintId — minted by the assembler if absent (nanoid). */
  fingerprintId?: string;
}

function beatsFromEvidence(evidence: MeasuredReferenceEvidence): FingerprintAudioLayer['beats'] {
  const bpm = evidence.beats.bpm;
  if (bpm <= 0) return [];
  // evidence.beats.beats is { timeMs, strength, isDownbeat } — map to MusicBeat.
  return evidence.beats.beats.map((b) => ({
    timestampMs: b.timeMs,
    strength: b.strength,
  }));
}

function decisionsFromCuts(evidence: MeasuredReferenceEvidence, confidence: number): FingerprintDecision[] {
  return evidence.cuts.map((cut) => ({
    family: 'transition_hard_cut',
    anchor: { kind: 'none', tMs: cut.tMs },
    params: {
      ...(cut.sceneScore !== undefined && { sceneScore: cut.sceneScore }),
      ...(cut.merged === true && { merged: 1 }),
    },
    confidence,
  }));
}

/**
 * Build a canonical EditFingerprint from R2 measured evidence + R3 identity.
 * Layer metadata (source/version/coordinate space/units) is attached per layer
 * in layerConfidence so consumers never guess the contract (R4).
 */
export function buildCanonicalFingerprintFromEvidence(
  referenceId: string,
  evidence: MeasuredReferenceEvidence,
  identity: SoundtrackIdentity | null,
  options: BuildCanonicalFingerprintOptions = {},
): EditFingerprint {
  const measuredConfidence = options.measuredConfidence ?? 0.9;
  const hasBeats = evidence.beats.beats.length > 0;

  const audio: FingerprintAudioLayer = {
    bpm: evidence.beats.bpm || undefined,
    beats: beatsFromEvidence(evidence),
    sections: evidence.sections.map((s) => ({ startMs: s.startMs, endMs: s.endMs, label: s.label })),
    energyCurve: [],
    dropsMs: evidence.sections
      .filter((s) => s.label.trim().toLowerCase() === 'drop')
      .map((s) => s.startMs),
    audioAnchored: hasBeats,
    voiceWindows: [],
    soundClass: identity ? 'catalog-track' : 'unknown',
    ...(identity && { recognition: identityToFingerprintRecognition(identity) }),
    durationMs: evidence.durationMs ?? 0,
  };

  const layerConfidence: Partial<Record<FingerprintLayer, FingerprintLayerConfidence>> = {
    audio: {
      confidence: measuredConfidence,
      source: 'measured-reference-evidence',
      algorithmVersion: MEASURED_EVIDENCE_VERSION,
      coordinateSpace: LAYER_META.audio.coordinateSpace,
      units: LAYER_META.audio.units,
    },
    decision: {
      confidence: measuredConfidence,
      source: 'measured-reference-evidence',
      algorithmVersion: MEASURED_EVIDENCE_VERSION,
      coordinateSpace: LAYER_META.decision.coordinateSpace,
      units: LAYER_META.decision.units,
      evidenceFramesMs: evidence.cuts.map((c) => c.tMs),
    },
    structure: {
      confidence: measuredConfidence,
      source: 'measured-reference-evidence',
      algorithmVersion: MEASURED_EVIDENCE_VERSION,
      coordinateSpace: LAYER_META.structure.coordinateSpace,
      units: LAYER_META.structure.units,
    },
  };

  return assembleEditFingerprint({
    referenceId,
    audio,
    decisionStream: decisionsFromCuts(evidence, measuredConfidence),
    layerConfidence,
    alignmentFrame: options.alignmentFrame,
    extractedAt: options.extractedAt,
    fingerprintId: options.fingerprintId,
  });
}
