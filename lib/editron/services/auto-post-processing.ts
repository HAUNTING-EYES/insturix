/**
 * Auto Post-Processing Pass
 *
 * Runs AFTER the EDL executor applies decisions. Adds professional
 * behaviors automatically that don't need Gemini's judgment — they're
 * standard film editing practice.
 *
 * From Director Knowledge Base:
 * - Z-030: Drift-zoom on ALL static images (non-negotiable, weight 9)
 * - Z-031: NEVER drift-zoom on video with camera motion
 * - Transition-matched SFX (3 options per transition type)
 * - G-100: Screen zone validation
 * - S-020: Freeze-frame under graphic overlays (optional)
 */

import type { AssetAnalysis } from './five-track-analysis';

// ─── Transition SFX Map ──────────────────────────────────────────
// 3 SFX options per transition type, contextually appropriate.
// The executor picks the first available from the project's SFX library,
// or generates via CassetteAI if none cached.

export const TRANSITION_SFX_MAP: Record<string, {
  sfxQueries: string[];
  volume: number;
  timing: 'start' | 'midpoint' | 'end';
  description: string;
}> = {
  'dissolve': {
    sfxQueries: ['soft ambient pad swell', 'gentle crossfade whoosh', 'subtle air transition'],
    volume: 0.10,
    timing: 'midpoint',
    description: 'Dissolves are invisible — SFX should be barely perceptible',
  },
  'film-burn': {
    sfxQueries: ['film projector crackling burn', 'vintage celluloid fire texture', 'analog tape hiss with warmth'],
    volume: 0.20,
    timing: 'start',
    description: 'Matches the organic burning visual with analog audio texture',
  },
  'wipe-left': {
    sfxQueries: ['directional swoosh left to right', 'fast horizontal slide sound', 'clean swipe transition effect'],
    volume: 0.18,
    timing: 'midpoint',
    description: 'Motion-matched directional sound following the wipe',
  },
  'wipe-right': {
    sfxQueries: ['directional swoosh right to left', 'reverse horizontal slide sound', 'clean swipe transition effect'],
    volume: 0.18,
    timing: 'midpoint',
    description: 'Motion-matched directional sound following the wipe',
  },
  'slide-up': {
    sfxQueries: ['upward slide thud', 'vertical push transition sound', 'ascending swoosh with weight'],
    volume: 0.18,
    timing: 'midpoint',
    description: 'Physical upward movement with subtle weight',
  },
  'slide-down': {
    sfxQueries: ['downward drop thud', 'vertical slide transition sound', 'descending swoosh with impact'],
    volume: 0.18,
    timing: 'midpoint',
    description: 'Physical downward movement with landing impact',
  },
  'zoom-punch': {
    sfxQueries: ['deep bass impact hit', 'cinematic punch zoom boom', 'heavy low-end thud impact'],
    volume: 0.30,
    timing: 'midpoint',
    description: 'Energetic bass hit matching the zoom energy spike',
  },
  'flash': {
    sfxQueries: ['bright camera flash snap', 'crisp light burst click', 'sharp electric spark sound'],
    volume: 0.25,
    timing: 'start',
    description: 'Quick bright sound matching the white flash burst',
  },
  'glitch': {
    sfxQueries: ['digital glitch stutter bitcrush', 'electronic data corruption sound', 'cyber glitch distortion effect'],
    volume: 0.22,
    timing: 'start',
    description: 'Digital aesthetic — tech/gaming contexts only',
  },
  'blur-transition': {
    sfxQueries: ['soft lens defocus hum', 'dreamy blur transition pad', 'gentle out of focus ambience'],
    volume: 0.12,
    timing: 'midpoint',
    description: 'Matches the visual defocus with an audio blur',
  },
  'light-leak': {
    sfxQueries: ['gentle ethereal shimmer chime', 'soft lens flare sparkle', 'dreamy light leak ambience'],
    volume: 0.15,
    timing: 'start',
    description: 'Ethereal quality matching the dreamy visual',
  },
  'swish-pan': {
    sfxQueries: ['fast camera whoosh swish pan', 'rapid horizontal air movement', 'quick whip pan swoosh'],
    volume: 0.25,
    timing: 'midpoint',
    description: 'Fast air movement matching camera whip speed',
  },
  'dip-to-black': {
    sfxQueries: ['subtle fade to silence tone', 'gentle room tone fadeout', 'soft low ambient decay'],
    volume: 0.08,
    timing: 'start',
    description: 'Silence IS the transition — barely audible if at all',
  },
  'dip-to-white': {
    sfxQueries: ['bright ascending shimmer', 'ethereal white light rise', 'clean bright transition chime'],
    volume: 0.15,
    timing: 'midpoint',
    description: 'Bright, ascending quality matching the white reveal',
  },
  'iris': {
    sfxQueries: ['circular mechanical iris aperture', 'camera shutter circle close', 'vintage iris wipe mechanism'],
    volume: 0.18,
    timing: 'start',
    description: 'Mechanical quality matching the circular reveal/close',
  },
  'morph': {
    sfxQueries: ['liquid morph transformation sound', 'organic shape shift effect', 'smooth metamorphosis texture'],
    volume: 0.20,
    timing: 'midpoint',
    description: 'Organic, fluid quality matching shape-morphing visual',
  },
  'spin': {
    sfxQueries: ['rapid rotational whoosh spin', 'circular spinning air movement', 'fast rotation transition effect'],
    volume: 0.22,
    timing: 'midpoint',
    description: 'Rotational momentum matching the spin visual',
  },
};

