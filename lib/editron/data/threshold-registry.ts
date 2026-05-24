/**
 * Threshold Registry — Source of truth for all calibratable values.
 *
 * Phase 7.2 deliverable. Every INVENTED threshold grounded against:
 *   - CRG: Creative Knowledge Graph node (strongest source)
 *   - AE: After Effects / motion design industry practice
 *   - DOMAIN: Video editing domain expertise
 *   - WCAG: Web Content Accessibility Guidelines (NOT_OVERRIDABLE)
 *   - INVENTED: No external source found — wide prior, highest calibration priority
 *
 * Each entry includes a Bayesian prior (mu, sigma) for Thompson sampling:
 *   - CRG-grounded: tight sigma (5-10% of mu)
 *   - AE-grounded (within cited range): moderate sigma (range_width / 4)
 *   - INVENTED: wide sigma (30-50% of mu)
 *
 * The bandit (Phase 7.3) reads priors from this registry.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ThresholdSource = 'crg' | 'ae' | 'domain' | 'wcag' | 'invented';

export interface ThresholdEntry {
  id: string;
  file: string;
  value: number;
  unit: string;
  controls: string;
  source: ThresholdSource;
  sourceRef?: string;
  aeRange?: [number, number];
  prior: { mu: number; sigma: number };
  adaptive: boolean;
  fixed?: boolean;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const THRESHOLD_REGISTRY: ThresholdEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL DETECTION & ROUTING (creative-brief.ts, decision-registry.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'speech-coverage-threshold',
    file: 'services/creative-brief.ts',
    value: 0.6,
    unit: 'ratio',
    controls: 'Content mode routing: above this → speech mode',
    source: 'invented',
    sourceRef: 'D-004. No CRG node for speech_coverage mode switching.',
    prior: { mu: 0.6, sigma: 0.15 },
    adaptive: true,
  },
  {
    id: 'music-presence-threshold',
    file: 'services/creative-brief.ts',
    value: 0.6,
    unit: 'ratio',
    controls: 'Content mode routing: above this + low speech → music mode',
    source: 'crg',
    sourceRef: 'signal:composite.montage_mode — music_energy > 0.6',
    prior: { mu: 0.6, sigma: 0.03 },
    adaptive: false,
  },
  {
    id: 'visual-change-threshold',
    file: 'services/creative-brief.ts',
    value: 0.3,
    unit: 'ratio',
    controls: 'Content mode routing: above this + low speech → visual mode',
    source: 'invented',
    sourceRef: 'D-004. CRG motion_intensity 0.2- = static; 0.3 = "clearly above static" for routing.',
    prior: { mu: 0.3, sigma: 0.08 },
    adaptive: true,
  },
  {
    id: 'non-speech-ceiling',
    file: 'services/creative-brief.ts',
    value: 0.3,
    unit: 'ratio',
    controls: 'Speech energy must be below this for music/visual mode',
    source: 'crg',
    sourceRef: 'signal:composite.montage_mode, mapping:visual.high_motion_fast_pacing — speech_energy < 0.3 used in 3+ nodes',
    prior: { mu: 0.3, sigma: 0.02 },
    adaptive: false,
  },
  {
    id: 'min-beat-density-bpm',
    file: 'services/creative-brief.ts',
    value: 20,
    unit: 'bpm',
    controls: 'Below this → ambient/tonal, no rhythm for beat-driven editing',
    source: 'invented',
    sourceRef: 'Slowest rhythmic music (ballads ~60 BPM) well above. Ambient/drone < 20.',
    prior: { mu: 20, sigma: 8 },
    adaptive: true,
  },
  {
    id: 'sparse-rhythm-bpm',
    file: 'services/creative-brief.ts',
    value: 60,
    unit: 'bpm',
    controls: 'Below this in music mode → phrase-driven not beat-driven prompt',
    source: 'domain',
    sourceRef: 'Below 60 BPM, individual beats too slow for beat-synced cutting. Classical rubato territory.',
    prior: { mu: 60, sigma: 15 },
    adaptive: true,
  },
  {
    id: 'low-motion-visual-threshold',
    file: 'services/creative-brief.ts',
    value: 0.3,
    unit: 'ratio',
    controls: 'Below this in visual mode → contemplative pacing adaptation',
    source: 'crg',
    sourceRef: 'signal:visual.motion_intensity — 0.2- = static, 0.7+ = high. 0.3 = static-to-moderate boundary.',
    prior: { mu: 0.3, sigma: 0.04 },
    adaptive: true,
  },
  {
    id: 'metronomic-beat-count',
    file: 'services/creative-brief.ts',
    value: 6,
    unit: 'count',
    controls: 'Consecutive beat-locked cuts before metronomic warning',
    source: 'crg',
    sourceRef: 'constraint:temporal.metronomic_beat_sync — 6+ consecutive, deduction -5. signal:audio.music_beat — 4+ → flag.',
    prior: { mu: 6, sigma: 0.5 },
    adaptive: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION TRACKER (decision-tracker.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'frame-match-tolerance',
    file: 'services/decision-tracker.ts',
    value: 3,
    unit: 'frames',
    controls: 'Overlay position within ±N frames = "kept" not "modified"',
    source: 'domain',
    sourceRef: '100ms at 30fps. Human cut-timing perception ~200ms (CRG theory:cognition.temporal_perception adjacent).',
    prior: { mu: 3, sigma: 1 },
    adaptive: true,
  },
  {
    id: 'overlay-proximity-range',
    file: 'services/decision-tracker.ts',
    value: 150,
    unit: 'frames',
    controls: 'Max distance for matching moved overlay to original decision',
    source: 'invented',
    sourceRef: '5s at 30fps. Beyond this, it is a different decision.',
    prior: { mu: 150, sigma: 50 },
    adaptive: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION PHYSICS (primitive-renderers.ts, choreography-computer.ts)
  // AE practice ranges cited in code comments — values within cited ranges.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'arc-magnitude',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.2,
    unit: 'ratio',
    controls: 'Arc path curvature for arc_in entrance',
    source: 'ae',
    sourceRef: 'AE practice: 10-25% of perpendicular axis for subtle arcs',
    aeRange: [0.1, 0.25],
    prior: { mu: 0.2, sigma: 0.04 },
    adaptive: true,
  },
  {
    id: 'squash-factor',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.08,
    unit: 'ratio',
    controls: 'Scale-up squash divergence (x vs y)',
    source: 'ae',
    sourceRef: 'AE practice: 5-10% divergence for subtle squash',
    aeRange: [0.05, 0.1],
    prior: { mu: 0.08, sigma: 0.013 },
    adaptive: true,
  },
  {
    id: 'pop-factor',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.12,
    unit: 'ratio',
    controls: 'Pop entrance energy (more energetic than scale-up)',
    source: 'ae',
    sourceRef: 'AE practice: 10-15% range',
    aeRange: [0.1, 0.15],
    prior: { mu: 0.12, sigma: 0.013 },
    adaptive: true,
  },
  {
    id: 'ghost-opacity',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.15,
    unit: 'ratio',
    controls: 'Ghost trail opacity for ghost exit',
    source: 'ae',
    sourceRef: 'AE practice: 10-20% ghost',
    aeRange: [0.1, 0.2],
    prior: { mu: 0.15, sigma: 0.025 },
    adaptive: true,
  },
  {
    id: 'scale-settle-frames',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 8,
    unit: 'frames',
    controls: 'Settle/overshoot duration for scale animations',
    source: 'ae',
    sourceRef: 'AE practice: 4-12 frames for scale settle',
    aeRange: [4, 12],
    prior: { mu: 8, sigma: 2 },
    adaptive: true,
  },
  {
    id: 'position-settle-frames',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 6,
    unit: 'frames',
    controls: 'Settle/overshoot duration for position animations',
    source: 'ae',
    sourceRef: 'Position overshoots less visibly than scale. 4-8 frame range.',
    aeRange: [4, 8],
    prior: { mu: 6, sigma: 1 },
    adaptive: true,
  },
  {
    id: 'ambient-pulse-cycle',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 90,
    unit: 'frames',
    controls: 'Ambient animation cycle duration (~3s at 30fps)',
    source: 'ae',
    sourceRef: 'AE practice: 2-4s ambient cycles',
    aeRange: [60, 120],
    prior: { mu: 90, sigma: 15 },
    adaptive: true,
  },
  {
    id: 'scale-pulse-amplitude',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.02,
    unit: 'ratio',
    controls: 'Subtle ambient scale pulse (2%)',
    source: 'ae',
    sourceRef: 'AE practice: 1-3% scale for subtle ambient pulse',
    aeRange: [0.01, 0.03],
    prior: { mu: 0.02, sigma: 0.005 },
    adaptive: true,
  },
  {
    id: 'opacity-breathe-range',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.15,
    unit: 'ratio',
    controls: 'Ambient opacity variance (breathing)',
    source: 'ae',
    sourceRef: 'AE practice: 10-20% opacity variance for breathing',
    aeRange: [0.1, 0.2],
    prior: { mu: 0.15, sigma: 0.025 },
    adaptive: true,
  },
  {
    id: 'float-amplitude-px',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 3,
    unit: 'px',
    controls: 'Ambient vertical float amplitude',
    source: 'ae',
    sourceRef: 'AE practice: 2-5px for subtle floating at MG scale',
    aeRange: [2, 5],
    prior: { mu: 3, sigma: 0.75 },
    adaptive: true,
  },
  {
    id: 'anticipation-ratio',
    file: 'motion-graphics/engine/choreography-computer.ts',
    value: 0.2,
    unit: 'ratio',
    controls: 'Anticipation phase as fraction of entrance duration',
    source: 'ae',
    sourceRef: 'AE practice: 15-25% of entrance for anticipation',
    aeRange: [0.15, 0.25],
    prior: { mu: 0.2, sigma: 0.025 },
    adaptive: true,
  },
  {
    id: 'beat-brightness-spike',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.08,
    unit: 'ratio',
    controls: 'Transient brightness increase on beat hit',
    source: 'ae',
    sourceRef: 'AE practice: transient response is sharper than beat. 5-10% range.',
    aeRange: [0.05, 0.1],
    prior: { mu: 0.08, sigma: 0.013 },
    adaptive: true,
  },
  {
    id: 'beat-scale-max',
    file: 'motion-graphics/engine/primitive-renderers.ts',
    value: 0.05,
    unit: 'ratio',
    controls: 'Max scale increase on beat (5%)',
    source: 'crg',
    sourceRef: 'CRG overshoot 102-105% maps to 2-5% range',
    prior: { mu: 0.05, sigma: 0.007 },
    adaptive: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL GATE (structural-gate.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'mg-element-count-limit',
    file: 'motion-graphics/engine/structural-gate.ts',
    value: 6,
    unit: 'count',
    controls: 'Max elements in one MG composition before warning',
    source: 'domain',
    sourceRef: 'Professional MG rarely exceeds 5-6 visible elements. CRG active_overlays_count (>3) measures TIMELINE overlays, not composition elements — different concept.',
    prior: { mu: 6, sigma: 1 },
    adaptive: true,
  },
  {
    id: 'mg-text-element-limit',
    file: 'motion-graphics/engine/structural-gate.ts',
    value: 3,
    unit: 'count',
    controls: 'Max text elements in 45% width zone',
    source: 'domain',
    sourceRef: '3+ text elements in 45% width risks line overflow',
    prior: { mu: 3, sigma: 0.5 },
    adaptive: true,
  },
  {
    id: 'contrast-threshold',
    file: 'motion-graphics/engine/structural-gate.ts',
    value: 0.7,
    unit: 'luminance-ratio',
    controls: 'Light text on bright frame = low contrast warning',
    source: 'wcag',
    sourceRef: 'WCAG AA 4.5:1 for normal text, AA 3:1 for large text. CRG constant:typography.wcag_aa_normal_contrast = 4.5:1 (NOT_OVERRIDABLE). 0.7 luminance is a proxy — should migrate to actual WCAG ratio.',
    prior: { mu: 0.7, sigma: 0 },
    adaptive: false,
    fixed: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSITION PLANNER (composition-planner.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'alignment-threshold',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 0.7,
    unit: 'ratio',
    controls: 'Face+voice emotional alignment — above this = cinematic moment',
    source: 'invented',
    sourceRef: 'No CRG node. High alignment = face and voice express same emotion.',
    prior: { mu: 0.7, sigma: 0.1 },
    adaptive: true,
  },
  {
    id: 'energy-rise-threshold',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 0.3,
    unit: 'ratio',
    controls: 'Significant energy rise detection',
    source: 'invented',
    sourceRef: 'No CRG node. Significant rise = 0.3+ delta in energy.',
    prior: { mu: 0.3, sigma: 0.1 },
    adaptive: true,
  },
  {
    id: 'cinematic-moment-threshold',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 0.6,
    unit: 'ratio',
    controls: 'Cinematic moment score → triggers premium composition budget',
    source: 'invented',
    sourceRef: 'CRG signal:composite.cinematic_moment is boolean (2+ tracks peak within 500ms), not a 0.6 scalar.',
    prior: { mu: 0.6, sigma: 0.15 },
    adaptive: true,
  },
  {
    id: 'visceral-impact-drift',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 0.7,
    unit: 'ratio',
    controls: 'visceral_impact above this → drift animation on hold',
    source: 'invented',
    sourceRef: 'Only dramatic content triggers drift.',
    prior: { mu: 0.7, sigma: 0.1 },
    adaptive: true,
  },
  {
    id: 'drift-px',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 15,
    unit: 'px',
    controls: 'Drift distance during hold',
    source: 'ae',
    sourceRef: 'AE practice: 10-20px for subtle hold drift',
    aeRange: [10, 20],
    prior: { mu: 15, sigma: 2.5 },
    adaptive: true,
  },
  {
    id: 'scale-pulse-value',
    file: 'motion-graphics/engine/composition-planner.ts',
    value: 1.05,
    unit: 'multiplier',
    controls: 'Scale pulse on energetic+fast content',
    source: 'crg',
    sourceRef: 'CRG overshoot 102-105% range. 1.05 = 5% = top of range.',
    prior: { mu: 1.05, sigma: 0.008 },
    adaptive: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOTION THEME RESOLVER (motion-theme-resolver.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'speech-energy-speed-weight',
    file: 'data/motion-theme-resolver.ts',
    value: 0.3,
    unit: 'weight',
    controls: 'speech.energy → animation speed multiplier',
    source: 'invented',
    sourceRef: 'No CRG source for signal-to-animation-property weights.',
    prior: { mu: 0.3, sigma: 0.1 },
    adaptive: true,
  },
  {
    id: 'motion-intensity-density-threshold',
    file: 'data/motion-theme-resolver.ts',
    value: 0.7,
    unit: 'ratio',
    controls: 'High motion → reduce graphic density',
    source: 'crg',
    sourceRef: 'mapping:visual.high_motion_fast_pacing — motion_intensity > 0.7 sustained 2+ seconds.',
    prior: { mu: 0.7, sigma: 0.03 },
    adaptive: false,
  },
  {
    id: 'time-since-cut-density-threshold',
    file: 'data/motion-theme-resolver.ts',
    value: 30,
    unit: 'frames',
    controls: 'Too close to a cut → suppress MG density',
    source: 'invented',
    sourceRef: 'No CRG source. 30 frames = 1s at 30fps.',
    prior: { mu: 30, sigma: 10 },
    adaptive: true,
  },
  {
    id: 'music-energy-blur-weight',
    file: 'data/motion-theme-resolver.ts',
    value: 0.8,
    unit: 'multiplier',
    controls: 'music_energy → backdrop blur multiplier',
    source: 'invented',
    sourceRef: 'No CRG source.',
    prior: { mu: 0.8, sigma: 0.2 },
    adaptive: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER (moment-weight, vjepa, director-agent, edl-executor)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'moment-weight-heuristic',
    file: 'services/moment-weight-service.ts',
    value: 0.55,
    unit: 'weight',
    controls: 'Engineering heuristic for weight computation',
    source: 'invented',
    sourceRef: 'No CRG or doc source.',
    prior: { mu: 0.55, sigma: 0.15 },
    adaptive: true,
  },
  {
    id: 'vjepa-batch-size',
    file: 'services/vjepa-service.ts',
    value: 30,
    unit: 'count',
    controls: 'V-JEPA inference batch size',
    source: 'domain',
    sourceRef: 'Based on "warm container handles ~20 in 10-20s". System limit, not creative threshold.',
    prior: { mu: 30, sigma: 0 },
    adaptive: false,
    fixed: true,
  },
  {
    id: 'api-delay-between-clips',
    file: 'agent/director-agent.ts',
    value: 2.5,
    unit: 'seconds',
    controls: 'Delay between API calls to stay under rate limit',
    source: 'domain',
    sourceRef: 'Rate limit avoidance. System constraint, not creative threshold.',
    prior: { mu: 2.5, sigma: 0 },
    adaptive: false,
    fixed: true,
  },
  {
    id: 'content-shape-significance',
    file: 'motion-graphics/engine/content-shape-analyzer.ts',
    value: 0.7,
    unit: 'ratio',
    controls: 'High-significance frames should not compete with graphics',
    source: 'invented',
    sourceRef: 'No CRG source.',
    prior: { mu: 0.7, sigma: 0.1 },
    adaptive: true,
  },
  {
    id: 'caption-zone-offset',
    file: 'motion-graphics/engine/composition-renderer.tsx',
    value: 0.22,
    unit: 'ratio',
    controls: 'Bottom caption zone as fraction of frame height',
    source: 'domain',
    sourceRef: 'Typical captions occupy bottom 15-20%. 22% provides margin.',
    prior: { mu: 0.22, sigma: 0.03 },
    adaptive: true,
  },
  {
    id: 'crg-max-validation-passes',
    file: 'motion-graphics/engine/crg-constraint-validator.ts',
    value: 3,
    unit: 'count',
    controls: 'Max iterative validation passes before accepting',
    source: 'domain',
    sourceRef: 'CEO review Section 2 specified max 3 passes.',
    prior: { mu: 3, sigma: 0 },
    adaptive: false,
    fixed: true,
  },
  {
    id: 'signal-color-complexity-ceiling',
    file: 'services/signal-registry.ts',
    value: 8,
    unit: 'count',
    controls: 'Max distinct colors = max color complexity',
    source: 'domain',
    sourceRef: 'Typical dominant color extraction yields 3-8 colors.',
    prior: { mu: 8, sigma: 2 },
    adaptive: true,
  },
];

// ─── Derived helpers ────────────────────────────────────────────────────────

export function getThreshold(id: string): ThresholdEntry | undefined {
  return THRESHOLD_REGISTRY.find(t => t.id === id);
}

export function getAdaptiveThresholds(): ThresholdEntry[] {
  return THRESHOLD_REGISTRY.filter(t => t.adaptive && !t.fixed);
}

export function getBySource(source: ThresholdSource): ThresholdEntry[] {
  return THRESHOLD_REGISTRY.filter(t => t.source === source);
}

// ─── Summary stats ──────────────────────────────────────────────────────────

export function registrySummary(): {
  total: number;
  bySource: Record<ThresholdSource, number>;
  adaptive: number;
  fixed: number;
} {
  const bySource: Record<ThresholdSource, number> = { crg: 0, ae: 0, domain: 0, wcag: 0, invented: 0 };
  let adaptive = 0;
  let fixed = 0;

  for (const t of THRESHOLD_REGISTRY) {
    bySource[t.source]++;
    if (t.adaptive && !t.fixed) adaptive++;
    if (t.fixed) fixed++;
  }

  return { total: THRESHOLD_REGISTRY.length, bySource, adaptive, fixed };
}
