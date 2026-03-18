import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import { parseAnalysesResponse } from '@/lib/alyzitron/parseResponse';

// Re-export so existing imports from this file continue to work
export { parseAnalysesResponse };

export function useAlyzitronPolling(enabled: boolean = true) {
    const queryClient = useQueryClient();

    const { data: analyses, isLoading, error } = useQuery<AlyzitronAnalysis[]>({
        queryKey: ['alyzitron-tasks'],
        queryFn: async () => {
            const response = await fetch('/api/services/alyzitron/analyses');
            if (!response.ok) throw new Error('Failed to fetch analyses');
            const json = await response.json();
            return parseAnalysesResponse(json);
        },
        enabled,
        refetchInterval: (query) => {
            // Poll every 3 seconds if there are in-progress tasks
            const data = query.state.data as any;
            const arr = Array.isArray(data) ? data : (data?.data ?? []);
            if (!arr) return 3000;

            const hasInProgress = arr.some((a: AlyzitronAnalysis) =>
                ['listed', 'queued', 'processing'].includes(a.status)
            );
            return hasInProgress ? 3000 : false;
        },
        staleTime: 0, // Always fetch fresh data when polling
        refetchOnWindowFocus: true,
    });

    return { analyses, isLoading, error };
}