// ─── Auto Post-Processing Functions ──────────────────────────────

/**
 * Z-030: Add drift-zoom to ALL static image overlays
 * Z-031: Skip if video has detected camera motion
 *
 * Weight: 9 (non-negotiable for static images)
 */
export function applyDriftZoom(
  overlays: any[],
  analyses?: Map<string, AssetAnalysis>,
): { modified: number } {
  let modified = 0;

  for (const overlay of overlays) {
    // Skip non-visual overlays
    if (overlay.type !== 'image' && overlay.type !== 'video') continue;

    // Skip very short overlays (< 1s at 30fps)
    if (overlay.durationInFrames < 30) continue;

    // Check if already has scale keyframes
    const hasScaleTrack = (overlay.keyframeTracks || []).some(
      (t: any) => t.property === 'scale',
    );
    if (hasScaleTrack) continue;

    // Z-031: If video, check for existing camera motion
    if (overlay.type === 'video' && analyses) {
      const analysis = analyses.get(overlay.assetId);
      if (analysis) {
        const motion = analysis.motionSegments?.[0];
        if (motion && motion.cameraMotion !== 'static') continue; // Has camera motion, skip
        if (motion && motion.motionIntensity > 0.1) continue; // Detectable movement, skip
      }
    }

    // Apply drift-zoom
    if (!overlay.keyframeTracks) overlay.keyframeTracks = [];

    // Alternate between zoom-in and zoom-out for variety
    const isEvenIndex = overlays.indexOf(overlay) % 2 === 0;
    const startScale = isEvenIndex ? 1.0 : 1.03;
    const endScale = isEvenIndex ? 1.03 : 1.0;

    // Logo/text overlays get minimal drift
    const isLogo = overlay.metadata?.sceneType === 'logo-reveal' ||
      overlay.metadata?.sceneType === 'text-card';
    const driftAmount = isLogo ? 0.01 : 0.03;
    const actualEndScale = isEvenIndex ? 1.0 + driftAmount : 1.0;
    const actualStartScale = isEvenIndex ? 1.0 : 1.0 + driftAmount;

    overlay.keyframeTracks.push({
      property: 'scale',
      keyframes: [
        { frame: 0, value: actualStartScale, easing: 'ease-in-out' },
        { frame: overlay.durationInFrames, value: actualEndScale, easing: 'ease-in-out' },
      ],
    });

    modified++;
  }

  return { modified };
}

