/**
 * MG Codegen — the moment input contract + receipt types. The neutral contract the seam
 * (edl-executor.applyGraphic, currently unbuilt) assembles per moment and hands to the codegen service.
 *
 * ★ Redesigned (2026-07-12) from the type-shaped E0 numeric payload to CONSUME the licensed
 * `SemanticMgCandidate` produced upstream (mg-semantic-fact-extractor → semantic-mg-candidates ledger+gate)
 * plus the moment's context (brand, placement regions, expressiveness, screen). There is NO MG "type" — the
 * component is composed from the licensed FACT + context. Grounding is enforced on both ends: upstream the
 * candidate's `hardGate` licenses only real, evidenced facts; in the prompt the model composes ONLY from the
 * fact and never invents a value.
 */

import type { Brand } from './kit/brand';
import type { SemanticMgCandidate } from '../engine/semantic-mg-candidates';

/** The clip window on the timeline, in frames at `fps`. */
export interface MgWindow {
  startFrame: number;
  endFrame: number;
  fps: number;
}

/** Timing anchors (clip-local frames) the graphic may sync to. */
export interface MgAnchors {
  wordFrames?: number[];
  beatFrames?: number[];
  /** The intended landing beat (clip-local frame), from the producer's timing. */
  landingFrame?: number;
}

/** A rectangle in title-safe fractions (0..1). The seam maps atomic-placement geometry into these. */
export interface MgRegionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

/** Where in the frame the graphic composes — derived from atomic placement (subject-aware). A SOFT prior. */
export interface MgPlacementContext {
  /** Preferred region label (e.g. 'bottom-center', 'full-frame'). */
  region: string;
  /** Regions to keep clear (subject / face / existing text). */
  avoid: MgRegionBox[];
  /** Regions with room (negative space). */
  prefer: MgRegionBox[];
}

/** How expressive vs restrained — derived from mg-expression-authority. NOT a graphic type. */
export interface MgExpressiveness {
  tier: 'subtle' | 'standard' | 'hero';
  /** 0..1 — restrained → bold. */
  intensity: number;
  emphasisScale: number;
}

/** Coarse screen context (soft prior) — where the subject is, where the room is. */
export interface MgScreenContext {
  subject?: { x: number; y: number; width?: number; height?: number };
  negativeSpace?: { region: string; strength: number };
}

/** The full per-moment input: the licensed FACT + its context. No MG type. */
export interface MgMomentInput {
  momentId: string;
  /** The licensed fact to visualize (upstream-gated, evidenced) — the ground truth. */
  candidate: SemanticMgCandidate;
  /** The client's brand, mapped to the kit Brand (Phase A). */
  brand: Brand;
  window: MgWindow;
  anchors?: MgAnchors;
  expressiveness: MgExpressiveness;
  placement: MgPlacementContext;
  screen?: MgScreenContext;
  /** Bounded free-text editorial direction — Layer-2 context, never an executable instruction. */
  notes?: string;
}

/** Forensic receipt for one moment — written at every stage. */
export interface MgReceipt {
  momentId: string;
  promptHash: string;
  attempts: number;
  scans: { passed: boolean; reason?: string }[];
  compiled: boolean;
  compileError?: string;
  judgeScore?: number;
  judgeIssues?: string[];
  outcome: 'generated' | 'declined' | 'fallback';
  /** Reason for a decline or fallback (absent when generated). */
  reason?: string;
}

/** The service result: a validated component, an honest decline (no faithful graphic), or a Law-2 fallback. */
export interface MgGenerateResult {
  status: 'generated' | 'declined' | 'fallback';
  /** The generated component source (only when status === 'generated'). */
  code?: string;
  /** Reason for decline/fallback (absent when generated). */
  reason?: string;
  receipt: MgReceipt;
}
