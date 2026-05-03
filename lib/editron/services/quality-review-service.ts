/**
 * Quality Review Service — Anti-Slop Gate
 *
 * Deterministic checks (zero AI cost) that catch common editing problems.
 * Runs on every project open and after Director Agent execution.
 *
 * Each check has an optional auto-fix action that the UI can trigger.
 */

import { ROW } from '@/lib/pipeline/scene-to-editron';
import type { AssetAnalysis } from './five-track-analysis';
import { PACING_BY_CONTENT_TYPE } from '@/lib/editron/data/creative-doc-rules';

export interface QualityIssue {
  type: IssueType;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  /** Frame range where the issue occurs */
  frameRange?: { start: number; end: number };
  /** Overlay ID involved */
  overlayId?: number;
  /** Suggested fix description */
  suggestedFix?: string;
  /** Whether this can be auto-fixed without user input */
  autoFixable: boolean;
}

export type IssueType =
  | 'timeline_gap'
  | 'text_overlap'
  | 'audio_gap'
  | 'vo_duration_mismatch'
  | 'missing_bgm'
  | 'bgm_no_fade'
  | 'no_captions'
  | 'graphic_too_close_to_cut'
  | 'bgm_not_ducking'
  | 'empty_scene'
  | 'scene_too_short'
  | 'color_inconsistency'
  | 'audio_clipping'
  | 'transition_collision'
  | 'overlapping_overlays'
  | 'caption_timing'
  | 'duration_sanity'
  | 'empty_url'
  | 'sfx_volume_balance'
  | 'transition_count'
  | 'dead_silence'
  | 'bgm_coverage'
  | 'vo_caption_misalign'
  | 'zero_duration'
  | 'low_analysis';

export interface QualityReport {
  /** Overall quality score 0-100 */
  overallScore: number;
  /** All detected issues */
  issues: QualityIssue[];
  /** Issues that can be auto-fixed */
  autoFixable: QualityIssue[];
  /** High-level suggestions */
  suggestions: string[];
  /** Timestamp of analysis */
  analyzedAt: Date;
}

// ─── Overlay Types for Analysis ──────────────────────────────────

interface AnalyzableOverlay {
  id: number;
  type: string;
  from: number;
  durationInFrames: number;
  row: number;
  assetId?: string;
  styles?: any;
  content?: string;
}

// ─── Check Functions ─────────────────────────────────────────────

function checkTimelineGaps(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for gaps between video/image overlays on main visual rows (2, 3)
  const visualOverlays = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .sort((a, b) => a.from - b.from);

  for (let i = 0; i < visualOverlays.length - 1; i++) {
    const current = visualOverlays[i];
    const next = visualOverlays[i + 1];
    const endFrame = current.from + current.durationInFrames;
    const gap = next.from - endFrame;

    if (gap > 3) { // More than 3 frames gap (~100ms)
      issues.push({
        type: 'timeline_gap',
        severity: gap > fps ? 'critical' : 'warning', // >1s is critical
        description: `Gap of ${Math.round(gap / fps * 100) / 100}s between visual overlays`,
        frameRange: { start: endFrame, end: next.from },
        autoFixable: true,
        suggestedFix: 'Extend previous overlay or insert room tone',
      });
    }
  }

  return issues;
}

function checkMissingBGM(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const hasBGM = overlays.some(o => o.type === 'sound' && o.row === ROW.BGM);
  if (!hasBGM) {
    return [{
      type: 'missing_bgm',
      severity: 'warning',
      description: 'No background music found. Videos without BGM feel incomplete.',
      autoFixable: false,
      suggestedFix: 'Generate BGM or add music track',
    }];
  }
  return [];
}

