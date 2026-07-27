/**
 * EditFingerprint — assembler (§7.2).
 *
 * Stitches the per-layer extraction outputs into ONE EditFingerprint. Pure and deterministic
 * (pass fingerprintId + extractedAt for a fully fixed result). Today the audio + voiceWindows
 * layers are real (built deterministically from Essentia + Grok); the visual/perception layers
 * arrive later.
 *
 * HONEST PARTIAL STATE (no faking): a layer that has NOT been extracted is filled with an empty
 * structure AND is left out of `layerConfidence`. So consumers can tell the difference between:
 *   - "looked, found nothing"  → layer empty AND present in layerConfidence;
 *   - "not analyzed yet"        → layer empty AND absent from layerConfidence.
 * Use isLayerExtracted() to check. Nothing is default-claimed (graphics density is simply omitted).
 *
 * alignmentFrame is declared FIRST (§7.1): audio-anchored ⇒ beat-space, else slot-space.
 */

import { nanoid } from 'nanoid';
import {
  EDIT_FINGERPRINT_VERSION,
  type EditFingerprint,
  type FingerprintAudioLayer,
  type FingerprintDecision,
  type FingerprintSignalConditional,
  type FingerprintStructure,
  type FingerprintTypographyLayer,
  type FingerprintPerformanceLayer,
  type FingerprintTreatmentLayer,
  type FingerprintGraphicsLayer,
  type FingerprintLayer,
  type FingerprintLayerConfidence,
} from '@/lib/editron/types/edit-fingerprint';
import type { TrendCopyFormula, TrendAlignmentFrame } from '@/lib/thinkforge/schemas/trend-spec';

export interface AssembleFingerprintInput {
  /** Ledger key of the exemplar this fingerprint is extracted from. */
  referenceId: string;
  /** The audio layer (built by audioLayerFromMusicAnalysis + deriveVoiceWindows). Required. */
  audio: FingerprintAudioLayer;

  // Perception layers — supplied as extraction lands; omitted ones become honest empties.
  decisionStream?: FingerprintDecision[];
  signalConditionals?: FingerprintSignalConditional[];
  structure?: FingerprintStructure;
  typography?: FingerprintTypographyLayer;
  performance?: FingerprintPerformanceLayer;
  treatment?: FingerprintTreatmentLayer;
  copyFormula?: TrendCopyFormula;
  graphics?: FingerprintGraphicsLayer;

  /** Only the layers ACTUALLY extracted, with the extractor's confidence. Absent layer = not analyzed. */
  layerConfidence?: Partial<Record<FingerprintLayer, FingerprintLayerConfidence>>;

  /** Override the alignment frame; defaults from audio.audioAnchored (§7.1). */
  alignmentFrame?: TrendAlignmentFrame;
  /** ISO timestamp — the caller stamps it (kept pure: no Date here). */
  extractedAt?: string;
  /** Explicit id; minted if absent (mirrors reference-content-extractor's nanoid ids). */
  fingerprintId?: string;
}

/** Stitch per-layer outputs into one EditFingerprint, filling un-extracted layers with honest empties. */
export function assembleEditFingerprint(input: AssembleFingerprintInput): EditFingerprint {
  const fingerprint: EditFingerprint = {
    fingerprintId: input.fingerprintId ?? `efp_${nanoid(12)}`,
    referenceId: input.referenceId,
    version: EDIT_FINGERPRINT_VERSION,
    alignmentFrame: input.alignmentFrame ?? (input.audio.audioAnchored ? 'beat-space' : 'slot-space'),
    durationMs: input.audio.durationMs,

    audio: input.audio,
    decisionStream: input.decisionStream ?? [],
    signalConditionals: input.signalConditionals ?? [],
    structure: input.structure ?? { slots: [] },
    typography: input.typography ?? {},
    performance: input.performance ?? {},
    treatment: input.treatment ?? {},
    copyFormula: input.copyFormula ?? { slots: [] },
    graphics: input.graphics ?? { classes: [] }, // density omitted ⇒ unknown, not a claim

    layerConfidence: input.layerConfidence ?? {},
  };
  if (input.extractedAt) fingerprint.extractedAt = input.extractedAt;
  return fingerprint;
}

/**
 * True when a layer was actually extracted (present in layerConfidence). Distinguishes
 * "looked, found nothing" from "not analyzed yet" — an empty layer alone is ambiguous.
 */
export function isLayerExtracted(fingerprint: EditFingerprint, layer: FingerprintLayer): boolean {
  return layer in fingerprint.layerConfidence;
}
