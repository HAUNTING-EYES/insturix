/**
 * S1 — SFX selection evidence (editron-sfx-s1).
 *
 * Populates the SELECTOR's existing surface/direction/motionSpeed/material
 * fields from realized transition / motion-graphic evidence without changing
 * role eligibility, score weights, semantic behavior, silence, or provider
 * policy. The selector already accepts and scores these fields
 * (lib/pipeline/sfx-catalog.ts::SfxCatalogSelectionRequest,
 * scoreCatalogEntry); the gap is that callers never supply them.
 *
 * ANTI-FABRICATION RULES (plan §7.2/§7.3):
 *   - surface: only from a real surface (transition | motion-graphic |
 *     ui | scene | logo | caption | chapter). Never guessed from the query.
 *   - direction: left/right/up/down/in/out ONLY when the realized visual
 *     evidence genuinely carries it (transition form label/axis, wipe key,
 *     MG motion vector). Otherwise ABSENT — never neutral-by-invention when
 *     unknown, and never label a neutral audio asset as directional.
 *   - motionSpeed: quantized to still/slow/medium/fast by ONE documented
 *     helper from realized duration/velocity when present. A normalized
 *     magnitude is NOT pixel distance and never fabricates px. A static
 *     crop or static mask produces NO motion speed.
 *   - material: only when explicit visual/content evidence or a human cue
 *     provides it (paper, cloth, glass, metal, wood, air, digital,
 *     environmental, ...). Weak evidence -> absent.
 *
 * All values are reported with their evidence keys and a single confidence,
 * so the selection report can prove where every value came from.
 */

import type { SfxCatalogDirection, SfxCatalogEntry, SfxCatalogSurface } from './sfx-catalog';

export const SFX_SELECTION_EVIDENCE_VERSION = 'sfx-selection-evidence-v1' as const;

export type SfxSelectionMotionSpeed = 'still' | 'slow' | 'medium' | 'fast';

export interface SfxSelectionEvidenceV1 {
  surface?: SfxCatalogSurface;
  direction?: SfxCatalogDirection;
  motionSpeed?: SfxSelectionMotionSpeed;
  material?: string;
  /** Producer keys that the values were derived from (receipt atoms, form fields). */
  evidenceKeys: string[];
  /** Single confidence for the whole derivation (0..1). ⚠️ INVENTED default 0.8. */
  confidence: number;
}

/** Realized visual evidence the helper reads. All optional; absent -> absent outputs. */
export interface SfxEvidenceSource {
  surface?: SfxCatalogSurface;
  /** Transition form direction label when the transition genuinely has one. */
  transitionDirectionLabel?: AtomicDirectionLabel;
  /** MG / wipe motion vector, when genuinely measured. */
  motion?: {
    /** Signed x (px/frame or normalized). 0/absent -> no x direction. */
    x?: number;
    /** Signed y. */
    y?: number;
    /** Magnitude (speed proxy). Direction only; never scaled into px. */
    magnitude?: number;
    axis?: 'x' | 'y' | 'none';
  };
  /** Realized duration (ms) for motion-speed quantization. */
  durationMs?: number;
  /** Distance moved (px) when measured in real pixels. */
  distancePx?: number;
  /** Explicit material evidence (paper, glass, ...) or human cue. */
  material?: string;
  /** Producer receipt keys to record. */
  receiptKeys?: string[];
}

type AtomicDirectionLabel = 'left' | 'right' | 'up' | 'down' | 'center';

/** One documented quantizer for motion speed. ⚠️ thresholds INVENTED — calibrate in S2. */
export function quantizeMotionSpeed(
  durationMs: number,
  distancePx: number | undefined,
): SfxSelectionMotionSpeed | undefined {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  // Distance is only trustworthy when measured in real pixels. A normalized
  // magnitude is NOT pixel evidence — do not scale it into fake px.
  if (typeof distancePx === 'number' && Number.isFinite(distancePx) && distancePx > 0) {
    const velocity = (distancePx / durationMs) * 1000;
    if (velocity >= 600) return 'fast';
    if (velocity >= 220) return 'medium';
    if (velocity >= 40) return 'slow';
    return 'still';
  }
  // Duration-only bucket (120ms whip-pan is fast; 500ms whoosh medium-ish -> slow per
  // current documented split; 2s is still-flavored). Calibration in S2.
  if (durationMs <= 160) return 'fast';
  if (durationMs <= 420) return 'medium';
  if (durationMs <= 1200) return 'slow';
  return 'still';
}

const DIRECTION_LABEL_TO_CATALOG: Record<AtomicDirectionLabel, SfxCatalogDirection | undefined> = {
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
  center: undefined, // center is NOT a catalog direction — no fabrication
};

/** Pure derivation: realized evidence -> S1 selection evidence, absent when unknown. */
export function deriveSfxSelectionEvidence(source: SfxEvidenceSource = {}): SfxSelectionEvidenceV1 {
  const evidenceKeys = [...(source.receiptKeys ?? [])];
  const out: SfxSelectionEvidenceV1 = {
    evidenceKeys,
    confidence: 0.8,
  };

  if (source.surface) {
    out.surface = source.surface;
    evidenceKeys.push('surface');
  }

  // Direction — only genuine realized direction.
  if (source.transitionDirectionLabel && source.transitionDirectionLabel !== 'center') {
    const mapped = DIRECTION_LABEL_TO_CATALOG[source.transitionDirectionLabel];
    if (mapped) {
      out.direction = mapped;
      evidenceKeys.push(`transition-direction:${source.transitionDirectionLabel}`);
    }
  } else if (source.motion?.axis === 'x' || source.motion?.axis === 'y') {
    const { x = 0, y = 0, magnitude = 0 } = source.motion;
    // A real signed motion vector with meaningful magnitude yields a direction.
    if (magnitude >= 0.3) {
      if (source.motion.axis === 'x') out.direction = x >= 0 ? 'right' : 'left';
      else out.direction = y >= 0 ? 'down' : 'up';
      evidenceKeys.push('motion-vector');
    }
  }
  // Absent direction stays absent (neutral audio must not be relabeled).

  // Motion speed — only when motion is real (static crop/mask -> none).
  // A normalized magnitude is NOT pixel distance: it never fabricates px, so
  // when only magnitude exists we fall back to duration-only quantization.
  const hasRealMotion = Boolean(source.motion) || (Number.isFinite(source.distancePx) && (source.distancePx ?? 0) > 0);
  if (hasRealMotion) {
    const distancePx = typeof source.distancePx === 'number' && Number.isFinite(source.distancePx)
      ? source.distancePx
      : undefined;
    const speed = quantizeMotionSpeed(source.durationMs ?? 0, distancePx);
    if (speed) {
      out.motionSpeed = speed;
      evidenceKeys.push('motion-speed');
    }
  }

  if (source.material) {
    const material = source.material.trim().toLowerCase();
    if (material.length > 0) {
      out.material = material;
      evidenceKeys.push('material');
    }
  }

  return out;
}