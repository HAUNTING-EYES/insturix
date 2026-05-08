/**
 * Project Graph Writer — Graphiti Knowledge Dispatch (FLAG 10)
 *
 * After a project edit is finalized, dispatches a ProjectGraphRecord to Neo4j
 * via QStash. This enables Thompson Sampling and brand learning.
 *
 * Data written:
 *   - Genre parameters used (9 dials)
 *   - Moment weights (all source fields)
 *   - Techniques used (counts per technique)
 *   - User overrides (what user changed)
 *   - Quality score + constraint violations
 *   - Ghost segments restored count
 *
 * Dispatch: Non-blocking via QStash (async). Pipeline doesn't wait.
 * Consumer: Graphiti (graph-service.ts) enriches brand + user nodes.
 */

import type { GenreParameters } from './graph-query';
import type { MomentWeight } from './moment-weight-service';
import type { ConstraintViolation } from './constraint-enforcer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserOverride {
  originalDecision: string;
  overrideDecision: string;
  affectedTechnique: string;
  timestampInVideoMs: number;
  momentWeightAtOverride: number;
}

export interface ProjectGraphRecord {
  // Identity
  projectId: string;
  brandId?: string;
  userId: string;
  timestamp: Date;

  // Profile used (← TRIBE §1C: bandit needs to know which arm produced this outcome)
  profileId: string;

  // Input characteristics
  videoDurationSec: number;
  speechCoverage: number;
  genreParameters: GenreParameters;
  momentWeights: MomentWeight[];

  // Decisions made
  totalEdits: number;
  techniquesUsed: Record<string, number>;
  transitionsUsed: Record<string, number>;
  zoomCount: number;
  graphicCount: number;
  captionMode: string;

  // Quality
  qualityScore: number;
  constraintViolations: Array<{
    constraint: string;
    severity: string;
    autoCorrected: boolean;
  }>;

  // User behavior (the learning signal)
  userOverrides: UserOverride[];
  userRendered: boolean;
  userPublished: boolean;

  // Ghost segments
  segmentsRemoved: number;
  segmentsRestoredByUser: number;
}

// ─── Dispatch Function ──────────────────────────────────────────────────────

/**
 * Dispatch project outcome to Graphiti via QStash.
 * Non-blocking — failures are logged but don't affect the pipeline.
 *
 * Called after:
 *   - User renders the final video (user_rendered = true)
 *   - OR user finishes overriding edits (user_rendered = false but overrides exist)
 *   - OR auto-edit completes with no user interaction (baseline data)
 */
