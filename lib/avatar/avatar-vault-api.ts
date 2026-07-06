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
import {
  buildAvatarRenderRecipe,
  type AvatarRenderAudioInput,
  type AvatarRenderAudioMode,
  type AvatarRenderRecipe,
  type AvatarRenderSoundCueInput,
  type AvatarRenderTarget,
  type AvatarRenderUseCase,
} from './avatar-render-recipe';
import {
  AVATAR_PROVIDER_DESCRIPTORS,
  planAvatarProviderRender,
  type AvatarProviderId,
  type AvatarProviderSelection,
  type AvatarProviderSelectionMode,
  type AvatarProviderSelectionOptions,
} from './avatar-provider-adapter';

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
  | 'not_draft'
  | 'profile_not_accepted';

type AvatarVaultErrorBody = {
  ok: false;
  error: {
    code: AvatarVaultErrorCode;
    message: string;
    issues?: unknown[];
  };
};

const AVATAR_SOURCE_TYPES: AvatarSourceType[] = [
  'virtual_person_profile',
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

  const identityPack = asRecord(profileBody.identityPack) as AvatarProfile['identityPack'] | undefined;
  if (sourceType === 'virtual_person_profile' && !hasFullBodyReference(identityPack)) {
    return fail(400, 'invalid_body', 'Virtual person profiles require at least one full-body reference.');
  }

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
    ...(identityPack ? { identityPack } : {}),
    ...(asRecord(profileBody.stylePack) ? { stylePack: asRecord(profileBody.stylePack) as AvatarProfile['stylePack'] } : {}),
    ...(asRecord(profileBody.performancePack) ? { performancePack: asRecord(profileBody.performancePack) as AvatarProfile['performancePack'] } : {}),
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
    return fail(status, result.code, avatarReviewFailureMessage(result.issues), result.issues);
  }
  return { status: 200, body: { ok: true, record: result.record, superseded: result.superseded } };
}

const AVATAR_RENDER_USE_CASES: AvatarRenderUseCase[] = [
  'product_shoot',
  'speech_delivery',
  'explainer_host',
  'ad_actor',
  'social_presenter',
  'generic_clip',
];

const AVATAR_RENDER_AUDIO_MODES: AvatarRenderAudioMode[] = [
  'silent',
  'tts_voiceover',
  'uploaded_voiceover',
  'copied_reference_audio',
  'external_mix',
];

export async function evaluateAvatarProfileRenderReadiness(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; recipe: AvatarRenderRecipe } | AvatarVaultErrorBody>> {
  const result = await resolveAcceptedAvatarRenderRecipe(input, dependencies);
  if (!result.ok) return result.result;
  return { status: 200, body: { ok: true, recipe: result.recipe } };
}

export async function planAvatarProfileRender(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: AvatarVaultApiDependencies = {},
): Promise<AvatarVaultApiResult<{ ok: true; recipe: AvatarRenderRecipe; providerPlan: AvatarProviderSelection } | AvatarVaultErrorBody>> {
  const result = await resolveAcceptedAvatarRenderRecipe(input, dependencies);
  if (!result.ok) return result.result;

  const providerOptions = parseProviderSelectionOptions(result.body.provider);
  if (!providerOptions.ok) return providerOptions.result;

  return {
    status: 200,
    body: {
      ok: true,
      recipe: result.recipe,
      providerPlan: planAvatarProviderRender(result.recipe, providerOptions.options),
    },
  };
}

async function resolveAcceptedAvatarRenderRecipe(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: AvatarVaultApiDependencies,
): Promise<
  | { ok: true; body: Record<string, unknown>; recipe: AvatarRenderRecipe }
  | { ok: false; result: AvatarVaultApiResult<AvatarVaultErrorBody> }
