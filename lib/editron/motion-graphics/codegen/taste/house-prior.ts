/**
 * Phase 2 (brief §6.2/§8): the versioned Insturix HOUSE taste prior.
 *
 * Deliberately authored art-direction when the user supplies no MG reference — the system acts as the art
 * director with real, founder-documented conventions, NOT fabricated examples.
 *
 * ⚠ exemplarIds is EMPTY on purpose (brief §6.2): there is no programmatically-importable founder-approved
 * codegen exemplar registry yet — searchable anchors are a §8 house-taste-bank phase. We do not fabricate
 * example assets.
 */
import type { HouseTasteProfile } from './taste-schemas';

export const INSTURIX_HOUSE_TASTE_VERSION = 'insturix-house-v1';

/** Seeded from the Insturix brand kit contract ("warm editorial dark. Heavy tight type, dense,
 *  mid-round gold, grid + glow, snappy.") + the codegen lane's own laws (boxless, meaning-bearing form,
 *  WCAG contrast, restraint-is-craft). */
export const INSTURIX_HOUSE_TASTE: HouseTasteProfile = {
  version: INSTURIX_HOUSE_TASTE_VERSION,
  name: 'Insturix Editorial-Motion House Prior',
  principles: [
    'Every MG encodes the licensed meaning — form is evidence, not decoration; never decorate a claim.',
    'Integrated by default: type lives IN the footage (halo/shade/SceneGrade), not on un-magnetized cards.',
    'One dominant idea per graphic; restraint is craft — a quiet precise graphic beats a loud generic one.',
    'At most one accent per graphic; any text must clear WCAG contrast over real footage.',
    'A graphic must belong beside professional motion design — never look worse than a rival AI tool.',
  ],
  emotionalDefaults: ['curiosity', 'credibility', 'momentum'],
  styleAxes: {
    restraint: 'restrained',
    editoriality: 'editorial',
    geometry: 'geometric',
    dimensionality: 'flat',
    texture: 'clean',
    abstraction: 'literal',
    rhythm: 'speech_synchronised',
    dominantMedium: 'typographic',
    composition: 'stable',
    novelty: 'familiar',
  },
  typographyPrinciples: [
    'Plus Jakarta Sans; heavy tight display for the anchor, lighter support underneath.',
    'Uppercase anchors, tight tracking; one display word plus a deliberately small support line.',
    'Never clip or overflow; mobile-legible over the footage.',
  ],
  colorPrinciples: [
    'Warm editorial dark (bg #0B0B0A, surfaces #16171A/#1E2026) with the gold accent #D4A652 holding the ONE licensed number or keyword.',
    'Muted #9C978C for support; no muddy gradients; no off-palette colour ever.',
  ],
  formPrinciples: [
    'Bars, rules, dots, and plot marks from the kit primitives — quantitative marks must bind real numbers.',
    'Avoid stencil/decorative plates; a panel only with a justified reason.',
  ],
  motionPrinciples: [
    'Snap entrance, settle, ambient float; anchor words land on their speech onset.',
    'Motion develops across intro/build/hold — never static, never decoration-only.',
  ],
  densityPrinciples: [
    'One idea per graphic; 2-4 graphics/min, spaced ≥3s; never bunch.',
  ],
  consistencyAnchors: ['single recurring motif per video', 'one accent colour per video', 'one type voice'],
  prohibitedMotifs: ['muddy gradients', 'plate cards without reason', 'stencil text', 'unlicensed stats', 'generic lower-third template look'],
  exemplarIds: [],
  createdAt: '2026-08-05T00:00:00.000Z',
};

export function houseTastePrior(): HouseTasteProfile {
  return JSON.parse(JSON.stringify(INSTURIX_HOUSE_TASTE)) as HouseTasteProfile;
}
