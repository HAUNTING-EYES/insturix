import { randomUUID } from 'node:crypto';
import { createAvatarProfileDraft, type AvatarProfileRecord } from './avatar-lifecycle';
import type {
  AvatarEvidence,
  AvatarProfile,
  AvatarProfileStatus,
  AvatarSourceType,
  AvatarVoiceSourceType,
} from './avatar-profile';
import {
  getDefaultAvatarProfileStore,
  type AvatarVaultProfileStore,
} from './avatar-mongo-store';

export interface AvatarVaultApiDependencies {
  store?: AvatarVaultProfileStore;
  now?: () => string;
}

export interface AvatarVaultActorInput {
  userId: string;
  orgId?: string | null;
  actorId?: string;
}

export type AvatarVaultApiResult<TBody> = {
  status: number;
  body: TBody;
};

type AvatarVaultErrorCode =
  | 'invalid_json'
  | 'invalid_body'
  | 'brand_scope_required'
  | 'brand_required'
  | 'not_found'
  | 'forbidden'
  | 'validation_failed'
  | 'not_draft';

type AvatarVaultErrorBody = {
  ok: false;
  error: {
    code: AvatarVaultErrorCode;
    message: string;
    issues?: unknown[];
  };
};

const AVATAR_SOURCE_TYPES: AvatarSourceType[] = [
  'uploaded_portrait',
  'generated_portrait',
  'stock_avatar',
  'imported_avatar',
];

const AVATAR_VOICE_SOURCE_TYPES: AvatarVoiceSourceType[] = [
  'uploaded_voice_sample',
  'selected_tts_voice',
  'imported_voice_profile',
];

export async function listAvatarProfiles(
  input: AvatarVaultActorInput & { searchParams?: URLSearchParams },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; records: AvatarProfileRecord[] }>> {
  const store = dependencies.store ?? getDefaultAvatarProfileStore();
  const params = input.searchParams;
  const status = parseStatus(params?.get('status'));
  const brandId = normalizeOptionalParam(params?.get('brandId'));
  const avatarId = normalizeOptionalParam(params?.get('avatarId'));
  const records = await store.listRecords({
    userId: input.userId,
    orgId: input.orgId ?? null,
    ...(status ? { status } : {}),
    ...(brandId !== undefined ? { brandId } : {}),
    ...(avatarId ? { avatarId } : {}),
  });
  return { status: 200, body: { ok: true, records } };
}

export async function createAvatarProfileDraftFromRequest(
  input: AvatarVaultActorInput & { body: unknown },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; record: AvatarProfileRecord } | AvatarVaultErrorBody>> {
  const body = asRecord(input.body);
  if (!body) return fail(400, 'invalid_body', 'Avatar profile body must be an object.');

  const brandScope = resolveBrandScope(body);
  if (!brandScope.ok) return brandScope.result;

  const now = dependencies.now?.() ?? new Date().toISOString();
  const profileBody = asRecord(body.profile) ?? body;
  const sourceType = parseAvatarSourceType(profileBody.sourceType);
  const voice = asRecord(profileBody.voice);
  const voiceSourceType = parseAvatarVoiceSourceType(voice?.sourceType);

  if (!sourceType) return fail(400, 'invalid_body', 'Avatar sourceType is required.');
  if (!voiceSourceType || !voice) return fail(400, 'invalid_body', 'Avatar voice.sourceType is required.');

  const rights = (asRecord(profileBody.rights) ?? {}) as AvatarProfile['rights'];
  const profile: AvatarProfile = {
    version: 1,
    avatarId: stringValue(profileBody.avatarId) || `avatar_${randomUUID()}`,
    userId: input.userId,
    orgId: input.orgId ?? null,
    brandId: brandScope.brandId,
    displayName: stringValue(profileBody.displayName),
    status: 'draft',
    sourceType,
    portrait: asRecord(profileBody.portrait) as AvatarProfile['portrait'],
    voice: { ...voice, sourceType: voiceSourceType } as AvatarProfile['voice'],
    persona: (asRecord(profileBody.persona) ?? {}) as AvatarProfile['persona'],
    rights,
    evidence: ensureConsentEvidence(profileBody.evidence, now, rights.consentConfirmed === true),
    createdAt: stringValue(profileBody.createdAt) || now,
    updatedAt: now,
  };

  const record = createAvatarProfileDraft(profile, {
    id: stringValue(body.recordId) || undefined,
    now,
    actorId: input.actorId,
  });
  await (dependencies.store ?? getDefaultAvatarProfileStore()).saveRecord(record, { now, actorId: input.actorId });
  return { status: 201, body: { ok: true, record } };
}

