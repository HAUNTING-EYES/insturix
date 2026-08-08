/**
 * S6-A — SFX coverage loop tooling (additive; NO selector behavior change).
 *
 * Closes the permanent S6 loop pieces that the audit found missing:
 *   1. Runtime selection-miss receipt — recorded whenever the selector returns
 *      no-match/silence on a production-qualified opportunity.
 *   2. Coverage-gap aggregation + prioritization — group misses into coverage
 *      gaps (by role/surface/query-token) and rank them for the review program.
 *   3. Richer reviewer metadata — additive extension fields for the review
 *      workflow (multi-role evidence, event family, style family, material,
 *      genuine direction/speed, tail, loopability, risk class, tier,
 *      publication/canary metadata).
 *
 * This module NEVER reads or mutates the selector; it only records evidence and
 * metadata for the human review pipeline. Remote semantic reranking stays
 * disabled; selector weights/thresholds are untouched (S2/S4 gates).
 */

import type { SfxCatalogDirection, SfxCatalogEventRole, SfxCatalogSurface } from './sfx-catalog';

export const SFX_COVERAGE_VERSION = 'editron-sfx-s6-coverage-v1' as const;

// ── 1. Runtime selection-miss receipt ─────────────────────────────────────

export interface SfxRuntimeMissReceipt {
  version: typeof SFX_COVERAGE_VERSION;
  receiptId: string;
  opportunityId?: string;
  producerPath: string;
  role: SfxCatalogEventRole;
  surface: SfxCatalogSurface;
  query: string;
  direction?: SfxCatalogDirection;
  motionSpeed?: string;
  material?: string;
  decision: 'no-match' | 'silence';
  /** When 'silence', whether the silence was form-intended (allowed) or a miss. */
  silenceFormIntended: boolean;
  recordedAt: string;
  sourceRef: string;
  producerVersion?: string;
}

export interface RuntimeMissCollector {
  total: number;
  byRole: Record<string, number>;
  bySurface: Record<string, number>;
  receipts: SfxRuntimeMissReceipt[];
}

export function collectRuntimeMisses(receipts: SfxRuntimeMissReceipt[]): RuntimeMissCollector {
  const byRole: Record<string, number> = {};
  const bySurface: Record<string, number> = {};
  let total = 0;
  for (const r of receipts) {
    total += 1;
    byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    bySurface[r.surface] = (bySurface[r.surface] ?? 0) + 1;
  }
  return { total, byRole, bySurface, receipts: [...receipts].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)) };
}

// ── 2. Coverage-gap aggregation + prioritization ──────────────────────────

export interface CoverageGap {
  /** Stable id grouping misses: role+surface+normalized-query-token. */
  gapId: string;
  role: SfxCatalogEventRole;
  surface: SfxCatalogSurface;
  queryToken: string;
  missCount: number;
  /** Number of unique receipts that hit this gap. */
  uniqueReceiptCount: number;
  /** ⚠️ INVENTED priority hint (0..1, higher = review first). Tooling only, not a selector knob. */
  priority: number;
  latestMissAt: string;
  sampleQueries: string[];
}

/** ⚠️ INVENTED — rough max entries per priority page; purely presentational. */
export const COVERAGE_PAGE_MIN_GAP = 3;

export function aggregateCoverageGaps(receipts: SfxRuntimeMissReceipt[]): CoverageGap[] {
  const byGap = new Map<string, SfxRuntimeMissReceipt[]>();
  for (const r of receipts) {
    const token = normalizeQueryToken(r.query) || 'unknown';
    const id = `${r.role}:${r.surface}:${token}`;
    const list = byGap.get(id) ?? [];
    list.push(r);
    byGap.set(id, list);
  }

  const gaps: CoverageGap[] = [];
  for (const [gapId, list] of byGap) {
    const latest = [...list].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    gaps.push({
      gapId,
      role: latest.role,
      surface: latest.surface,
      queryToken: normalizeQueryToken(latest.query) || 'unknown',
      missCount: list.length,
      uniqueReceiptCount: list.length,
      priority: priorityForGap(list.length),
      latestMissAt: latest.recordedAt,
      sampleQueries: [...new Set(list.map((r) => r.query))].slice(0, 3),
    });
  }
  gaps.sort((a, b) => b.priority - a.priority || b.missCount - a.missCount);
  return gaps;
}

/** ⚠️ INVENTED priority curve — review most-missed gaps first; tooling guidance only. */
function priorityForGap(missCount: number): number {
  return Math.min(1, missCount / 5);
}

function normalizeQueryToken(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
}

// ── 3. Richer reviewer metadata (additive review contract) ────────────────

export interface SfxReviewMetadataExtensionV1 {
  autoEligible?: boolean;
  manualEligible?: boolean;
  domains: string[];
  /** Multiple plausible editorial roles (S4 will use role agreement as ranking later). */
  multipleRoleEvidence?: Array<{ role: SfxCatalogEventRole; confidence: number; source: string }>;
  eventFamilies: string[];
  styleFamily?: string;
  material?: string;
  /** Genuine direction (never fabricated for neutral audio). */
  genuineDirection?: SfxCatalogDirection;
  motionSpeed?: string;
  tailMs?: number;
  loopable?: boolean;
  riskClass?: 'low' | 'medium' | 'high';
  reviewerEvidenceRefs: string[];
  rights: {
    licenseId: string;
    status: 'licensed' | 'pending' | 'rejected';
    sourceAssetId?: string;
  };
  publicationState: 'unpublished' | 'reviewed' | 'published' | 'rolled-back';
  /** Rendered contextual canary metadata (S5 gate; empty = canary not yet run). */
  renderedCanary?: {
    canaryId: string;
    status: 'queued' | 'passed' | 'failed' | 'absent';
    artifactRef?: string;
    ranAt?: string;
  };
  /** Cross-reviewer disagreement record (S6-A adjudication). */
  adjudication?: {
    conflictingReviewerIds: string[];
    resolved: boolean;
    result: 'accepted-consensus' | 'adjudicated-choice' | 'unresolved';
    note?: string;
  };
}

export function validateReviewMetadataExtension(ext: Partial<SfxReviewMetadataExtensionV1>): SfxReviewMetadataExtensionV1 {
  if (ext.multipleRoleEvidence) {
    for (const item of ext.multipleRoleEvidence) {
      if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
        throw new Error(`multipleRoleEvidence confidence out of range for ${item.role}`);
      }
    }
  }
  if (ext.genuineDirection && !['left', 'right', 'up', 'down', 'in', 'out', 'neutral'].includes(ext.genuineDirection)) {
    throw new Error(`genuineDirection invalid: ${ext.genuineDirection}`);
  }
  return {
    domains: ext.domains ?? [],
    eventFamilies: ext.eventFamilies ?? [],
    reviewerEvidenceRefs: ext.reviewerEvidenceRefs ?? [],
    rights: ext.rights ?? { licenseId: 'unset', status: 'pending' },
    publicationState: ext.publicationState ?? 'unpublished',
    ...ext,
  };
}