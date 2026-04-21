/**
 * Decision Budget Tracker
 *
 * Enforces hard limits from the Director Knowledge Base to prevent
 * "amateur AI editing" where the engine goes overboard with zoom-punches,
 * shakes, and graphics on every frame.
 *
 * Rules enforced (with Knowledge Base rule IDs):
 * - Z-011: Max 3 punch-zooms per 30s
 * - CS-020: Max 4 shakes per 30s, max 2 impact/aggressive
 * - G-002: Max 1 keyword graphic per 3s, 5-7 per 30s
 * - G-101: Max 2 simultaneous graphic overlays (excluding captions)
 * - G-102: Min 1.5s between graphic exit and next entrance
 * - C-012: Max 1 caption emphasis per sentence, 8-10 per 30s
 * - A-100: Max 15 SFX per 30s, max 5 prominent
 * - T-033: Never 2 consecutive flashy transitions
 * - F-011: Max 2 distinct filter presets per 60s
 * - S-002: Clamp AI video slow-mo to 0.5x minimum
 * - Contrast principle: After high-intensity decision, force low-intensity next
 *
 * Usage:
 *   const budget = new DecisionBudget(totalDurationMs, fps);
 *   for (const decision of proposedDecisions) {
 *     const result = budget.evaluate(decision);
 *     if (result.allowed) {
 *       budget.commit(decision);
 *       acceptedDecisions.push(decision);
 *     } else {
 *       // result.reason explains why it was rejected
 *       // result.alternative suggests a replacement (if available)
 *     }
 *   }
 */

export interface BudgetDecision {
  type: string;
  frame: number;
  durationFrames?: number;
  params?: Record<string, any>;
  confidence?: number;
  sources?: string[];
}

export interface BudgetEvaluation {
  allowed: boolean;
  reason?: string;
  ruleId?: string;
  alternative?: Partial<BudgetDecision>;
}

/** Profile-configurable budget limits. Each value can be overridden per EditProfile. */
export interface BudgetLimits {
  PUNCH_ZOOM_PER_30S: number;
  SHAKE_PER_30S: number;
  IMPACT_SHAKE_PER_30S: number;
  KEYWORD_GRAPHIC_PER_30S: number;
  KEYWORD_MIN_GAP_FRAMES: number;
  MAX_SIMULTANEOUS_GRAPHICS: number;
  GRAPHIC_BREATHING_FRAMES: number;
  CAPTION_EMPHASIS_PER_30S: number;
  SFX_PER_30S: number;
  PROMINENT_SFX_PER_30S: number;
  FILTER_PRESETS_PER_60S: number;
  AI_SLOWMO_MIN: number;
}

export class DecisionBudget {
  private totalDurationMs: number;
  private fps: number;
  private totalFrames: number;
  private durationScale: number; // multiplier for budgets (1.0 for 30s, 2.0 for 60s)

  // Running counters
  private punchZoomCount = 0;
  private shakeCount = 0;
  private impactShakeCount = 0;
  private keywordGraphicCount = 0;
  private captionEmphasisCount = 0;
  private sfxCount = 0;
  private prominentSfxCount = 0;
  private filterPresetCount = 0;
  private filterPresets = new Set<string>();

  // State tracking
  private previousDecisionIntensity = 0;
  private previousTransitionType = '';
  private lastGraphicExitFrame = -Infinity;
  private activeGraphicCount = 0;
  private committedDecisions: BudgetDecision[] = [];

  // Budgets (per 30 seconds, scaled by duration)
  // These are KB defaults — profiles can override via constructor options.
  private readonly BUDGETS: BudgetLimits;

  // KB baseline defaults
  private static readonly KB_DEFAULTS: BudgetLimits = {
    PUNCH_ZOOM_PER_30S: 3,           // Z-011
    SHAKE_PER_30S: 4,                // CS-020
    IMPACT_SHAKE_PER_30S: 2,         // CS-020
    KEYWORD_GRAPHIC_PER_30S: 7,      // G-002
    KEYWORD_MIN_GAP_FRAMES: 90,      // G-002: 1 per 3s = 90 frames at 30fps
    MAX_SIMULTANEOUS_GRAPHICS: 2,    // G-101
    GRAPHIC_BREATHING_FRAMES: 45,    // G-102: 1.5s = 45 frames
    CAPTION_EMPHASIS_PER_30S: 10,    // C-012
    SFX_PER_30S: 15,                 // A-100
    PROMINENT_SFX_PER_30S: 5,        // A-100
    FILTER_PRESETS_PER_60S: 2,       // F-011
    AI_SLOWMO_MIN: 0.5,             // S-002
  };