function checkBGMFadeOut(overlays: AnalyzableOverlay[], projectDuration: number): QualityIssue[] {
  const bgm = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
  if (!bgm) return [];

  const bgmEnd = bgm.from + bgm.durationInFrames;
  // If BGM ends within 5 frames of project end, it likely has no fade-out
  if (Math.abs(bgmEnd - projectDuration) < 5) {
    // Check if there's a fade-out configured (via duckingConfig or animation)
    const hasFade = bgm.styles?.animation?.exit === 'fade';
    if (!hasFade) {
      return [{
        type: 'bgm_no_fade',
        severity: 'warning',
        description: 'BGM ends abruptly without fade-out',
        frameRange: { start: bgmEnd - 30, end: bgmEnd },
        overlayId: bgm.id,
        autoFixable: true,
        suggestedFix: 'Apply 1-second fade-out to BGM',
      }];
    }
  }
  return [];
}

function checkMissingCaptions(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const hasVO = overlays.some(o => o.type === 'sound' && o.row === ROW.VOICEOVER);
  const hasCaptions = overlays.some(o => o.type === 'caption' || (o.type === 'text' && o.row === ROW.CAPTIONS));
  if (hasVO && !hasCaptions) {
    return [{
      type: 'no_captions',
      severity: 'info',
      description: 'Voiceover present but no captions. 85%+ of social media videos are watched without sound.',
      autoFixable: false,
      suggestedFix: 'Add captions using AI chat: "add subtitles"',
    }];
  }
  return [];
}

function checkBGMDucking(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const bgm = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
  const hasVO = overlays.some(o => o.type === 'sound' && o.row === ROW.VOICEOVER);
  if (!bgm || !hasVO) return [];

  const duckingConfig = bgm.styles?.duckingConfig;
  if (!duckingConfig?.enabled) {
    return [{
      type: 'bgm_not_ducking',
      severity: 'warning',
      description: 'BGM not ducking under voiceover. Audio will compete and sound unprofessional.',
      overlayId: bgm.id,
      autoFixable: true,
      suggestedFix: 'Enable audio ducking on BGM overlay',
    }];
  }
  return [];
}

function checkSceneTooShort(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videoOverlays = overlays.filter(o => o.type === 'video');

  for (const overlay of videoOverlays) {
    const durationSec = overlay.durationInFrames / fps;
    if (durationSec < 1.5) {
      issues.push({
        type: 'scene_too_short',
        severity: 'warning',
        description: `Video clip is only ${durationSec.toFixed(1)}s — may feel like a flash`,
        frameRange: { start: overlay.from, end: overlay.from + overlay.durationInFrames },
        overlayId: overlay.id,
        autoFixable: false,
        suggestedFix: 'Extend clip or merge with adjacent scene',
      });
    }
  }
  return issues;
}

function checkGraphicTooCloseTocut(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const cuts = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .map(o => o.from)
    .sort((a, b) => a - b);

  const graphics = overlays.filter(o =>
    o.type === 'html-scene' || o.type === 'html-sticker' || o.type === 'sticker',
  );

  for (const graphic of graphics) {
    for (const cutFrame of cuts) {
      const distanceFrames = Math.abs(graphic.from - cutFrame);
      if (distanceFrames > 0 && distanceFrames < 3) {
        issues.push({
          type: 'graphic_too_close_to_cut',
          severity: 'info',
          description: 'Motion graphic enters within 3 frames of a scene cut',
          frameRange: { start: graphic.from, end: graphic.from + 3 },
          overlayId: graphic.id,
          autoFixable: true,
          suggestedFix: 'Delay graphic by 0.5s after the cut',
        });
        break;
      }
    }
  }
  return issues;
}

// ─── New Checks (Fix 7: expand to 20+ deterministic checks) ─────

function checkAudioClipping(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const audioOverlays = overlays.filter(o => o.type === 'sound');
  for (const o of audioOverlays) {
    const vol = (o.styles as any)?.volume ?? (o as any).volume ?? 1;
    if (vol > 1.0) {
      issues.push({ type: 'audio_clipping', severity: 'warning', description: `Audio overlay ${o.id} has volume ${vol} (>1.0 will clip/distort)`, overlayId: o.id, autoFixable: true, suggestedFix: 'Lower volume to 1.0 or below' });
    }
  }
  return issues;
}

