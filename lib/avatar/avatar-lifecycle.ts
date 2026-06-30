import {
  cloneAvatarProfile,
  type AvatarEvidence,
  type AvatarProfile,
  type AvatarProfileStatus,
} from './avatar-profile';

export type AvatarProfileIssueSeverity = 'error' | 'warning';

export interface AvatarProfileIssue {
  severity: AvatarProfileIssueSeverity;
  code:
    | 'invalid_version'
    | 'invalid_status'
    | 'invalid_timestamp'
    | 'invalid_confidence'
    | 'invalid_scope'
    | 'missing_avatar_id'
    | 'missing_user_id'
    | 'missing_display_name'
    | 'missing_portrait_asset'
    | 'missing_portrait_url'
    | 'missing_voice_source'
    | 'missing_consent'
    | 'missing_consent_evidence'
    | 'invalid_likeness_owner'
    | 'commercial_use_disallowed'
    | 'duplicate_evidence_id'
    | 'fallback_evidence'
    | 'review_required';
  path: string;
  message: string;
}

export interface AvatarProfileValidationResult {
  valid: boolean;
  errors: AvatarProfileIssue[];
  warnings: AvatarProfileIssue[];
}

export interface AvatarProfileRecord {
  id: string;
  status: AvatarProfileStatus;
  profile: AvatarProfile;
  createdAt: string;
  updatedAt: string;
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

export interface AvatarLifecycleOptions {
  id?: string;
  now?: string;
  actorId?: string;
}

export type AvatarLifecycleResult =
  | { ok: true; record: AvatarProfileRecord }
  | { ok: false; issues: AvatarProfileIssue[] };

const AVATAR_STATUSES: AvatarProfileStatus[] = [
  'draft',
  'accepted',
  'rejected',
  'disabled',
  'superseded',
];

export function validateAvatarProfile(profile: AvatarProfile): AvatarProfileValidationResult {
  const issues: AvatarProfileIssue[] = [];
  const evidence = Array.isArray(profile.evidence) ? profile.evidence : [];
  const evidenceById = new Map<string, AvatarEvidence>();

  if (profile.version !== 1) {
    issues.push(error('invalid_version', 'version', 'AvatarProfile version must be 1.'));
  }
  if (!AVATAR_STATUSES.includes(profile.status)) {
    issues.push(error('invalid_status', 'status', `Unknown avatar profile status "${profile.status}".`));
  }
  if (!isIsoDate(profile.createdAt)) {
    issues.push(error('invalid_timestamp', 'createdAt', 'createdAt must be an ISO timestamp.'));
  }
  if (!isIsoDate(profile.updatedAt)) {
    issues.push(error('invalid_timestamp', 'updatedAt', 'updatedAt must be an ISO timestamp.'));
  }
  if (!isNonEmptyString(profile.avatarId)) {
    issues.push(error('missing_avatar_id', 'avatarId', 'avatarId is required.'));
  }
  if (!isNonEmptyString(profile.userId)) {
    issues.push(error('missing_user_id', 'userId', 'userId is required.'));
  }
  if (!isNonEmptyString(profile.displayName)) {
    issues.push(error('missing_display_name', 'displayName', 'displayName is required.'));
  }
  validateOptionalScope('brandId', profile.brandId, issues);
  validateOptionalScope('orgId', profile.orgId, issues);

  if (!isNonEmptyString(profile.portrait?.assetId)) {
    issues.push(error('missing_portrait_asset', 'portrait.assetId', 'A portrait asset is required.'));
  }
  if (!isNonEmptyString(profile.portrait?.imageUrl)) {
    issues.push(error('missing_portrait_url', 'portrait.imageUrl', 'A portrait image URL is required.'));
  }
  if (!hasUsableVoiceSource(profile.voice)) {
    issues.push(error('missing_voice_source', 'voice', 'A selected TTS voice, uploaded voice sample, or imported voice profile is required.'));
  }
  if (!profile.rights?.consentConfirmed) {
    issues.push(error('missing_consent', 'rights.consentConfirmed', 'Likeness and voice consent must be confirmed before acceptance.'));
  }
  if (profile.rights?.likenessOwner === 'unknown') {
    issues.push(error('invalid_likeness_owner', 'rights.likenessOwner', 'Likeness owner must be self, client, or licensed.'));
  }
  if (!profile.rights?.commercialUseAllowed) {
    issues.push(error('commercial_use_disallowed', 'rights.commercialUseAllowed', 'Commercial use must be allowed before avatar generation.'));
  }

  for (const item of evidence) {
    if (evidenceById.has(item.id)) {
      issues.push(error('duplicate_evidence_id', `evidence.${item.id}`, `Duplicate evidence id "${item.id}".`));
    }
    evidenceById.set(item.id, item);
    validateConfidence(item.confidence, `evidence.${item.id}.confidence`, issues);
    if (!isIsoDate(item.observedAt)) {
      issues.push(error('invalid_timestamp', `evidence.${item.id}.observedAt`, 'Evidence observedAt must be an ISO timestamp.'));
    }
    if (item.sourceType === 'fallback_default') {
      issues.push(warning('fallback_evidence', `evidence.${item.id}`, 'Fallback evidence is review-only for avatar identity.'));
    }
  }

  if (profile.rights?.consentConfirmed && !hasConsentEvidence(profile, evidence)) {
    issues.push(error('missing_consent_evidence', 'rights', 'Consent confirmation must have a consent artifact or explicit consent evidence.'));
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings };
}

export function createAvatarProfileDraft(
  profile: AvatarProfile,
  options: AvatarLifecycleOptions = {},
): AvatarProfileRecord {
  const now = options.now ?? new Date().toISOString();
  const draftProfile = syncProfileStatus(profile, 'draft', now);
  const validation = validateAvatarProfile(draftProfile);
  return {
    id: options.id ?? `avatar_profile_${draftProfile.avatarId || 'unknown'}_${Date.parse(now) || 0}`,
    status: 'draft',
    profile: draftProfile,
    createdAt: now,
    updatedAt: now,
    review: {
      required: true,
      reasons: getAvatarReviewReasons(draftProfile, validation),
    },
  };
}

export function acceptAvatarProfileDraft(
  record: AvatarProfileRecord,
  options: AvatarLifecycleOptions = {},
): AvatarLifecycleResult {
  if (record.status !== 'draft') {
    return { ok: false, issues: [error('review_required', 'status', `Only draft avatar profiles can be accepted. Current status: ${record.status}.`)] };
  }

  const validation = validateAvatarProfile(record.profile);
  if (!validation.valid) {
    return { ok: false, issues: validation.errors };
  }

  const now = options.now ?? new Date().toISOString();
  const acceptedProfile = syncProfileStatus(record.profile, 'accepted', now, options.actorId);
  return {
    ok: true,
    record: {
      ...record,
      status: 'accepted',
      profile: acceptedProfile,
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

export function rejectAvatarProfileDraft(
  record: AvatarProfileRecord,
  reason: string,
  options: AvatarLifecycleOptions = {},
): AvatarProfileRecord {
  const now = options.now ?? new Date().toISOString();
  return {
    ...record,
    status: 'rejected',
    profile: syncProfileStatus(record.profile, 'rejected', now),
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

export function supersedeAvatarProfileRecord(
  record: AvatarProfileRecord,
  options: AvatarLifecycleOptions = {},
): AvatarProfileRecord {
  const now = options.now ?? new Date().toISOString();
  return {
    ...record,
    status: 'superseded',
    profile: syncProfileStatus(record.profile, 'superseded', now),
    updatedAt: now,
  };
}

export function getAvatarReviewReasons(
  profile: AvatarProfile,
  validation = validateAvatarProfile(profile),
): string[] {
  const reasons = new Set<string>(['Avatar profiles must be reviewed before they can generate videos.']);
  if (validation.errors.length > 0) reasons.add('Profile has blocking validation errors.');
  if (validation.warnings.length > 0) reasons.add('Profile has fallback or review-only evidence.');
  if (profile.brandId === null || profile.brandId === undefined) {
    reasons.add('Profile is personal/no-brand and must not inherit project brand metadata silently.');
  }
  return [...reasons];
}

function syncProfileStatus(
  profile: AvatarProfile,
  status: AvatarProfileStatus,
  updatedAt: string,
  actorId?: string,
): AvatarProfile {
  const next = cloneAvatarProfile(profile);
  next.status = status;
  next.updatedAt = updatedAt;
  if (status === 'accepted') {
    next.acceptedAt = updatedAt;
    next.acceptedBy = actorId;
  } else {
    delete next.acceptedAt;
    delete next.acceptedBy;
  }
  return next;
}

function hasUsableVoiceSource(voice: AvatarProfile['voice'] | undefined): boolean {
  if (!voice) return false;
  if (voice.sourceType === 'uploaded_voice_sample') {
    return isNonEmptyString(voice.sampleAssetId) || isNonEmptyString(voice.voiceProfileId);
  }
  if (voice.sourceType === 'selected_tts_voice') {
    return isNonEmptyString(voice.ttsVoiceId);
  }
  if (voice.sourceType === 'imported_voice_profile') {
    return isNonEmptyString(voice.voiceProfileId);
  }
  return false;
}

function hasConsentEvidence(profile: AvatarProfile, evidence: AvatarEvidence[]): boolean {
  if (isNonEmptyString(profile.rights?.consentArtifactAssetId)) return true;
  return evidence.some((item) => item.signalPath === 'rights.consentConfirmed' && item.sourceType === 'manual_user_entry');
}

function validateOptionalScope(
  path: 'brandId' | 'orgId',
  value: string | null | undefined,
  issues: AvatarProfileIssue[],
): void {
  if (value !== undefined && value !== null && !isNonEmptyString(value)) {
    issues.push(error('invalid_scope', path, `${path} must be null, undefined, or a non-empty string.`));
  }
}

function validateConfidence(value: number, path: string, issues: AvatarProfileIssue[]): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    issues.push(error('invalid_confidence', path, 'Confidence must be a finite number between 0 and 1.'));
  }
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function error(code: AvatarProfileIssue['code'], path: string, message: string): AvatarProfileIssue {
  return { severity: 'error', code, path, message };
}

function warning(code: AvatarProfileIssue['code'], path: string, message: string): AvatarProfileIssue {
  return { severity: 'warning', code, path, message };
}