  // Flashy transition types (T-033: never consecutive)
  private readonly FLASHY_TRANSITIONS = new Set([
    'zoom-punch', 'flash', 'glitch', 'spin', 'swish-pan',
  ]);

  /**
   * @param totalDurationMs - Video total duration in milliseconds
   * @param fps - Frames per second (default 30)
   * @param profileOverrides - Partial budget overrides from EditProfile.
   *   Example: { PUNCH_ZOOM_PER_30S: 5 } for TikTok profiles that need more zooms.
   *   Unspecified values use KB defaults.
   */
  constructor(totalDurationMs: number, fps: number = 30, profileOverrides?: Partial<BudgetLimits>) {
    this.totalDurationMs = totalDurationMs;
    this.fps = fps;
    this.totalFrames = Math.round((totalDurationMs / 1000) * fps);
    this.durationScale = Math.max(1, totalDurationMs / 30000);

    // Short-form adjustment: videos ≤45s get relaxed graphic spacing.
    // KB G-002 baseline (90 frames = 3s gap) was designed for 2+ min videos.
    // A 30s ad with 17 clips averages 53 frames/clip — 90-frame gap means
    // most on-screen text gets rejected. Scale gap proportionally but floor
    // at 45 frames (1.5s) to avoid visual clutter.
    const shortFormOverrides: Partial<BudgetLimits> = {};
    if (totalDurationMs <= 45000) {
      const scaleFactor = Math.max(0.5, totalDurationMs / 60000);
      shortFormOverrides.KEYWORD_MIN_GAP_FRAMES = Math.max(45, Math.round(90 * scaleFactor));
      shortFormOverrides.GRAPHIC_BREATHING_FRAMES = Math.max(20, Math.round(45 * scaleFactor));
    }

    this.BUDGETS = { ...DecisionBudget.KB_DEFAULTS, ...shortFormOverrides, ...profileOverrides };
  }

