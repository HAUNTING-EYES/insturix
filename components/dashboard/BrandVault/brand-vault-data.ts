/**
 * Brand Vault — pure data helpers
 *
 * Deterministic, framework-free shaping of an accepted/draft BrandSignalProfile
 * into the view models the review UI renders. No React, no I/O — easy to test.
 */

import type {
  BrandEvidenceCandidate,
  BrandVaultApiSuccess,
  BrandVaultSignalGroup,
  BrandVaultSignalGroupCoverage,
  BrandVaultSnapshot,
  EvidenceItem,
  SignalConflict,
  SignalGroupId,
  SignalGroupMeta,
  SignalRow,
  SignalTone,
  SourceLane,
} from './brand-vault-types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Confidence at/above which a signal affects generation. Mirrors the
 *  shared contract's getBrandSignalEffectWeight default (0.55). */
export const ACTIONABLE_THRESHOLD = 0.55;

export const GROUPS: SignalGroupMeta[] = [
  { id: 'identity', label: 'Identity', color: '#D4A652' },
  { id: 'palette', label: 'Palette', color: '#D088B4' },
  { id: 'typography', label: 'Typography', color: '#5CB8CC' },
  { id: 'visual', label: 'Visual', color: '#9088D4' },
  { id: 'motion', label: 'Motion', color: '#C58BA8' },
  { id: 'voice', label: 'Voice', color: '#5EC97E' },
  { id: 'warnings', label: 'Warnings', color: '#D46A5C' },
];

export const EMPTY_SNAPSHOT: BrandVaultSnapshot = {
  job: null,
  record: null,
  reviewPayload: null,
  candidates: [],
};

const WEBSITE_SOURCE_TYPES = new Set([
  'website',
  'website_metadata',
  'json_ld',
  'css',
  'logo_asset',
]);

const SOCIAL_SOURCE_TYPES = new Set(['social_profile', 'social_post']);
const UPLOAD_SOURCE_TYPES = new Set(['uploaded_guideline', 'uploaded_asset']);
const CRAWL_EXTRACTOR = 'brand-vault-crawler.v1';

/* ------------------------------------------------------------------ */
/*  Snapshot normalization                                             */
/* ------------------------------------------------------------------ */

/** Merge an API success body over a previous snapshot, preserving fields the
 *  response omitted (undefined) while honoring explicit nulls. */
export function mergeSnapshot(
  prev: BrandVaultSnapshot,
  result: BrandVaultApiSuccess,
): BrandVaultSnapshot {
  return {
    job: result.job === undefined ? prev.job : result.job ?? null,
    record: result.record === undefined ? prev.record : result.record ?? null,
    reviewPayload:
      result.reviewPayload === undefined ? prev.reviewPayload : result.reviewPayload ?? null,
    candidates: Array.isArray(result.candidates) ? result.candidates : prev.candidates,
  };
}

/* ------------------------------------------------------------------ */
/*  Signal collection                                                  */
/* ------------------------------------------------------------------ */

export function collectSignals(profile: unknown): SignalRow[] {
  const rows: SignalRow[] = [];
  visitSignals(profile, '', rows);
  return rows.sort(
    (a, b) => groupIndex(a.group) - groupIndex(b.group) || a.path.localeCompare(b.path),
  );
}

function visitSignals(value: unknown, path: string, rows: SignalRow[]): void {
  if (isSignal(value)) {
    rows.push({
      path,
      group: groupFromPath(path),
      label: labelFromPath(path),
      value: value.value,
      confidence: typeof value.confidence === 'number' ? value.confidence : 0,
      trustLevel: typeof value.trustLevel === 'string' ? value.trustLevel : 'unknown',
      authorityClass: typeof value.authorityClass === 'string' ? value.authorityClass : 'unknown',
      evidenceIds: Array.isArray(value.evidenceIds)
        ? value.evidenceIds.filter((id): id is string => typeof id === 'string')
        : [],
      fallbackReason: typeof value.fallbackReason === 'string' ? value.fallbackReason : undefined,
    });
    return;
  }
  if (!isRecord(value) || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'evidence') continue;
    visitSignals(child, path ? `${path}.${key}` : key, rows);
  }
}

