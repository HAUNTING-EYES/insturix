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
  /** AssetIds whose zoom was budget-rejected — don't re-add zoom via drift-zoom */
  budgetRejectedZoomAssetIds?: Set<string>,
): { modified: number; skippedBudget: number } {
  let modified = 0;
  let skippedBudget = 0;

  for (const overlay of overlays) {
    // Skip non-visual overlays
    if (overlay.type !== 'image' && overlay.type !== 'video') continue;

    // OLD: If EDL budget rejected a zoom, drift-zoom re-added one anyway.
    // NEW: Respect budget decisions — if the budget said "no zoom", don't drift-zoom either.
    if (budgetRejectedZoomAssetIds?.has(overlay.assetId)) {
      skippedBudget++;
      continue;
    }

    // Skip very short overlays (< 1s at 30fps)
    if (overlay.durationInFrames < 30) continue;

    // Check if already has scale keyframes
    const hasScaleTrack = (overlay.keyframeTracks || []).some(
      (t: any) => t.property === 'scale',
    );
    if (hasScaleTrack) continue;

    // Z-031: If video, check for existing camera motion
    // BUT: only trust motion data if analysis quality is real (not fallback).
    // Fallback data has hardcoded motionIntensity=0.3 which would wrongly skip drift-zoom.
    if (overlay.type === 'video' && analyses) {
      const analysis = analyses.get(overlay.assetId);
      if (analysis) {
        const quality = (analysis as any).analysisQuality || 'unknown';
        // Only skip drift-zoom based on motion if we have REAL analysis data
        if (quality === 'high' || quality === 'medium') {
          const motion = analysis.motionSegments?.[0];
          if (motion && motion.cameraMotion !== 'static') continue;
          if (motion && motion.motionIntensity > 0.1) continue;
        }
        // For fallback/low quality: always apply drift-zoom (safe default for unanalyzed clips)
      }
    }

    // Skip drift-zoom for content types where motion is noise, not cinematic:
    // screenshots, charts, infographics, data visuals, UI recordings, diagrams
    const visualDesc = (overlay.metadata?.visualDescription || overlay.metadata?.subShotDescription || '').toLowerCase();
    const skipKeywords = /\b(screenshot|screen recording|screencast|chart|graph|diagram|infographic|data visual|dashboard|ui |code editor|terminal|spreadsheet|table of|flowchart)\b/i;
    if (skipKeywords.test(visualDesc)) continue;

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

  return { modified, skippedBudget };
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

  const isPortrait = canvas.height > canvas.width;
  // Portrait videos need wider safe margins (content closer to edges on phones)
  const safeMarginX = canvas.width * (isPortrait ? 0.06 : 0.05);
  const safeMarginY = canvas.height * (isPortrait ? 0.04 : 0.05);
  // Caption zone adjusts for portrait (captions are higher on vertical screens)
  const zone3Top = canvas.height * (isPortrait ? 0.82 : 0.80);

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
 * S-020: Apply freeze-frame under graphic overlays
 *
 * When a graphic (stat-counter, keyword-highlight, etc.) is placed on a video,
 * freeze the video frame for the graphic's duration so the viewer can read both.
 * This is the Hormozi signature: freeze → graphic animates → hold → unfreeze.
 *
 * Only applies to graphics on top of video overlays, NOT on static images.
 */
export function applyFreezeFrameUnderGraphics(
  overlays: any[],
  canvas: { width: number; height: number } = { width: 1920, height: 1080 },
): { modified: number; skippedTiny: number } {
  let modified = 0;
  let skippedTiny = 0;

  const graphicOverlays = overlays.filter(o =>
    o.type === 'html-scene' && o.metadata?.sourceType?.includes('edl')
  );
  const videoOverlays = overlays.filter(o => o.type === 'video');

  // Minimum graphic area to justify a freeze-frame (5% of canvas).
  // OLD: No size check — a 312x56px corner text froze the entire 4s video.
  // NEW: Skip tiny graphics that don't need a video freeze for readability.
  const canvasArea = canvas.width * canvas.height;
  const MIN_AREA_RATIO = 0.05;

  for (const graphic of graphicOverlays) {
    const graphicType = graphic.metadata?.graphicType;
    // Freeze for graphic types that need readability — viewer must read text while video pauses.
    if (!['stat-counter', 'keyword-highlight', 'quote-card', 'bullet-list', 'logo-reveal', 'emphasis-text'].includes(graphicType)) continue;

    // Skip tiny graphics — don't freeze entire video for a small corner callout
    const graphicArea = (graphic.width || 0) * (graphic.height || 0);
    if (graphicArea > 0 && (graphicArea / canvasArea) < MIN_AREA_RATIO) {
      skippedTiny++;
      continue;
    }

    // Find the video overlay under this graphic
    const video = videoOverlays.find((v: any) =>
      v.from <= graphic.from && (v.from + v.durationInFrames) > graphic.from
    );
    if (!video) continue;

    // Check if video already has a speed curve (don't override existing speed ramps)
    if (video.speedCurve && video.speedCurve.length > 0) continue;

    // Research-backed readTime: ~250ms/word (Murch/Dancyger), minimum 1s, maximum 4s.
    // OLD: Used graphic.durationInFrames (whatever EDL set, often too long).
    // NEW: Calculate freeze duration from text content length.
    const textContent = (graphic.content || '').replace(/<[^>]*>/g, '').trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const readTimeMs = Math.max(1000, Math.min(4000, wordCount * 250));
    const readTimeFrames = Math.round(readTimeMs / (1000 / 30)); // Convert to frames at 30fps

    const relStart = graphic.from - video.from;
    const relEnd = relStart + Math.min(readTimeFrames, graphic.durationInFrames || 60);

    video.speedCurve = [
      { frame: Math.max(0, relStart - 5), value: 1.0, easing: 'ease-in' },
      { frame: relStart, value: 0.05, easing: 'ease-in' }, // Near-freeze (0.05x, not 0x to avoid Remotion issues)
      { frame: relEnd, value: 0.05, easing: 'ease-out' },
      { frame: Math.min(video.durationInFrames, relEnd + 5), value: 1.0, easing: 'ease-out' },
    ];

    modified++;
  }

  return { modified, skippedTiny };
}

/**
 * P-010: Validate scene duration variety
 *
 * Never have 3 consecutive scenes of the same duration (±0.5s).
 * Adjust the third scene to be at least 1.0s different.
 */
export function validateDurationVariety(
  overlays: any[],
  fps: number = 30,
): { adjusted: number } {
  let adjusted = 0;
  const videoOverlays = overlays
    .filter(o => o.type === 'video')
    .sort((a, b) => a.from - b.from);

  for (let i = 2; i < videoOverlays.length; i++) {
    // Skip montage sub-shots — they have intentionally uniform duration (Eisenstein's metric montage).
    // Forced variety on a montage breaks the rhythmic pattern the editor intended.
    const isMontage = videoOverlays[i].metadata?.isMontageSub
      || videoOverlays[i - 1].metadata?.isMontageSub
      || videoOverlays[i - 2].metadata?.isMontageSub;
    if (isMontage) continue;

    // Skip clips with script-set pacing — edit-direction-applier already adjusted these.
    // Overriding script intent with auto-variety breaks the user's creative direction.
    const hasScriptPacing = videoOverlays[i].metadata?.scriptPacing
      || videoOverlays[i].metadata?.editDirectionApplied;
    if (hasScriptPacing) continue;

    const durA = videoOverlays[i - 2].durationInFrames / fps;
    const durB = videoOverlays[i - 1].durationInFrames / fps;
    const durC = videoOverlays[i].durationInFrames / fps;

    // Check if all three are within 0.5s of each other
    if (Math.abs(durA - durB) < 0.5 && Math.abs(durB - durC) < 0.5) {
      // OLD: Changed clip duration without checking voiceover alignment.
      // NEW: Skip if a voiceover overlay extends beyond the new shorter duration.
      // Voiceover is on row 3 (ROW.VOICEOVER). If VO runs longer than the new clip
      // duration, the viewer hears scene N's narration over scene N+1's video.
      const clipStart = videoOverlays[i].from;
      const clipEnd = clipStart + videoOverlays[i].durationInFrames;
      const voiceover = overlays.find((o: any) =>
        (o.type === 'sound' && o.row === 3) &&
        o.from >= clipStart && o.from < clipEnd
      );

      // Adjust C to be at least 1.0s different
      const targetDur = durB > 3 ? durB - 1.5 : durB + 1.5;
      const newFrames = Math.round(targetDur * fps);

      // Don't shorten clip if voiceover extends beyond new end
      if (voiceover) {
        const voEnd = voiceover.from + (voiceover.durationInFrames || 0);
        const newClipEnd = clipStart + newFrames;
        if (newClipEnd < voEnd) {
          // Shortening would desync voiceover — skip this adjustment
          continue;
        }
      }

      if (newFrames > 30 && newFrames < 300) { // 1s-10s bounds
        videoOverlays[i].durationInFrames = newFrames;
        adjusted++;
      }
    }
  }

  return { adjusted };
}

/**
 * Run ALL post-processing passes on a project's overlays.
 * Call this AFTER the EDL executor finishes.
 */
export function runPostProcessing(
  overlays: any[],
  canvas: { width: number; height: number },
  analyses?: Map<string, AssetAnalysis>,
  /** AssetIds whose zoom was budget-rejected by EDL — drift-zoom skips these */
  budgetRejectedZoomAssetIds?: Set<string>,
): {
  driftZoomApplied: number;
  zoneViolationsFixed: number;
  freezeFramesApplied: number;
  durationAdjusted: number;
  totalModified: number;
} {
  // Z-030 + Z-031: Drift zoom on static images (respects budget rejections)
  const driftResult = applyDriftZoom(overlays, analyses, budgetRejectedZoomAssetIds);

  // G-100: Screen zone validation
  const zoneResult = validateScreenZones(overlays, canvas);

  // S-020: Freeze-frame under graphic overlays (Hormozi signature, skips tiny graphics)
  const freezeResult = applyFreezeFrameUnderGraphics(overlays, canvas);

  // P-010: Duration variety (no 3 consecutive same-duration scenes, respects voiceover)
  const durationResult = validateDurationVariety(overlays);

  const totalModified = driftResult.modified + zoneResult.fixed + freezeResult.modified + durationResult.adjusted;

  if (totalModified > 0) {
    console.log(`[PostProcess] Applied: ${driftResult.modified} drift-zooms (${driftResult.skippedBudget} budget-skipped), ${zoneResult.fixed} zone fixes, ${freezeResult.modified} freeze-frames (${freezeResult.skippedTiny} tiny-skipped), ${durationResult.adjusted} duration adjustments`);
    if (zoneResult.violations.length > 0) {
      console.log(`[PostProcess] Zone violations: ${zoneResult.violations.join('; ')}`);
    }
  }

  return {
    driftZoomApplied: driftResult.modified,
    zoneViolationsFixed: zoneResult.fixed,
    freezeFramesApplied: freezeResult.modified,
    durationAdjusted: durationResult.adjusted,
    totalModified,
  };
}