> {
  const body = asRecord(input.body);
  if (!body) return { ok: false, result: fail(400, 'invalid_body', 'Render request body must be an object.') };

  const useCase = parseAvatarRenderUseCase(body.useCase);
  if (!useCase) {
    return {
      ok: false,
      result: fail(400, 'invalid_body', `A valid avatar render useCase is required (one of: ${AVATAR_RENDER_USE_CASES.join(', ')}).`),
    };
  }

  const store = dependencies.store ?? getDefaultAvatarProfileStore();
  const record = await store.getRecord(input.recordId);
  if (!record) {
    return { ok: false, result: fail(404, 'not_found', `Avatar profile record "${input.recordId}" was not found.`) };
  }
  if (!canAccessRecord(record, input.userId, input.orgId ?? null)) {
    return { ok: false, result: fail(403, 'forbidden', 'You cannot use this avatar profile.') };
  }
  if (record.status !== 'accepted' || record.profile.status !== 'accepted') {
    return { ok: false, result: fail(409, 'profile_not_accepted', 'Only accepted avatar profiles can be used for render planning.') };
  }

  const recipe = buildAvatarRenderRecipe({
    profileRecord: record,
    useCase,
    prompt: stringValue(body.prompt),
    script: optionalStringValue(body.script),
    negativePrompt: optionalStringValue(body.negativePrompt),
    audio: parseRenderAudio(body.audio),
    soundCues: parseRenderSoundCues(body.soundCues),
    productImageUrls: parseStringArray(body.productImageUrls),
    target: parseRenderTarget(body.target),
  });

  return { ok: true, body, recipe };
}

function parseProviderSelectionOptions(value: unknown):
  | { ok: true; options: AvatarProviderSelectionOptions }
  | { ok: false; result: AvatarVaultApiResult<AvatarVaultErrorBody> } {
  if (value === undefined) return { ok: true, options: {} };
  const record = asRecord(value);
  if (!record) return { ok: false, result: fail(400, 'invalid_body', 'provider must be an object when provided.') };

  const mode = parseProviderSelectionMode(record.mode);
  if (record.mode !== undefined && !mode) {
    return { ok: false, result: fail(400, 'invalid_body', 'provider.mode must be "single" or "benchmark".') };
  }

  const preferredProviderId = parseAvatarProviderId(record.preferredProviderId);
  if (record.preferredProviderId !== undefined && !preferredProviderId) {
    return { ok: false, result: fail(400, 'invalid_body', `provider.preferredProviderId must be one of: ${avatarProviderIdList()}.`) };
  }

  const includeProviderIds = parseAvatarProviderIdArray(record.includeProviderIds);
  if (!includeProviderIds.ok) return includeProviderIds;

  const options: AvatarProviderSelectionOptions = {};
  if (mode) options.mode = mode;
  if (preferredProviderId) options.preferredProviderId = preferredProviderId;
  if (includeProviderIds.providerIds) options.includeProviderIds = includeProviderIds.providerIds;
  return { ok: true, options };
}

function parseProviderSelectionMode(value: unknown): AvatarProviderSelectionMode | undefined {
  return value === 'single' || value === 'benchmark' ? value : undefined;
}

function parseAvatarProviderIdArray(value: unknown):
  | { ok: true; providerIds?: AvatarProviderId[] }
  | { ok: false; result: AvatarVaultApiResult<AvatarVaultErrorBody> } {
  if (value === undefined) return { ok: true };
  if (!Array.isArray(value)) {
    return { ok: false, result: fail(400, 'invalid_body', 'provider.includeProviderIds must be an array when provided.') };
  }

  const providerIds: AvatarProviderId[] = [];
  for (const item of value) {
    const providerId = parseAvatarProviderId(item);
    if (!providerId) {
      return { ok: false, result: fail(400, 'invalid_body', `provider.includeProviderIds must only include: ${avatarProviderIdList()}.`) };
    }
    if (!providerIds.includes(providerId)) providerIds.push(providerId);
  }

  if (providerIds.length === 0) {
    return { ok: false, result: fail(400, 'invalid_body', 'provider.includeProviderIds must include at least one provider when provided.') };
  }
  return { ok: true, providerIds };
}

function parseAvatarProviderId(value: unknown): AvatarProviderId | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AVATAR_PROVIDER_DESCRIPTORS, value)
    ? (value as AvatarProviderId)
    : undefined;
}

function avatarProviderIdList(): string {
  return Object.keys(AVATAR_PROVIDER_DESCRIPTORS).join(', ');
}

