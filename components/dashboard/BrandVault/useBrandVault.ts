'use client';

/**
 * useBrandVault
 *
 * React Query hooks over the four live Brand Vault routes:
 *   POST  /api/brand-vault/refinery/jobs
 *   GET   /api/brand-vault/refinery/jobs?jobId=...
 *   GET   /api/brand-vault/signal-profiles/[id]
 *   PATCH /api/brand-vault/signal-profiles/[id]
 *
 * Mirrors the project's useOrganization pattern (Clerk gating, staleTime,
 * invalidateQueries). Fetch helpers fail loud: any non-ok envelope throws so
 * the query/mutation surfaces an error state rather than rendering junk.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import type {
  BrandVaultApiResult,
  BrandVaultApiSuccess,
  CreateBrandVaultDraftInput,
} from './brand-vault-types';

/* ------------------------------------------------------------------ */
/*  Query keys                                                         */
/* ------------------------------------------------------------------ */

export const BRAND_VAULT_KEYS = {
  all: ['brand-vault'] as const,
  job: (jobId: string) => [...BRAND_VAULT_KEYS.all, 'job', jobId] as const,
  profile: (recordId: string) => [...BRAND_VAULT_KEYS.all, 'profile', recordId] as const,
};

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function brandVaultFetch(url: string, init?: RequestInit): Promise<BrandVaultApiSuccess> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const payload = (await response.json().catch(() => null)) as BrandVaultApiResult | null;
  if (!payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false
        ? payload.error?.message ?? 'Brand Vault request failed.'
        : `Brand Vault request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export interface BrandVaultSignalEditInput {
  path: string;
  value: unknown;
}

export interface AcceptBrandVaultDraftInput {
  recordId: string;
  signalEdits?: BrandVaultSignalEditInput[];
}

async function createDraftRequest(input: CreateBrandVaultDraftInput): Promise<BrandVaultApiSuccess> {
  return brandVaultFetch('/api/brand-vault/refinery/jobs', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

async function fetchJob(jobId: string): Promise<BrandVaultApiSuccess> {
  return brandVaultFetch(`/api/brand-vault/refinery/jobs?jobId=${encodeURIComponent(jobId)}`);
}

async function fetchProfile(recordId: string): Promise<BrandVaultApiSuccess> {
  return brandVaultFetch(`/api/brand-vault/signal-profiles/${encodeURIComponent(recordId)}`);
}

/** Latest accepted brand profile record id for the signed-in user (null if none accepted yet). */
async function fetchLatestAcceptedRecordId(): Promise<string | null> {
  const response = await fetch('/api/brand-vault/signal-profiles', { credentials: 'include' });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; recordId?: string | null } | null;
  return payload?.ok ? payload.recordId ?? null : null;
}

async function reviewDraftRequest(
  recordId: string,
  action: 'accept' | 'reject',
  reason?: string,
  signalEdits?: BrandVaultSignalEditInput[],
): Promise<BrandVaultApiSuccess> {
  return brandVaultFetch(`/api/brand-vault/signal-profiles/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(action === 'accept' ? { action, signalEdits: signalEdits ?? [] } : { action, reason }),
  });
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Load (or reload) a refinery job + its draft profile by job id. */
export function useBrandVaultJob(jobId: string | null) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: BRAND_VAULT_KEYS.job(jobId ?? ''),
    queryFn: () => fetchJob(jobId as string),
    enabled: Boolean(isSignedIn && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 2500 : false;
    },
    staleTime: 30 * 1000,
  });
}

/** Open a profile record (draft or accepted) directly by record id. */
export function useBrandVaultProfile(recordId: string | null) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: BRAND_VAULT_KEYS.profile(recordId ?? ''),
    queryFn: () => fetchProfile(recordId as string),
    enabled: Boolean(isSignedIn && recordId),
    staleTime: 30 * 1000,
  });
}

/** Id of the signed-in user's latest accepted brand profile, so the tab can reload it on mount. */
export function useLatestAcceptedBrandVaultRecordId() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: [...BRAND_VAULT_KEYS.all, 'latest-accepted'] as const,
    queryFn: fetchLatestAcceptedRecordId,
    enabled: Boolean(isSignedIn),
    staleTime: 30 * 1000,
  });
}

/** Create-draft, accept, and reject mutations with cache invalidation. */
export function useBrandVaultMutations() {
  const queryClient = useQueryClient();

  const createDraft = useMutation({
    mutationFn: (input: CreateBrandVaultDraftInput) => createDraftRequest(input),
    onSuccess: (data) => {
      if (data.job?.id) {
        queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.job(data.job.id) });
      }
    },
  });

  const acceptDraft = useMutation({
    mutationFn: (input: AcceptBrandVaultDraftInput) =>
      reviewDraftRequest(input.recordId, 'accept', undefined, input.signalEdits),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.profile(input.recordId) });
    },
  });

  const rejectDraft = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) =>
      reviewDraftRequest(recordId, 'reject', reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.profile(variables.recordId) });
    },
  });

  return { createDraft, acceptDraft, rejectDraft };
}
