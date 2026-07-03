/**
 * useStorage — per-plan storage status + the "extra storage" (paid overage) toggle.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

export const STORAGE_QUERY_KEY = ['user', 'storage'];

export interface StorageStatus {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  percentUsed: number;
  extraStorageEnabled: boolean;
  overageBytes: number;
  estMonthlyCredits: number;
  usedFormatted: string;
  limitFormatted: string;
  remainingFormatted: string;
  overageFormatted: string;
  ownerType: 'org' | 'user';
}

async function fetchStorage(): Promise<StorageStatus> {
  const res = await fetch('/api/user/storage');
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch storage');
  return data.storage;
}

export function useStorage() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: STORAGE_QUERY_KEY,
    queryFn: fetchStorage,
    enabled: !!userId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch('/api/user/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraStorageEnabled: enabled }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to update storage setting');
      return d.storage as StorageStatus;
    },
    onSuccess: (storage) => queryClient.setQueryData(STORAGE_QUERY_KEY, storage),
  });

  return {
    storage: data ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    setExtraStorage: toggle.mutateAsync,
    isTogglingExtra: toggle.isPending,
  };
}