function parseAvatarRenderUseCase(value: unknown): AvatarRenderUseCase | undefined {
  return typeof value === 'string' && AVATAR_RENDER_USE_CASES.includes(value as AvatarRenderUseCase)
    ? (value as AvatarRenderUseCase)
    : undefined;
}

function parseAudioMode(value: unknown): AvatarRenderAudioMode | undefined {
  return typeof value === 'string' && AVATAR_RENDER_AUDIO_MODES.includes(value as AvatarRenderAudioMode)
    ? (value as AvatarRenderAudioMode)
    : undefined;
}

function parseRenderAudio(value: unknown): AvatarRenderAudioInput | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    ...(parseAudioMode(record.mode) ? { mode: parseAudioMode(record.mode) } : {}),
    ...(optionalStringValue(record.sourceAssetId) ? { sourceAssetId: optionalStringValue(record.sourceAssetId) } : {}),
    ...(optionalStringValue(record.sourceUrl) ? { sourceUrl: optionalStringValue(record.sourceUrl) } : {}),
    ...(optionalStringValue(record.voiceReferenceAssetId) ? { voiceReferenceAssetId: optionalStringValue(record.voiceReferenceAssetId) } : {}),
    ...(optionalStringValue(record.voiceReferenceUrl) ? { voiceReferenceUrl: optionalStringValue(record.voiceReferenceUrl) } : {}),
    ...(optionalStringValue(record.voiceoverText) ? { voiceoverText: optionalStringValue(record.voiceoverText) } : {}),
    ...(optionalStringValue(record.description) ? { description: optionalStringValue(record.description) } : {}),
    copyAllowed: record.copyAllowed === true,
    consentConfirmed: record.consentConfirmed === true,
  };
}

function parseRenderSoundCues(value: unknown): AvatarRenderSoundCueInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cues = value
    .map(parseRenderSoundCue)
    .filter((cue): cue is AvatarRenderSoundCueInput => cue !== undefined);
  return cues.length > 0 ? cues : undefined;
}

function parseRenderSoundCue(value: unknown): AvatarRenderSoundCueInput | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    ...(optionalStringValue(record.id) ? { id: optionalStringValue(record.id) } : {}),
    ...(optionalStringValue(record.label) ? { label: optionalStringValue(record.label) } : {}),
    description: stringValue(record.description),
    ...(optionalStringValue(record.sourceAssetId) ? { sourceAssetId: optionalStringValue(record.sourceAssetId) } : {}),
    ...(optionalStringValue(record.sourceUrl) ? { sourceUrl: optionalStringValue(record.sourceUrl) } : {}),
    copyAllowed: record.copyAllowed === true,
  };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length > 0 ? items : undefined;
}

function parseRenderTarget(value: unknown): AvatarRenderTarget | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const target: AvatarRenderTarget = {};
  const aspectRatio = optionalStringValue(record.aspectRatio);
  if (aspectRatio) target.aspectRatio = aspectRatio;
  const resolution = optionalStringValue(record.resolution);
  if (resolution) target.resolution = resolution;
  if (typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds)) {
    target.durationSeconds = record.durationSeconds;
  }
  return Object.keys(target).length > 0 ? target : undefined;
}

function optionalStringValue(value: unknown): string | undefined {
  const trimmed = stringValue(value);
  return trimmed ? trimmed : undefined;
}

function avatarReviewFailureMessage(issues: unknown[] | undefined): string {
  const issueMessages = Array.isArray(issues)
    ? issues.map((issue) => asRecord(issue)?.message).filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
    : [];
  if (issueMessages.length === 0) return 'Avatar profile review failed.';
  return `Avatar profile review failed: ${issueMessages.join(' ')}`;
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

function hasFullBodyReference(identityPack: AvatarProfile['identityPack'] | undefined): boolean {
  return Boolean(identityPack?.referenceAssets?.some((asset) => {
    if (asset.role !== 'full_body_front' && asset.role !== 'full_body_side') return false;
    return Boolean(stringValue(asset.assetId) || stringValue(asset.imageUrl));
  }));
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
