/**
 * QualityGate — Per-Operation Before/After Metric Snapshots
 *
 * TRIBE/HUMAN Phase 1: wraps each Director action with quality measurement.
 * Takes a snapshot BEFORE the action, lets the action run, takes AFTER snapshot,
 * then compares. If quality degrades beyond threshold, logs a warning.
 *
 * Metrics (aligned with TRIBE_HUMAN_INTEGRATION_PLAN.md §1A):
 *   - pacingScore: cuts/min relative to target range (from genre params or content type)
 *   - audioLevelEstimate: estimated LUFS deviation from -14 target (proxy from overlay volumes)
 *   - transitionVariety: unique transition types / total transitions
 *   - captionSyncScore: caption coverage relative to VO presence
 *   - visualVariety: unique visual treatments / total clips
 *
 * Threshold sources documented inline per E4 requirement.
 */

import { ROW } from '@/lib/pipeline/scene-to-editron';

export interface GateSnapshot {
  pacingCutsPerMin: number;
  transitionVariety: number;
  transitionRepetitionRun: number;
  audioLevelEstimate: number;
  visualVariety: number;
  captionSyncScore: number;
  clipCount: number;
  transitionCount: number;
  sfxCount: number;
  overlayCount: number;
  timestamp: number;
}

export interface GateResult {
  passed: boolean;
  actionName: string;
  before: GateSnapshot;
  after: GateSnapshot;
  degradations: GateDegradation[];
  improvements: string[];
  durationMs: number;
}

