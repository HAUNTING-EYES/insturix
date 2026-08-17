import type {
  BrandSignal,
  BrandSignalEvidence,
  BrandSignalProfile,
  BrandSignalTrustLevel,
} from './brand-signal-profile';
import { BRAND_CONFIDENCE } from './brand-confidence';
import { getBrandSignalEffectWeight } from './brand-signal-profile';

export type BrandSignalProfileStatus = 'draft' | 'accepted' | 'rejected' | 'superseded';

export type BrandSignalIssueSeverity = 'error' | 'warning';

export interface BrandSignalProfileIssue {
  severity: BrandSignalIssueSeverity;
  code:
    | 'invalid_version'
    | 'invalid_timestamp'
    | 'duplicate_evidence_id'
    | 'missing_evidence'
    | 'unknown_evidence_id'
    | 'invalid_confidence'
    | 'fallback_without_reason'
    | 'unsafe_signal'
    | 'evidence_path_mismatch'
    | 'review_required';
  path: string;
  message: string;
}

export interface BrandSignalValidationResult {
  valid: boolean;
  errors: BrandSignalProfileIssue[];
  warnings: BrandSignalProfileIssue[];
}

export interface BrandSignalProfileRecord {
  id: string;
  status: BrandSignalProfileStatus;
  profile: BrandSignalProfile;
  createdAt: string;
  updatedAt: string;
  /** Exact accepted revision this draft branched from; null means no accepted revision existed. */
  baseAcceptedRevision?: {
    recordId: string;
    updatedAt: string;
  } | null;
  review: {
    required: boolean;
    reasons: string[];
    acceptedAt?: string;
    acceptedBy?: string;
    rejectedAt?: string;
    rejectedBy?: string;
    rejectionReason?: string;
  };
}

export function bindBrandSignalDraftToAcceptedRevision(
  record: BrandSignalProfileRecord,
  accepted: BrandSignalProfileRecord | null,
): BrandSignalProfileRecord {
  if (record.status !== 'draft' || record.baseAcceptedRevision !== undefined) return record;
  return {
    ...record,
    baseAcceptedRevision: accepted
      ? { recordId: accepted.id, updatedAt: accepted.updatedAt }
      : null,
  };
}

export function brandSignalDraftMatchesAcceptedRevision(
  draft: BrandSignalProfileRecord,
  accepted: BrandSignalProfileRecord | null,
): boolean {
  if (draft.status !== 'draft' || draft.baseAcceptedRevision === undefined) return false;
  if (draft.baseAcceptedRevision === null) return accepted === null;
  return accepted?.id === draft.baseAcceptedRevision.recordId
    && accepted.updatedAt === draft.baseAcceptedRevision.updatedAt;
}

export interface BrandSignalLifecycleOptions {
  id?: string;
  now?: string;
  actorId?: string;
}

export type BrandSignalLifecycleResult =
  | { ok: true; record: BrandSignalProfileRecord }
  | { ok: false; issues: BrandSignalProfileIssue[] };

const HIGH_TRUST: BrandSignalTrustLevel[] = [
  'manual_user_entry',
  'uploaded_brand_guideline',
  'first_party_website',
  'brand_api',
];

export function validateBrandSignalProfile(profile: BrandSignalProfile): BrandSignalValidationResult {
  const issues: BrandSignalProfileIssue[] = [];
  const evidenceById = new Map<string, BrandSignalEvidence>();

  if (profile.version !== 1) {
    issues.push(error('invalid_version', 'version', 'BrandSignalProfile version must be 1.'));
  }
  if (!isIsoDate(profile.generatedAt)) {
    issues.push(error('invalid_timestamp', 'generatedAt', 'generatedAt must be an ISO timestamp.'));
  }

  for (const item of profile.evidence) {
    if (evidenceById.has(item.id)) {
      issues.push(error('duplicate_evidence_id', `evidence.${item.id}`, `Duplicate evidence id "${item.id}".`));
    }
    evidenceById.set(item.id, item);
    validateConfidence(item.confidence, `evidence.${item.id}.confidence`, issues);
    if (item.trustLevel === 'fallback_default' && !item.fallbackReason) {
      issues.push(error('fallback_without_reason', `evidence.${item.id}`, 'Fallback evidence must include fallbackReason.'));
    }
    if (item.authorityClass === 'unsafe_or_untrusted') {
      issues.push(error('unsafe_signal', `evidence.${item.id}`, 'Unsafe or untrusted evidence cannot be accepted as brand truth.'));
    }
  }

  for (const { path, signal } of collectBrandSignals(profile)) {
    validateSignal(path, signal, evidenceById, issues);
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings };
}