function checkTransitionCollision(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const transitions = overlays.filter(o => o.type === 'transition').sort((a, b) => a.from - b.from);
  for (let i = 0; i < transitions.length - 1; i++) {
    const gap = transitions[i + 1].from - (transitions[i].from + transitions[i].durationInFrames);
    if (gap < 15) {
      issues.push({ type: 'transition_collision', severity: 'warning', description: `Two transitions overlap or are within 0.5s of each other at frame ${transitions[i].from}`, frameRange: { start: transitions[i].from, end: transitions[i + 1].from + transitions[i + 1].durationInFrames }, autoFixable: false, suggestedFix: 'Remove one transition or increase gap between them' });
    }
  }
  return issues;
}

function checkOverlappingOverlays(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const visualRows = [ROW.VIDEO];
  for (const row of visualRows) {
    const rowOverlays = overlays.filter(o => o.row === row && o.type !== 'transition').sort((a, b) => a.from - b.from);
    for (let i = 0; i < rowOverlays.length - 1; i++) {
      const endA = rowOverlays[i].from + rowOverlays[i].durationInFrames;
      if (endA > rowOverlays[i + 1].from + 3) {
        issues.push({ type: 'overlapping_overlays', severity: 'warning', description: `Overlays ${rowOverlays[i].id} and ${rowOverlays[i + 1].id} overlap by ${endA - rowOverlays[i + 1].from} frames on row ${row}`, overlayId: rowOverlays[i + 1].id, autoFixable: false, suggestedFix: 'Trim one overlay or adjust start time' });
      }
    }
  }
  return issues;
}

function checkCaptionTiming(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const captions = overlays.filter(o => o.type === 'caption');
  for (const c of captions) {
    const durSec = c.durationInFrames / fps;
    if (durSec < 1) {
      issues.push({ type: 'caption_timing', severity: 'warning', description: `Caption ${c.id} displays for only ${durSec.toFixed(1)}s — too fast to read`, overlayId: c.id, autoFixable: false, suggestedFix: 'Extend caption display time to at least 2 seconds' });
    } else if (durSec > 8) {
      issues.push({ type: 'caption_timing', severity: 'info', description: `Caption ${c.id} displays for ${durSec.toFixed(1)}s — consider splitting into shorter segments`, overlayId: c.id, autoFixable: false, suggestedFix: 'Split long caption into 2-4 second segments' });
    }
  }
  return issues;
}

function checkDurationSanity(totalDuration: number, fps: number): QualityIssue[] {
  const durSec = totalDuration / fps;
  if (durSec < 3) {
    return [{ type: 'duration_sanity', severity: 'critical', description: `Project is only ${durSec.toFixed(1)}s — too short for any platform`, autoFixable: false, suggestedFix: 'Add more content or check if overlays are missing' }];
  }
  if (durSec > 600) {
    return [{ type: 'duration_sanity', severity: 'info', description: `Project is ${Math.round(durSec / 60)} minutes — consider chapter-based rendering`, autoFixable: false, suggestedFix: 'Use chapter rendering for videos over 5 minutes' }];
  }
  return [];
}

function checkEmptyUrls(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const mediaOverlays = overlays.filter(o => o.type === 'video' || o.type === 'image' || o.type === 'sound');
  for (const o of mediaOverlays) {
    const src = (o as any).src || '';
    const assetId = o.assetId || '';
    if (!src && !assetId) {
      issues.push({ type: 'empty_url', severity: 'critical', description: `${o.type} overlay ${o.id} has no src and no assetId — will render as blank/silent`, overlayId: o.id, autoFixable: false, suggestedFix: 'Re-link the asset or remove the empty overlay' });
    }
  }
  return issues;
}

function checkSfxVolumeBalance(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const sfx = overlays.filter(o => o.type === 'sound' && o.row === ROW.SFX);
  for (const s of sfx) {
    const vol = (s.styles as any)?.volume ?? (s as any).volume ?? 0.25;
    if (vol > 0.5) {
      issues.push({ type: 'sfx_volume_balance', severity: 'info', description: `SFX ${s.id} at volume ${vol} — may overpower dialogue/music`, overlayId: s.id, autoFixable: true, suggestedFix: 'Lower SFX volume to 0.2-0.4 range' });
    }
  }
  return issues;
}

