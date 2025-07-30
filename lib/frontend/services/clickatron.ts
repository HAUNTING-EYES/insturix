import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface ThumbnailGenerationParams {
  details: string;
}

export const useGenerateThumbnail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ThumbnailGenerationParams) => {
      const response = await axios.post('/api/services/clickatron/generate', params);
      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to generate thumbnail');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clickatron', 'history'] });
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