/**
 * G-100: Validate screen zone management for all graphic overlays
 *
 * Zones:
 *   ZONE 1 (Top 20%): stat-counters, callout-boxes, keyword-highlights
 *   ZONE 2 (Center 40%): quote-cards, screen-mockups, before-after
 *   ZONE 3 (Bottom 20%): RESERVED for captions and lower-thirds ONLY
 *   ZONE 4 (Left/Right 15%): bullet-lists, icon-pops, arrows
 *   SAFE ZONE: Keep all content within 90% of frame (5% margin all sides)
 */
export function validateScreenZones(
  overlays: any[],
  canvas: { width: number; height: number },
): { violations: string[]; fixed: number } {
  const violations: string[] = [];
  let fixed = 0;

  const safeMarginX = canvas.width * 0.05;
  const safeMarginY = canvas.height * 0.05;
  const zone3Top = canvas.height * 0.80; // Bottom 20%

  for (const overlay of overlays) {
    if (overlay.type !== 'html-scene') continue;
    if (!overlay.metadata?.sourceType?.includes('edl')) continue; // Only check EDL-generated graphics

    const graphicType = overlay.metadata?.graphicType;

    // Safe zone check — keep within 90% of frame
    if (overlay.left < safeMarginX) {
      overlay.left = safeMarginX;
      fixed++;
    }
    if (overlay.top < safeMarginY) {
      overlay.top = safeMarginY;
      fixed++;
    }
    if (overlay.left + overlay.width > canvas.width - safeMarginX) {
      overlay.left = canvas.width - safeMarginX - overlay.width;
      fixed++;
    }
    if (overlay.top + overlay.height > canvas.height - safeMarginY) {
      overlay.top = canvas.height - safeMarginY - overlay.height;
      fixed++;
    }

    // Zone 3 check — only captions and lower-thirds allowed in bottom 20%
    if (overlay.top > zone3Top && graphicType !== 'lower-third') {
      // Check if there are active captions that might overlap
      const hasActiveCaptionsAtFrame = overlays.some(o =>
        o.type === 'caption' &&
        o.from <= overlay.from &&
        (o.from + o.durationInFrames) > overlay.from
      );
      if (hasActiveCaptionsAtFrame) {
        // Move graphic above Zone 3
        overlay.top = Math.min(overlay.top, zone3Top - overlay.height - 10);
        violations.push(`G-100: Moved ${graphicType} out of caption zone at frame ${overlay.from}`);
        fixed++;
      }
    }
  }

  return { violations, fixed };
}

/**
 * Run ALL post-processing passes on a project's overlays.
 * Call this AFTER the EDL executor finishes.
 */
export function runPostProcessing(
  overlays: any[],
  canvas: { width: number; height: number },
  analyses?: Map<string, AssetAnalysis>,
): {
  driftZoomApplied: number;
  zoneViolationsFixed: number;
  totalModified: number;
} {
  // Z-030 + Z-031: Drift zoom
  const driftResult = applyDriftZoom(overlays, analyses);

  // G-100: Screen zones
  const zoneResult = validateScreenZones(overlays, canvas);

  const totalModified = driftResult.modified + zoneResult.fixed;

  if (totalModified > 0) {
    console.log(`[PostProcess] Applied: ${driftResult.modified} drift-zooms, ${zoneResult.fixed} zone fixes`);
    if (zoneResult.violations.length > 0) {
      console.log(`[PostProcess] Zone violations: ${zoneResult.violations.join('; ')}`);
    }
  }

  return {
    driftZoomApplied: driftResult.modified,
    zoneViolationsFixed: zoneResult.fixed,
    totalModified,
  };
}
