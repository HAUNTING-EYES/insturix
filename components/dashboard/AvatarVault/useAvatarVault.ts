'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvatarProfileStatus } from '@/lib/avatar/avatar-profile';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type { AvatarProfileDraftRequest } from './avatar-vault-form';

interface AvatarVaultApiError {
  ok: false;
  error?: {
    code?: string;
    message?: string;
    issues?: unknown[];
  };
}

interface AvatarVaultListSuccess {
  ok: true;
  records: AvatarProfileRecord[];
}

interface AvatarVaultRecordSuccess {
  ok: true;
  record: AvatarProfileRecord;
  superseded?: AvatarProfileRecord[];
}

type AvatarVaultApiResult = AvatarVaultApiError | AvatarVaultListSuccess | AvatarVaultRecordSuccess;

export interface AvatarProfileListQuery {
  status?: AvatarProfileStatus;
  brandId?: string | null;
  avatarId?: string;
}

export interface ReviewAvatarProfileInput {
  recordId: string;
  action: 'accept' | 'reject';
  reason?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const AVATAR_VAULT_KEYS = {
  all: ['avatar-vault'] as const,
  profilesRoot: () => [...AVATAR_VAULT_KEYS.all, 'profiles'] as const,
  profiles: (query: AvatarProfileListQuery) => [...AVATAR_VAULT_KEYS.profilesRoot(), query] as const,
  profile: (recordId: string | null | undefined) =>
    [...AVATAR_VAULT_KEYS.all, 'profile', recordId ?? 'none'] as const,
};

export function useAvatarProfiles(query: AvatarProfileListQuery = {}) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: AVATAR_VAULT_KEYS.profiles(query),
    queryFn: () => fetchAvatarProfiles(query),
    enabled: Boolean(isSignedIn),
    staleTime: 30 * 1000,
  });
}

export function useAvatarProfile(recordId: string | null) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: AVATAR_VAULT_KEYS.profile(recordId),
    queryFn: () => fetchAvatarProfile(recordId as string),
    enabled: Boolean(isSignedIn && recordId),
    staleTime: 30 * 1000,
  });
}

export function useAvatarVaultMutations() {
  const queryClient = useQueryClient();

  const createDraft = useMutation({
    mutationFn: createAvatarProfileDraftRequest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: AVATAR_VAULT_KEYS.profilesRoot() });
      queryClient.setQueryData(AVATAR_VAULT_KEYS.profile(data.record.id), data.record);
    },
  });

  const reviewDraft = useMutation({
    mutationFn: reviewAvatarProfileDraftRequest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: AVATAR_VAULT_KEYS.profilesRoot() });
      queryClient.setQueryData(AVATAR_VAULT_KEYS.profile(data.record.id), data.record);
    },
  });

  return { createDraft, reviewDraft };
}

async function fetchAvatarProfiles(query: AvatarProfileListQuery): Promise<AvatarProfileRecord[]> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.avatarId?.trim()) params.set('avatarId', query.avatarId.trim());
  if (query.brandId !== undefined) params.set('brandId', query.brandId ?? 'null');
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const payload = await avatarVaultFetch<AvatarVaultListSuccess>(`/api/avatar-vault/profiles${suffix}`);
  return payload.records;
}

async function fetchAvatarProfile(recordId: string): Promise<AvatarProfileRecord> {
  const payload = await avatarVaultFetch<AvatarVaultRecordSuccess>(
    `/api/avatar-vault/profiles/${encodeURIComponent(recordId)}`,
  );
  return payload.record;
}

async function createAvatarProfileDraftRequest(
  input: AvatarProfileDraftRequest,
): Promise<AvatarVaultRecordSuccess> {
  return avatarVaultFetch<AvatarVaultRecordSuccess>('/api/avatar-vault/profiles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

async function reviewAvatarProfileDraftRequest(
  input: ReviewAvatarProfileInput,
): Promise<AvatarVaultRecordSuccess> {
  return avatarVaultFetch<AvatarVaultRecordSuccess>(
    `/api/avatar-vault/profiles/${encodeURIComponent(input.recordId)}`,
    {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        input.action === 'reject'
          ? { action: input.action, reason: input.reason ?? 'Rejected in Avatar Vault.' }
          : { action: input.action },
      ),
    },
  );
}

async function avatarVaultFetch<TSuccess extends { ok: true }>(
  url: string,
  init?: RequestInit,
): Promise<TSuccess> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const payload = (await response.json().catch(() => null)) as AvatarVaultApiResult | null;
  if (!response.ok || !payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false
        ? payload.error?.message ?? 'Avatar Vault request failed.'
        : `Avatar Vault request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload as unknown as TSuccess;
}