export async function dispatchProjectGraphRecord(record: ProjectGraphRecord): Promise<boolean> {
  try {
    const qstashToken = process.env.QSTASH_TOKEN;
    if (!qstashToken) {
      console.warn('[ProjectGraphWriter] QSTASH_TOKEN not set — skipping graph dispatch');
      return false;
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

    const response = await fetch(
      `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${qstashToken}`,
          'Content-Type': 'application/json',
          'Upstash-Retries': '2',
        },
        body: JSON.stringify({
          action: 'project_edit_complete',
          data: {
            projectId: record.projectId,
            userId: record.userId,
            brandId: record.brandId,
            profileId: record.profileId,
            timestamp: record.timestamp.toISOString(),

            // Genre parameters — for Thompson Sampling to learn optimal values per brand
            genreParameters: record.genreParameters,

            // What techniques were used and how often
            techniquesUsed: record.techniquesUsed,
            transitionsUsed: record.transitionsUsed,
            totalEdits: record.totalEdits,
            zoomCount: record.zoomCount,
            graphicCount: record.graphicCount,

            // Quality outcome — reward signal for Thompson Sampling
            qualityScore: record.qualityScore,
            constraintViolationCount: record.constraintViolations.length,
            blockerViolations: record.constraintViolations.filter(v => v.severity === 'blocker').length,

            // User behavior — THE learning signal
            // "User kept the edits" = positive reward
            // "User overrode X" = negative reward for that technique choice
            userRendered: record.userRendered,
            userPublished: record.userPublished,
            overrideCount: record.userOverrides.length,
            overrides: record.userOverrides.map(o => ({
              from: o.originalDecision,
              to: o.overrideDecision,
              technique: o.affectedTechnique,
              weight: o.momentWeightAtOverride,
            })),

            // Ghost segment restoration = user disagreed with silence removal
            segmentsRemoved: record.segmentsRemoved,
            segmentsRestoredByUser: record.segmentsRestoredByUser,

            // Moment weights for learning weight assignment
            momentWeightSummary: {
              count: record.momentWeights.length,
              avgWeight: record.momentWeights.length > 0
                ? record.momentWeights.reduce((s, w) => s + w.final_weight, 0) / record.momentWeights.length
                : 0.5,
              highWeightCount: record.momentWeights.filter(w => w.final_weight > 0.7).length,
              lowWeightCount: record.momentWeights.filter(w => w.final_weight < 0.3).length,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`[ProjectGraphWriter] QStash dispatch failed: ${response.status} ${response.statusText}`);
      return false;
    }

    console.log(`[ProjectGraphWriter] Dispatched project outcome for ${record.projectId} (quality: ${record.qualityScore}, overrides: ${record.userOverrides.length})`);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ProjectGraphWriter] Dispatch error: ${msg}`);
    return false;
  }
}

/**
 * Build a ProjectGraphRecord from available project data.
 * Called by the Director Agent after completion, or by the render endpoint after render.
 */
export function buildProjectGraphRecord(params: {
  projectId: string;
  userId: string;
  brandId?: string;
  profileId: string;
  videoDurationSec: number;
  speechCoverage: number;
  genreParameters: GenreParameters;
  momentWeights: MomentWeight[];
  decisions: Array<{ type: string; technique: string; params: Record<string, unknown> }>;
  qualityScore: number;
  constraintViolations: ConstraintViolation[];
  captionMode: string;
  segmentsRemoved: number;
  segmentsRestoredByUser?: number;
  userOverrides?: UserOverride[];
  userRendered?: boolean;
  userPublished?: boolean;
}): ProjectGraphRecord {
  // Count techniques
  const techniquesUsed: Record<string, number> = {};
  const transitionsUsed: Record<string, number> = {};
  let zoomCount = 0;
  let graphicCount = 0;

  for (const d of params.decisions) {
    techniquesUsed[d.technique] = (techniquesUsed[d.technique] || 0) + 1;
    if (d.type === 'transition') {
      const transType = (d.params['type'] as string) ?? 'hard-cut';
      transitionsUsed[transType] = (transitionsUsed[transType] || 0) + 1;
    }
    if (d.type === 'zoom') zoomCount++;
    if (d.type === 'graphic') graphicCount++;
  }

  return {
    projectId: params.projectId,
    userId: params.userId,
    brandId: params.brandId,
    profileId: params.profileId,
    timestamp: new Date(),
    videoDurationSec: params.videoDurationSec,
    speechCoverage: params.speechCoverage,
    genreParameters: params.genreParameters,
    momentWeights: params.momentWeights,
    totalEdits: params.decisions.length,
    techniquesUsed,
    transitionsUsed,
    zoomCount,
    graphicCount,
    captionMode: params.captionMode,
    qualityScore: params.qualityScore,
    constraintViolations: params.constraintViolations.map(v => ({
      constraint: v.constraintId,
      severity: v.severity,
      autoCorrected: v.autoCorrected,
    })),
    userOverrides: params.userOverrides ?? [],
    userRendered: params.userRendered ?? false,
    userPublished: params.userPublished ?? false,
    segmentsRemoved: params.segmentsRemoved,
    segmentsRestoredByUser: params.segmentsRestoredByUser ?? 0,
  };
}
