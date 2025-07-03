import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface ThumbnailGenerationParams {
  details: string;
}

export const useGenerateThumbnail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ThumbnailGenerationParams) => {
      const { data } = await axios.post('/api/services/clickatron/generate', params);
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