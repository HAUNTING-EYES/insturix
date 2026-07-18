/**
 * MG Codegen — the MOTION INTENSITY token (founder correction, 2026-07-19).
 *
 * "How ALIVE a graphic is" is NOT a global constant — it is brand × video × user, exactly like the density
 * budget's "how much MG". This module is the deterministic resolver: a pure function from {brand motion energy,
 * this video's energy, the user's motionGraphics intensity dial} to a single liveness scalar the coder binds for
 * every ambient hold + entrance. Same inputs → same intensity, always — no model call, throws loud on malformed
 * input (R18N).
 *
 * WHY A FLOOR, NOT A GLOBAL AMOUNT (the calibration, 2026-07-18): a truly frozen render is broken for ANY brand
 * (that stays the global broken-floor in mg-placement-gate). But the AMOUNT of life above "not broken" is
 * identity: a luxury brand on a somber testimonial breathes subtly; a hype brand on a promo punches. The failing
 * P4 renders used a hardcoded ambient strength 0.5 (ignoring all three signals) and read near-dead. Measured:
 * ambient strength ~0.7 + a real entrance clears the broken-floor; 1.0 is punchy. So intensity spans [0.7, 1.0]
 * — always subtly alive, never a global bump.
 *
 * Every number is derived (Rule 31):
 * - MIN_LIVENESS 0.7            ← calibration (calibrate-motion 2026-07-18): ambient strength ≥ ~0.7 with an
 *                                 entrance clears the broken-floor; below it a calm hold risks reading frozen
 * - signal weights .45/.35/.20  ← derived taste: brand motion personality is the primary identity, the specific
 *                                 video's energy modulates, the user's dial fine-tunes; bounded, calibrated
 *                                 downstream by the frame-armed judge + founder eyeball
 * - neutral defaults 0.5        ← absent video energy / user dial = neutral prior (no signal ⇒ no push)
 */

import type { EditorialFamilyPreference } from '../../../production-brief/editorial-preferences';

export interface MgMotionIntensityInput {
  /** Brand.motion.energy, 0..1 (finite) — the brand's motion personality (primary identity signal). */
  brandMotionEnergy: number;
  /** This video's resolved energy signal, 0..1 (finite; absent ⇒ pass undefined for the 0.5 neutral prior). */
  videoEnergy?: number;
  /** The project's motionGraphics family preference; absent/undefined ⇒ neutral (no user push). */
  preference?: EditorialFamilyPreference | null;
}

export interface MgMotionIntensity {
  /** Liveness scalar in [MIN_LIVENESS, 1] — the coder binds this as the ambient hold strength + entrance scale.
   *  Always ≥ MIN_LIVENESS so no graphic reads frozen; identity lives in the amount above that. */
  intensity: number;
  /** Deterministic receipt of the derivation — logged and handed to the coder. */
  rationale: string;
}

export const MIN_MG_LIVENESS = 0.7; // always-subtly-alive floor ← calibration (header)
const W_BRAND = 0.45;
const W_VIDEO = 0.35;
const W_USER = 0.2;
const NEUTRAL = 0.5; // absent video/user signal ⇒ neutral prior

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function assertFiniteIn01(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`motion-intensity: ${name} must be a finite number, got ${String(value)}`);
  }
}

export function computeMgMotionIntensity(input: MgMotionIntensityInput): MgMotionIntensity {
  assertFiniteIn01('brandMotionEnergy', input.brandMotionEnergy);
  const brand = clamp(input.brandMotionEnergy, 0, 1);

  let video = NEUTRAL;
  if (input.videoEnergy !== undefined) {
    assertFiniteIn01('videoEnergy', input.videoEnergy);
    video = clamp(input.videoEnergy, 0, 1);
  }

  const pref = input.preference ?? undefined;
  let user = NEUTRAL;
  if (pref?.intensity !== undefined) {
    assertFiniteIn01('preference.intensity', pref.intensity);
    user = clamp(pref.intensity, 0, 1);
  }

  const energyMix = clamp(W_BRAND * brand + W_VIDEO * video + W_USER * user, 0, 1);
  const intensity = clamp(MIN_MG_LIVENESS + (1 - MIN_MG_LIVENESS) * energyMix, MIN_MG_LIVENESS, 1);

  return {
    intensity,
    rationale: `brand ${brand.toFixed(2)}×${W_BRAND} + video ${video.toFixed(2)}×${W_VIDEO} + user ${user.toFixed(2)}×${W_USER} = mix ${energyMix.toFixed(2)} → ${MIN_MG_LIVENESS} + ${(1 - MIN_MG_LIVENESS).toFixed(1)}×mix → intensity ${intensity.toFixed(3)}`,
  };
}