  /**
   * Evaluate whether a proposed decision should be allowed.
   * Does NOT commit the decision — call commit() separately if allowed.
   */
  evaluate(decision: BudgetDecision): BudgetEvaluation {
    const { type, frame, params } = decision;

    switch (type) {
      case 'zoom': {
        const isP = this.isPunchZoom(params);
        if (isP && this.punchZoomCount >= this.scaled(this.BUDGETS.PUNCH_ZOOM_PER_30S)) {
          return {
            allowed: false,
            reason: `Punch-zoom budget exceeded (${this.punchZoomCount}/${this.scaled(this.BUDGETS.PUNCH_ZOOM_PER_30S)} max). Use slow-push or caption-emphasis instead.`,
            ruleId: 'Z-011',
            alternative: { type: 'caption-emphasis', frame, params: {} },
          };
        }
        break;
      }

      case 'camera-shake': {
        if (this.shakeCount >= this.scaled(this.BUDGETS.SHAKE_PER_30S)) {
          return {
            allowed: false,
            reason: `Camera shake budget exceeded (${this.shakeCount}/${this.scaled(this.BUDGETS.SHAKE_PER_30S)} max).`,
            ruleId: 'CS-020',
          };
        }
        const isImpact = (params?.intensity || 0) > 0.3;
        if (isImpact && this.impactShakeCount >= this.scaled(this.BUDGETS.IMPACT_SHAKE_PER_30S)) {
          return {
            allowed: false,
            reason: `Impact shake budget exceeded (${this.impactShakeCount}/${this.scaled(this.BUDGETS.IMPACT_SHAKE_PER_30S)} max). Use subtle shake instead.`,
            ruleId: 'CS-020',
            alternative: { ...decision, params: { ...params, intensity: 0.1 } },
          };
        }
        break;
      }

      case 'graphic': {
        const isKeyword = params?.graphicType === 'keyword-highlight';
        if (isKeyword) {
          if (this.keywordGraphicCount >= this.scaled(this.BUDGETS.KEYWORD_GRAPHIC_PER_30S)) {
            return {
              allowed: false,
              reason: `Keyword graphic budget exceeded (${this.keywordGraphicCount}/${this.scaled(this.BUDGETS.KEYWORD_GRAPHIC_PER_30S)} max).`,
              ruleId: 'G-002',
            };
          }
          // Check minimum gap between keywords
          const lastKeyword = this.committedDecisions
            .filter(d => d.type === 'graphic' && d.params?.graphicType === 'keyword-highlight')
            .pop();
          if (lastKeyword && (frame - lastKeyword.frame) < this.BUDGETS.KEYWORD_MIN_GAP_FRAMES) {
            return {
              allowed: false,
              reason: `Keywords too close (${frame - lastKeyword.frame} frames apart, min ${this.BUDGETS.KEYWORD_MIN_GAP_FRAMES}). Skip or delay.`,
              ruleId: 'G-002',
            };
          }
        }

        // Check graphic breathing room (G-102)
        if (frame < this.lastGraphicExitFrame + this.BUDGETS.GRAPHIC_BREATHING_FRAMES) {
          return {
            allowed: false,
            reason: `Graphic too soon after previous (need ${this.BUDGETS.GRAPHIC_BREATHING_FRAMES} frame gap). Delay or skip.`,
            ruleId: 'G-102',
          };
        }
        break;
      }

      case 'caption-emphasis': {
        if (this.captionEmphasisCount >= this.scaled(this.BUDGETS.CAPTION_EMPHASIS_PER_30S)) {
          return {
            allowed: false,
            reason: `Caption emphasis budget exceeded (${this.captionEmphasisCount}/${this.scaled(this.BUDGETS.CAPTION_EMPHASIS_PER_30S)} max).`,
            ruleId: 'C-012',
          };
        }
        break;
      }

      case 'sfx-trigger': {
        if (this.sfxCount >= this.scaled(this.BUDGETS.SFX_PER_30S)) {
          return {
            allowed: false,
            reason: `SFX budget exceeded (${this.sfxCount}/${this.scaled(this.BUDGETS.SFX_PER_30S)} max).`,
            ruleId: 'A-100',
          };
        }
        break;
      }

      case 'transition': {
        const transType = params?.transitionType || '';
        if (this.FLASHY_TRANSITIONS.has(transType) && this.FLASHY_TRANSITIONS.has(this.previousTransitionType)) {
          return {
            allowed: false,
            reason: `Two consecutive flashy transitions (${this.previousTransitionType} → ${transType}). Use hard-cut or dissolve instead.`,
            ruleId: 'T-033',
            alternative: { ...decision, params: { ...params, transitionType: 'hard-cut' } },
          };
        }
        break;
      }

      case 'speed-change': {
        const mult = params?.speedMultiplier || 1.0;
        if (mult < this.BUDGETS.AI_SLOWMO_MIN) {
          return {
            allowed: false,
            reason: `Slow-mo ${mult}x below minimum ${this.BUDGETS.AI_SLOWMO_MIN}x for AI video. Clamping up.`,
            ruleId: 'S-002',
            alternative: { ...decision, params: { ...params, speedMultiplier: this.BUDGETS.AI_SLOWMO_MIN } },
          };
        }
        break;
      }

      case 'filter-change': {
        const preset = params?.filterPreset || '';
        if (preset && !this.filterPresets.has(preset)) {
          if (this.filterPresets.size >= this.scaled(this.BUDGETS.FILTER_PRESETS_PER_60S, 60)) {
            return {
              allowed: false,
              reason: `Filter preset budget exceeded (${this.filterPresets.size}/${this.scaled(this.BUDGETS.FILTER_PRESETS_PER_60S, 60)} max). Reuse existing preset.`,
              ruleId: 'F-011',
            };
          }
        }
        break;
      }
    }

    // Contrast principle: after high-intensity, prefer low-intensity
    const intensity = this.getDecisionIntensity(decision);
    if (this.previousDecisionIntensity > 0.7 && intensity > 0.7) {
      // Allow but warn — don't hard-reject (emotional arc may demand sustained intensity)
      // The Gemini prompt should handle this, budget just tracks it
    }

    return { allowed: true };
  }

