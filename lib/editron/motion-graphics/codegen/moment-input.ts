/**
 * MG Codegen — the moment-input assembler (Phase E, the seam's input builder). The seam
 * (edl-executor.applyGraphic) has the licensed fact plus several rich context objects sitting side by side:
 * the placement resolution, the expression authority, the timing, the brand. This fuses them into the ONE
 * validated `MgMomentInput` the codegen prompt + renderer consume.
 *
 * DECOUPLED BY DESIGN (R33): it does NOT import the services/ types (AtomicPlacementResolution,
 * MgExpressionAuthority, AtomicMomentBundle). It declares the MINIMAL structural shapes it reads, and the
 * caller's rich objects satisfy them structurally. So codegen never depends on engine/service internals, and
 * an unrelated field change upstream can't break this — only a rename of a field we actually read would, and
 * that surfaces loudly at the call site (which is correct).
 *
 * It VALIDATES (fails loud on a degenerate window — R18N), NORMALISES (clamps fractions to their declared
 * ranges), DERIVES (screen context from the placement's own main-subject box — one fewer thing to wire), and
 * DEFAULTS honestly (a missing region → 'full-frame' = "no preference", never a fabricated choice — R2N).
 */

import type { Brand } from './kit/brand';
import type { SemanticMgCandidate } from '../engine/semantic-mg-candidates';
import type {
  MgAnchors,
  MgExpressiveness,
  MgMomentInput,
  MgPlacementContext,
  MgRegionBox,
  MgScreenContext,
  MgVisualEvidence,
} from './types';

/** A rectangle in fractions — the caller's placement boxes satisfy this structurally. */
export interface MgBoxSource {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

/** The fields we read from an AtomicPlacementResolution (structural — pass the whole resolution). */
export interface MgPlacementSource {
  candidateRegion?: string;
  requestedRegion?: string;
  placementHints: { avoid: MgBoxSource[]; prefer: MgBoxSource[] };
}

/** The fields we read from an MgExpressionAuthority (structural — pass the whole authority). */
export interface MgExpressionSource {
  qualityTier: 'suppressed' | 'subtle' | 'standard' | 'hero';
  relevanceScore: number;
  typography: { emphasisScale: number };
}

export interface BuildMgMomentInputArgs {
  momentId: string;
  /** The licensed fact (upstream-gated) — the ground truth, passed through untouched. */
  candidate: SemanticMgCandidate;
  /** The brand already mapped to the kit Brand (the caller ran brandToKit). */
  brand: Brand;
  /** The clip window on the timeline. */
  window: { startFrame: number; endFrame: number; fps: number };
  /** The expression authority's tier / relevance / emphasis. */
  expression: MgExpressionSource;
  /** The atomic placement resolution (region + avoid/prefer boxes). */
  placement: MgPlacementSource;
  /** Timing anchors, if the producer computed them. */
  anchors?: MgAnchors;
  /** Canonical edited-canvas footage sampled for multimodal composition. */
  visualEvidence?: MgVisualEvidence;
  /** Bounded editorial direction (context, never an executable instruction). */
  notes?: string;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/** 'suppressed' should have been gated out upstream (allowMotionGraphic=false); if it reaches here, the most
 *  restrained honest treatment is 'subtle' — never crash on it. */
function toTier(tier: MgExpressionSource['qualityTier']): MgExpressiveness['tier'] {
  return tier === 'suppressed' ? 'subtle' : tier;
}

/** Map a placement box to a title-safe MgRegionBox, clamping each fraction to the [0,1] the type declares. */
function toRegionBox(b: MgBoxSource): MgRegionBox {
  return { x: clamp01(b.x), y: clamp01(b.y), width: clamp01(b.width), height: clamp01(b.height), reason: b.reason };
}

/** Derive coarse screen context from the placement's OWN boxes: the main-subject avoid box is the subject;
 *  the strongest prefer box (placementHints.prefer is sorted strongest-first) is the negative space. */
function deriveScreen(placement: MgPlacementSource): MgScreenContext | undefined {
  const subjectBox = placement.placementHints.avoid.find((b) => b.reason === 'main-subject' || b.reason === 'face-attention');
  const room = placement.placementHints.prefer[0];
  const screen: MgScreenContext = {};
  if (subjectBox) {
    screen.subject = { x: clamp01(subjectBox.x), y: clamp01(subjectBox.y), width: clamp01(subjectBox.width), height: clamp01(subjectBox.height) };
  }
  if (room) {
    screen.negativeSpace = { region: placement.candidateRegion ?? 'full-frame', strength: 1 };
  }
  return screen.subject || screen.negativeSpace ? screen : undefined;
}

/**
 * Fuse the seam's rich context into the one validated MgMomentInput. Throws on a degenerate window (a
 * zero/negative-length clip or non-positive fps is a caller bug — fail loud, do not silently "fix" it).
 */
export function buildMgMomentInput(args: BuildMgMomentInputArgs): MgMomentInput {
  const { momentId, candidate, brand, window, expression, placement, anchors, visualEvidence, notes } = args;

  if (!Number.isFinite(window.fps) || window.fps <= 0) {
    throw new Error(`buildMgMomentInput: fps must be positive, got ${window.fps}`);
  }
  if (!Number.isFinite(window.startFrame) || !Number.isFinite(window.endFrame) || window.endFrame <= window.startFrame) {
    throw new Error(`buildMgMomentInput: window must have endFrame > startFrame, got [${window.startFrame}, ${window.endFrame}]`);
  }

  const expressiveness: MgExpressiveness = {
    tier: toTier(expression.qualityTier),
    intensity: clamp01(finiteOr(expression.relevanceScore, 0.5)), // intensity is DEFINED 0..1
    emphasisScale: finiteOr(expression.typography.emphasisScale, 1) > 0 ? finiteOr(expression.typography.emphasisScale, 1) : 1,
  };

  const placementContext: MgPlacementContext = {
    region: placement.candidateRegion ?? placement.requestedRegion ?? 'full-frame',
    avoid: placement.placementHints.avoid.map(toRegionBox),
    prefer: placement.placementHints.prefer.map(toRegionBox),
  };

  const input: MgMomentInput = {
    momentId,
    candidate,
    brand,
    window: { startFrame: window.startFrame, endFrame: window.endFrame, fps: window.fps },
    expressiveness,
    placement: placementContext,
  };

  const screen = deriveScreen(placement);
  if (screen) input.screen = screen;
  if (visualEvidence) input.visualEvidence = visualEvidence;
  if (anchors) input.anchors = anchors;
  const trimmedNotes = notes?.trim();
  if (trimmedNotes) input.notes = trimmedNotes.slice(0, 400);

  return input;
}