export async function getAvatarProfile(
  input: AvatarVaultActorInput & { recordId: string },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; record: AvatarProfileRecord } | AvatarVaultErrorBody>> {
  const record = await (dependencies.store ?? getDefaultAvatarProfileStore()).getRecord(input.recordId);
  if (!record) return fail(404, 'not_found', `Avatar profile record "${input.recordId}" was not found.`);
  if (!canAccessRecord(record, input.userId, input.orgId ?? null)) return fail(403, 'forbidden', 'You cannot access this avatar profile.');
  return { status: 200, body: { ok: true, record } };
}

export async function reviewAvatarProfileDraft(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; record: AvatarProfileRecord; superseded: AvatarProfileRecord[] } | AvatarVaultErrorBody>> {
  const body = asRecord(input.body);
  if (!body) return fail(400, 'invalid_body', 'Review body must be an object.');

  const store = dependencies.store ?? getDefaultAvatarProfileStore();
  const record = await store.getRecord(input.recordId);
  if (!record) return fail(404, 'not_found', `Avatar profile record "${input.recordId}" was not found.`);
  if (!canAccessRecord(record, input.userId, input.orgId ?? null)) return fail(403, 'forbidden', 'You cannot review this avatar profile.');

  const now = dependencies.now?.() ?? new Date().toISOString();
  const action = stringValue(body.action);
  const result = action === 'accept'
    ? await store.acceptDraft(input.recordId, { now, actorId: input.actorId ?? input.userId })
    : action === 'reject'
      ? await store.rejectDraft(input.recordId, stringValue(body.reason) || 'Rejected by reviewer.', { now, actorId: input.actorId ?? input.userId })
      : null;

  if (!result) return fail(400, 'invalid_body', 'Review action must be "accept" or "reject".');
  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : result.code === 'not_draft' ? 409 : 422;
    return fail(status, result.code, 'Avatar profile review failed.', result.issues);
  }
  return { status: 200, body: { ok: true, record: result.record, superseded: result.superseded } };
}

function resolveBrandScope(body: Record<string, unknown>):
  | { ok: true; brandId: string | null }
  | { ok: false; result: AvatarVaultApiResult<AvatarVaultErrorBody> } {
  if (typeof body.bindBrand !== 'boolean') {
    return { ok: false, result: fail(400, 'brand_scope_required', 'bindBrand must explicitly be true or false.') };
  }
  if (!body.bindBrand) return { ok: true, brandId: null };

  const profile = asRecord(body.profile);
  const brandId = stringValue(body.brandId) || stringValue(profile?.brandId);
  if (!brandId) return { ok: false, result: fail(400, 'brand_required', 'brandId is required when bindBrand is true.') };
  return { ok: true, brandId };
}

function ensureConsentEvidence(value: unknown, now: string, consentConfirmed: boolean): AvatarEvidence[] {
  const evidence = Array.isArray(value) ? (value as AvatarEvidence[]) : [];
  if (!consentConfirmed) return evidence;
  const hasConsent = evidence.some((item) => item?.signalPath === 'rights.consentConfirmed');
  if (hasConsent) return evidence;
  return [
    ...evidence,
    {
      id: `e_consent_${Date.parse(now) || 0}`,
      signalPath: 'rights.consentConfirmed',
      sourceType: 'manual_user_entry',
      confidence: 1,
      observedAt: now,
      extractor: 'avatar-vault-api.v1',
      consentRequired: true,
    },
  ];
}

function canAccessRecord(record: AvatarProfileRecord, userId: string, orgId: string | null): boolean {
  return record.profile.userId === userId || Boolean(orgId && record.profile.orgId === orgId);
}

function parseAvatarSourceType(value: unknown): AvatarSourceType | undefined {
  return typeof value === 'string' && AVATAR_SOURCE_TYPES.includes(value as AvatarSourceType)
    ? value as AvatarSourceType
    : undefined;
}

function parseAvatarVoiceSourceType(value: unknown): AvatarVoiceSourceType | undefined {
  return typeof value === 'string' && AVATAR_VOICE_SOURCE_TYPES.includes(value as AvatarVoiceSourceType)
    ? value as AvatarVoiceSourceType
    : undefined;
}

function parseStatus(value: string | null | undefined): AvatarProfileStatus | undefined {
  return value === 'draft' || value === 'accepted' || value === 'rejected' || value === 'disabled' || value === 'superseded'
    ? value
    : undefined;
}

function normalizeOptionalParam(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed === 'null' || trimmed === 'none' ? null : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fail(
  status: number,
  code: AvatarVaultErrorCode,
  message: string,
  issues?: unknown[],
): AvatarVaultApiResult<AvatarVaultErrorBody> {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        ...(issues ? { issues } : {}),
      },
    },
  };
}