function checkTransitionCount(overlays: AnalyzableOverlay[], totalDuration: number, fps: number): QualityIssue[] {
  const transitions = overlays.filter(o => o.type === 'transition');
  const videos = overlays.filter(o => o.type === 'video');
  const durSec = totalDuration / fps;
  if (durSec < 5) return [];
  if (transitions.length === 0 && videos.length > 1) {
    return [{ type: 'transition_count', severity: 'info', description: `No transitions between ${videos.length} clips — all hard cuts`, autoFixable: false, suggestedFix: 'Add dissolve or dip-to-black transitions between scenes' }];
  }
  const transPerSec = transitions.length / durSec;
  if (transPerSec > 0.33) {
    return [{ type: 'transition_count', severity: 'warning', description: `${transitions.length} transitions in ${durSec.toFixed(0)}s (1 every ${(durSec / transitions.length).toFixed(1)}s) — feels overloaded`, autoFixable: false, suggestedFix: 'Remove some transitions — use hard cuts for fast pacing sections' }];
  }
  return [];
}

function checkDeadSilence(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const hasBGM = overlays.some(o => o.type === 'sound' && o.row === ROW.BGM);
  const hasVO = overlays.some(o => o.type === 'sound' && o.row === ROW.VOICEOVER);
  const hasSFX = overlays.some(o => o.type === 'sound' && o.row === ROW.SFX);
  const videoLength = overlays.filter(o => o.type === 'video').reduce((sum, o) => sum + o.durationInFrames, 0) / fps;
  if (!hasBGM && !hasVO && !hasSFX && videoLength > 10) {
    return [{ type: 'dead_silence', severity: 'critical', description: `${videoLength.toFixed(0)}s of video with zero audio — completely silent`, autoFixable: false, suggestedFix: 'Add background music, voiceover, or ambient sound' }];
  }
  return [];
}

function checkBGMCoverage(overlays: AnalyzableOverlay[], totalDuration: number): QualityIssue[] {
  const bgm = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
  if (!bgm || totalDuration <= 0) return [];
  const coverage = bgm.durationInFrames / totalDuration;
  if (coverage < 0.6) {
    return [{ type: 'bgm_coverage', severity: 'warning', description: `BGM covers only ${Math.round(coverage * 100)}% of the video — sections will feel empty`, autoFixable: false, suggestedFix: 'Extend BGM to cover at least 80% of the project' }];
  }
  return [];
}

function checkVOCaptionAlignment(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const vo = overlays.find(o => o.type === 'sound' && o.row === ROW.VOICEOVER);
  const caption = overlays.find(o => o.type === 'caption');
  if (!vo || !caption) return [];
  const drift = Math.abs(caption.from - vo.from) / fps;
  if (drift > 1) {
    return [{ type: 'vo_caption_misalign', severity: 'warning', description: `Captions start ${drift.toFixed(1)}s ${caption.from > vo.from ? 'after' : 'before'} voiceover — looks out of sync`, autoFixable: true, suggestedFix: 'Align caption start to voiceover start frame' }];
  }
  return [];
}

function checkZeroDuration(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const o of overlays) {
    if (o.durationInFrames <= 0) {
      issues.push({ type: 'zero_duration', severity: 'critical', description: `Overlay ${o.id} (${o.type}) has duration ${o.durationInFrames} frames — will crash renderer`, overlayId: o.id, autoFixable: true, suggestedFix: 'Remove this overlay or set a valid duration' });
    }
  }
  return issues;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Run all deterministic quality checks on a project.
 *
 * @param overlays - Project overlays
 * @param fps - Frames per second (default 30)
 * @param projectDuration - Total project duration in frames
 */
