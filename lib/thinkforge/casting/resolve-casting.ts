import {
  listAvatarProfiles,
  type AvatarVaultApiDependencies,
} from '@/lib/avatar/avatar-vault-api';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import { buildAvatarRenderRecipe } from '@/lib/avatar/avatar-render-recipe';
import type {
  CharacterCasting,
  ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';
import type { ProjectMeta } from '../state/types';

export type ThinkForgeCastingStatus = 'not_requested' | 'resolved' | 'voiceover_fallback';

export interface ThinkForgeCastingMetadata {
  status: ThinkForgeCastingStatus;
  characterId?: string;
  selectedAvatarProfileId?: string;
  source?: 'explicit_avatar' | 'brand' | 'user_global';
  confidence?: number;
  warnings: string[];
  offer?: string;
}

export interface ThinkForgeCastingIntent {
  requested: boolean;
  target: 'self';
  characterId: string;
  characterName: string;
  avatarProfileId?: string;
}

export interface ResolveThinkForgeCastingInput {
  brief: ProductionBrief;
  project?: ProjectMeta | null;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  dependencies?: AvatarVaultApiDependencies;
  castingIntent?: ThinkForgeCastingIntent | null;
}

export interface ResolveThinkForgeCastingResult {
  brief: ProductionBrief;
  metadata: ThinkForgeCastingMetadata;
}

const DEFAULT_CHARACTER_ID = 'host';
const DEFAULT_CHARACTER_NAME = 'Host';
const READY_CHECK_SCRIPT = 'ThinkForge avatar casting readiness check.';

export async function resolveThinkForgeAvatarCasting(
  input: ResolveThinkForgeCastingInput,
): Promise<ResolveThinkForgeCastingResult> {
  const intent = input.castingIntent ?? readStructuredCastingIntent(input.project);
  if (!intent?.requested) {
    return {
      brief: input.brief,
      metadata: { status: 'not_requested', warnings: [] },
    };
  }

  const warnings: string[] = [];
  const selected = await selectAvatarRecord(input, intent, warnings);
  if (!selected.record) {
    return voiceoverFallback(input.brief, intent.characterId, warnings, 'Add an accepted avatar in Avatar Vault to appear on camera.');
  }

  const gateFailures = getCastingGateFailures(selected.record);
  if (gateFailures.length > 0) {
    warnings.push(...gateFailures);
    return voiceoverFallback(input.brief, intent.characterId, warnings, "Your avatar isn't finished for on-camera speaking yet. Writing this as voiceover for now.");
  }

  const voice = resolveCharacterVoice(selected.record);
  if (voice.mode === 'none') {
    warnings.push('avatar_voice_reference_missing');
    return voiceoverFallback(input.brief, intent.characterId, warnings, 'Attach a cloned voice sample or preset TTS voice in Avatar Vault to speak on camera.');
  }

  return {
    brief: {
      ...input.brief,
      casting: {
        map: {
          ...(input.brief.casting?.map ?? {}),
          [intent.characterId]: {
            avatarProfileId: selected.record.id,
            voice,
          },
        },
      },
    },
    metadata: {
      status: 'resolved',
      characterId: intent.characterId,
      selectedAvatarProfileId: selected.record.id,
      source: selected.source,
      confidence: selected.confidence,
      warnings,
    },
  };
}

function voiceoverFallback(
  brief: ProductionBrief,
  characterId: string,
  warnings: string[],
  offer: string,
): ResolveThinkForgeCastingResult {
  return {
    brief,
    metadata: {
      status: 'voiceover_fallback',
      characterId,
      warnings,
      offer,
    },
  };
}

async function selectAvatarRecord(
  input: ResolveThinkForgeCastingInput,
  intent: ThinkForgeCastingIntent,
  warnings: string[],
): Promise<{
  record: AvatarProfileRecord | null;
  source?: ThinkForgeCastingMetadata['source'];
  confidence?: number;
}> {
  if (intent.avatarProfileId) {
    const explicit = (await listAcceptedAvatarRecords(input)).find((record) => {
      return record.id === intent.avatarProfileId || record.profile.avatarId === intent.avatarProfileId;
    }) ?? null;
    if (!explicit) warnings.push('explicit_avatar_profile_not_found_or_not_accepted');
    return {
      record: explicit,
      source: explicit ? 'explicit_avatar' : undefined,
      confidence: explicit ? 1 : undefined,
    };
  }

  if (isNonEmptyString(input.brandId)) {
    const brandRecords = await listAcceptedAvatarRecords(input, { brandId: input.brandId });
    if (brandRecords.length > 0) {
      if (brandRecords.length > 1) warnings.push('multiple_brand_avatars_defaulted_most_recent');
      return {
        record: brandRecords[0],
        source: 'brand',
        confidence: brandRecords.length > 1 ? 0.72 : 0.92,
      };
    }
    warnings.push('no_brand_avatar_available');
  }

  const userGlobalRecords = (await listAcceptedAvatarRecords(input))
    .filter((record) => !isNonEmptyString(record.profile.brandId));
  if (userGlobalRecords.length > 0) {
    if (userGlobalRecords.length > 1) warnings.push('multiple_user_global_avatars_defaulted_most_recent');
    return {
      record: userGlobalRecords[0],
      source: 'user_global',
      confidence: userGlobalRecords.length > 1 ? 0.68 : 0.86,
    };
  }

  warnings.push('no_accepted_avatar_available');
  return { record: null };
}

async function listAcceptedAvatarRecords(
  input: ResolveThinkForgeCastingInput,
  filter: { brandId?: string } = {},
): Promise<AvatarProfileRecord[]> {
  const params = new URLSearchParams({ status: 'accepted' });
  if (filter.brandId) params.set('brandId', filter.brandId);
  const result = await listAvatarProfiles({
    userId: input.userId,
    orgId: input.orgId ?? null,
    searchParams: params,
  }, input.dependencies);
  return result.body.records;
}

function getCastingGateFailures(record: AvatarProfileRecord): string[] {
  const failures: string[] = [];
  if (record.status !== 'accepted' || record.profile.status !== 'accepted') {
    failures.push('avatar_profile_not_accepted');
  }
  if (record.profile.rights.consentConfirmed !== true) {
    failures.push('avatar_consent_missing');
  }

  const recipe = buildAvatarRenderRecipe({
    profileRecord: record,
    useCase: 'social_presenter',
    prompt: 'On-camera presenter for a ThinkForge-generated script.',
    script: READY_CHECK_SCRIPT,
    audio: { voiceoverText: READY_CHECK_SCRIPT },
  });
  if (!recipe.readiness.ready) {
    failures.push(
      ...recipe.readiness.errors.map((issue) => `avatar_not_render_ready:${issue.code}`),
    );
  }
  return failures;
}

function resolveCharacterVoice(record: AvatarProfileRecord): CharacterCasting['voice'] {
  const voice = record.profile.voice;
  if (voice.sourceType === 'selected_tts_voice' && isNonEmptyString(voice.ttsVoiceId)) {
    return { mode: 'preset', ttsVoiceId: voice.ttsVoiceId };
  }

  const voiceReferenceUrl = record.profile.evidence.find((item) => {
    return item.sourceType === 'uploaded_voice_sample' && isNonEmptyString(item.sourceUrl);
  })?.sourceUrl;
  if (voice.sourceType === 'uploaded_voice_sample' && isNonEmptyString(voiceReferenceUrl)) {
    return { mode: 'cloned', voiceReferenceUrl: voiceReferenceUrl.trim() };
  }

  return { mode: 'none' };
}

function readStructuredCastingIntent(project?: ProjectMeta | null): ThinkForgeCastingIntent | null {
  const projectRecord = toRecord(project);
  const preferences = toRecord(project?.preferences);
  const candidates = [
    toRecord(projectRecord?.casting),
    toRecord(projectRecord?.castingIntent),
    toRecord(projectRecord?.avatarCasting),
    toRecord(preferences?.casting),
    toRecord(preferences?.castingIntent),
    toRecord(preferences?.avatarCasting),
  ].filter((candidate): candidate is Record<string, unknown> => Boolean(candidate));

  const directAvatarProfileId = firstString(
    projectRecord?.avatarProfileId,
    preferences?.avatarProfileId,
  );
  const directRequested = booleanTrue(projectRecord?.useAvatar)
    || booleanTrue(projectRecord?.castSelf)
    || booleanTrue(preferences?.useAvatar)
    || booleanTrue(preferences?.castSelf);

  for (const candidate of candidates) {
    const avatarProfileId = firstString(candidate.avatarProfileId, candidate.profileId, candidate.recordId);
    const target = firstString(candidate.target, candidate.subject, candidate.speaker, candidate.actor);
    const requested = booleanTrue(candidate.requested)
      || booleanTrue(candidate.onCamera)
      || booleanTrue(candidate.castSelf)
      || avatarProfileId !== undefined
      || target === 'self'
      || target === 'user';
    if (!requested) continue;
    return {
      requested: true,
      target: 'self',
      characterId: firstString(candidate.characterId, candidate.id) ?? DEFAULT_CHARACTER_ID,
      characterName: firstString(candidate.characterName, candidate.name) ?? DEFAULT_CHARACTER_NAME,
      ...(avatarProfileId ? { avatarProfileId } : {}),
    };
  }

  if (directAvatarProfileId || directRequested) {
    return {
      requested: true,
      target: 'self',
      characterId: DEFAULT_CHARACTER_ID,
      characterName: DEFAULT_CHARACTER_NAME,
      ...(directAvatarProfileId ? { avatarProfileId: directAvatarProfileId } : {}),
    };
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (!isNonEmptyString(value)) continue;
    return value.trim();
  }
  return undefined;
}

function booleanTrue(value: unknown): boolean {
  return value === true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
