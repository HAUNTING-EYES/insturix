/**
 * EditFingerprint — the ONE canonical per-exemplar reference format (Master v1.1 §7.2).
 *
 * A fingerprint is what we extract from a SINGLE reference video (an Insturix Trends
 * exemplar, or a user's pasted reference at N=1). It is expressed in Editron's existing
 * signal → decision → atom → token ontology, and it is the input that AGGREGATES into a
 * TrendSpec (lib/thinkforge/schemas/trend-spec.ts): across 3–10 exemplars we compute
 * support + dispersion per (layer, feature) to split invariants from variables.
 *
 * UNIFICATION RULE (§5.2 / doc): this replaces the flat EditDNA/styleParams as the
 * canonical reference record. EditDNA remains as a DERIVED, coarser view — see
 * `DeriveEditDna` below. `extractReferenceAnalysis` will be upgraded to emit an
 * EditFingerprint at N=1 (coordinated with the Editron session).
 *
 * AGGREGATION CONTRACT: every layer surfaces `(layer, feature, value|dist)` triples so
 * the aggregator can emit TrendInvariant/TrendVariable ({layer, feature, value|dist,
 * support}). `FingerprintLayer` is the closed set of `layer` names those triples use.
 *
 * This file is a PURE TYPE CONTRACT — no logic, no thresholds. Extraction, aggregation,
 * validation (zod), and the EditDNA reducer land in later phases behind these types.
 *
 * Reused (type-only) so there is ONE source of truth per concept:
 *   - EditronExecutable            ← lib/shared/capabilities.ts        (decision-family vocabulary)
 *   - MusicBeat / MusicSection     ← ../services/music-analysis-service (Essentia output)
 *   - Caption* atoms               ← ../services/caption-preset-registry (typography axes)
 *   - Trend* copy/align/audio       ← lib/thinkforge/schemas/trend-spec  (the aggregate it feeds)
 *   - EditDNA                       ← ../services/style-transfer-service  (the derived view)
 */

import type { EditronExecutable } from '@/lib/shared/capabilities';
import type { MusicBeat, MusicSection } from '@/lib/editron/services/music-analysis-service';
import type {
  CaptionTextCase,
  CaptionStroke,
  CaptionReveal,
  CaptionEmphasisRole,
  CaptionRoleStyle,
} from '@/lib/editron/services/caption-preset-registry';
import type {
  TrendCopyFormula,
  TrendAlignmentFrame,
  TrendSpecAudioProducerData,
} from '@/lib/thinkforge/schemas/trend-spec';
import type { EditDNA } from '@/lib/editron/services/style-transfer-service';

/** Wire version. Pinned to the TrendSpec version (trend-spec.ts:3) so the pair evolve together. */
export const EDIT_FINGERPRINT_VERSION = 1 as const;
export type EditFingerprintVersion = typeof EDIT_FINGERPRINT_VERSION;

/**
 * The closed set of layer names. TrendInvariant.layer / TrendVariable.layer values are
 * drawn from this set, so per-exemplar fingerprints aggregate into TrendSpec by (layer, feature).
 */
export type FingerprintLayer =
  | 'audio'
  | 'decision'
  | 'signal'
  | 'structure'
  | 'typography'
  | 'performance'
  | 'treatment'
  | 'copy'
  | 'graphics';

/** How a timed event is anchored (§7.2 L2). `tMs` is always the raw wall-clock position. */
export type FingerprintAnchorKind = 'beat' | 'word' | 'none';

export interface FingerprintAnchor {
  kind: FingerprintAnchorKind;
  /** Raw wall-clock position (ms) — always populated, before beat/slot normalization. */
  tMs: number;
  /** Beat index into `audio.beats` when kind === 'beat'. */
  beat?: number;
  /** VO word index into the exemplar transcript when kind === 'word'. */
  word?: number;
}

/** A magnitude distribution — shape-compatible with TrendInvariant.dist for aggregation. */
export interface FingerprintDistribution {
  mean: number;
  sd: number;
}

// ─── Layer 1 — audio ─────────────────────────────────────────────────────────
// Produced by the Audio Intelligence pass (§7.2 L1) on the SEPARATED music stem, so the
// grid is not contaminated by the creator's VO.

/** A speech-viable span (§7.2 rev6) — the slot the user's script VO fills. Drop/peak zones are excluded. */
export interface FingerprintVoiceWindow {
  startMs: number;
  endMs: number;
  /** true when the exemplar's own vocals sat here; false when inferred from low music-stem energy. */
  hadVocals: boolean;
}