export function runQualityReview(
  overlays: AnalyzableOverlay[],
  fps: number = 30,
  projectDuration?: number,
  /** Optional: analysis results map (assetId → AssetAnalysis) */
  analyses?: Map<string, AssetAnalysis>,
  /** Optional: constraint violations from signal-driven executor (Mode 2 Path D) */
  constraintViolations?: Array<{ constraintId: string; constraintName: string; severity: 'blocker' | 'warning' | 'info'; description: string; autoCorrected: boolean; deduction: number }>,
  /** Optional: computed genre parameters (Mode 2 — replaces content-type pacing lookup) */
  genreParameters?: { pacing_tolerance: number; transition_density: number },
): QualityReport {
  const totalDuration = projectDuration || Math.max(...overlays.map(o => o.from + o.durationInFrames), 0);

  const allIssues: QualityIssue[] = [
    // Original 7 checks
    ...checkTimelineGaps(overlays, fps),
    ...checkMissingBGM(overlays),
    ...checkBGMFadeOut(overlays, totalDuration),
    ...checkMissingCaptions(overlays),
    ...checkBGMDucking(overlays),
    ...checkSceneTooShort(overlays, fps),
    ...checkGraphicTooCloseTocut(overlays),
    // Fix 7: 13 new checks (21 total — deterministic, zero AI cost)
    ...checkAudioClipping(overlays),
    ...checkTransitionCollision(overlays),
    ...checkOverlappingOverlays(overlays),
    ...checkCaptionTiming(overlays, fps),
    ...checkDurationSanity(totalDuration, fps),
    ...checkEmptyUrls(overlays),
    ...checkSfxVolumeBalance(overlays),
    ...checkTransitionCount(overlays, totalDuration, fps),
    ...checkDeadSilence(overlays, fps),
    ...checkBGMCoverage(overlays, totalDuration),
    ...checkVOCaptionAlignment(overlays, fps),
    ...checkZeroDuration(overlays),
  ];

  // Check analysis quality — if most assets used fallback data, editing decisions are unreliable
  if (analyses && analyses.size > 0) {
    let fallbackCount = 0;
    let criticalConfidenceFailures = 0;
    const total = analyses.size;

    for (const [_assetId, analysis] of analyses) {
      const quality = analysis.analysisQuality || 'unknown';
      if (quality === 'fallback' || quality === 'low') {
        fallbackCount++;
      }

      // Check for deep slop: near-zero confidence in critical tracks
      if (analysis.confidenceBreakdown) {
        const { vision, speech } = analysis.confidenceBreakdown;
        if (vision < 0.2 || speech < 0.2) {
          criticalConfidenceFailures++;
        }
      }
    }

    if (fallbackCount > total * 0.5) {
      allIssues.push({
        type: 'low_analysis' as any,
        severity: criticalConfidenceFailures > total * 0.3 ? 'critical' : 'warning',
        description: `${fallbackCount}/${total} assets used fallback or low-quality analysis data. AI editing decisions may be unreliable.`,
        autoFixable: false,
        suggestedFix: 'Re-run 5-Track analysis with better video quality or longer timeout',
      });
    }
  }

  // ── Mode 2 raw footage quality checks ──
  // These only fire when rawFootageAnalysis is available (Mode 2 with transcript intelligence).
  // They validate that silence removal, filler handling, and pacing are correct.
  // Passed via the analyses map under a special '__rawFootage' key by the Director.
  const rawFootage = analyses?.get('__rawFootage') as any;
  if (rawFootage?.silenceRemovalPlan) {
    // Check: no long silences remain after removal
    const remainingSilences = (rawFootage.silenceGaps || []).filter((g: any) => {
      const threshold = rawFootage.contentTypeDetection?.silenceThreshold?.removeAboveMs || 1500;
      // Check if this gap was removed by the plan
      const wasRemoved = rawFootage.silenceRemovalPlan.some((a: any) =>
        a.action === 'remove' && a.startMs <= g.startMs && a.endMs >= g.endMs
      );
      return !wasRemoved && g.durationMs > threshold;
    });
    if (remainingSilences.length > 0) {
      allIssues.push({
        type: 'remaining_silence' as any,
        severity: 'warning',
        description: `${remainingSilences.length} silence gap(s) above threshold remain after removal.`,
        autoFixable: false,
        suggestedFix: 'Re-run silence removal or manually trim remaining gaps',
      });
    }

    // Check: pacing consistency — are cuts/min within the expected range?
    // Mode 2 with genre_parameters: use computed transition_density (signal-driven, no content-type labels)
    // Fallback: use PACING_BY_CONTENT_TYPE (v2 legacy for Mode 1)
    if (totalDuration > 0) {
      const videoOverlayCount = overlays.filter(o => o.type === 'video').length;
      const durationMin = (totalDuration / fps) / 60;
      const actualCutsPerMin = durationMin > 0 ? (videoOverlayCount - 1) / durationMin : 0;

      let expectedMin = 4;
      let expectedMax = 12;
      let pacingSource = 'default';

      if (genreParameters) {
        // Signal-computed: transition_density IS the target cuts/min
        expectedMin = genreParameters.transition_density * 0.5;
        expectedMax = genreParameters.transition_density * 1.5;
        pacingSource = 'genre_parameters';
      } else if (rawFootage.contentTypeDetection?.contentType) {
        // Legacy fallback: content-type lookup
        const contentType = rawFootage.contentTypeDetection.contentType;
        const pacingRule = PACING_BY_CONTENT_TYPE[contentType] || PACING_BY_CONTENT_TYPE['talking-head'];
        if (pacingRule) {
          expectedMin = pacingRule.cutsPerMin[0];
          expectedMax = pacingRule.cutsPerMin[1];
          pacingSource = contentType;
        }
      }

      if (actualCutsPerMin < expectedMin * 0.5) {
        allIssues.push({
          type: 'pacing_too_slow' as any,
          severity: 'info',
          description: `Pacing (${actualCutsPerMin.toFixed(1)} cuts/min) is below expected range (${expectedMin.toFixed(0)}-${expectedMax.toFixed(0)}, source: ${pacingSource}).`,
          autoFixable: false,
          suggestedFix: 'Consider more aggressive silence removal or adding B-roll cuts',
        });
      }
    }
  }

  // ── Constraint violations from signal-driven executor (Mode 2 Path D) ──
  // Uncorrectable violations are real quality issues; auto-corrected ones are already fixed.
  if (constraintViolations?.length) {
    for (const cv of constraintViolations) {
      if (cv.autoCorrected) continue; // Already fixed — no penalty
      allIssues.push({
        type: cv.constraintId.includes('accessibility') ? 'audio_clipping' : 'transition_collision' as IssueType,
        severity: cv.severity === 'blocker' ? 'critical' : cv.severity === 'warning' ? 'warning' : 'info',
        description: `[Constraint] ${cv.constraintName}: ${cv.description}`,
        autoFixable: false,
        suggestedFix: `Constraint ${cv.constraintId} violated — manual review needed`,
      });
    }
  }

  // Calculate score: start at 100, deduct per issue
  let score = 100;
  for (const issue of allIssues) {
    if (issue.severity === 'critical') score -= 15;
    else if (issue.severity === 'warning') score -= 5;
    else score -= 1;
  }
  score = Math.max(0, score);

  // Suggestions
  const suggestions: string[] = [];
  if (score < 50) suggestions.push('Multiple issues detected. Consider re-running the Director Agent with a different profile.');
  if (allIssues.some(i => i.type === 'missing_bgm')) suggestions.push('Add background music to make the video feel complete.');
  if (allIssues.some(i => i.type === 'no_captions')) suggestions.push('Add captions — most social media viewers watch without sound.');
  if (rawFootage) suggestions.push(`Content type: ${rawFootage.contentTypeDetection?.contentType || 'unknown'}. Clean duration: ${Math.round((rawFootage.estimatedCleanDurationMs || 0) / 1000)}s.`);

  return {
    overallScore: score,
    issues: allIssues,
    autoFixable: allIssues.filter(i => i.autoFixable),
    suggestions,
    analyzedAt: new Date(),
  };
}
