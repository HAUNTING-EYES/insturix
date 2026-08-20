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

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import type {
  BrandVaultAcceptedBrandsApiResult,
  BrandVaultAcceptedBrandSummary,
  BrandVaultApiResult,
  BrandVaultApiSuccess,
  BrandVaultBrandScanSummary,
  BrandVaultBrandScansApiResult,
  CreateBrandVaultDraftInput,
} from './brand-vault-types';

/* ------------------------------------------------------------------ */
/*  Query keys                                                         */
/* ------------------------------------------------------------------ */

export const BRAND_VAULT_KEYS = {
  all: ['brand-vault'] as const,
  job: (jobId: string) => [...BRAND_VAULT_KEYS.all, 'job', jobId] as const,
  profile: (recordId: string) => [...BRAND_VAULT_KEYS.all, 'profile', recordId] as const,
  latestAcceptedRoot: () => [...BRAND_VAULT_KEYS.all, 'latest-accepted'] as const,
  latestAccepted: (brandId: string | null | undefined) =>
    [...BRAND_VAULT_KEYS.latestAcceptedRoot(), brandId ?? 'none'] as const,
  acceptedBrandsRoot: () => [...BRAND_VAULT_KEYS.all, 'accepted-brands'] as const,
  acceptedBrands: () => BRAND_VAULT_KEYS.acceptedBrandsRoot(),
  scansRoot: () => [...BRAND_VAULT_KEYS.all, 'scans'] as const,
  scans: (brandId: string | null | undefined) => [...BRAND_VAULT_KEYS.scansRoot(), brandId ?? 'none'] as const,
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

/** Latest accepted brand profile record id for one explicitly selected client. */
async function fetchLatestAcceptedRecordId(brandId: string): Promise<string | null> {
  const query = `?${new URLSearchParams({ brandId }).toString()}`;
  const response = await fetch(`/api/brand-vault/signal-profiles${query}`, { credentials: 'include' });
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; recordId?: string | null }
    | { ok: false; error?: { message?: string } }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload && 'error' in payload ? payload.error?.message ?? 'Could not load the accepted Brand Vault profile.' : 'Could not load the accepted Brand Vault profile.');
  }
  return payload.recordId ?? null;
}

async function fetchAcceptedBrands(): Promise<BrandVaultAcceptedBrandSummary[]> {
  const response = await fetch('/api/brand-vault/brands', { credentials: 'include', cache: 'no-store' });
  const payload = (await response.json().catch(() => null)) as BrandVaultAcceptedBrandsApiResult | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload && 'error' in payload ? payload.error?.message ?? 'Could not load accepted Brand Vault brands.' : 'Could not load accepted Brand Vault brands.');
  }
  if (!Array.isArray(payload.brands)) {
    throw new Error('Accepted Brand Vault brand list was malformed.');
  }
  return payload.brands;
}

/** Bounded scan-history summaries for one brand (newest first). No raw candidates. */
async function fetchBrandScans(brandId: string): Promise<BrandVaultBrandScanSummary[]> {
  const response = await fetch(`/api/brand-vault/brands/${encodeURIComponent(brandId)}/scans`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as BrandVaultBrandScansApiResult | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && 'error' in payload
        ? payload.error?.message ?? 'Could not load scan history for this brand.'
        : 'Could not load scan history for this brand.',
    );
  }
  return Array.isArray(payload.scans) ? payload.scans : [];
}