export function createBrandSignalProfileDraft(
  profile: BrandSignalProfile,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalProfileRecord {
  const now = options.now ?? new Date().toISOString();
  const validation = validateBrandSignalProfile(profile);
  return {
    id: options.id ?? `brand_signal_profile_${profile.brandId ?? 'unknown'}_${Date.parse(now) || 0}`,
    status: 'draft',
    profile,
    createdAt: now,
    updatedAt: now,
    review: {
      required: true,
      reasons: getReviewReasons(profile, validation),
    },
  };
}

export function acceptBrandSignalProfileDraft(
  record: BrandSignalProfileRecord,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalLifecycleResult {
  if (record.status !== 'draft') {
    return { ok: false, issues: [error('review_required', 'status', `Only draft profiles can be accepted. Current status: ${record.status}.`)] };
  }

  const validation = validateBrandSignalProfile(record.profile);
  if (!validation.valid) {
    return { ok: false, issues: validation.errors };
  }

  const now = options.now ?? new Date().toISOString();
  return {
    ok: true,
    record: {
      ...record,
      status: 'accepted',
      updatedAt: now,
      review: {
        ...record.review,
        required: false,
        acceptedAt: now,
        acceptedBy: options.actorId,
      },
    },
  };
}

export function rejectBrandSignalProfileDraft(
  record: BrandSignalProfileRecord,
  reason: string,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalProfileRecord {
  const now = options.now ?? new Date().toISOString();
  return {
    ...record,
    status: 'rejected',
    updatedAt: now,
    review: {
      ...record.review,
      required: false,
      rejectedAt: now,
      rejectedBy: options.actorId,
      rejectionReason: reason,
    },
  };
}

export function supersedeBrandSignalProfileRecord(
  record: BrandSignalProfileRecord,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalProfileRecord {
  const now = options.now ?? new Date().toISOString();
  return { ...record, status: 'superseded', updatedAt: now };
}

export function getReviewReasons(
  profile: BrandSignalProfile,
  validation = validateBrandSignalProfile(profile),
): string[] {
  const reasons = new Set<string>(['Brand signal profiles must be reviewed before they become accepted brand truth.']);
  if (validation.errors.length > 0) reasons.add('Profile has blocking validation errors.');
  if (validation.warnings.length > 0) reasons.add('Profile has fallback or low-confidence warnings.');
  if (profile.evidence.some((item) => !HIGH_TRUST.includes(item.trustLevel))) {
    reasons.add('Profile contains inferred, social, or fallback evidence that needs human review.');
  }
  return [...reasons];
}

export function collectBrandSignals(profile: BrandSignalProfile): Array<{ path: string; signal: BrandSignal<unknown> }> {
  const signals: Array<{ path: string; signal: BrandSignal<unknown> }> = [];
  visit(profile, '', signals);
  return signals;
}

function visit(value: unknown, path: string, signals: Array<{ path: string; signal: BrandSignal<unknown> }>): void {
  if (isBrandSignal(value)) {
    signals.push({ path, signal: value });
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'evidence') continue;
    visit(child, path ? `${path}.${key}` : key, signals);
  }
}

function validateSignal(
  path: string,
  signal: BrandSignal<unknown>,
  evidenceById: Map<string, BrandSignalEvidence>,
  issues: BrandSignalProfileIssue[],
): void {
  validateConfidence(signal.confidence, `${path}.confidence`, issues);
  const actionable = signal.trustLevel !== 'fallback_default'
    && signal.confidence >= BRAND_CONFIDENCE.ACTIONABLE_SIGNAL
    && getBrandSignalEffectWeight(signal) > 0;
  if (signal.evidenceIds.length === 0 && actionable && signal.trustLevel !== 'llm_inference') {
    issues.push(error('missing_evidence', path, 'Brand signal must reference at least one evidence item.'));
  }
  if (signal.trustLevel === 'fallback_default' && !signal.fallbackReason) {
    issues.push(error('fallback_without_reason', path, 'Fallback signal must include fallbackReason.'));
  }
  if (signal.authorityClass === 'unsafe_or_untrusted') {
    issues.push(error('unsafe_signal', path, 'Unsafe or untrusted signal cannot be accepted as brand truth.'));
  }
  if (signal.trustLevel === 'fallback_default' || signal.confidence < BRAND_CONFIDENCE.ACTIONABLE_SIGNAL || getBrandSignalEffectWeight(signal) === 0 || signal.evidenceIds.length === 0) {
    issues.push(warning('review_required', path, 'Signal is fallback, low-confidence, or non-actionable and should remain review-only.'));
  }
  for (const id of signal.evidenceIds) {
    const item = evidenceById.get(id);
    if (!item) {
      issues.push(error('unknown_evidence_id', `${path}.evidenceIds`, `Unknown evidence id "${id}".`));
      continue;
    }
    if (item.signalPath !== path) {
      issues.push(warning('evidence_path_mismatch', path, `Evidence "${id}" points to "${item.signalPath}", not "${path}".`));
    }
  }
}

function validateConfidence(value: number, path: string, issues: BrandSignalProfileIssue[]): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    issues.push(error('invalid_confidence', path, 'Confidence must be a finite number between 0 and 1.'));
  }
}

function isBrandSignal(value: unknown): value is BrandSignal<unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'confidence' in value &&
    'trustLevel' in value &&
    'authorityClass' in value &&
    'evidenceIds' in value &&
    Array.isArray((value as { evidenceIds?: unknown }).evidenceIds),
  );
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function error(code: BrandSignalProfileIssue['code'], path: string, message: string): BrandSignalProfileIssue {
  return { severity: 'error', code, path, message };
}

function warning(code: BrandSignalProfileIssue['code'], path: string, message: string): BrandSignalProfileIssue {
  return { severity: 'warning', code, path, message };
}
