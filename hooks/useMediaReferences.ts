/**
 * useMediaReferences — the pinned "reference pool" + a pin/unpin action.
 * Pinned assets are never LRU-evicted and are the library Brand Vault / future
 * generations draw from. Drop-in for a pin button anywhere assets are listed.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

export interface MediaReference {
  assetId: string;
  name: string;
  type: string;
  path: string;
  size: number;
  thumbnail?: string;
  dimensions?: { width: number; height: number };
}

export const MEDIA_REFERENCES_QUERY_KEY = ['editron', 'media', 'references'];

async function fetchReferences(): Promise<MediaReference[]> {
  const res = await fetch('/api/services/editron/media/references');
  const d = await res.json();
  if (!res.ok || !d.success) throw new Error(d.error || 'Failed to load references');
  return d.references;
}

export function useMediaReferences() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: MEDIA_REFERENCES_QUERY_KEY,
    queryFn: fetchReferences,
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  const pin = useMutation({
    mutationFn: async ({ assetId, pinned }: { assetId: string; pinned: boolean }) => {
      const res = await fetch('/api/services/editron/media/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, pinned }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to update pin');
      return d as { assetId: string; pinned: boolean };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_REFERENCES_QUERY_KEY }),
  });

  return {
    references: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    setPinned: pin.mutateAsync,
    isPinning: pin.isPending,
  };
}
