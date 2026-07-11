/**
 * MG Codegen — the moment input contract + receipt types (E0 Phase C). §4 of the spec, scoped to E0
 * (M3 numeric/data moments, no external assets). This is the neutral contract Editron assembles per hero
 * moment and hands to the codegen service.
 */

import type { Brand } from './kit/brand';

/** E0 = M3 (data/type). M1 (trend-copy) + M2 (concept scenes) are E1/E2. */
export type MgMode = 'M3';

/** The license that permits codegen for this moment. E0: a numeric/data fact (encoding-wire licensed). */
export interface MgLicense {
  kind: 'numeric';
  /** Where the license came from (e.g. the transcript sentence / encoding-wire id) — provenance. */
  source: string;
  claimStrength?: 'hedged' | 'assertive';
}

/** The clip window in the SOURCE video, in frames at `fps`. */
export interface MgWindow {
  startFrame: number;
  endFrame: number;
  fps: number;
}

/** Timing anchors (frames relative to the clip start) the graphic syncs to. */
export interface MgAnchors {
  /** Word onset frames (from transcription.words, remapped to clip-local frames). */
  wordFrames?: number[];
  /** Beat frames (from the audio beat grid). */
  beatFrames?: number[];
}

/** The data the moment visualizes (verbatim-protected where applicable). */
export interface MgContentPayload {
  /** The primary number (the stat). */
  value?: number;
  /** Unit shown after the value: '' | '%' | '×' | '+' | 'x'. */
  suffix?: string;
  /** A short context label (≤8 words). */
  label?: string;
  /** For comparisons: the two (or more) quantities and their labels. */
  comparison?: { label: string; value: number }[];
  /** A kinetic-type phrase, when the moment is a statement rather than a lone number. */
  phrase?: string;
  /** The word to accent (must appear in `phrase`/`label`). */
  accentWord?: string;
}

/** The full per-moment input (§4), E0 subset. */
export interface MgMomentInput {
  momentId: string;
  mode: MgMode;
  license: MgLicense;
  window: MgWindow;
  anchors: MgAnchors;
  /** The client's brand, already mapped to the kit Brand (Phase A). */
  brand: Brand;
  contentPayload: MgContentPayload;
  budgetRemaining?: number;
}

/** Forensic receipt for one moment — written at every stage (§7 discipline). */
export interface MgReceipt {
  momentId: string;
  /** hash(mode, license, payload, tokens, anchors, kitVersion) — the cache key (§7). */
  promptHash: string;
  attempts: number;
  /** Per-attempt scan outcomes (the reason on failure). */
  scans: { passed: boolean; reason?: string }[];
  compiled: boolean;
  compileError?: string;
  judgeScore?: number;
  judgeIssues?: string[];
  outcome: 'generated' | 'fallback';
  fallbackReason?: string;
}

/** The service result: a validated component, or a signal to place the Tier-A engine form (Law 2). */
export interface MgGenerateResult {
  status: 'generated' | 'fallback';
  /** The generated component source (only when status === 'generated'). */
  code?: string;
  fallbackReason?: string;
  receipt: MgReceipt;
}
