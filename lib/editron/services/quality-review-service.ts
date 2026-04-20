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
  | 'color_inconsistency';

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
): QualityReport {
  const totalDuration = projectDuration || Math.max(...overlays.map(o => o.from + o.durationInFrames), 0);

  const allIssues: QualityIssue[] = [
    ...checkTimelineGaps(overlays, fps),
    ...checkMissingBGM(overlays),
    ...checkBGMFadeOut(overlays, totalDuration),
    ...checkMissingCaptions(overlays),
    ...checkBGMDucking(overlays),
    ...checkSceneTooShort(overlays, fps),
    ...checkGraphicTooCloseTocut(overlays),
  ];

  // Check analysis quality — if most assets used fallback data, editing decisions are unreliable
  if (analyses && analyses.size > 0) {
    let fallbackCount = 0;
    let criticalConfidenceFailures = 0;
    const total = analyses.size;

    for (const [assetId, analysis] of analyses) {
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

  return {
    overallScore: score,
    issues: allIssues,
    autoFixable: allIssues.filter(i => i.autoFixable),
    suggestions,
    analyzedAt: new Date(),
  };
}
