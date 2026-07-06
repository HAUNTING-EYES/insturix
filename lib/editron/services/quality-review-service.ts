/**
 * Quality Review Service — Anti-Slop Gate
 *
 * Deterministic checks (zero AI cost) that catch common editing problems.
 * Runs on every project open and after Director Agent execution.
 *
 * Each check has an optional auto-fix action that the UI can trigger.
 */

import { ROW } from '@/lib/pipeline/scene-to-editron';
import { getNativeAudioDuckRegions } from './native-audio-evidence';
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
  | 'low_analysis'
  | 'transition_repetition'
  | 'filter_mismatch'
  | 'pacing_inconsistency'
  | 'jump_cut'
  | 'audio_level_spike'
  | 'caption_reading_speed'
  | 'orphan_sfx'
  | 'transition_during_speech'
  | 'missing_transition_sfx'
  | 'narration_sync_drift'
  | 'graphic_occlusion'
  | 'abrupt_start'
  | 'abrupt_end'
  | 'clip_too_long'
  | 'repetitive_zoom'
  | 'empty_timeline_section'
  | 'audio_extends_beyond_video'
  | 'silent_beginning'
  | 'silent_ending'
  | 'excessive_graphics'
  | 'duplicate_adjacent_transition'
  | 'fade_to_black_overuse'
  | 'subtitle_gap'
  | 'visual_monotony'
  | 'remaining_silence'
  | 'pacing_too_slow'
  | 'clip_order_mismatch'
  | 'aspect_ratio_mismatch'
  | 'pacing_monotony'
  | 'graphic_too_small'
  | 'caption_spans_cut'
  | 'visual_clutter'
  | 'transition_overuse';

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

const QUALITY_WARNING_TYPE_CAP = 5; // INVENTED-needs-calibration: one warning type should not dominate long edits.
const QUALITY_CRITICAL_TYPE_CAP = 15; // INVENTED-needs-calibration: one critical type remains visibly costly.
const GRAPH_SYNC_TIER_A_TOLERANCE_MS = 40; // CRG audioRules.syncTiers.tierA_percussive.toleranceMs
const GRAPH_SYNC_TIER_B_TOLERANCE_MS = 120; // CRG audioRules.syncTiers.tierB_word_anchored.toleranceMs
// ─── Overlay Types for Analysis ──────────────────────────────────

interface AnalyzableOverlay {
  id: number;
  type: string;
  from: number;
  durationInFrames: number;
  row: number;
  assetId?: string;
  styles?: any;
  content?: unknown;
  metadata?: any;
}

interface CaptionVisibleSpan {
  overlayId: number;
  startFrame: number;
  endFrame: number;
  text: string;
  source: 'caption-group' | 'overlay';
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function captionVisibleSpans(caption: AnalyzableOverlay, fps: number): CaptionVisibleSpan[] {
  const groups: Record<string, any>[] = Array.isArray((caption as any).captions)
    ? (caption as any).captions.filter(isPlainRecord)
    : [];
  const groupSpans = groups
    .map((group): CaptionVisibleSpan | null => {
      const timing = captionGroupTimingMs(group);
      if (!timing) return null;
      const startFrame = caption.from + Math.round((timing.startMs / 1000) * fps);
      const endFrame = caption.from + Math.round((timing.endMs / 1000) * fps);
      if (endFrame <= startFrame) return null;
      return {
        overlayId: caption.id,
        startFrame,
        endFrame,
        text: String(group.text ?? group.content ?? '').trim(),
        source: 'caption-group',
      };
    })
    .filter((span: CaptionVisibleSpan | null): span is CaptionVisibleSpan => Boolean(span));

  if (groupSpans.length > 0) return groupSpans;

  return [{
    overlayId: caption.id,
    startFrame: caption.from,
    endFrame: caption.from + caption.durationInFrames,
    text: String(caption.content ?? (caption as any).text ?? '').trim(),
    source: 'overlay',
  }];
}

function captionCoverageRatio(overlays: AnalyzableOverlay[], fps: number, totalDuration: number): number {
  if (totalDuration <= 0) return 0;
  const intervals = overlays
    .filter(o => o.type === 'caption')
    .flatMap(c => captionVisibleSpans(c, fps))
    .map(span => ({
      start: Math.max(0, Math.min(totalDuration, span.startFrame)),
      end: Math.max(0, Math.min(totalDuration, span.endFrame)),
    }))
    .filter(interval => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const interval of intervals) {
    if (currentStart == null) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      covered += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  if (currentStart != null) covered += currentEnd - currentStart;
  return Math.max(0, Math.min(1, covered / totalDuration));
}

function captionGroupTimingMs(group: Record<string, any>): { startMs: number; endMs: number } | null {
  const directStart = finiteNumber(group.startMs);
  const directEnd = finiteNumber(group.endMs);
  if (directStart != null && directEnd != null && directEnd > directStart) {
    return { startMs: directStart, endMs: directEnd };
  }

  const words = Array.isArray(group.words) ? group.words.filter(isPlainRecord) : [];
  const wordStarts = words
    .map((word) => finiteNumber(word.startMs))
    .filter((value): value is number => value != null);
  const wordEnds = words
    .map((word) => finiteNumber(word.endMs))
    .filter((value): value is number => value != null);
  if (wordStarts.length === 0 || wordEnds.length === 0) return null;

  const startMs = Math.min(...wordStarts);
  const endMs = Math.max(...wordEnds);
  return endMs > startMs ? { startMs, endMs } : null;
}

function getSfxSyncFrame(overlay: AnalyzableOverlay): number {
  return finiteNumber(overlay.metadata?.atomicSfxForm?.timing?.syncFrame)
    ?? finiteNumber(overlay.metadata?.sfxSyncFrame)
    ?? overlay.from;
}

function getSfxTimingAnchor(overlay: AnalyzableOverlay): string | null {
  const anchor = overlay.metadata?.atomicSfxForm?.timing?.anchor
    ?? overlay.metadata?.sfxAnchor
    ?? sfxReceiptPayload(overlay).syncAnchor;
  return typeof anchor === 'string' && anchor.trim()
    ? anchor.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
    : null;
}

function hasSelfLicensedSfxAudioAnchor(overlay: AnalyzableOverlay): boolean {
  const anchor = getSfxTimingAnchor(overlay);
  if (anchor === 'motion-peak') return getSfxMotionEvidenceStrength(overlay) >= 0.62;
  return anchor === 'keyword' || anchor === 'speech-peak' || anchor === 'beat';
}

function getSfxMotionEvidenceStrength(overlay: AnalyzableOverlay): number {
  const receipt = preferredSfxReceipt(overlay);
  const visualContext = isPlainRecord(receipt.visualContext) ? receipt.visualContext : {};
  const atoms = Array.isArray(receipt.atoms) ? receipt.atoms.filter(isPlainRecord) : [];
  const atomMotion = atoms.reduce((max, atom) => (
    atom.key === 'visual.motion_intensity'
      ? Math.max(max, finiteNumber(atom.value) ?? 0)
      : max
  ), 0);
  return Math.max(
    finiteNumber(visualContext.motionIntensity) ?? 0,
    finiteNumber(visualContext.motion_intensity) ?? 0,
    atomMotion,
  );
}

function preferredSfxReceipt(overlay: AnalyzableOverlay): Record<string, any> {
  const metadata = isPlainRecord(overlay.metadata) ? overlay.metadata : {};
  const receipts = [
    ...(Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts.filter(isPlainRecord) : []),
    ...(isPlainRecord(metadata.atomicOverlayReceipt) ? [metadata.atomicOverlayReceipt] : []),
  ];
  return receipts.find(isSfxReceipt) ?? receipts[0] ?? {};
}

function sfxReceiptPayload(overlay: AnalyzableOverlay): Record<string, any> {
  const payload = preferredSfxReceipt(overlay).payload;
  return isPlainRecord(payload) ? payload : {};
}

function isSfxReceipt(receipt: Record<string, any>): boolean {
  const payload = isPlainRecord(receipt.payload) ? receipt.payload : {};
  const form = isPlainRecord(receipt.form) ? receipt.form : {};
  return receipt.family === 'sfx'
    || form.family === 'sfx'
    || payload.formVersion === 'atomic-sfx-form-v1';
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNestedNumber(source: unknown, path: string): number | null {
  if (!isPlainRecord(source)) return null;
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (!isPlainRecord(cursor)) return undefined;
    return cursor[key];
  }, source);
  return finiteNumber(value);
}

function readOverlaySignalNumber(overlay: AnalyzableOverlay, keys: string[]): number | null {
  const metadata = isPlainRecord(overlay.metadata) ? overlay.metadata : {};
  const atomicReceipt = isPlainRecord(metadata.atomicOverlayReceipt) ? metadata.atomicOverlayReceipt : {};
  const payload = isPlainRecord(atomicReceipt.payload) ? atomicReceipt.payload : {};
  const candidates = [
    metadata,
    metadata.signals,
    metadata.signalValues,
    metadata.atomicSignals,
    atomicReceipt,
    payload,
    payload.signals,
  ];
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = key.includes('.')
        ? readNestedNumber(candidate, key)
        : (isPlainRecord(candidate) ? finiteNumber(candidate[key]) : null);
      if (value != null) return value;
    }
  }
  return null;
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

