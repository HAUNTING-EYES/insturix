/**
 * deriveEditDna — the EditFingerprint → EditDNA migration bridge (implements the DeriveEditDna
 * type declared in edit-fingerprint.ts; the doc: "EditDNA's fields become derived aggregates").
 *
 * Once the extractor emits fingerprints, existing EditDNA consumers keep working through this
 * reducer. ADDITIVE: EditDNA and every place that reads it are untouched — flipping the current
 * analyzer to produce fingerprints-then-derive is a separate, coordinated step.
 *
 * Honesty: fields the fingerprint genuinely can't supply (cut pattern, colour temperature,
 * dominantColors, font weight, music genre, hook speed, caption frequency) fall back to the
 * EXISTING EditDNA defaults (reference-content-extractor.ts:109-139) — carried convention, not
 * fabrication. Works on PARTIAL fingerprints: an audio-only one yields musicStyle and defaults elsewhere.
 */

import type { EditDNA } from '@/lib/editron/services/style-transfer-service';
import type { EditFingerprint, FingerprintDecision } from '@/lib/editron/types/edit-fingerprint';

// ⚠️ INVENTED coarse-bucket boundaries — calibration knobs (no CRG node for these categorical splits).
const SAT_LOW = 0.9;
const SAT_HIGH = 1.1;
const CONTRAST_LOW = 0.9;
const CONTRAST_HIGH = 1.1;
const BPM_SLOW = 90;
const BPM_FAST = 130;
const ENERGY_LOW = 0.33;
const ENERGY_HIGH = 0.66;
const CUTS_SLOW = 8; // cuts/minute
const CUTS_FAST = 20;

type DominantTransition = EditDNA['transitions']['dominant'];
type TextAnimation = EditDNA['textStyle']['animation'];

const TRANSITION_MAP: Record<string, DominantTransition> = {
  transition_hard_cut: 'hard_cut',
  transition_soft_cut: 'hard_cut',
  transition_dissolve: 'fade',
  transition_fade_to_black: 'fade',
  transition_flash: 'fade',
  transition_wipe: 'wipe',
  transition_whip_pan: 'slide',
};

const REVEAL_TO_ANIMATION: Record<string, TextAnimation> = {
  fade: 'fade',
  'slide-up': 'slide',
  pop: 'pop',
  typewriter: 'typewriter',
  none: 'none',
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function dominantMappedTransition(cuts: FingerprintDecision[]): DominantTransition | null {
  const counts = new Map<DominantTransition, number>();
  for (const cut of cuts) {
    const mapped = TRANSITION_MAP[cut.family];
    if (mapped) counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
  }
  let best: DominantTransition | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

export function deriveEditDna(fingerprint: EditFingerprint): EditDNA {
  const durationMin = fingerprint.durationMs / 60_000;

  // cutRhythm + transitions from the transition_* decisionStream events.
  const cuts = fingerprint.decisionStream.filter((d) => d.family.startsWith('transition_'));
  const avgCutsPerMinute = durationMin > 0 && cuts.length ? cuts.length / durationMin : 10;
  const avgClipDuration = cuts.length ? fingerprint.durationMs / 1000 / (cuts.length + 1) : 3;
  const dominant = dominantMappedTransition(cuts) ?? 'hard_cut';
  const styledCuts = cuts.filter((d) => (TRANSITION_MAP[d.family] ?? 'hard_cut') !== 'hard_cut').length;
  const transitionFrequency = cuts.length ? Math.round((styledCuts / cuts.length) * 100) : 30;

  // colorGrade from treatment deltas (temperature + dominantColors are not in the fingerprint).
  const treat = fingerprint.treatment;
  const saturation: EditDNA['colorGrade']['saturation'] =
    treat.saturate === undefined ? 'normal' : treat.saturate < SAT_LOW ? 'desaturated' : treat.saturate > SAT_HIGH ? 'high' : 'normal';
  const contrast: EditDNA['colorGrade']['contrast'] =
    treat.contrast === undefined ? 'normal' : treat.contrast < CONTRAST_LOW ? 'low' : treat.contrast > CONTRAST_HIGH ? 'high' : 'normal';

  // musicStyle from the audio layer (genre is not in the fingerprint).
  const bpm = fingerprint.audio.bpm;
  const tempo: EditDNA['musicStyle']['tempo'] = bpm === undefined ? 'medium' : bpm < BPM_SLOW ? 'slow' : bpm > BPM_FAST ? 'fast' : 'medium';
  const energyMean = mean(fingerprint.audio.energyCurve);
  const energyLevel: EditDNA['musicStyle']['energyLevel'] =
    fingerprint.audio.energyCurve.length === 0 ? 'medium' : energyMean < ENERGY_LOW ? 'low' : energyMean > ENERGY_HIGH ? 'high' : 'medium';

  const overall: EditDNA['pacing']['overall'] =
    avgCutsPerMinute < CUTS_SLOW ? 'slow' : avgCutsPerMinute > CUTS_FAST ? 'fast' : 'medium';

  const reveal = fingerprint.typography.reveal;

  return {
    profileId: `style_${fingerprint.fingerprintId}`,
    sourceName: fingerprint.referenceId,
    sourceUrl: undefined,
    cutRhythm: { avgCutsPerMinute, pattern: 'steady', avgClipDuration }, // pattern: not derivable → default
    transitions: { dominant, frequency: transitionFrequency },
    colorGrade: { temperature: 'neutral', saturation, contrast, dominantColors: [] },
    textStyle: {
      fontWeight: 'normal', // not derivable → default
      position: fingerprint.typography.position ?? 'lower_third',
      animation: reveal ? REVEAL_TO_ANIMATION[reveal] ?? 'fade' : 'fade',
      frequency: 'moderate', // caption frequency not derivable → default
    },
    musicStyle: { tempo, genre: 'unknown', energyLevel },
    pacing: { overall, hookSpeed: 'fast', mainSpeed: overall },
    graphicsDensity: fingerprint.graphics.density ?? 'moderate',
  };
}
