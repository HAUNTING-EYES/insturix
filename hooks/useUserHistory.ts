// TanStack Query hooks for user history
import { useQuery } from '@tanstack/react-query';

interface HistoryItem {
  id: string;
  name: string;
  thumbnail: string;
  timestamp: number;
  preset: string;
}

// Mock function - will be replaced with real API call
const fetchUserHistory = async (): Promise<HistoryItem[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock data
  return [
    {
      id: '1',
      name: 'Epic Gaming Montage',
      thumbnail: 'https://picsum.photos/320/180?random=1',
      timestamp: Date.now() - 86400000, // 1 day ago
      preset: 'YouTube Thumbnail',
    },
    {
      id: '2', 
      name: 'React Tutorial Series',
      thumbnail: 'https://picsum.photos/320/180?random=2',
      timestamp: Date.now() - 172800000, // 2 days ago
      preset: 'YouTube Thumbnail',
    },
    {
      id: '3',
      name: 'Travel Vlog Adventure',
      thumbnail: 'https://picsum.photos/320/180?random=3', 
      timestamp: Date.now() - 259200000, // 3 days ago
      preset: 'Social Media Post',
    },
  ];
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