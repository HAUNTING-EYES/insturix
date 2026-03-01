import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateVariationRequest, ChatMessage } from '@/types/clickatron';

// Polling utility for variation completion
export const pollVariationCompletion = async (
  sessionId: string,
  variationId: string,
  loadSession: (sessionId: string) => Promise<void>,
  getTask: () => any,
  refreshUsageLimits?: () => void,
  pollInterval: number = 2000,
  signal?: AbortSignal
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Helper function to check if variation is complete with image/thumbnail
    const isVariationComplete = (variation: any): boolean => {
      if (!variation) return false;
      const hasImage = variation.imageRef && variation.imageRef.trim() !== '';
      const hasThumbnail = variation.thumbnailRef && variation.thumbnailRef.trim() !== '';
      return variation.status === 'completed' && (hasImage || hasThumbnail);
    };

    // Check initial state before starting polling
    const task = getTask();
    const initialVariation = task?.details.canvas?.variations.find((v: any) => v.id === variationId);
    if (isVariationComplete(initialVariation)) {
      if (refreshUsageLimits) {
        refreshUsageLimits();
      }
      resolve();
      return;
    }

    const poll = setInterval(async () => {
      if (signal?.aborted) {
        clearInterval(poll);
        reject(new Error('Polling aborted'));
        return;
      }
      try {
        // Check current state before making API call
        const currentTask = getTask();
        const currentVariation = currentTask?.details.canvas?.variations.find((v: any) => v.id === variationId);
        
        // If already complete with image/thumbnail, skip API call and stop polling
        if (isVariationComplete(currentVariation)) {
          clearInterval(poll);
          if (refreshUsageLimits) {
            refreshUsageLimits();
          }
          resolve();
          return;
        }

        // Only call loadSession if variation is not yet complete
        await loadSession(sessionId);
        const task = getTask();
        const variation = task?.details.canvas?.variations.find((v: any) => v.id === variationId);
        
        // Stop polling if generation is complete with image/thumbnail
        if (isVariationComplete(variation)) {
          clearInterval(poll);
          if (refreshUsageLimits) {
            refreshUsageLimits();
          }
          resolve();
        } else if (variation && variation.status !== 'generating') {
          // Also stop if status changed to something other than generating (e.g., failed)
          clearInterval(poll);
          console.log('Polling stopped:', variation?.status);
          // Refresh usage limits if callback is provided
          if (refreshUsageLimits) {
            refreshUsageLimits();
          }
          // Reject if the variation failed
          if (variation.status === 'failed') {
            reject(new Error('Image generation failed'));
          } else {
            resolve();
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        clearInterval(poll);
        reject(error);
      }
    }, pollInterval);

    // Cleanup on abort
    signal?.addEventListener('abort', () => {
      clearInterval(poll);
      reject(new Error('Polling aborted'));
    });
  });
};

// React Query hooks for Clickatron API
export const useCreateVariation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, ...data }: CreateVariationRequest & { sessionId: string }) => {
      const idempotencyKey = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      
      const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create variation');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate session query to refetch latest state
      queryClient.invalidateQueries({ queryKey: ['clickatron-session', variables.sessionId] });
    },
  });
};

export const useAddChatMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, ...data }: { sessionId: string; content: string; referenceImages?: string[]; variationId?: string }) => {
      const response = await fetch(`/api/services/clickatron/session/${sessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to add chat message');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate chat history query
      queryClient.invalidateQueries({ queryKey: ['clickatron-chat', variables.sessionId] });
    },
  });
};

export const useChatHistory = (sessionId: string) => {
  return useQuery({
    queryKey: ['clickatron-chat', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/services/clickatron/session/${sessionId}/chat`);
      if (!response.ok) {
        throw new Error('Failed to fetch chat history');
      }
      const data = await response.json();
      return data.chatHistory as ChatMessage[];
    },
    enabled: !!sessionId,
  });
};

export const useVariation = (sessionId: string, variationId: string) => {
  return useQuery({
    queryKey: ['clickatron-variation', sessionId, variationId],
    queryFn: async () => {
      const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation/${variationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch variation');
      }
      const data = await response.json();
      return data.variation;
    },
    enabled: !!sessionId && !!variationId,
  });
};