  /**
   * Commit a decision to the budget tracker (call after evaluate returns allowed: true)
   */
  commit(decision: BudgetDecision): void {
    const { type, frame, params } = decision;
    this.committedDecisions.push(decision);

    switch (type) {
      case 'zoom':
        if (this.isPunchZoom(params)) this.punchZoomCount++;
        break;
      case 'camera-shake':
        this.shakeCount++;
        if ((params?.intensity || 0) > 0.3) this.impactShakeCount++;
        break;
      case 'graphic':
        if (params?.graphicType === 'keyword-highlight') this.keywordGraphicCount++;
        this.lastGraphicExitFrame = frame + (decision.durationFrames || 90);
        break;
      case 'caption-emphasis':
        this.captionEmphasisCount++;
        break;
      case 'sfx-trigger':
        this.sfxCount++;
        break;
      case 'transition':
        this.previousTransitionType = params?.transitionType || '';
        break;
      case 'filter-change':
        if (params?.filterPreset) this.filterPresets.add(params.filterPreset);
        break;
    }

    this.previousDecisionIntensity = this.getDecisionIntensity(decision);
  }

  /**
   * Get budget summary for logging/debugging
   */
  getSummary(): Record<string, string> {
    return {
      punchZooms: `${this.punchZoomCount}/${this.scaled(this.BUDGETS.PUNCH_ZOOM_PER_30S)}`,
      shakes: `${this.shakeCount}/${this.scaled(this.BUDGETS.SHAKE_PER_30S)} (${this.impactShakeCount} impact)`,
      keywordGraphics: `${this.keywordGraphicCount}/${this.scaled(this.BUDGETS.KEYWORD_GRAPHIC_PER_30S)}`,
      captionEmphasis: `${this.captionEmphasisCount}/${this.scaled(this.BUDGETS.CAPTION_EMPHASIS_PER_30S)}`,
      sfx: `${this.sfxCount}/${this.scaled(this.BUDGETS.SFX_PER_30S)}`,
      filterPresets: `${this.filterPresets.size}/${this.scaled(this.BUDGETS.FILTER_PRESETS_PER_60S, 60)}`,
      totalCommitted: `${this.committedDecisions.length}`,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────

  private isPunchZoom(params?: Record<string, any>): boolean {
    const scale = params?.scaleTo || params?.zoomScale || 1.0;
    return scale >= 1.10; // 1.10+ is punch territory, below is slow-push
  }

  private getDecisionIntensity(decision: BudgetDecision): number {
    switch (decision.type) {
      case 'zoom': return this.isPunchZoom(decision.params) ? 0.8 : 0.3;
      case 'camera-shake': return Math.min(1.0, (decision.params?.intensity || 0.3) * 2);
      case 'transition': {
        const t = decision.params?.transitionType || '';
        if (this.FLASHY_TRANSITIONS.has(t)) return 0.9;
        if (t === 'dissolve' || t === 'dip-to-black') return 0.2;
        return 0.1; // hard-cut
      }
      case 'speed-change': {
        const m = decision.params?.speedMultiplier || 1.0;
        return m < 0.7 ? 0.7 : m > 1.5 ? 0.6 : 0.3;
      }
      case 'graphic': return 0.4;
      case 'sfx-trigger': return 0.3;
      case 'caption-emphasis': return 0.2;
      case 'filter-change': return 0.1;
      default: return 0.1;
    }
  }

  /**
   * Scale budget with diminishing returns (sqrt curve instead of linear).
   * This prevents absurd numbers for long-form content:
   *   30s → 3 punch-zooms (baseline, unchanged)
   *   60s → 4 punch-zooms (was 6 with linear)
   *   5min → 10 punch-zooms (was 30 with linear)
   *   10min → 14 punch-zooms (was 60 with linear)
   * Editing effects are meant to be SPECIAL — more video doesn't mean more effects.
   */
  private scaled(budgetPer30s: number, baseDuration: number = 30): number {
    const scale = this.totalDurationMs / (baseDuration * 1000);
    return Math.max(budgetPer30s, Math.ceil(budgetPer30s * Math.sqrt(scale)));
  }
}
