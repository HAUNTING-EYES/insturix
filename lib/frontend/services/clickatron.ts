import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatMessage } from '@/types/clickatron';

const DEFAULT_VARIATION_POLL_TIMEOUT_MS = 12 * 60 * 1000;

// Polling utility for variation completion
export const pollVariationCompletion = async (
  sessionId: string,
  variationId: string,
  loadSession: (sessionId: string) => Promise<void>,
  getTask: () => any,
  refreshUsageLimits?: () => void,
  pollInterval: number = 2000,
  signal?: AbortSignal,
  maxWaitMs: number = DEFAULT_VARIATION_POLL_TIMEOUT_MS,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

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
      if (Date.now() - startedAt > maxWaitMs) {
        clearInterval(poll);
        reject(new Error(`Image generation timed out after ${Math.round(maxWaitMs / 60000)} minutes`));
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
          // Reject if the variation failed — surface the worker's real error
          // (deprecated model, 0-reference rejection, provider 4xx, brand-logo gating,
          // watchdog timeout) instead of a generic string, so failures are diagnosable
          // end-to-end. The worker persists this on variation.error; the UI was discarding it.
          if (variation.status === 'failed') {
            reject(new Error(variation.error || 'Image generation failed'));
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

// Note: the variation route reads request.formData(); creation is done directly in
// CanvasStage via FormData. A dead JSON-body useCreateVariation hook was removed here
// (zero importers) — it would have failed against the formData route if ever wired.

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