export interface FingerprintAudioLayer {
  /** Ledger referenceIds of the separated stems, when stem separation (Demucs-class) ran. */
  stemRefs?: { music?: string; vocals?: string; other?: string };
  /** Recognition output (ACRCloud/AudD). Reuses the TrendSpec producer contract (trackIdentity/soundClass/playOffsetMs). */
  recognition?: TrendSpecAudioProducerData;
  /** catalog-track vs original-sound (recognition confidence × stem dominance); 'unknown' until recognition runs. */
  soundClass: 'catalog-track' | 'original-sound' | 'unknown';
  bpm?: number;
  /** Beat grid in track-time ms (post play-offset). One entry per beat. */
  beats: MusicBeat[];
  /** Drop / high-impact positions (ms). */
  dropsMs: number[];
  /** Section map (verse/chorus/bridge/drop/…), computed on the clean music stem. */
  sections: MusicSection[];
  /** Per-frame energy (0..1) from the clean music stem. */
  energyCurve: number[];
  /** true when the trend is anchored to a musical grid → compare in beat-space (§7.1). */
  audioAnchored: boolean;
  /**
   * Speech-viable spans for the user's VO; drop/chorus peaks excluded.
   * NOTE: sync events ("cut ON the drop") are the `decisionStream` entries whose
   * `anchor.kind === 'beat'` — they are not duplicated here.
   */
  voiceWindows: FingerprintVoiceWindow[];
  durationMs: number;
}

// ─── Layer 2 — decisionStream ────────────────────────────────────────────────

/** One timestamped edit event, keyed by the platform decision-family vocabulary (capabilities.EDITRON_EXECUTABLES). */
export interface FingerprintDecision {
  family: EditronExecutable;
  anchor: FingerprintAnchor;
  /** Family-specific parameters (magnitude, direction, durationMs, …). Shape owned by the family. */
  params: Record<string, number | string | boolean>;
  /** 0..1 detector confidence for this individual event. */
  confidence: number;
}

// ─── Layer 3 — signalConditionals ────────────────────────────────────────────

/**
 * Per family: what triggers it, how often, and the magnitude distribution — e.g.
 * zoom_punch: { trigger: 'word_emphasis ∧ energy_peak', ratePerMin: 4, magnitude: { mean: 1.15, sd: 0.04 } }.
 * `trigger` is grounded against creative-graph signal ids in the extractor phase.
 */
export interface FingerprintSignalConditional {
  family: EditronExecutable;
  trigger: string;
  /** Events per minute for this family in the exemplar. */
  ratePerMin: number;
  /** Distribution of the family's primary magnitude param. */
  magnitude?: FingerprintDistribution;
}

// ─── Layer 4 — structureSkeleton ─────────────────────────────────────────────

/** A named structural slot (hook / promise / payoff / text-reveal / loop-point). */
export interface FingerprintStructureSlot {
  /** e.g. 'hook' | 'promise' | 'payoff' | 'text-reveal' | 'loop-point'. Free string for extensibility. */
  role: string;
  startMs: number;
  endMs: number;
  anchor?: FingerprintAnchor;
}

export interface FingerprintStructure {
  slots: FingerprintStructureSlot[];
  /** Loop point (ms) when the exemplar loops seamlessly. */
  loopPointMs?: number;
}

// ─── Layer 5 — typography / captions ─────────────────────────────────────────
// Preset-AXIS values (NOT a flat style label), reusing the caption registry atoms.

export interface FingerprintTypographyLayer {
  textCase?: CaptionTextCase;
  stroke?: CaptionStroke;
  reveal?: CaptionReveal;
  /** Per-emphasis-role styling observed in the exemplar. */
  roles?: Partial<Record<CaptionEmphasisRole, CaptionRoleStyle>>;
  /** On-screen text position tendency. */
  position?: 'center' | 'lower_third' | 'top' | 'varied';
  /** Words revealed per caption group (cadence). */
  wordsPerGroup?: number;
}

// ─── Layer 6 — blocking / performance ────────────────────────────────────────

/**
 * A model-agnostic shot spec compiled from a performanceScript beat (§7.2 rev6). Per-model
 * enrichers translate it. `@Image1` = subject/avatar, `@Image2..` = prop/product references
 * (the user's product rides as a reference so the model animates THEIR product), `@Audio1` = cloned voice.
 */
export interface FingerprintShotSpec {
  /** Asset/Ledger ref bound to @Image1 (the subject/avatar). */
  avatarImageRef?: string;
  /** Asset/Ledger refs bound to @Image2.. (product/prop references). */
  propRefs?: string[];
  motionPrompt: string;
  cameraPrompt?: string;
  durationBeats: number;
  /** Asset/Ledger ref bound to @Audio1 (cloned-voice track). */
  audioRef?: string;
  /** Locked wardrobe descriptor carried into every shot for cross-shot consistency. */
  wardrobeLock?: string;
}

