/**
 * useCredits Hook
 *
 * React Query-based hook for managing credits balance with automatic refresh.
 * Use `invalidateCredits()` to trigger refresh after any credits-changing action.
 *
 * Context-aware (P2 org UX): fetches with `?wallet=auto`, so when org-wallet billing is enabled
 * and the ACTIVE Clerk context is an organization, the balance shown is the ORG's shared wallet
 * (walletOwner:'org'); personal context (or flag off) shows the personal wallet exactly as
 * before. The query key carries the active org id, so switching context in the OrgSwitcher
 * refetches automatically. NOTE: display follows active context; non-editron services that still
 * bill personal (e.g. alyzitron) charge the personal wallet regardless — their pre-checks are
 * conservative, never a wrong charge.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useOrganization } from '@clerk/nextjs';

// Query key PREFIX for credits — used to invalidate from anywhere. Actual query keys append the
// active org id (or 'personal'), and invalidateQueries matches by prefix, so existing
// invalidation calls cover every context.
export const CREDITS_QUERY_KEY = ['user', 'credits'];

export interface CreditsBalance {
  // MAIN pool (everyday workflow)
  subscriptionCredits: number;
  topupCredits: number;
  totalCredits: number;
  subscriptionCreditsExpiry: string | null;
  // MEDIA pool (image/video/audio generation) — granted on top of the main pool
  mediaCredits: number;
  mediaTopupCredits: number;
  totalMediaCredits: number;
  mediaCreditsExpiry: string | null;
}

export interface CreditTransaction {
  id: string;
  type: 'subscription_grant' | 'topup' | 'usage' | 'refund' | 'expiry' | 'adjustment';
  amount: number;
  service?: string;
  action?: string;
  timestamp: string;
  balanceAfter: number;
}

export interface CreditsData {
  balance: CreditsBalance;
  recentTransactions: CreditTransaction[];
  /** Which wallet this balance is — 'org' when the active context is a team (flag on). */
  walletOwner: 'personal' | 'org';
  orgId?: string;
}

async function fetchCredits(): Promise<CreditsData> {
  const res = await fetch('/api/user/credits?wallet=auto');
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch credits');
  }

  return {
    balance: data.balance,
    recentTransactions: data.recentTransactions || [],
    walletOwner: data.walletOwner === 'org' ? 'org' : 'personal',
    orgId: data.orgId,
  };
}

export function useCredits() {
  const { userId } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    // Keyed by active org so an OrgSwitcher change refetches the right wallet.
    queryKey: [...CREDITS_QUERY_KEY, organization?.id ?? 'personal'],
    queryFn: fetchCredits,
    enabled: !!userId, // Only fetch if user is signed in
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Function to invalidate and refetch credits from anywhere (prefix-matches every context key)
  const invalidateCredits = () => {
    queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
  };

  return {
    balance: data?.balance ?? null,
    transactions: data?.recentTransactions ?? [],
    walletOwner: data?.walletOwner ?? (organization ? 'org' : 'personal'),
    orgName: organization?.name ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    invalidateCredits,
  };
}

// Hook for checking if user has enough credits for an action.
// Pass pool='media' for image/video/audio generation actions so the check runs
// against the media pool; defaults to the main pool for everyday workflow.
export function useCreditsCheck(requiredCredits: number, pool: 'main' | 'media' = 'main') {
  const { balance, isLoading } = useCredits();

  const available = balance
    ? (pool === 'media' ? balance.totalMediaCredits : balance.totalCredits)
    : 0;
  const hasEnough = available >= requiredCredits;
  const shortfall = Math.max(0, requiredCredits - available);

  return {
    hasEnough,
    shortfall,
    available,
    pool,
    isLoading,
  };
}

// Global helper to invalidate credits from outside React components
// Useful for API route responses or SSE events
let queryClientRef: ReturnType<typeof useQueryClient> | null = null;

export function setQueryClientRef(client: ReturnType<typeof useQueryClient>) {
  queryClientRef = client;
}

export function invalidateCreditsGlobally() {
  if (queryClientRef) {
    queryClientRef.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
  }
}