function checkMissingBGM(overlays: AnalyzableOverlay[], shouldAddBgm?: boolean): QualityIssue[] {
  // BGM is a signal-driven decision (genre-parameter-computer.computeBgmRecommendation) — not every
  // video needs it. When the system computed shouldAddBgm=false (moderate/low speech coverage, formal
  // content, short clip, or music already in the footage), the absence of BGM is CORRECT, not a defect,
  // so don't flag it. Only flag when BGM was expected (true) or the decision is unknown (undefined).
  if (shouldAddBgm === false) return [];
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
  const hasSpeechSource = overlays.some(o => (
    (o.type === 'sound' && o.row === ROW.VOICEOVER)
    || getNativeAudioDuckRegions(o).length > 0
  ));
  if (!bgm || !hasSpeechSource) return [];

  const duckingConfig = bgm.styles?.duckingConfig;
  if (!duckingConfig?.enabled) {
    return [{
      type: 'bgm_not_ducking',
      severity: 'warning',
      description: 'BGM not ducking under speech/native source audio. Audio will compete and sound unprofessional.',
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
    const shortSpans: Array<{ span: CaptionVisibleSpan; durSec: number }> = [];
    const longSpans: Array<{ span: CaptionVisibleSpan; durSec: number }> = [];
    for (const span of captionVisibleSpans(c, fps)) {
      const durSec = (span.endFrame - span.startFrame) / fps;
      if (durSec < 1) {
        shortSpans.push({ span, durSec });
      } else if (durSec > 8) {
        longSpans.push({ span, durSec });
      }
    }
    const firstShort = shortSpans[0];
    if (firstShort) {
      issues.push({ type: 'caption_timing', severity: 'warning', description: `Caption ${c.id} has ${shortSpans.length} visible group(s) under 1.0s; first is ${firstShort.durSec.toFixed(1)}s — too fast to read`, overlayId: c.id, frameRange: { start: firstShort.span.startFrame, end: firstShort.span.endFrame }, autoFixable: false, suggestedFix: 'Increase canonical caption minGroupDurationMs or merge nearby caption words' });
    }
    const firstLong = longSpans[0];
    if (firstLong) {
      const unit = firstLong.span.source === 'caption-group' ? 'visible group' : 'overlay';
      issues.push({ type: 'caption_timing', severity: 'info', description: `Caption ${c.id} has ${longSpans.length} ${unit}(s) over 8.0s; first is ${firstLong.durSec.toFixed(1)}s — consider splitting into shorter segments`, overlayId: c.id, frameRange: { start: firstLong.span.startFrame, end: firstLong.span.endFrame }, autoFixable: false, suggestedFix: 'Split long caption into 2-4 second segments' });
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
  const videoOverlays = overlays.filter(o => o.type === 'video');
  const videoLength = videoOverlays.reduce((sum, o) => sum + o.durationInFrames, 0) / fps;
  if (!hasBGM && !hasVO && !hasSFX && videoLength > 10) {
    // Mode 2 raw footage: audio is embedded in video clips (not separate sound overlays).
    // Detect single-source content (all videos share one assetId) as a proxy for "user upload with audio."
    // OLD: flagged as critical → -15 points → false 0/100 on all Mode 2 projects.
    // FIX: downgrade to info for single-source (embedded audio likely). Keep critical for Mode 1
    // (AI-generated clips have no embedded audio — genuinely silent without BGM/VO).
    const uniqueAssets = new Set(videoOverlays.map(o => (o as any).assetId).filter(Boolean));
    const isSingleSource = uniqueAssets.size === 1 && videoOverlays.length > 1;
    if (isSingleSource) {
      return [{ type: 'dead_silence', severity: 'info', description: `No separate audio overlays, but source video likely has embedded audio (single-source Mode 2)`, autoFixable: false, suggestedFix: 'Consider adding background music for a more polished feel' }];
    }
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

// ─── TRIBE Phase 1: 30 New Anti-Pattern Checks (51 total) ───────

function checkTransitionRepetition(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const transitions = overlays.filter(o => o.type === 'transition').sort((a, b) => a.from - b.from);
  if (transitions.length < 4) return [];

  let runLength = 1;
  let runType = getTransitionStyle(transitions[0]);
  for (let i = 1; i < transitions.length; i++) {
    const style = getTransitionStyle(transitions[i]);
    if (style === runType) {
      runLength++;
      if (runLength >= 3) {
        issues.push({ type: 'transition_repetition', severity: 'warning', description: `${runLength} consecutive "${runType}" transitions starting at frame ${transitions[i - runLength + 1].from}`, autoFixable: false, suggestedFix: 'Vary transition types — alternate between dissolve, wipe, dip-to-black' });
      }
    } else {
      runLength = 1;
      runType = style;
    }
  }
  return issues;
}

// ← constraint:transition.dissolve_color_clash
// Rule: color_temperature delta > 1000K between clips AND transition_type = dissolve
// Threshold: > 1000K with dissolve = blocker (-15), warm/cold clash without dissolve = info (-1)
// NOTE: No pixel-level color temp at overlay level. Using filter name classification as proxy.
function checkFilterMismatch(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  const transitions = overlays.filter(o => o.type === 'transition');

  for (let i = 0; i < videos.length - 1; i++) {
    const filterA = (videos[i].styles as any)?.filter || 'none';
    const filterB = (videos[i + 1].styles as any)?.filter || 'none';
    if (filterA !== 'none' && filterB !== 'none' && filterA !== filterB) {
      if (!isWarmColdConflict(filterA, filterB)) continue;

      const cutFrame = videos[i + 1].from;
      const dissolveAtCut = transitions.some(t => {
        const style = getTransitionStyle(t);
        return (style === 'dissolve' || style === 'cross-dissolve')
          && Math.abs(t.from - cutFrame) < 15;
      });

      if (dissolveAtCut) {
        // CRG: dissolve + color clash = blocker
        issues.push({ type: 'filter_mismatch', severity: 'critical', description: `Dissolve between warm "${filterA}" → cool "${filterB}" creates muddy blend — dissolve_color_clash violation`, frameRange: { start: videos[i].from + videos[i].durationInFrames - 15, end: cutFrame + 15 }, autoFixable: true, suggestedFix: 'Switch to hard cut (if mild clash) or dip-to-black (if severe)' });
      } else {
        issues.push({ type: 'filter_mismatch', severity: 'info', description: `Adjacent clips use conflicting color temps: "${filterA}" → "${filterB}"`, frameRange: { start: videos[i].from, end: cutFrame + 30 }, autoFixable: false, suggestedFix: 'Use consistent color grading or add a dip-to-black between them' });
      }
    }
  }
  return issues;
}

function checkPacingInconsistency(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  if (videos.length < 6) return [];

  const windowSize = 3;
  const cutRates: number[] = [];
  for (let i = 0; i <= videos.length - windowSize; i++) {
    const windowStart = videos[i].from;
    const windowEnd = videos[i + windowSize - 1].from + videos[i + windowSize - 1].durationInFrames;
    const windowDurMin = (windowEnd - windowStart) / fps / 60;
    if (windowDurMin > 0) cutRates.push((windowSize - 1) / windowDurMin);
  }

  for (let i = 1; i < cutRates.length; i++) {
    if (cutRates[i - 1] > 0 && cutRates[i] / cutRates[i - 1] > 3) {
      issues.push({ type: 'pacing_inconsistency', severity: 'info', description: `Sudden pacing spike: ${cutRates[i - 1].toFixed(1)} → ${cutRates[i].toFixed(1)} cuts/min around clip ${i + 1}`, autoFixable: false, suggestedFix: 'Smooth pacing transitions — avoid jarring tempo shifts unless intentional' });
      break;
    }
  }
  return issues;
}

// ← constraint:temporal.shot_underheld
// Rule: shot < 0.8s outside montage is subliminal. Butt-edits between sub-second clips = jump cut.
// Threshold: gap < 0.5s (15 frames @30fps) + both clips < 0.8s | severity: warning | deduction: -5
function checkJumpCut(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  const GAP_THRESHOLD = Math.round(fps * 0.5); // 0.5s = 15 frames @30fps
  const CLIP_SHORT = 0.8; // ← constraint:temporal.shot_underheld threshold

  for (let i = 0; i < videos.length - 1; i++) {
    const endA = videos[i].from + videos[i].durationInFrames;
    const startB = videos[i + 1].from;
    const gap = Math.abs(startB - endA);
    if (gap <= GAP_THRESHOLD) {
      const durA = videos[i].durationInFrames / fps;
      const durB = videos[i + 1].durationInFrames / fps;
      if (durA < CLIP_SHORT || durB < CLIP_SHORT) {
        const hasTransition = overlays.some(o => o.type === 'transition' && Math.abs(o.from - endA) < fps);
        if (!hasTransition) {
          issues.push({ type: 'jump_cut', severity: 'warning', description: `Jump cut at frame ${endA} — ${durA < CLIP_SHORT ? `clip A is ${durA.toFixed(2)}s` : `clip B is ${durB.toFixed(2)}s`} (< 0.8s) with no transition`, frameRange: { start: endA - fps, end: startB + fps }, autoFixable: false, suggestedFix: 'Add dissolve, extend to 0.8s minimum, or merge with adjacent shot' });
        }
      }
    }
  }
  return issues;
}

function checkAudioLevelSpike(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const sounds = overlays.filter(o => o.type === 'sound').sort((a, b) => a.from - b.from);
  for (let i = 0; i < sounds.length - 1; i++) {
    if (sounds[i].row !== sounds[i + 1].row) continue;
    const volA = (sounds[i].styles as any)?.volume ?? (sounds[i] as any).volume ?? 1;
    const volB = (sounds[i + 1].styles as any)?.volume ?? (sounds[i + 1] as any).volume ?? 1;
    const ratio = Math.max(volA, volB) / Math.max(Math.min(volA, volB), 0.01);
    if (ratio > 3) {
      issues.push({ type: 'audio_level_spike', severity: 'warning', description: `Volume spike: ${volA.toFixed(2)} → ${volB.toFixed(2)} between audio overlays on row ${sounds[i].row}`, overlayId: sounds[i + 1].id, autoFixable: true, suggestedFix: 'Normalize audio levels between adjacent clips' });
    }
  }
  return issues;
}

function checkCaptionReadingSpeed(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  let totalFastSpans = 0;
  let affectedCaptions = 0;
  let worst: { span: CaptionVisibleSpan; wpm: number } | null = null;

  for (const c of overlays.filter(o => o.type === 'caption')) {
    let captionFastSpans = 0;
    for (const span of captionVisibleSpans(c, fps)) {
      const wordCount = span.text.split(/\s+/).filter(Boolean).length;
      const durationSec = (span.endFrame - span.startFrame) / fps;
      if (durationSec <= 0 || wordCount === 0) continue;
      const wpm = (wordCount / durationSec) * 60;
      if (wpm <= 200) continue;
      totalFastSpans++;
      captionFastSpans++;
      if (!worst || wpm > worst.wpm) worst = { span, wpm };
    }
    if (captionFastSpans > 0) affectedCaptions++;
  }

  if (!worst) return [];
  return [{
    type: 'caption_reading_speed',
    severity: 'warning',
    description: `${affectedCaptions} caption overlay(s) contain ${totalFastSpans} visible group(s) above readable speed; worst ${Math.round(worst.wpm)} words/min (target <=200)`,
    overlayId: worst.span.overlayId,
    frameRange: { start: worst.span.startFrame, end: worst.span.endFrame },
    autoFixable: false,
    suggestedFix: 'Reduce words per group, merge flash groups into longer windows, or extend display time',
  }];
}
// ← constraint:audio.sfx_timing_drift
// Rule: SFX trigger point > 3 frames (100ms @30fps) from its visual event
// Threshold: > 3 frames offset | severity: warning | deduction: -5
function checkOrphanSfx(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const sfx = overlays.filter(o => o.type === 'sound' && o.row === ROW.SFX);
  const transitions = overlays.filter(o => o.type === 'transition');
  const cuts = overlays.filter(o => o.type === 'video').map(o => o.from).sort((a, b) => a - b);
  const graphicStarts = overlays
    .filter(o => o.type === 'html-scene' || o.type === 'html-sticker' || o.type === 'sticker')
    .map(o => o.from);
  const DRIFT_THRESHOLD = 3; // ±3 frames per CRG
  const ORPHAN_WINDOW = fps; // 1s window for orphan detection (no visual event at all)

  for (const s of sfx) {
    const syncFrame = getSfxSyncFrame(s);
    if (hasSelfLicensedSfxAudioAnchor(s)) continue;
    const nearTransition = transitions.some(t => Math.abs(t.from - syncFrame) <= DRIFT_THRESHOLD);
    const nearCut = cuts.some(c => Math.abs(c - syncFrame) <= DRIFT_THRESHOLD);
    const nearGraphic = graphicStarts.some(g => Math.abs(g - syncFrame) <= DRIFT_THRESHOLD);

    if (nearTransition || nearCut || nearGraphic) continue; // properly synced

    // Check if it's drifted (near-ish but > 3 frames) vs orphaned (nothing nearby)
    const looseNearTransition = transitions.some(t => Math.abs(t.from - syncFrame) <= ORPHAN_WINDOW);
    const looseNearCut = cuts.some(c => Math.abs(c - syncFrame) <= ORPHAN_WINDOW);
    const looseNearGraphic = graphicStarts.some(g => Math.abs(g - syncFrame) <= ORPHAN_WINDOW);

    if (looseNearTransition || looseNearCut || looseNearGraphic) {
      issues.push({ type: 'orphan_sfx', severity: 'warning', description: `SFX ${s.id} sync frame ${syncFrame} is > 3 frames from nearest visual event — synchresis drift`, overlayId: s.id, autoFixable: true, suggestedFix: 'Shift SFX to align within ±1 frame of visual event' });
    } else {
      issues.push({ type: 'orphan_sfx', severity: 'info', description: `SFX ${s.id} sync frame ${syncFrame} has no nearby visual event — feels random`, overlayId: s.id, autoFixable: false, suggestedFix: 'Remove orphan SFX or align to a visual event' });
    }
  }
  return issues;
}

// ← constraint:transition.transition_during_speech
// Rule: transition effect (dissolve, wipe, flash, whip-pan) begins while speech_energy > 0.3
// Threshold: any occurrence during active speech | severity: warning | deduction: -5
function checkTransitionDuringSpeech(overlays: AnalyzableOverlay[], fps: number, totalDuration: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const transitions = overlays.filter(o => o.type === 'transition');
  const captions = overlays.filter(o => o.type === 'caption');
  const broadCaptionProxy = captionCoverageRatio(overlays, fps, totalDuration) > 0.8;

  for (const t of transitions) {
    const style = getTransitionStyle(t);
    if (style === 'hard-cut' || style === 'match-cut') continue; // exempt per CRG
    const transStart = t.from;
    // Caption timing is only a speech proxy. A full-video caption track is too broad to punish.
    const duringSpeech = captions.some(c => captionVisibleSpans(c, fps).some(span =>
      transStart > span.startFrame + fps / 2 && transStart < span.endFrame - fps / 2,
    ));
    if (duringSpeech) {
      issues.push({
        type: 'transition_during_speech',
        severity: broadCaptionProxy ? 'info' : 'warning',
        description: broadCaptionProxy
          ? `"${style}" transition at frame ${t.from} overlaps broad caption coverage; kept advisory because captions are an imprecise speech proxy`
          : `"${style}" transition at frame ${t.from} occurs during active speech - splits viewer attention`,
        frameRange: { start: t.from, end: t.from + t.durationInFrames },
        autoFixable: false,
        suggestedFix: broadCaptionProxy
          ? 'Use transcript/energy speech windows before treating this as a blocking transition issue'
          : 'Shift transition to nearest speech gap (silence > 200ms) or use hard cut',
      });
    }
  }
  return issues;
}
// ← constraint:transition.missing_transition_sound
// Rule: non-hard-cut, non-match-cut transition without paired SFX within ±3 frames
// Threshold: any non-hard-cut transition without sound | severity: warning | deduction: -5
function checkMissingTransitionSfx(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const transitions = overlays.filter(o => o.type === 'transition');
  const sfx = overlays.filter(o => o.type === 'sound' && o.row === ROW.SFX);
  const SYNC_WINDOW = 3; // ±3 frames per CRG

  for (const t of transitions) {
    const style = getTransitionStyle(t);
    if (!transitionNeedsPairedSfx(style, t)) continue;
    const hasPairedSfx = sfx.some(s => Math.abs(getSfxSyncFrame(s) - t.from) <= SYNC_WINDOW);
    if (!hasPairedSfx) {
      issues.push({ type: 'missing_transition_sfx', severity: 'warning', description: `"${style}" transition at frame ${t.from} has no paired SFX within ±3 frames — Chion synchresis violation`, overlayId: t.id, frameRange: { start: t.from, end: t.from + t.durationInFrames }, autoFixable: false, suggestedFix: `Add whoosh/impact SFX within ±3 frames of transition start` });
    }
  }
  return issues;
}

// <- qualityGate:G9_narration_desync
// Rule: anchored events stay inside CRG audioRules.syncTiers final-timeline tolerances.
// Threshold: tierA >40ms or tierB >120ms from the persisted narration/marker anchor.
function checkGraphNarrationSync(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  if (!Number.isFinite(fps) || fps <= 0) return [];
  const issues: QualityIssue[] = [];

  for (const overlay of overlays) {
    const evidence = graphSyncEvidence(overlay);
    if (!evidence) continue;
    const driftFrames = evidence.actualFrame - evidence.anchorFrame;
    const driftMs = (driftFrames / fps) * 1000;
    const toleranceMs = evidence.tier === 'tierA'
      ? GRAPH_SYNC_TIER_A_TOLERANCE_MS
      : GRAPH_SYNC_TIER_B_TOLERANCE_MS;
    if (Math.abs(driftMs) <= toleranceMs) continue;

    issues.push({
      type: 'narration_sync_drift',
      severity: 'warning',
      description: `Graph G9 narration_desync ${evidence.tier} violation: overlay ${overlay.id} actual frame ${evidence.actualFrame} is ${Math.round(driftMs)}ms from anchor frame ${evidence.anchorFrame} (tolerance +/-${toleranceMs}ms)`,
      overlayId: overlay.id,
      frameRange: { start: overlay.from, end: overlay.from + Math.max(1, overlay.durationInFrames) },
      autoFixable: false,
      suggestedFix: evidence.tier === 'tierA'
        ? 'Align the percussive/name/number landing frame within +/-40ms of its narration or designed SFX anchor'
        : 'Align the word-anchored reveal within +/-120ms of the syllable, preferably on or just after it',
    });
  }

  return issues;
}

function graphSyncEvidence(overlay: AnalyzableOverlay): { tier: 'tierA' | 'tierB'; anchorFrame: number; actualFrame: number } | null {
  if (overlay.type !== 'motion-graphic') return null;
  const metadata = isPlainRecord(overlay.metadata) ? overlay.metadata : {};
  const signalCurves = isPlainRecord(metadata.signalCurves) ? metadata.signalCurves : {};
  const anchorFrame = finiteNumber(signalCurves.decisionFrame)
    ?? readNestedNumber(metadata, 'atomicMomentBundle.timing.anchorFrame')
    ?? readNestedNumber(metadata, 'momentBundle.timing.anchorFrame');
  if (anchorFrame == null) return null;
  const actualFrame = finiteNumber(signalCurves.overlayFrom) ?? overlay.from;
  if (!Number.isFinite(actualFrame)) return null;
  return {
    tier: graphSyncTierForMotionGraphic(overlay),
    anchorFrame,
    actualFrame,
  };
}

function graphSyncTierForMotionGraphic(overlay: AnalyzableOverlay): 'tierA' | 'tierB' {
  const metadata = isPlainRecord(overlay.metadata) ? overlay.metadata : {};
  const graphicType = typeof metadata.graphicType === 'string' ? metadata.graphicType.toLowerCase() : '';
  const content: Record<string, any> = isPlainRecord(overlay.content) ? overlay.content : {};
  const semanticAtoms: Record<string, any> = isPlainRecord(metadata.semanticAtoms) ? metadata.semanticAtoms : {};
  const hasScalar = isPlainRecord(semanticAtoms.scalar)
    || ['value', 'amount', 'metric', 'number'].some((key) => typeof content[key] === 'string' && /\d/.test(content[key]));
  const hasIdentity = isPlainRecord(semanticAtoms.identity)
    || ['name', 'speaker', 'logo', 'brand'].some((key) => typeof content[key] === 'string' && content[key].trim().length > 0);
  if (hasScalar || hasIdentity || graphicType.includes('stat') || graphicType.includes('logo') || graphicType.includes('lower-third')) {
    return 'tierA';
  }
  return 'tierB';
}

// <- constraint:overlay.graphic_in_caption_zone
// Rule: graphic overlay position overlaps caption position (bottom 15-25% of safe zone)
// Threshold: any spatial overlap between graphic and caption | severity: warning | deduction: -5
function checkGraphicOcclusion(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const graphics = overlays.filter(o => o.type === 'html-scene' || o.type === 'html-sticker' || o.type === 'sticker');
  const captions = overlays.filter(o => o.type === 'caption');

  for (const g of graphics) {
    const gEnd = g.from + g.durationInFrames;
    // Spatial check: is graphic in the caption zone (bottom 25% of frame)?
    const gTop = (g.styles as any)?.top ?? (g.metadata as any)?.top;
    const gY = (g.styles as any)?.y ?? (g.metadata as any)?.y;
    const gPosition = gTop ?? gY;
    // Caption zone: bottom 25% of 1080p = top > 810px, or percentage > 75%
    const inCaptionZone = typeof gPosition === 'number'
      ? (gPosition > 810 || (gPosition > 0.7 && gPosition <= 1))
      : true; // no position data → assume potential conflict

    for (const c of captions) {
      const cEnd = c.from + c.durationInFrames;
      const temporalOverlap = Math.min(gEnd, cEnd) - Math.max(g.from, c.from);
      if (temporalOverlap > 0 && inCaptionZone) {
        issues.push({ type: 'graphic_occlusion', severity: 'warning', description: `Graphic ${g.id} overlaps caption ${c.id} in caption zone for ${temporalOverlap} frames — two reading tasks = neither read`, overlayId: g.id, frameRange: { start: Math.max(g.from, c.from), end: Math.min(gEnd, cEnd) }, autoFixable: false, suggestedFix: 'Reposition graphic to upper area or delay until caption group completes' });
        break;
      }
    }
  }
  return issues;
}

function checkAbruptStart(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  if (videos.length === 0) return [];
  const firstVideo = videos[0];
  if (firstVideo.from > fps * 0.5) return [];
  const hasIntroTransition = overlays.some(o => o.type === 'transition' && o.from < fps);
  const hasIntroGraphic = overlays.some(o => (o.type === 'html-scene' || o.type === 'sticker') && o.from < fps * 2);
  if (!hasIntroTransition && !hasIntroGraphic) {
    return [{ type: 'abrupt_start', severity: 'info', description: 'Video starts with hard content — no fade-in, title card, or intro element', autoFixable: false, suggestedFix: 'Add a fade-from-black or title card at the beginning' }];
  }
  return [];
}

function checkAbruptEnd(overlays: AnalyzableOverlay[], totalDuration: number, fps: number): QualityIssue[] {
  const endZone = totalDuration - fps * 1;
  const hasOutroTransition = overlays.some(o => o.type === 'transition' && o.from + o.durationInFrames >= endZone);
  const bgm = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
  const bgmFades = bgm && (bgm.styles?.animation?.exit === 'fade' || bgm.durationInFrames < totalDuration - fps);
  if (!hasOutroTransition && !bgmFades && totalDuration > fps * 10) {
    return [{ type: 'abrupt_end', severity: 'info', description: 'Video ends abruptly — no fade-out or outro element', autoFixable: false, suggestedFix: 'Add fade-to-black or end card in the last second' }];
  }
  return [];
}

// ← constraint:temporal.shot_overheld
// Rule: time_since_last_cut > pacing_tolerance × 1.5 AND narrative_pressure < 0.5
// Threshold: pacing_tolerance × 1.5 (e.g., if tolerance=4s, flag at 6s) | severity: warning | deduction: -5
function checkClipTooLong(overlays: AnalyzableOverlay[], fps: number, pacingTolerance?: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video');
  const tolerance = pacingTolerance || 8; // 8s default when no genre params - conservative
  const threshold = tolerance * 1.5;

  for (const v of videos) {
    const durSec = v.durationInFrames / fps;
    if (durSec <= threshold) continue;
    const narrativePressure = readOverlaySignalNumber(v, [
      'narrative_pressure',
      'narrativePressure',
      'composite.narrative_pressure',
    ]);
    const hasLowNarrativePressure = narrativePressure != null && narrativePressure < 0.5;
    const severity: QualityIssue['severity'] = hasLowNarrativePressure
      ? (durSec > tolerance * 3 ? 'critical' : 'warning')
      : 'info';
    issues.push({
      type: 'clip_too_long',
      severity,
      description: hasLowNarrativePressure
        ? `Clip ${v.id} held ${durSec.toFixed(1)}s with narrative_pressure=${narrativePressure.toFixed(2)} - exceeds ${threshold.toFixed(0)}s limit (pacing_tolerance x 1.5)`
        : `Clip ${v.id} held ${durSec.toFixed(1)}s - advisory only because shot-overheld needs low narrative_pressure evidence`,
      overlayId: v.id,
      frameRange: { start: v.from, end: v.from + v.durationInFrames },
      autoFixable: false,
      suggestedFix: hasLowNarrativePressure
        ? 'Find nearest viable cut point - prefer speech boundary or motion peak'
        : 'Inspect narrative-pressure or visual-dead-air evidence before adding cuts',
    });
  }
  return issues;
}
// ← constraint:rhythm.identical_zoom_targets
// Rule: 3+ zoom decisions with identical target scale (e.g., three consecutive zoom_pushes all to exactly 1.1x)
// Threshold: 3+ identical zoom scales | severity: info | deduction: -1
function checkRepetitiveZoom(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  if (videos.length < 3) return [];

  const zoomScales: Array<{ id: number; scale: number; from: number }> = [];
  for (const v of videos) {
    const scale = (v.metadata as any)?.zoomScale ?? (v.styles as any)?.scale ?? null;
    if (scale !== null && scale !== 1) {
      zoomScales.push({ id: v.id, scale: Math.round(scale * 100) / 100, from: v.from });
    }
  }

  // Check for runs of identical scale values
  let runLength = 1;
  for (let i = 1; i < zoomScales.length; i++) {
    if (zoomScales[i].scale === zoomScales[i - 1].scale) {
      runLength++;
      if (runLength >= 3) {
        issues.push({ type: 'repetitive_zoom', severity: 'info', description: `${runLength}+ clips with identical zoom scale ${zoomScales[i].scale}x — feels like default setting, not intentional`, autoFixable: true, suggestedFix: `Vary zoom targets by ±2-3% (e.g., ${(zoomScales[i].scale * 0.98).toFixed(2)}x, ${(zoomScales[i].scale * 1.02).toFixed(2)}x)` });
        break;
      }
    } else {
      runLength = 1;
    }
  }
  return issues;
}

function checkEmptyTimelineSection(overlays: AnalyzableOverlay[], fps: number, totalDuration: number): QualityIssue[] {
  if (totalDuration < fps * 10) return [];
  const issues: QualityIssue[] = [];
  const sectionSize = fps * 10;
  const nonVideoOverlays = overlays.filter(o => o.type !== 'video' && o.type !== 'transition');

  for (let start = 0; start < totalDuration; start += sectionSize) {
    const end = Math.min(start + sectionSize, totalDuration);
    const hasVideo = overlays.some(o => o.type === 'video' && o.from < end && o.from + o.durationInFrames > start);
    const hasOther = nonVideoOverlays.some(o => o.from < end && o.from + o.durationInFrames > start);
    if (hasVideo && !hasOther) {
      issues.push({ type: 'empty_timeline_section', severity: 'info', description: `10s section at frame ${start} has video but no captions, graphics, or audio`, frameRange: { start, end }, autoFixable: false, suggestedFix: 'Add captions, BGM, or graphics to this section' });
    }
  }
  return issues.slice(0, 3);
}

function checkAudioExtendsBeyondVideo(overlays: AnalyzableOverlay[], totalDuration: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const sounds = overlays.filter(o => o.type === 'sound');
  for (const s of sounds) {
    const end = s.from + s.durationInFrames;
    if (end > totalDuration + 15) {
      issues.push({ type: 'audio_extends_beyond_video', severity: 'warning', description: `Audio overlay ${s.id} extends ${end - totalDuration} frames past video end`, overlayId: s.id, autoFixable: true, suggestedFix: 'Trim audio to match video duration' });
    }
  }
  return issues;
}

function checkSilentBeginning(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const sounds = overlays.filter(o => o.type === 'sound');
  const anyAudioInFirst2s = sounds.some(o => o.from < fps * 2);
  if (!anyAudioInFirst2s && sounds.length > 0) {
    return [{ type: 'silent_beginning', severity: 'info', description: 'No audio in the first 2 seconds — video opens in silence', autoFixable: false, suggestedFix: 'Start BGM from frame 0 or add an intro sound' }];
  }
  return [];
}

function checkSilentEnding(overlays: AnalyzableOverlay[], fps: number, totalDuration: number): QualityIssue[] {
  const sounds = overlays.filter(o => o.type === 'sound');
  const endZone = totalDuration - fps * 2;
  const anyAudioInLast2s = sounds.some(o => o.from + o.durationInFrames > endZone);
  if (!anyAudioInLast2s && sounds.length > 0 && totalDuration > fps * 5) {
    return [{ type: 'silent_ending', severity: 'info', description: 'No audio in the last 2 seconds — video ends in silence', autoFixable: false, suggestedFix: 'Extend BGM to cover the ending or add an outro sound' }];
  }
  return [];
}

// ← constraint:budget.graphic_density_exceeded
// Rule: graphics per minute > graphic_density target × 1.3 (30% over target)
// Threshold: > 130% of target | severity: info | deduction: -1
function checkExcessiveGraphics(overlays: AnalyzableOverlay[], fps: number, graphicDensityTarget?: number): QualityIssue[] {
  const graphics = overlays.filter(o => o.type === 'html-scene' || o.type === 'html-sticker' || o.type === 'sticker');
  if (graphics.length < 3) return [];
  const totalDurationSec = Math.max(...overlays.map(o => o.from + o.durationInFrames), 1) / fps;
  const totalDurationMin = totalDurationSec / 60;
  if (totalDurationMin <= 0) return [];
  const graphicsPerMin = graphics.length / totalDurationMin;
  const target = graphicDensityTarget || 3; // 3/min default when no genre params
  const threshold = target * 1.3;

  if (graphicsPerMin > threshold) {
    return [{ type: 'excessive_graphics', severity: 'info', description: `${graphics.length} graphics in ${totalDurationSec.toFixed(0)}s (${graphicsPerMin.toFixed(1)}/min) exceeds ${threshold.toFixed(1)}/min limit (target×1.3)`, autoFixable: false, suggestedFix: 'Remove lowest-weight graphics until within target density' }];
  }
  return [];
}

function checkDuplicateAdjacentTransition(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const transitions = overlays.filter(o => o.type === 'transition').sort((a, b) => a.from - b.from);
  const duplicates: Array<{ style: string; firstFrame: number; secondFrame: number }> = [];
  for (let i = 0; i < transitions.length - 1; i++) {
    const styleA = getTransitionStyle(transitions[i]);
    const styleB = getTransitionStyle(transitions[i + 1]);
    if (styleA === styleB && styleA !== 'hard-cut') {
      duplicates.push({ style: styleA, firstFrame: transitions[i].from, secondFrame: transitions[i + 1].from });
    }
  }
  if (duplicates.length === 0) return [];
  const first = duplicates[0];
  return [{
    type: 'duplicate_adjacent_transition',
    severity: 'info',
    description: `${duplicates.length} adjacent non-hard-cut transition pair(s) repeat a style; first "${first.style}" repeat at frames ${first.firstFrame} and ${first.secondFrame}`,
    frameRange: { start: first.firstFrame, end: first.secondFrame },
    autoFixable: false,
    suggestedFix: 'Vary transition jobs between consecutive boundaries or keep one boundary clean',
  }];
}
function checkFadeToBlackOveruse(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const transitions = overlays.filter(o => o.type === 'transition');
  if (transitions.length < 2) return [];
  const dipCount = transitions.filter(t => {
    const style = getTransitionStyle(t);
    return style === 'dip-to-black' || style === 'fade-to-black';
  }).length;
  // CRG constraint:transition.fade_to_black_overuse — threshold: >3 per video
  if (dipCount > 3) {
    const ratio = dipCount / transitions.length;
    return [{ type: 'fade_to_black_overuse', severity: ratio > 0.5 ? 'warning' : 'info', description: `${dipCount}/${transitions.length} transitions (${Math.round(ratio * 100)}%) are dip-to-black — exceeds 3-per-video limit`, autoFixable: false, suggestedFix: 'Replace some dip-to-black with dissolve, wipe, or hard cut' }];
  }
  return [];
}

function checkSubtitleGap(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const captions = overlays.filter(o => o.type === 'caption').sort((a, b) => a.from - b.from);
  const vo = overlays.filter(o => o.type === 'sound' && o.row === ROW.VOICEOVER);
  if (captions.length < 2 || vo.length === 0) return [];

  for (let i = 0; i < captions.length - 1; i++) {
    const endA = captions[i].from + captions[i].durationInFrames;
    const startB = captions[i + 1].from;
    const gapSec = (startB - endA) / fps;
    if (gapSec > 1 && gapSec < 5) {
      const voActive = vo.some(v => endA >= v.from && endA <= v.from + v.durationInFrames);
      if (voActive) {
        issues.push({ type: 'subtitle_gap', severity: 'warning', description: `${gapSec.toFixed(1)}s gap between captions at frame ${endA} while voiceover is playing`, frameRange: { start: endA, end: startB }, autoFixable: false, suggestedFix: 'Fill caption gap — speech is playing but no text is displayed' });
      }
    }
  }
  return issues.slice(0, 5);
}

function checkVisualMonotony(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const videos = overlays.filter(o => o.type === 'video');
  if (videos.length < 5) return [];
  const filters = videos.map(v => (v.styles as any)?.filter || 'none');
  const uniqueFilters = new Set(filters);
  if (uniqueFilters.size === 1 && filters[0] !== 'none' && videos.length >= 5) {
    return [{ type: 'visual_monotony', severity: 'info', description: `All ${videos.length} clips use the same filter "${filters[0]}" — visually flat`, autoFixable: false, suggestedFix: 'Add subtle filter variation between scenes or sections' }];
  }
  return [];
}

// REMOVED: checkClipOrderMismatch was unreliable — overlay IDs don't correspond to
// chronological order. ID assignment depends on creation time, not narrative sequence.
// Keeping stub to avoid breaking callers until aggregation is cleaned up.
function checkClipOrderMismatch(_overlays: AnalyzableOverlay[]): QualityIssue[] {
  return [];
}

function checkAspectRatioMismatch(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const videos = overlays.filter(o => o.type === 'video');
  if (videos.length < 2) return [];
  const ratios = new Set<string>();
  for (const v of videos) {
    const w = (v as any).width || (v.metadata as any)?.width;
    const h = (v as any).height || (v.metadata as any)?.height;
    if (w && h) ratios.add(`${Math.round(w / h * 100)}`);
  }
  if (ratios.size > 1) {
    return [{ type: 'aspect_ratio_mismatch', severity: 'warning', description: `Mixed aspect ratios detected across ${videos.length} clips (${ratios.size} different ratios)`, autoFixable: false, suggestedFix: 'Normalize all clips to the same aspect ratio (16:9 or 9:16)' }];
  }
  return [];
}

// ─── TRIBE Phase 1: 5 New CRG-Sourced Checks ──────────────────

// ← constraint:temporal.pacing_monotony
// Rule: stdev of shot durations for last 5 consecutive shots < 10% of mean
// Threshold: 5+ shots with < 10% duration variance | severity: warning | deduction: -5
function checkPacingMonotony(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
  if (videos.length < 5) return [];

  const WINDOW = 5;
  for (let i = 0; i <= videos.length - WINDOW; i++) {
    const durations = videos.slice(i, i + WINDOW).map(v => v.durationInFrames / fps);
    const mean = durations.reduce((s, d) => s + d, 0) / WINDOW;
    if (mean <= 0) continue;
    const variance = durations.reduce((s, d) => s + (d - mean) ** 2, 0) / WINDOW;
    const stdev = Math.sqrt(variance);
    const coeffOfVariation = stdev / mean;

    if (coeffOfVariation < 0.1) {
      issues.push({ type: 'pacing_monotony', severity: 'warning', description: `Shots ${i + 1}-${i + WINDOW} have < 10% duration variance (${durations.map(d => d.toFixed(1)).join('s, ')}s) — metronomic rhythm`, frameRange: { start: videos[i].from, end: videos[i + WINDOW - 1].from + videos[i + WINDOW - 1].durationInFrames }, autoFixable: false, suggestedFix: 'Vary next 2-3 shot holds by ±15-20% from current mean' });
      break; // one warning per project is enough
    }
  }
  return issues;
}

// ← constraint:overlay.graphic_too_small
// Rule: text within graphic < 72px font size at 1080p
// Threshold: < 72px at 1080p | severity: warning | deduction: -5
function checkGraphicTooSmall(overlays: AnalyzableOverlay[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const graphics = overlays.filter(o =>
    o.type === 'html-scene' || o.type === 'html-sticker' || o.type === 'sticker',
  );

  for (const g of graphics) {
    const fontSize = (g.styles as any)?.fontSize
      ?? (g.metadata as any)?.fontSize
      ?? (g.styles as any)?.textSize;
    // Only flag if we have font size data and it's below threshold
    if (typeof fontSize === 'number' && fontSize < 72) {
      issues.push({ type: 'graphic_too_small', severity: 'warning', description: `Graphic ${g.id} has ${fontSize}px text — unreadable on mobile (min 72px @1080p)`, overlayId: g.id, frameRange: { start: g.from, end: g.from + g.durationInFrames }, autoFixable: true, suggestedFix: 'Scale graphic up until minimum 72px font size is met' });
    }
  }
  return issues;
}

// ← constraint:overlay.caption_spans_cut
// Rule: a single caption starts before a hard cut and continues after it
// Threshold: caption straddles a hard cut | severity: info | deduction: -1
function checkCaptionSpansCut(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const captions = overlays.filter(o => o.type === 'caption');
  const videos = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);

  // Hard cuts = video start frames where there's no transition nearby
  const transitions = overlays.filter(o => o.type === 'transition');
  const hardCutFrames: number[] = [];
  for (let i = 1; i < videos.length; i++) {
    const cutFrame = videos[i].from;
    const hasTransition = transitions.some(t =>
      Math.abs(t.from - cutFrame) < 10 || Math.abs(t.from + t.durationInFrames - cutFrame) < 10,
    );
    if (!hasTransition) hardCutFrames.push(cutFrame);
  }

  for (const c of captions) {
    const spans = captionVisibleSpans(c, fps);
    const spanCutHits: Array<{ span: CaptionVisibleSpan; cut: number }> = [];
    for (const cut of hardCutFrames) {
      for (const span of spans) {
        if (span.startFrame < cut - 3 && span.endFrame > cut + 3) { // 3-frame buffer to avoid false positives
          spanCutHits.push({ span, cut });
          break;
        }
      }
    }
    const firstHit = spanCutHits[0];
    if (firstHit) {
      issues.push({ type: 'caption_spans_cut', severity: 'info', description: `Caption ${c.id} has ${spanCutHits.length} visible group(s) straddling hard cuts; first crosses frame ${firstHit.cut}`, overlayId: c.id, frameRange: { start: firstHit.cut - 3, end: firstHit.cut + 3 }, autoFixable: true, suggestedFix: 'End caption 0.1s before cut, start new caption 0.1s after' });
    }
  }
  return issues;
}

// ← constraint:overlay.visual_clutter
// Rule: > 2 non-caption overlays simultaneously for > 1 second
// Threshold: > 2 non-caption overlays > 1s | severity: warning | deduction: -5
function checkVisualClutter(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const nonCaptionOverlays = overlays.filter(o =>
    o.type !== 'caption' && o.type !== 'video' && o.type !== 'sound' && o.type !== 'transition',
  );
  if (nonCaptionOverlays.length < 3) return [];

  const totalDuration = Math.max(...overlays.map(o => o.from + o.durationInFrames), 0);
  const STEP = Math.max(fps / 2, 1); // sample every 0.5s

  for (let frame = 0; frame < totalDuration; frame += STEP) {
    const activeCount = nonCaptionOverlays.filter(o =>
      o.from <= frame && o.from + o.durationInFrames > frame,
    ).length;

    if (activeCount > 2) {
      // Verify it persists for > 1 second
      let clutterEnd = frame;
      for (let f = frame + STEP; f < totalDuration; f += STEP) {
        const count = nonCaptionOverlays.filter(o =>
          o.from <= f && o.from + o.durationInFrames > f,
        ).length;
        if (count > 2) clutterEnd = f;
        else break;
      }
      if (clutterEnd - frame >= fps) {
        issues.push({ type: 'visual_clutter', severity: 'warning', description: `${activeCount} non-caption overlays active simultaneously for ${((clutterEnd - frame) / fps).toFixed(1)}s at frame ${frame} — Gestalt figure-ground violation`, frameRange: { start: frame, end: clutterEnd }, autoFixable: false, suggestedFix: 'Stagger overlays — delay newest entrance until oldest exits + 0.3s' });
        frame = clutterEnd; // skip past this clutter zone
      }
    }
  }
  return issues.slice(0, 3); // cap at 3 clutter warnings
}

// ← constraint:transition.transition_overuse
// Rule: non-hard-cut transitions > 5 per minute of content
// Threshold: > 5 special transitions per minute | severity: warning | deduction: -5
function checkTransitionOveruse(overlays: AnalyzableOverlay[], fps: number): QualityIssue[] {
  const transitions = overlays.filter(o => o.type === 'transition');
  const specialTransitions = transitions.filter(t => {
    const style = getTransitionStyle(t);
    return style !== 'hard-cut' && style !== 'unknown';
  });
  const totalDurationSec = Math.max(...overlays.map(o => o.from + o.durationInFrames), 1) / fps;
  const totalDurationMin = totalDurationSec / 60;
  if (totalDurationMin <= 0) return [];

  const specialPerMin = specialTransitions.length / totalDurationMin;
  if (specialPerMin > 5) {
    return [{ type: 'transition_overuse', severity: 'warning', description: `${specialTransitions.length} special transitions in ${totalDurationSec.toFixed(0)}s (${specialPerMin.toFixed(1)}/min) — hard cuts should be 80-90% of all cuts`, autoFixable: false, suggestedFix: 'Convert least-motivated special transitions back to hard cuts' }];
  }
  return [];
}

// ─── Helpers for anti-pattern checks ────────────────────────────

function getTransitionStyle(overlay: AnalyzableOverlay): string {
  return (overlay.metadata as any)?.transitionStyle
    || (overlay.styles as any)?.transitionStyle
    || (overlay as any).transitionStyle
    || 'unknown';
}

function transitionNeedsPairedSfx(style: string, overlay?: AnalyzableOverlay): boolean {
  const atomicSfxRole = getAtomicTransitionSfxRole(overlay);
  if (transitionSfxSuppressedByOwner(overlay)) return false;
  if (atomicSfxRole === 'none') return false;
  if (atomicSfxRole) return true;
  return ![
    'cut',
    'hard-cut',
    'hard_cut',
    'invisible-cut',
    'match-cut',
    'match_cut',
    'soft-cut',
    'dip-to-black',
    'dip-to-white',
    'film-burn',
    'none',
    'unknown',
  ].includes(style);
}

function getAtomicTransitionSfxRole(overlay?: AnalyzableOverlay): string | null {
  const form = (overlay?.metadata as any)?.atomicTransitionForm;
  const role = form && typeof form === 'object' ? form.sfxRole : undefined;
  return typeof role === 'string' && role.trim() ? role.trim() : null;
}

function transitionSfxSuppressedByOwner(overlay?: AnalyzableOverlay): boolean {
  const metadata = isPlainRecord(overlay?.metadata) ? overlay.metadata : {};
  const placement = isPlainRecord(metadata.transitionSfxPlacement) ? metadata.transitionSfxPlacement : {};
  const status = typeof placement.status === 'string' ? placement.status : metadata.transitionSfxPlacementStatus;
  const reason = typeof placement.reason === 'string' ? placement.reason : metadata.transitionSfxSkipReason;
  return status === 'suppressed'
    || reason === 'profile-policy-off'
    || reason === 'atomic-silence'
    || (typeof reason === 'string' && reason.startsWith('silence-wins'));
}

function isWarmColdConflict(a: string, b: string): boolean {
  const warm = ['warm', 'vintage', 'sepia', 'golden', 'sunset'];
  const cold = ['cool', 'arctic', 'blue', 'moonlight', 'cyberpunk'];
  const aWarm = warm.some(w => a.toLowerCase().includes(w));
  const aCold = cold.some(c => a.toLowerCase().includes(c));
  const bWarm = warm.some(w => b.toLowerCase().includes(w));
  const bCold = cold.some(c => b.toLowerCase().includes(c));
  return (aWarm && bCold) || (aCold && bWarm);
}


export function scoreQualityIssues(issues: QualityIssue[]): number {
  const byType = new Map<IssueType, { raw: number; hasCritical: boolean }>();
  for (const issue of issues) {
    if (issue.severity === 'info') continue;
    const current = byType.get(issue.type) ?? { raw: 0, hasCritical: false };
    current.raw += issue.severity === 'critical' ? QUALITY_CRITICAL_TYPE_CAP : QUALITY_WARNING_TYPE_CAP;
    current.hasCritical = current.hasCritical || issue.severity === 'critical';
    byType.set(issue.type, current);
  }

  let deduction = 0;
  for (const value of byType.values()) {
    deduction += Math.min(value.raw, value.hasCritical ? QUALITY_CRITICAL_TYPE_CAP : QUALITY_WARNING_TYPE_CAP);
  }
  return Math.max(0, 100 - deduction);
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
  /** Deprecated compatibility slot: content labels are report-only and never adjust severity/pacing. */
  _contentType?: string,
  /** Optional: computed genre parameters (Mode 2 — replaces content-type pacing lookup).
   *  `bgmRecommendation.shouldAddBgm` (signal-driven) gates the missing-BGM check. */
  genreParameters?: { pacing_tolerance: number; transition_density: number; bgmRecommendation?: { shouldAddBgm?: boolean } },
  brandConfig?: { colors: string[]; typography?: string },
): QualityReport {
  const totalDuration = projectDuration || Math.max(...overlays.map(o => o.from + o.durationInFrames), 0);

  const allIssues: QualityIssue[] = [
    // Original 7 checks
    ...checkTimelineGaps(overlays, fps),
    ...checkMissingBGM(overlays, genreParameters?.bgmRecommendation?.shouldAddBgm),
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
    // TRIBE Phase 1: anti-pattern checks — all thresholds sourced from CRG part-4-constraints
    ...checkTransitionRepetition(overlays),
    ...checkFilterMismatch(overlays),
    ...checkPacingInconsistency(overlays, fps),
    ...checkJumpCut(overlays, fps),
    ...checkAudioLevelSpike(overlays),
    ...checkCaptionReadingSpeed(overlays, fps),
    ...checkOrphanSfx(overlays, fps),
    ...checkTransitionDuringSpeech(overlays, fps, totalDuration),
    ...checkMissingTransitionSfx(overlays, fps),
    ...checkGraphNarrationSync(overlays, fps),
    ...checkGraphicOcclusion(overlays),
    ...checkAbruptStart(overlays, fps),
    ...checkAbruptEnd(overlays, totalDuration, fps),
    ...checkClipTooLong(overlays, fps, genreParameters?.pacing_tolerance),
    ...checkRepetitiveZoom(overlays),
    ...checkEmptyTimelineSection(overlays, fps, totalDuration),
    ...checkAudioExtendsBeyondVideo(overlays, totalDuration),
    ...checkSilentBeginning(overlays, fps),
    ...checkSilentEnding(overlays, fps, totalDuration),
    ...checkExcessiveGraphics(overlays, fps),
    ...checkDuplicateAdjacentTransition(overlays),
    ...checkFadeToBlackOveruse(overlays),
    ...checkSubtitleGap(overlays, fps),
    ...checkVisualMonotony(overlays),
    ...checkClipOrderMismatch(overlays),
    ...checkAspectRatioMismatch(overlays),
    // TRIBE Phase 1 CRG additions (5 new checks)
    ...checkPacingMonotony(overlays, fps),
    ...checkGraphicTooSmall(overlays),
    ...checkCaptionSpansCut(overlays, fps),
    ...checkVisualClutter(overlays, fps),
    ...checkTransitionOveruse(overlays, fps),
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

    // Check: pacing consistency, using signal-derived genre parameters only.
    // Content labels are report-only and must not invent cut-density expectations.
    if (totalDuration > 0 && genreParameters) {
      const videoOverlayCount = overlays.filter(o => o.type === 'video').length;
      const durationMin = (totalDuration / fps) / 60;
      const actualCutsPerMin = durationMin > 0 ? (videoOverlayCount - 1) / durationMin : 0;

      const expectedMin = genreParameters.transition_density * 0.5;
      const expectedMax = genreParameters.transition_density * 1.5;

      if (actualCutsPerMin < expectedMin * 0.5) {
        allIssues.push({
          type: 'pacing_too_slow' as any,
          severity: 'info',
          description: `Pacing (${actualCutsPerMin.toFixed(1)} cuts/min) is below signal-derived expected range (${expectedMin.toFixed(0)}-${expectedMax.toFixed(0)}, source: genre_parameters).`,
          autoFixable: false,
          suggestedFix: 'Review signal-derived cut density and cut-boundary evidence before changing the cut plan',
        });
      }
    }
  }

  // ── Absence checks: missing production elements ──
  // A video that has no problems but also no QUALITY is still garbage.
  // Professional output requires: transitions, visual motion, and SFX.
  const videoOverlays = overlays.filter(o => o.type === 'video');
  const totalDurationSec = totalDuration > 0 ? totalDuration / fps : 0;

  if (totalDurationSec > 15 && videoOverlays.length > 3) {
    const transitionOverlays = overlays.filter(o => o.type === 'transition' || (o as any).metadata?.isTransition);
    if (transitionOverlays.length === 0) {
      allIssues.push({
        type: 'visual_monotony' as IssueType,
        severity: 'critical',
        description: `Zero transitions in ${videoOverlays.length}-clip video (${Math.round(totalDurationSec)}s). Video feels like a slideshow with hard cuts only.`,
        autoFixable: false,
        suggestedFix: 'Re-run Director Agent or manually add transitions between key sections',
      });
    }

    const clipsWithMotion = videoOverlays.filter(o => (o as any).keyframeTracks?.length > 0);
    if (clipsWithMotion.length < videoOverlays.length * 0.3) {
      allIssues.push({
        type: 'visual_monotony' as IssueType,
        severity: 'warning',
        description: `Only ${clipsWithMotion.length}/${videoOverlays.length} clips have visual motion (zoom/pan). Video feels static.`,
        autoFixable: false,
        suggestedFix: 'Add zoom keyframes or camera movement to key clips',
      });
    }
  }

  if (totalDurationSec > 30) {
    const sfxOverlays = overlays.filter(o =>
      (o as any).row === 4 || // ROW.SFX
      (o as any).metadata?.source?.includes('sfx') ||
      (o as any).metadata?.sfxType
    );
    if (sfxOverlays.length === 0) {
      allIssues.push({
        type: 'dead_silence' as IssueType,
        severity: 'warning',
        description: `Zero sound effects in ${Math.round(totalDurationSec)}s video. Transitions and emphasis moments lack audio punctuation.`,
        autoFixable: false,
        suggestedFix: 'Set FREESOUND_API_KEY env var to enable SFX library, then re-run Director',
      });
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

  // Brand-aware checks (only when brandConfig is provided)
  if (brandConfig && brandConfig.colors.length > 0) {
    allIssues.push(...checkBrandColorCompliance(overlays, brandConfig.colors));
  }
  if (brandConfig?.typography) {
    allIssues.push(...checkBrandTypography(overlays, brandConfig.typography));
  }

  const score = scoreQualityIssues(allIssues);

  // Suggestions
  const suggestions: string[] = [];
  if (score < 50) suggestions.push('Multiple issues detected. Consider re-running the Director Agent with a different profile.');
  if (allIssues.some(i => i.type === 'missing_bgm')) suggestions.push('Add background music to make the video feel complete.');
  if (allIssues.some(i => i.type === 'no_captions')) suggestions.push('Add captions — most social media viewers watch without sound.');
  if (rawFootage) suggestions.push(`Raw-footage clean duration: ${Math.round((rawFootage.estimatedCleanDurationMs || 0) / 1000)}s.`);

  return {
    overallScore: score,
    issues: allIssues,
    autoFixable: allIssues.filter(i => i.autoFixable),
    suggestions,
    analyzedAt: new Date(),
  };
}

// ─── Brand-Aware Quality Checks ─────────────────────────────────

function normalizeColor(color: string): string {
  return color.trim().toLowerCase().replace(/\s+/g, '');
}

function checkBrandColorCompliance(
  overlays: AnalyzableOverlay[],
  brandColors: string[],
): QualityIssue[] {
  if (brandColors.length === 0) return [];

  const normalizedBrand = new Set(brandColors.map(normalizeColor));
  const issues: QualityIssue[] = [];
  let offBrandCount = 0;

  const textOverlays = overlays.filter(
    (o) => (o.type === 'caption' || o.type === 'text') && o.styles?.color,
  );

  for (const overlay of textOverlays) {
    const overlayColor = normalizeColor(String(overlay.styles.color));
    // White and black are universal — skip brand check for them
    if (overlayColor === '#ffffff' || overlayColor === '#000000' || overlayColor === 'white' || overlayColor === 'black') {
      continue;
    }
    if (!normalizedBrand.has(overlayColor)) {
      offBrandCount++;
    }
  }

  if (offBrandCount > 0 && textOverlays.length > 0) {
    const ratio = offBrandCount / textOverlays.length;
    if (ratio > 0.5) {
      issues.push({
        type: 'brand_color_mismatch' as any,
        severity: 'warning',
        description: `${offBrandCount}/${textOverlays.length} text overlays use colors not in the brand palette. Brand colors: ${brandColors.join(', ')}.`,
        autoFixable: true,
        suggestedFix: 'Update caption/text colors to match brand palette',
      });
    }
  }

  return issues;
}

function checkBrandTypography(
  overlays: AnalyzableOverlay[],
  brandTypography: string,
): QualityIssue[] {
  if (!brandTypography) return [];

  const issues: QualityIssue[] = [];
  const brandFont = brandTypography.toLowerCase().trim();
  let offBrandFontCount = 0;

  const textOverlays = overlays.filter(
    (o) => (o.type === 'caption' || o.type === 'text') && o.styles?.fontFamily,
  );

  for (const overlay of textOverlays) {
    const overlayFont = String(overlay.styles.fontFamily).toLowerCase().trim();
    if (!overlayFont.includes(brandFont) && !brandFont.includes(overlayFont)) {
      offBrandFontCount++;
    }
  }

  if (offBrandFontCount > 0 && textOverlays.length > 0) {
    const ratio = offBrandFontCount / textOverlays.length;
    if (ratio > 0.5) {
      issues.push({
        type: 'brand_typography_mismatch' as any,
        severity: 'info',
        description: `${offBrandFontCount}/${textOverlays.length} text overlays use fonts different from brand typography "${brandTypography}".`,
        autoFixable: true,
        suggestedFix: `Update font family to "${brandTypography}"`,
      });
    }
  }

  return issues;
}