export interface GateDegradation {
  metric: string;
  before: number;
  after: number;
  delta: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface GateConfig {
  enabled: boolean;
  targetPacingMin?: number;
  targetPacingMax?: number;
}

const DEFAULT_GATE_CONFIG: GateConfig = {
  enabled: true,
};

interface AnalyzableOverlay {
  id: number;
  type: string;
  from: number;
  durationInFrames: number;
  row: number;
  styles?: any;
  content?: string;
  metadata?: any;
}

export function takeSnapshot(overlays: AnalyzableOverlay[], fps: number = 30): GateSnapshot {
  const videos = overlays.filter(o => o.type === 'video');
  const transitions = overlays.filter(o => o.type === 'transition');
  const sounds = overlays.filter(o => o.type === 'sound');
  const captions = overlays.filter(o => o.type === 'caption');

  const totalDurationFrames = Math.max(
    ...overlays.map(o => o.from + o.durationInFrames),
    1,
  );
  const totalDurationMin = totalDurationFrames / fps / 60;

  // Pacing: raw cuts/min — comparison against target happens in compareSnapshots
  const pacingCutsPerMin = totalDurationMin > 0 ? Math.max(0, videos.length - 1) / totalDurationMin : 0;

  // Transition variety: unique types / total
  // ← constraint:transition.transition_repetition (3+ identical = violation)
  const transitionStyles = transitions.map(t =>
    (t.metadata as any)?.transitionStyle || (t.styles as any)?.transitionStyle || 'unknown',
  );
  const uniqueTypes = new Set(transitionStyles);
  const transitionVariety = transitions.length > 0
    ? uniqueTypes.size / transitions.length
    : 1;

  // Longest run of identical transitions
  // ← constraint:transition.transition_repetition threshold = 3
  let maxRun = 0;
  let currentRun = 1;
  const sortedStyles = transitions
    .sort((a, b) => a.from - b.from)
    .map(t => (t.metadata as any)?.transitionStyle || (t.styles as any)?.transitionStyle || 'unknown');
  for (let i = 1; i < sortedStyles.length; i++) {
    if (sortedStyles[i] === sortedStyles[i - 1] && sortedStyles[i] !== 'hard-cut') {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }
  if (sortedStyles.length <= 1) maxRun = 0;

  // Audio level estimate: proxy for LUFS using overlay volume settings
  // Real LUFS requires waveform analysis (not available pre-render).
  // Proxy: estimate based on volume settings relative to -14 LUFS target.
  // ← constant:audio.universal_safe_default_lufs = -14 LUFS, -1.0 dBTP
  // ← constant:audio.dialogue_level_range = -12 to -6 dB
  // ← constant:audio.music_solo_level_range = -12 to -6 dB
  // ← constant:audio.music_under_speech_level_range = -24 to -18 dB
  const bgm = sounds.filter(o => o.row === ROW.BGM);
  const vo = sounds.filter(o => o.row === ROW.VOICEOVER);
  const sfx = sounds.filter(o => o.row === ROW.SFX);

  let audioLevelEstimate = 0;
  const hasVO = vo.length > 0;
  const hasBGM = bgm.length > 0;
  const hasSFX = sfx.length > 0;

  if (hasVO || hasBGM) {
    const voVol = hasVO ? Math.min((vo[0].styles as any)?.volume ?? (vo[0] as any).volume ?? 1, 1.5) : 0;
    const bgmVol = hasBGM ? Math.min((bgm[0].styles as any)?.volume ?? (bgm[0] as any).volume ?? 0.3, 1.5) : 0;
    // VO at 1.0 ≈ -12dB, BGM at 0.3 ≈ -20dB (under speech) → good mix
    // VO at 1.0 + BGM at 1.0 without ducking → competition (bad)
    const bgmDucked = hasBGM && (bgm[0].styles as any)?.duckingConfig?.enabled;
    const voNormalized = voVol >= 0.7 && voVol <= 1.2 ? 1 : Math.max(0, 1 - Math.abs(voVol - 1) * 0.5);
    const bgmNormalized = hasBGM
      ? (bgmDucked || !hasVO ? 1 : (bgmVol <= 0.4 ? 1 : Math.max(0, 1 - (bgmVol - 0.4) * 2)))
      : 0;
    const sfxNormalized = hasSFX ? 1 : 0;

    // Weighted by audio importance: VO 50%, BGM 35%, SFX 15%
    // ← constant:audio.dialogue_level_range is the primary channel in any mix
    audioLevelEstimate = (voNormalized * 0.5) + (bgmNormalized * 0.35) + (sfxNormalized * 0.15);
  }

  // Visual variety: unique visual treatments / clips
  const filterSet = new Set<string>();
  for (const v of videos) {
    const filter = (v.styles as any)?.filter || (v.metadata as any)?.filter || 'none';
    filterSet.add(filter);
  }
  const visualVariety = videos.length > 1 ? filterSet.size / videos.length : 1;

  // Caption sync: how well captions cover voiced content
  // ← constraint:overlay.caption_timing_drift threshold = 0.5s before or 1.0s after speech
  const voTotalFrames = vo.reduce((sum, v) => sum + v.durationInFrames, 0);
  const captionTotalFrames = captions.reduce((sum, c) => sum + c.durationInFrames, 0);
  let captionSyncScore = 0;
  if (voTotalFrames > 0) {
    const coverageRatio = Math.min(1, captionTotalFrames / voTotalFrames);
    // Also check timing: are captions near VO?
    let alignedFrames = 0;
    for (const c of captions) {
      const cEnd = c.from + c.durationInFrames;
      for (const v of vo) {
        const vEnd = v.from + v.durationInFrames;
        const overlap = Math.max(0, Math.min(cEnd, vEnd) - Math.max(c.from, v.from));
        alignedFrames += overlap;
      }
    }
    const alignmentRatio = voTotalFrames > 0 ? Math.min(1, alignedFrames / voTotalFrames) : 1;
    captionSyncScore = coverageRatio * 0.5 + alignmentRatio * 0.5;
  } else if (captions.length > 0) {
    captionSyncScore = 1;
  }

  return {
    pacingCutsPerMin,
    transitionVariety,
    transitionRepetitionRun: maxRun,
    audioLevelEstimate,
    visualVariety,
    captionSyncScore,
    clipCount: videos.length,
    transitionCount: transitions.length,
    sfxCount: sfx.length,
    overlayCount: overlays.length,
    timestamp: Date.now(),
  };
}

export function compareSnapshots(
  before: GateSnapshot,
  after: GateSnapshot,
  actionName: string,
  config: Partial<GateConfig> = {},
): GateResult {
  const degradations: GateDegradation[] = [];
  const improvements: string[] = [];

  // --- Pacing degradation ---
  // Uses relative change (>2x jump) since absolute thresholds depend on content type.
  // ← R0: no fixed cuts/min works for all content types, so detect RELATIVE spikes.
  if (before.pacingCutsPerMin > 0 && after.pacingCutsPerMin > before.pacingCutsPerMin * 2.5) {
    degradations.push({
      metric: 'pacingCutsPerMin',
      before: before.pacingCutsPerMin,
      after: after.pacingCutsPerMin,
      delta: after.pacingCutsPerMin - before.pacingCutsPerMin,
      severity: after.pacingCutsPerMin > before.pacingCutsPerMin * 4 ? 'critical' : 'warning',
      message: `Pacing spiked ${(after.pacingCutsPerMin / before.pacingCutsPerMin).toFixed(1)}x (${before.pacingCutsPerMin.toFixed(1)} → ${after.pacingCutsPerMin.toFixed(1)} cuts/min) after ${actionName}`,
    });
  }

  // --- Transition repetition ---
  // ← constraint:transition.transition_repetition: 3+ identical non-hard-cut = warning, -5
  if (after.transitionRepetitionRun >= 3 && after.transitionRepetitionRun > before.transitionRepetitionRun) {
    degradations.push({
      metric: 'transitionRepetitionRun',
      before: before.transitionRepetitionRun,
      after: after.transitionRepetitionRun,
      delta: after.transitionRepetitionRun - before.transitionRepetitionRun,
      severity: after.transitionRepetitionRun >= 5 ? 'critical' : 'warning',
      message: `${after.transitionRepetitionRun} identical transitions in a row after ${actionName} (CRG limit: 3)`,
    });
  }

  // --- Transition variety drop ---
  // ← constraint:transition.transition_overuse: >5 special transitions per minute = warning
  // Variety below 20% with 4+ transitions signals single-type dominance
  if (after.transitionVariety < 0.2 && after.transitionCount >= 4 &&
      after.transitionVariety < before.transitionVariety - 0.1) {
    degradations.push({
      metric: 'transitionVariety',
      before: before.transitionVariety,
      after: after.transitionVariety,
      delta: after.transitionVariety - before.transitionVariety,
      severity: after.transitionVariety < 0.1 ? 'critical' : 'warning',
      message: `Transition variety dropped to ${(after.transitionVariety * 100).toFixed(0)}% after ${actionName}`,
    });
  }

  // --- Audio level degradation ---
  // ← constant:audio.universal_safe_default_lufs = -14 LUFS
  // A 30%+ drop in audio balance indicates layers were removed or misconfigured
  if (before.audioLevelEstimate > 0.3 && after.audioLevelEstimate < before.audioLevelEstimate - 0.25) {
    degradations.push({
      metric: 'audioLevelEstimate',
      before: before.audioLevelEstimate,
      after: after.audioLevelEstimate,
      delta: after.audioLevelEstimate - before.audioLevelEstimate,
      severity: after.audioLevelEstimate < 0.1 ? 'critical' : 'warning',
      message: `Audio balance dropped from ${(before.audioLevelEstimate * 100).toFixed(0)}% to ${(after.audioLevelEstimate * 100).toFixed(0)}% after ${actionName}`,
    });
  }

  // --- Caption sync degradation ---
  // ← constraint:overlay.caption_timing_drift: > 0.5s before or > 1.0s after speech = warning, -5
  if (before.captionSyncScore > 0.5 && after.captionSyncScore < before.captionSyncScore - 0.25) {
    degradations.push({
      metric: 'captionSyncScore',
      before: before.captionSyncScore,
      after: after.captionSyncScore,
      delta: after.captionSyncScore - before.captionSyncScore,
      severity: 'warning',
      message: `Caption sync dropped from ${(before.captionSyncScore * 100).toFixed(0)}% to ${(after.captionSyncScore * 100).toFixed(0)}% after ${actionName}`,
    });
  }

  // --- SFX removed ---
  // ← constraint:transition.missing_transition_sound: non-hard-cut without SFX = warning, -5
  if (before.sfxCount > 0 && after.sfxCount === 0) {
    degradations.push({
      metric: 'sfxCount',
      before: before.sfxCount,
      after: after.sfxCount,
      delta: -before.sfxCount,
      severity: 'warning',
      message: `All ${before.sfxCount} SFX removed after ${actionName}`,
    });
  }

  // --- Improvements ---
  if (after.audioLevelEstimate > before.audioLevelEstimate + 0.1) {
    improvements.push(`Audio balance improved to ${(after.audioLevelEstimate * 100).toFixed(0)}%`);
  }
  if (after.transitionVariety > before.transitionVariety + 0.1 && after.transitionCount >= 2) {
    improvements.push(`Transition variety improved to ${(after.transitionVariety * 100).toFixed(0)}%`);
  }
  if (after.captionSyncScore > before.captionSyncScore + 0.1) {
    improvements.push(`Caption sync improved to ${(after.captionSyncScore * 100).toFixed(0)}%`);
  }
  if (after.transitionRepetitionRun < before.transitionRepetitionRun && before.transitionRepetitionRun >= 3) {
    improvements.push(`Transition repetition reduced from ${before.transitionRepetitionRun} to ${after.transitionRepetitionRun}`);
  }

  const criticalCount = degradations.filter(d => d.severity === 'critical').length;
  const passed = criticalCount === 0 && degradations.length <= 2;

  return {
    passed,
    actionName,
    before,
    after,
    degradations,
    improvements,
    durationMs: after.timestamp - before.timestamp,
  };
}

export interface GateSessionSummary {
  totalActions: number;
  passedActions: number;
  failedActions: number;
  totalDegradations: number;
  criticalDegradations: number;
  topDegradations: GateDegradation[];
  overallTrend: 'improving' | 'stable' | 'degrading';
  actionResults: Array<{ action: string; passed: boolean; degradationCount: number }>;
}

export function summarizeGateSession(results: GateResult[]): GateSessionSummary {
  const passed = results.filter(r => r.passed).length;
  const allDegradations = results.flatMap(r => r.degradations);
  const criticals = allDegradations.filter(d => d.severity === 'critical');

  const sorted = [...allDegradations].sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  let trend: GateSessionSummary['overallTrend'] = 'stable';
  if (results.length >= 3) {
    const lastThree = results.slice(-3);
    const degrading = lastThree.filter(r => !r.passed).length;
    const improving = lastThree.filter(r => r.improvements.length > 0 && r.degradations.length === 0).length;
    if (degrading >= 2) trend = 'degrading';
    else if (improving >= 2) trend = 'improving';
  }

  return {
    totalActions: results.length,
    passedActions: passed,
    failedActions: results.length - passed,
    totalDegradations: allDegradations.length,
    criticalDegradations: criticals.length,
    topDegradations: sorted.slice(0, 5),
    overallTrend: trend,
    actionResults: results.map(r => ({
      action: r.actionName,
      passed: r.passed,
      degradationCount: r.degradations.length,
    })),
  };
}
