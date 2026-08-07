/**
 * MG delivery integrity (brief §16, Fix-4, 2026-08-05).
 *
 * Reliability foundation that makes "an expected MG silently vanished but the export says success" impossible.
 * It does NOT create a second durable-job system — it CONSOLIDATES the per-moment delivery ledger the codegen lane
 * already writes:
 *   - `intelligence.mgCodegenRun.outcomes`       (sync, decision-time)      → edl-executor.ts
 *   - `intelligence.mgCodegenRun.asyncOutcomes`  (durable worker)           → mg-render-job-runner.ts
 *   - landed `MG_SEQUENCE` overlays in `projects.overlays` (metadata.mgRenderJobId)
 *
 * NOTHING here inserts a plain card, atomic overlay, template, or deterministic composition as a replacement for a
 * missing codegen MG (non-negotiable §3.2/§3.3). A missing MG is surfaced as `missingMGs` and the render policy
 * decides: preview (surface), degraded_allowed (warn + proceed + completed_with_warnings semantics), strict (block).
 */

export type MgRenderIntegrityPolicy = 'preview' | 'degraded_allowed' | 'strict';

/** Default = degraded_allowed for the client-facing auto-edit path (§24.3); strict is opt-in via env. */
export function renderIntegrityPolicy(env: Record<string, string | undefined> = process.env): MgRenderIntegrityPolicy {
  const raw = (env.MG_RENDER_INTEGRITY_POLICY ?? 'degraded_allowed').trim().toLowerCase();
  if (raw === 'preview' || raw === 'strict') return raw;
  return 'degraded_allowed';
}

/**
 * A decision-time outcome record. Only the fields the preflight needs are declared; unknown extras are ignored.
 * Mirrors `MgCodegenDecisionOutcome` (edl-executor.ts:4155-4166) and the worker's asyncOutcomes entries
 * (mg-render-job-runner.ts:391-401).
 */
export interface MgDeliveryOutcomeRecord {
  jobId?: string;
  momentId?: string;
  candidateId?: string;
  frame?: number;
  status?: string;
  sequenceId?: string;
  reason?: string;
  completedAt?: string;
}

export interface MgPreflightMissing {
  momentId?: string;
  jobId?: string;
  status: 'queued' | 'running';
  reason: string;
}

export interface MGRenderPreflight {
  policy: MgRenderIntegrityPolicy;
  expected: string[];
  delivered: string[];
  declined: string[];
  unavailable: string[];
  rejected: string[];
  pending: string[];
  failed: string[];
  timedOut: string[];
  missingMGs: MgPreflightMissing[];
  degraded: boolean;
  lastPreflightAt: string;
}

interface MgPreflightProject {
  overlays?: unknown[];
  intelligence?: {
    mgCodegenRun?: {
      outcomes?: MgDeliveryOutcomeRecord[];
      asyncOutcomes?: MgDeliveryOutcomeRecord[];
    };
  };
}

const jobIdOf = (overlay: unknown): string | null => {
  const meta = (overlay as { metadata?: Record<string, unknown> })?.metadata;
  const j = meta?.mgRenderJobId ?? meta?.jobId;
  return typeof j === 'string' && j ? j : null;
};

/** Pure: consolidate the existing ledger into a preflight. Deterministic for a given project doc. */
export function computeMGRenderPreflight(
  project: MgPreflightProject,
  opts: { now?: string; policy?: MgRenderIntegrityPolicy } = {},
): MGRenderPreflight {
  const policy = opts.policy ?? renderIntegrityPolicy();
  const lastPreflightAt = opts.now ?? new Date().toISOString();

  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const run = project.intelligence?.mgCodegenRun;
  const outcomes = Array.isArray(run?.outcomes) ? run.outcomes : [];
  const asyncOutcomes = Array.isArray(run?.asyncOutcomes) ? run.asyncOutcomes : [];

  const delivered = new Set<string>();
  const declined = new Set<string>();
  const failed = new Set<string>();
  const timedOut = new Set<string>();
  const expected = new Map<string, { status: 'queued' | 'running'; momentId?: string; jobId: string }>();

  // Ground truth: a landed MG_SEQUENCE overlay IS delivery.
  for (const o of overlays) {
    const jobId = jobIdOf(o);
    if (jobId) delivered.add(jobId);
  }

  for (const o of outcomes) {
    const jobId = typeof o?.jobId === 'string' && o.jobId ? o.jobId : null;
    if (!jobId) continue;
    const status = (o.status ?? '').toString();
    if (status === 'queued' || status === 'running') {
      expected.set(jobId, { jobId, status: status as 'queued' | 'running', momentId: o.momentId });
    }
    if (status === 'generated') delivered.add(jobId);
    if (status === 'declined') declined.add(jobId);
  }
  for (const a of asyncOutcomes) {
    const jobId = typeof a?.jobId === 'string' && a.jobId ? a.jobId : null;
    if (!jobId) continue;
    const status = (a.status ?? '').toString();
    if (status === 'queued' || status === 'running') {
      expected.set(jobId, { jobId, status: status as 'queued' | 'running', momentId: a.momentId });
    }
    if (status === 'generated') delivered.add(jobId);
    if (status === 'declined') declined.add(jobId);
    if (status === 'fallback') failed.add(jobId);
    if (status === 'timed_out') timedOut.add(jobId);
  }

  const missingMGs: MgPreflightMissing[] = [];
  for (const [jobId, rec] of expected) {
    if (delivered.has(jobId) || declined.has(jobId) || failed.has(jobId) || timedOut.has(jobId)) continue;
    missingMGs.push({
      momentId: rec.momentId,
      jobId,
      status: rec.status,
      reason: 'worker job not delivered before render; no replacement inserted (MG omitted honestly)',
    });
  }

  const pending = [...expected.keys()].filter(
    (j) => !delivered.has(j) && !declined.has(j) && !failed.has(j) && !timedOut.has(j),
  );

  return {
    policy,
    expected: [...expected.keys()],
    delivered: [...delivered],
    declined: [...declined],
    unavailable: [],
    rejected: [...failed],
    pending,
    failed: [...failed],
    timedOut: [...timedOut],
    missingMGs,
    degraded: missingMGs.length > 0,
    lastPreflightAt,
  };
}
