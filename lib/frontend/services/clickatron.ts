import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface ThumbnailGenerationParams {
  details: string;
}

export const useClickatronVariation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { sessionId: string; prompt: string; fineTuning?: any }) => {
      const response = await axios.post(`/api/services/clickatron/session/${params.sessionId}/variation`, params);
      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to generate variation');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clickatron', 'sessions'] });
    },
  });
};

export const useClickatronHistory = () => {
  return useQuery({
    queryKey: ['clickatron', 'history'],
    queryFn: async () => {
      const { data } = await axios.get('/api/services/clickatron/history');
      return data;
    },
  });
};