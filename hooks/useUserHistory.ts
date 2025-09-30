// TanStack Query hooks for user history
import { useQuery } from '@tanstack/react-query';

interface HistoryItem {
  id: string;
  name: string;
  videoIdea: string;
  thumbnail: string | null;
  timestamp: number;
  preset: string;
  selectedDirection?: string;
  status: string;
  stage?: 'ideation' | 'canvas';
  createdAt: string;
  updatedAt: string;
}

// Fetch real Clickatron history from API
const fetchUserHistory = async (): Promise<HistoryItem[]> => {
  try {
    const response = await fetch('/api/services/clickatron/history?page=1&limit=20');
    if (!response.ok) {
      throw new Error('Failed to fetch history');
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Clickatron history:', error);
    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
};

export const useUserHistory = () => {
  return useQuery({
    queryKey: ['userHistory'],
    queryFn: fetchUserHistory,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
};

// Hook for individual history item
export const useHistoryItem = (itemId: string) => {
  return useQuery({
    queryKey: ['historyItem', itemId],
    queryFn: async () => {
      const history = await fetchUserHistory();
      return history.find(item => item.id === itemId) || null;
    },
    enabled: !!itemId,
  });
};