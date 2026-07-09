'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvatarProfileStatus, AvatarReferenceRole } from '@/lib/avatar/avatar-profile';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import type {
  AvatarRenderAudioInput,
  AvatarRenderModality,
  AvatarRenderRecipe,
  AvatarRenderTarget,
  AvatarRenderUseCase,
} from '@/lib/avatar/avatar-render-recipe';
import type {
  AvatarProviderId,
  AvatarProviderSelection,
  AvatarProviderSelectionMode,
} from '@/lib/avatar/avatar-provider-adapter';
import type { AvatarRenderJobSnapshot } from '@/lib/avatar/avatar-render-job';
import type { AvatarPipelineJobSnapshot } from '@/lib/avatar/avatar-pipeline-job';
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

interface AvatarVaultUploadSuccess {
  ok: true;
  asset: AvatarVaultUploadedReference;
}

interface AvatarVaultRenderPlanSuccess {
  ok: true;
  recipe: AvatarRenderRecipe;
  providerPlan: AvatarProviderSelection;
}

interface AvatarVaultRenderJobSuccess extends AvatarVaultRenderPlanSuccess {
  job: AvatarRenderJobSnapshot;
}

interface AvatarPipelineJobSuccess {
  ok: true;
  job: AvatarPipelineJobSnapshot;
  recipe?: AvatarRenderRecipe;
}

type AvatarVaultApiResult =
  | AvatarVaultApiError
  | AvatarVaultListSuccess
  | AvatarVaultRecordSuccess
  | AvatarVaultUploadSuccess
  | AvatarVaultRenderPlanSuccess
  | AvatarVaultRenderJobSuccess
  | AvatarPipelineJobSuccess;

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

export interface UploadAvatarReferenceInput {
  file: File;
  role: AvatarReferenceRole;
}

export interface PlanAvatarRenderInput {
  recordId: string;
  useCase: AvatarRenderUseCase;
  renderModality?: AvatarRenderModality;
  prompt: string;
  script?: string;
  negativePrompt?: string;
  audio?: AvatarRenderAudioInput;
  productImageUrls?: string[];
  target?: AvatarRenderTarget;
  provider?: {
    mode?: AvatarProviderSelectionMode;
    preferredProviderId?: AvatarProviderId;
    includeProviderIds?: AvatarProviderId[];
  };
}

export type CreateAvatarRenderJobInput = PlanAvatarRenderInput;

export interface AvatarVaultUploadedReference {
  assetId: string;
  imageUrl: string;
  r2Key: string;
  role: AvatarReferenceRole;
  contentType: string;
  sizeBytes: number;
  originalName: string;
  storedAt: string;
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

  const uploadReference = useMutation({
    mutationFn: uploadAvatarReferenceRequest,
  });

  return { createDraft, reviewDraft, uploadReference };
}

export function useAvatarRenderPlanMutation() {
  return useMutation({
    mutationFn: planAvatarRenderRequest,
  });
}

export function useAvatarRenderJobMutation() {
  return useMutation({
    mutationFn: createAvatarRenderJobRequest,
  });
}

/** Create a job on the PROVEN pipeline path: Chatterbox voice → OmniHuman face → Remotion composite. */
export function useAvatarPipelineJobMutation() {
  return useMutation({
    mutationFn: createAvatarPipelineJobRequest,
  });
}

/** Poll a pipeline job; each fetch advances its stages until the job is terminal. */
export function useAvatarPipelineJob(jobId: string | null) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: [...AVATAR_VAULT_KEYS.all, 'pipeline-job', jobId ?? 'none'],
    queryFn: () => fetchAvatarPipelineJob(jobId as string),
    enabled: Boolean(isSignedIn && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'succeeded' || status === 'failed' ? false : 3000;
    },
  });
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

async function uploadAvatarReferenceRequest(input: UploadAvatarReferenceInput): Promise<AvatarVaultUploadSuccess> {
  const formData = new FormData();
  formData.set('file', input.file);
  formData.set('role', input.role);

  return avatarVaultFetch<AvatarVaultUploadSuccess>('/api/avatar-vault/uploads', {
    method: 'POST',
    body: formData,
  });
}

async function planAvatarRenderRequest(input: PlanAvatarRenderInput): Promise<AvatarVaultRenderPlanSuccess> {
  const { recordId, ...body } = input;
  return avatarVaultFetch<AvatarVaultRenderPlanSuccess>(
    `/api/avatar-vault/profiles/${encodeURIComponent(recordId)}/render-plan`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    },
  );
}

async function createAvatarRenderJobRequest(input: CreateAvatarRenderJobInput): Promise<AvatarVaultRenderJobSuccess> {
  const { recordId, ...body } = input;
  return avatarVaultFetch<AvatarVaultRenderJobSuccess>(
    `/api/avatar-vault/profiles/${encodeURIComponent(recordId)}/render-jobs`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    },
  );
}

async function createAvatarPipelineJobRequest(input: CreateAvatarRenderJobInput): Promise<AvatarPipelineJobSuccess> {
  const { recordId, ...body } = input;
  return avatarVaultFetch<AvatarPipelineJobSuccess>(
    `/api/avatar-vault/profiles/${encodeURIComponent(recordId)}/pipeline-jobs`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    },
  );
}

async function fetchAvatarPipelineJob(jobId: string): Promise<AvatarPipelineJobSnapshot> {
  const payload = await avatarVaultFetch<AvatarPipelineJobSuccess>(
    `/api/avatar-vault/pipeline-jobs/${encodeURIComponent(jobId)}`,
  );
  return payload.job;
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