function isSignal(
  value: unknown,
): value is Record<string, unknown> & { value: unknown; confidence: number; evidenceIds: unknown[] } {
  return (
    isRecord(value) &&
    'value' in value &&
    typeof value.confidence === 'number' &&
    Array.isArray(value.evidenceIds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function groupFromPath(path: string): SignalGroupId {
  const first = path.split('.')[0] as SignalGroupId;
  return GROUPS.some((group) => group.id === first) ? first : 'warnings';
}

function groupIndex(group: SignalGroupId): number {
  return GROUPS.findIndex((item) => item.id === group);
}

export function labelFromPath(path: string): string {
  const raw = path.split('.').at(-1) ?? path;
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

export function groupMeta(group: SignalGroupId): SignalGroupMeta {
  return GROUPS.find((g) => g.id === group) ?? GROUPS[0];
}

/* ------------------------------------------------------------------ */
/*  Actionability + tone                                               */
/* ------------------------------------------------------------------ */

/** True when a signal will actually affect downstream generation. */
export function isActionable(signal: SignalRow): boolean {
  return (
    !signal.fallbackReason &&
    signal.trustLevel !== 'fallback_default' &&
    signal.authorityClass !== 'unsafe_or_untrusted' &&
    signal.confidence >= ACTIONABLE_THRESHOLD
  );
}

export function signalTone(signal: SignalRow): SignalTone {
  if (!isActionable(signal)) return 'risk';
  if (signal.confidence < 0.75) return 'warn';
  return 'good';
}

/* ------------------------------------------------------------------ */
/*  Conflicts (candidates that disagree on one signal path)            */
/* ------------------------------------------------------------------ */

export function groupConflicts(candidates: BrandEvidenceCandidate[]): SignalConflict[] {
  const byPath = new Map<string, BrandEvidenceCandidate[]>();
  for (const candidate of candidates) {
    if (isAssetAlternativePath(candidate.signalPath)) continue;
    const list = byPath.get(candidate.signalPath) ?? [];
    list.push(candidate);
    byPath.set(candidate.signalPath, list);
  }

  const conflicts: SignalConflict[] = [];
  for (const [path, group] of byPath) {
    const distinct = new Set(
      group.map((c) => JSON.stringify(c.normalizedValue ?? c.rawValue ?? null)),
    );
    if (distinct.size < 2) continue;
    conflicts.push({
      path,
      label: labelFromPath(path),
      group: groupFromPath(path),
      candidates: [...group].sort((a, b) => b.confidence - a.confidence),
    });
  }
  return conflicts.sort((a, b) => b.candidates.length - a.candidates.length);
}

function isAssetAlternativePath(path: string): boolean {
  return path === 'assets.logoCandidates' || path === 'assets.socialPreviewImages';
}

/* ------------------------------------------------------------------ */
/*  Evidence for a selected signal                                     */
/* ------------------------------------------------------------------ */

export function selectEvidence(
  snapshot: BrandVaultSnapshot,
  signal: SignalRow | null,
): EvidenceItem[] {
  if (!signal) return [];
  const profileEvidence = (snapshot.record?.profile.evidence ?? []).filter(
    (item) => signal.evidenceIds.includes(item.id) || item.signalPath === signal.path,
  );
  const candidateEvidence = snapshot.candidates.filter((item) => item.signalPath === signal.path);
  return [...profileEvidence, ...candidateEvidence].slice(0, 8);
}

export function evidenceBody(item: EvidenceItem): string {
  if (item.excerpt) return item.excerpt;
  if ('normalizedValue' in item) return formatValue(item.normalizedValue ?? item.rawValue);
  if (item.fallbackReason) return item.fallbackReason;
  return item.signalPath;
}

/* ------------------------------------------------------------------ */
/*  Sources                                                            */
/* ------------------------------------------------------------------ */

export function buildSourceLanes(snapshot: BrandVaultSnapshot): SourceLane[] {
  const { job, candidates, reviewPayload } = snapshot;
  const intakeLane = (id: 'website' | 'crawl' | 'social' | 'uploads' | 'legacy') =>
    reviewPayload?.intake.evidenceLanes.find((lane) => lane.id === id);
  const intakeCount = (id: 'website' | 'crawl' | 'social' | 'uploads' | 'legacy') => {
    const lane = intakeLane(id);
    return lane ? Math.max(lane.sourceCount, lane.evidenceCount, lane.candidateCount) : 0;
  };

  const websiteCount =
    intakeCount('website') ||
    candidates.filter((c) => WEBSITE_SOURCE_TYPES.has(c.sourceType) && !isCrawlCandidate(c)).length ||
    reviewPayload?.intake.website.evidenceCount ||
    0;
  const socialCount = job?.inputs.socialLinks?.length ?? 0;
  const sourceInputs = job?.inputs.sourceEvidence ?? [];
  const socialSourceCount = sourceInputs.filter((s) => SOCIAL_SOURCE_TYPES.has(s.kind)).length;
  const socialCandidateCount = candidates.filter((c) => SOCIAL_SOURCE_TYPES.has(c.sourceType)).length;
  const uploadSourceCount = sourceInputs.filter((s) => UPLOAD_SOURCE_TYPES.has(s.kind)).length;
  const uploadCandidateCount = candidates.filter((c) => UPLOAD_SOURCE_TYPES.has(c.sourceType)).length;
  const crawlSourceCount = sourceInputs.filter((s) => s.kind === 'crawl_seed').length;
  const crawlCandidateCount = candidates.filter(isCrawlCandidate).length;
  const legacySourceCount = sourceInputs.filter((s) => s.kind === 'legacy_brand_intelligence').length;
  const legacyCandidateCount = candidates.filter((c) => c.sourceType === 'legacy_brand_intelligence').length;
  const failed = job?.status === 'failed';

  return [
    {
      id: 'website',
      label: 'Website',
      icon: 'world',
      detail: 'Homepage, metadata, JSON-LD, CSS colours, fonts, logo candidates.',
      status: sourceLaneStatus({
        intakeStatus: intakeLane('website')?.status,
        liveCount: websiteCount,
        stagedCount: job?.inputs.websiteUrl ? 1 : 0,
        failed,
      }),
      count: websiteCount,
    },
    {
      id: 'socials',
      label: 'Socials',
      icon: 'share',
      detail: 'Profile links, connected social posts, and review-only public social evidence.',
      status: sourceLaneStatus({
        intakeStatus: intakeLane('social')?.status,
        liveCount: socialCandidateCount,
        stagedCount: Math.max(socialCount, socialSourceCount),
        failed,
      }),
      count: intakeCount('social') || Math.max(socialCount, socialSourceCount, socialCandidateCount),
    },
    {
      id: 'uploads',
      label: 'Uploads',
      icon: 'upload',
      detail: 'Parsed PDFs, docs, slides, screenshots, logos, and brand guideline files.',
      status: sourceLaneStatus({
        intakeStatus: intakeLane('uploads')?.status,
        liveCount: uploadCandidateCount,
        stagedCount: uploadSourceCount,
        failed,
      }),
      count: intakeCount('uploads') || Math.max(uploadSourceCount, uploadCandidateCount),
    },
    {
      id: 'crawler',
      label: 'Full crawler',
      icon: 'sitemap',
      detail: 'Additional owned pages from sitemap, common brand pages, and crawl seeds.',
      status: sourceLaneStatus({
        intakeStatus: intakeLane('crawl')?.status,
        liveCount: crawlCandidateCount,
        stagedCount: crawlSourceCount,
        failed,
      }),
      count: intakeCount('crawl') || Math.max(crawlSourceCount, crawlCandidateCount),
    },
    {
      id: 'legacy',
      label: 'Legacy intel',
      icon: 'archive',
      detail: 'Existing brand facts, attached only once backed by source evidence.',
      status: sourceLaneStatus({
        intakeStatus: intakeLane('legacy')?.status,
        liveCount: 0,
        stagedCount: Math.max(legacySourceCount, legacyCandidateCount),
        failed,
      }),
      count: intakeCount('legacy') || Math.max(legacySourceCount, legacyCandidateCount),
    },
  ];
}

function isCrawlCandidate(candidate: BrandEvidenceCandidate): boolean {
  return candidate.extractorId === CRAWL_EXTRACTOR || candidate.sourceField === 'crawl.page';
}

function sourceLaneStatus(args: {
  intakeStatus?: 'complete' | 'needs_review' | 'needs_auth' | 'not_provided' | 'skipped' | 'failed';
  liveCount: number;
  stagedCount: number;
  failed: boolean;
}): SourceLane['status'] {
  if (args.failed || args.intakeStatus === 'failed') return 'failed';
  if (args.intakeStatus === 'complete' || args.liveCount > 0) return 'live';
  if (args.intakeStatus === 'needs_review' || args.intakeStatus === 'needs_auth' || args.stagedCount > 0) return 'pending';
  return 'not_provided';
}

/* ------------------------------------------------------------------ */
/*  Coverage + summary                                                 */
/* ------------------------------------------------------------------ */

export function coveragePercent(
  coverage: Partial<Record<BrandVaultSignalGroup, BrandVaultSignalGroupCoverage>> | undefined,
  group: BrandVaultSignalGroup,
): number {
  const entry = coverage?.[group];
  if (!entry || entry.signalCount === 0) return 0;
  return Math.round((entry.actionableSignalCount / entry.signalCount) * 100);
}

export interface BrandVaultSummary {
  actionable: number;
  reviewOnly: number;
  conflicts: number;
  evidence: number;
}

export function summarize(
  signals: SignalRow[],
  conflicts: SignalConflict[],
  snapshot: BrandVaultSnapshot,
): BrandVaultSummary {
  const actionable = signals.filter(isActionable).length;
  return {
    actionable,
    reviewOnly: signals.length - actionable,
    conflicts: conflicts.length,
    evidence: snapshot.reviewPayload?.evidenceCount ?? snapshot.candidates.length,
  };
}

/* ------------------------------------------------------------------ */
/*  Misc                                                               */
/* ------------------------------------------------------------------ */

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? value.map(formatValue).join(', ') : 'None observed';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value || 'None observed';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return 'None observed';
}

export function parseSocialLinks(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function profileBrandName(snapshot: BrandVaultSnapshot): string {
  const profile = snapshot.record?.profile as
    | { identity?: { brandName?: { value?: unknown } } }
    | undefined;
  const name = profile?.identity?.brandName?.value;
  return typeof name === 'string' && name ? name : 'Draft brand profile';
}
