/**
 * EditDecision types — shared output contract for Mode 2 signal-driven editing.
 *
 * These types define the standard Edit Decision List (EDL) format produced by
 * signal-executor.ts and consumed by constraint-enforcer.ts, humanize-pass.ts,
 * and the EDL executor.
 *
 * Extracted here so that when signal-executor.ts is deleted/replaced, all
 * downstream consumers can update their import path without touching the
 * type definitions themselves.
 *
 * Consumers:
 *   - lib/editron/services/constraint-enforcer.ts
 *   - lib/editron/services/humanize-pass.ts
 *   - lib/editron/agent/director-agent.ts (Path D)
 */

// ─── Decision Types ──────────────────────────────────────────────────────────

export interface EditDecision {
  type: 'zoom' | 'transition' | 'graphic' | 'sfx' | 'sfx-trigger' | 'speed-change' |
        'filter-change' | 'caption-emphasis' | 'audio-duck' | 'fade' | 'camera-shake' |
        'cut' | 'pacing';
  frame: number;
  confidence: number;
  source: string;               // mapping ID that produced this
  technique: string;            // technique ID applied
  params: Record<string, number | string>;
  complements?: EditDecision[];  // paired SFX, caption emphasis, etc.
  reason?: string;               // from mapping's "why" field
}

export interface EditDecisionList {
  decisions: EditDecision[];
  metadata: {
    totalMappingsEvaluated: number;
    totalMappingsFired: number;
    totalDecisionsGenerated: number;
    totalDecisionsSuppressed: number;
    executionTimeMs: number;
  };
}