export interface FingerprintPerformanceLayer {
  /** Shot-scale tendency per structural beat (ecu…ews). */
  shotScales?: Array<'ecu' | 'cu' | 'mcu' | 'ms' | 'ws' | 'ews'>;
  subjectPosition?: 'left' | 'center' | 'right' | 'varied';
  cameraMotion?: 'static' | 'push_in' | 'pull_out' | 'handheld' | 'whip' | 'varied';
  /** The must-copy performance direction (feeds the Shoot Kit + avatar prompts). */
  performanceScript?: string;
  /** Model-agnostic shot specs compiled from the performanceScript beats. */
  shots?: FingerprintShotSpec[];
}

// ─── Layer 7 — treatment ─────────────────────────────────────────────────────
// Grade as TOKEN DELTAS (NOT hex, NOT named presets). Compiles to CSS NUMERIC filter
// functions later (overlay.styles.filter — the socket with no writer today, §5.2.11).

export interface FingerprintTreatmentLayer {
  /** saturate() multiplier, 1 = unchanged. */
  saturate?: number;
  /** contrast() multiplier, 1 = unchanged. */
  contrast?: number;
  /** brightness() multiplier, 1 = unchanged. */
  brightness?: number;
  /** sepia() amount, 0..1. */
  sepia?: number;
  /** hue-rotate() degrees. */
  hueRotateDeg?: number;
  /** perceived grain amount, 0..1. */
  grain?: number;
}

// ─── Layer 9 — graphics / atoms ──────────────────────────────────────────────
// Motion-graphics wire/shape CLASSES + density (Rule 11: classes, never named components).

export interface FingerprintGraphicsLayer {
  /** Structural MG classes observed (e.g. 'kinetic-type', 'data-viz', 'callout', 'wireframe'). */
  classes: string[];
  /** Optional: absent = graphics not analyzed yet (never a default claim). */
  density?: 'heavy' | 'moderate' | 'minimal';
}

// ─── Layer 10 — confidence + evidence ────────────────────────────────────────

export interface FingerprintLayerConfidence {
  /** 0..1 extraction confidence for the layer. */
  confidence: number;
  /** Wall-clock ms of the frames that evidence this layer. */
  evidenceFramesMs?: number[];
  /** Provenance of the producer that built this layer (R4: source + algorithm version). */
  source?: string;
  /** Algorithm/contract version the producer used (e.g. 'editron-r2-measured-evidence-v1'). */
  algorithmVersion?: string;
  /** Coordinate space the layer's values are expressed in (R4): 'beat' | 'slot' | 'wall-clock'. */
  coordinateSpace?: 'beat' | 'slot' | 'wall-clock';
  /** Units the layer's magnitudes use (R4) — e.g. 'ms', 'events-per-minute', 'count'. */
  units?: string;
}

// ─── Top-level fingerprint ───────────────────────────────────────────────────

export interface EditFingerprint {
  fingerprintId: string;
  /** Ledger key of the exemplar this fingerprint was extracted from. */
  referenceId: string;
  version: EditFingerprintVersion;
  /**
   * Declared FIRST (§7.1): audio-anchored trends compare in beat-space, speech/format
   * trends in slot-space. Reuses TrendSpec's alignment vocabulary.
   */
  alignmentFrame: TrendAlignmentFrame;
  durationMs: number;

  // The ten layers (§7.2). Layer 8 (copyFormula) reuses the TrendSpec type directly.
  audio: FingerprintAudioLayer;
  decisionStream: FingerprintDecision[];
  signalConditionals: FingerprintSignalConditional[];
  structure: FingerprintStructure;
  typography: FingerprintTypographyLayer;
  performance: FingerprintPerformanceLayer;
  treatment: FingerprintTreatmentLayer;
  copyFormula: TrendCopyFormula;
  graphics: FingerprintGraphicsLayer;

  /** Layer 10 — per-layer confidence + evidence frames. */
  layerConfidence: Partial<Record<FingerprintLayer, FingerprintLayerConfidence>>;
  /** ISO timestamp; set by the extractor. */
  extractedAt?: string;
}

/**
 * EditDNA is a DERIVED, coarser view of an EditFingerprint (the doc: EditDNA's fields
 * "become derived aggregates"). Rough mapping: cutRhythm ← structure/decisionStream,
 * transitions ← decisionStream, colorGrade ← treatment, textStyle ← typography,
 * musicStyle ← audio, pacing ← structure, graphicsDensity ← graphics.
 *
 * This is the SIGNATURE only; the reducer implementation lands with the aggregation phase.
 */
export type DeriveEditDna = (fingerprint: EditFingerprint) => EditDNA;