/** Delete a scan from a brand's history (owner-scoped server-side). Fail-loud on a non-ok envelope. */
async function deleteBrandScanRequest(brandId: string, jobId: string): Promise<void> {
  const response = await fetch(
    `/api/brand-vault/brands/${encodeURIComponent(brandId)}/scans?jobId=${encodeURIComponent(jobId)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok: true }
    | { ok: false; error?: { message?: string } }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && 'error' in payload ? payload.error?.message ?? 'Could not delete the scan.' : 'Could not delete the scan.',
    );
  }
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

function syncReviewCaches(queryClient: QueryClient, data: BrandVaultApiSuccess, fallbackRecordId: string): void {
  const recordId = data.record?.id ?? fallbackRecordId;
  const jobId = data.job?.id ?? data.reviewPayload?.jobId ?? null;

  const brandId = data.record?.profile.brandId ?? null;

  queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.latestAcceptedRoot() });
  queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.acceptedBrandsRoot() });
  // Scan history reflects this record's new status (ready -> accepted/rejected), so refresh every brand's
  // history rather than guessing the brand key.
  queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.scansRoot() });
  // The global brand switcher (ActiveBrandProvider) keeps its own brand list under this key. Without this
  // it stays stale after accept — the just-accepted brand never appears and the pill reads "No brand".
  queryClient.invalidateQueries({ queryKey: ['active-brand', 'brands'] });
  if (data.record?.status === 'accepted' && recordId && brandId) {
    queryClient.setQueryData(BRAND_VAULT_KEYS.latestAccepted(brandId), recordId);
  }
  if (recordId) queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.profile(recordId) });
  if (jobId) queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.job(jobId) });
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

/** Id of the accepted profile for the explicit active client. Never queries a global latest record. */
export function useLatestAcceptedBrandVaultRecordId(brandId: string | null | undefined) {
  const { isSignedIn } = useAuth();
  const normalizedBrandId = brandId?.trim() || null;
  return useQuery({
    queryKey: BRAND_VAULT_KEYS.latestAccepted(normalizedBrandId),
    queryFn: () => fetchLatestAcceptedRecordId(normalizedBrandId as string),
    enabled: Boolean(isSignedIn && normalizedBrandId),
    staleTime: 30 * 1000,
  });
}

/** Latest accepted Brand Vault profiles grouped by brand for the signed-in scope. */
export function useAcceptedBrandVaultBrands() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: BRAND_VAULT_KEYS.acceptedBrands(),
    queryFn: fetchAcceptedBrands,
    enabled: Boolean(isSignedIn),
    staleTime: 30 * 1000,
  });
}

/** Recent scan history (bounded summaries) for one brand, for the manager / rescan view. */
export function useBrandVaultScans(brandId: string | null | undefined) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: BRAND_VAULT_KEYS.scans(brandId),
    queryFn: () => fetchBrandScans(brandId as string),
    enabled: Boolean(isSignedIn && brandId),
    staleTime: 30 * 1000,
  });
}

/** Delete a scan from a brand's history; refreshes that brand's scan list on success. */
export function useDeleteBrandVaultScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, jobId }: { brandId: string; jobId: string }) => deleteBrandScanRequest(brandId, jobId),
    onSuccess: (_data, { brandId }) => {
      queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.scans(brandId) });
    },
  });
}

/** Create-draft, accept, and reject mutations with cache invalidation. */
export function useBrandVaultMutations() {
  const queryClient = useQueryClient();

  const createDraft = useMutation({
    mutationFn: (input: CreateBrandVaultDraftInput) => createDraftRequest(input),
    onSuccess: (data, input) => {
      if (data.job?.id) {
        queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.job(data.job.id) });
      }
      // A fresh scan is a new entry in this brand's history — refresh so the manager list shows it.
      queryClient.invalidateQueries({ queryKey: BRAND_VAULT_KEYS.scans(input.brandId) });
    },
  });

  const acceptDraft = useMutation({
    mutationFn: (input: AcceptBrandVaultDraftInput) =>
      reviewDraftRequest(input.recordId, 'accept', undefined, input.signalEdits),
    onSuccess: (data, input) => {
      syncReviewCaches(queryClient, data, input.recordId);
    },
  });

  const rejectDraft = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) =>
      reviewDraftRequest(recordId, 'reject', reason),
    onSuccess: (data, variables) => {
      syncReviewCaches(queryClient, data, variables.recordId);
    },
  });

  return { createDraft, acceptDraft, rejectDraft };
}
