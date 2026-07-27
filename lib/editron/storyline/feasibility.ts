/**
 * feasibility - given the moments a user WANTS (a shot list) + the footage they gave, answer
 * "can we make this, and what's missing?" with the same conviction as single-shot coverage. This
 * is the pre-analysis feasibility gate of the multi-asset program: before promising a video, tell
 * the user honestly which requested moments we HAVE, which are only CLOSE, and which we're MISSING
 * (the "go film this" list) - instead of silently making a video that skips what they asked for.
 *
 * A request can be `must` (essential - its absence BLOCKS the intended edit) or `nice` (its
 * absence just leaves a gap; we still make the video with what we have). Built entirely on
 * `assessCoverage` (vision-verified), so every verdict is grounded in an actual frame or an
 * honest gap. Async only through the injected `verify`; never throws.
 */

import { assessCoverage, type CoverageResult, type CoverageVerdict, type CoverageVerify } from './coverage';
import type { Scene } from './scene';

/** A moment the user wants in the cut (a shot-list entry), with its precomputed query embedding. */
export interface ShotRequest {
  id: string;
  text: string;
  embedding?: readonly number[] | null;
  /** `must` = essential (missing => blocked); `nice` (default) = a gap, doesn't block. */
  priority?: 'must' | 'nice';
}

export interface ShotAssessment {
  request: ShotRequest;
  verdict: CoverageVerdict;
  coverage: CoverageResult;
}

/** ready = every requested moment covered; gaps = some missing/partial but the edit can proceed;
 *  blocked = an ESSENTIAL (`must`) moment is missing. */
export type FeasibilityStatus = 'ready' | 'gaps' | 'blocked';

export interface FeasibilityReport {
  status: FeasibilityStatus;
  assessments: ShotAssessment[];
  /** Requests not fully covered (missing or partial), worst first — the "film this" list. */
  coverageGaps: ShotAssessment[];
  statement: string;
}

function isMust(r: ShotRequest): boolean {
  return r.priority === 'must';
}

/** Order for "worst first": missing before partial. */
function verdictSeverity(v: CoverageVerdict): number {
  return v === 'missing' ? 0 : v === 'partial' ? 1 : 2;
}

/**
 * Assess whether the footage covers the user's requested moments. Runs vision-verified coverage
 * per request, then rolls up: BLOCKED if any `must` moment is missing, GAPS if anything is
 * missing/partial, READY if all covered. Async only through the injected `verify`; never throws.
 */
export async function assessFeasibility(
  requests: readonly ShotRequest[],
  scenes: readonly Scene[],
  verify: CoverageVerify,
  opts?: { topK?: number; partialSimilarity?: number },
): Promise<FeasibilityReport> {
  const assessments: ShotAssessment[] = [];
  for (const request of requests) {
    const coverage = await assessCoverage({ text: request.text, embedding: request.embedding }, scenes, verify, opts);
    assessments.push({ request, verdict: coverage.verdict, coverage });
  }

  const coverageGaps = assessments
    .filter((a) => a.verdict !== 'have')
    .sort((a, b) => verdictSeverity(a.verdict) - verdictSeverity(b.verdict) || (isMust(b.request) ? 1 : 0) - (isMust(a.request) ? 1 : 0));

  const mustMissing = assessments.filter((a) => a.verdict === 'missing' && isMust(a.request));
  const status: FeasibilityStatus = mustMissing.length > 0 ? 'blocked' : coverageGaps.length > 0 ? 'gaps' : 'ready';

  const statement = buildStatement(status, requests.length, coverageGaps, mustMissing);
  return { status, assessments, coverageGaps, statement };
}

function buildStatement(status: FeasibilityStatus, total: number, gaps: ShotAssessment[], mustMissing: ShotAssessment[]): string {
  if (total === 0) return 'No specific moments requested — the cut uses whatever the footage best supports.';
  if (status === 'ready') return `All ${total} requested moment(s) are covered — we can make this.`;
  const filmList = gaps.filter((g) => g.verdict === 'missing').map((g) => `"${g.request.text}"`).join(', ');
  if (status === 'blocked') {
    const essential = mustMissing.map((g) => `"${g.request.text}"`).join(', ');
    return `Can't fully make this yet — essential shot(s) missing: ${essential}. Film ${filmList || essential} and re-run.`;
  }
  return `We can make this, but ${gaps.length} requested moment(s) aren't fully covered${filmList ? ` — consider filming: ${filmList}` : ''}.`;
}
