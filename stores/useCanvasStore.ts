import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  IClickatronTask,
  CreateSessionRequest,
  Idea,
  Canvas,
  ClickatronStore,
  Variation,
} from '@/types/clickatron';
import { produce } from 'immer';

const useClickatronStore = create<ClickatronStore>()(
  devtools(
    (set, get) => ({
      task: null,
      isSaving: false,
      saveError: null,
      lastSaved: null,
      ideationModelId: undefined,
      editModelId: undefined,
      setTask: (task) => set({ task }),
      setIdeationModelId: (modelId: string | undefined) => set({ ideationModelId: modelId }),
      setEditModelId: (modelId: string | undefined) => set({ editModelId: modelId }),
      
      updateCanvas: (canvas) => {
        set(
          produce((state: ClickatronStore) => {
            if (state.task) {
              state.task.details.canvas = canvas;
            }
          })
        );
      },

      updateVariation: (variationId: string, newVariationData: Partial<Variation>) => {
        set(
          produce((state: ClickatronStore) => {
            if (state.task && state.task.details.canvas) {
              const variationIndex = state.task.details.canvas.variations.findIndex(
                (v) => v.id === variationId
              );
              if (variationIndex !== -1) {
                state.task.details.canvas.variations[variationIndex] = {
                  ...state.task.details.canvas.variations[variationIndex],
                  ...newVariationData,
                };
              }
            }
          })
        );
      },

      // Update canvas without triggering autosave (for backend updates)
      setCanvasFromBackend: (canvas) => {
        set(
          produce((state: ClickatronStore) => {
            if (state.task) {
              state.task.details.canvas = canvas;
            }
          })
        );
      },

      createSession: async (request) => {
        try {
          const response = await fetch('/api/services/clickatron/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });

          if (!response.ok) {
            throw new Error('Failed to create session');
          }

          const data = await response.json();
          
          set(produce((state: ClickatronStore) => {
              state.task = {
                  _id: data.sessionId,
                  clerkUserId: '', // This will be filled when loading the session
                  details: {
                      videoIdea: request.videoIdea,
                      aspectRatio: request.aspectRatio,
                      ideas: data.ideas
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
              }
          }));

          return data.sessionId;
        } catch (error) {
          console.error('Error creating session:', error);
          return null;
        }
      },

      selectIdea: async (sessionId, idea, modelId) => {
        try {
          const requestBody: any = { selectedIdea: idea };
          if (modelId !== undefined) {
            requestBody.modelId = modelId;
          }
          
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/ideas/select`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            throw new Error('Failed to select idea');
          }

          // Immediately load the session to get the "generating" state
          await get().loadSession(sessionId);

          // Set up polling with proper cleanup
          const firstVariation = get().task?.details.canvas?.variations[0];
          if (firstVariation) {
            // Use the polling utility (we'll need to import it)
            let pollCount = 0;
            const maxPolls = 15; // 30 seconds max (15 * 2 seconds)
            
            const poll = setInterval(async () => {
              pollCount++;
              
              try {
                await get().loadSession(sessionId);
                const task = get().task;
                const variation = task?.details.canvas?.variations[0];
                
                // Stop polling if generation is complete or we've reached max attempts
                if (variation && (variation.status !== 'generating' || pollCount >= maxPolls)) {
                  clearInterval(poll);
                }
              } catch (error) {
                console.error('Polling error:', error);
                clearInterval(poll);
              }
            }, 2000);
          }

          return true;
        } catch (error) {
          console.error('Error selecting idea:', error);
          return false;
        }
      },

      syncCanvas: async (sessionId, canvas) => {
        if (get().isSaving) return;
        set({ isSaving: true, saveError: null });

        try {
          console.log('🚀 Syncing canvas with session:', sessionId);
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canvas }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Sync failed with status:', response.status, 'and body:', errorText);
            throw new Error(`Failed to sync canvas: ${response.status} ${errorText}`);
          }

          const responseData = await response.json();
          
          set(produce((state: ClickatronStore) => {
            if (state.task) {
              state.task.details.canvas = responseData.session.details.canvas;
              state.lastSaved = new Date();
              state.saveError = null; // Clear any previous error
            }
          }));
        } catch (error) {
          console.error('💥 Sync error:', error);
          set({ saveError: error instanceof Error ? error.message : "Unknown error" });
        } finally {
          set({ isSaving: false });
        }
      },

      loadSession: async (sessionId) => {
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`);
          if (!response.ok) throw new Error('Failed to load session');
          const data = await response.json();
          
          set(produce((state: ClickatronStore) => {
            const remoteSession = data.session;
            if (state.task) {
              // Merge remote session into local state
              state.task = { ...state.task, ...remoteSession };
            } else {
              state.task = remoteSession;
            }
          }));
        } catch (error) {
          console.error('Error loading session:', error);
        }
      },
    }),
    { name: 'ClickatronStore' }
  )
);

export default useClickatronStore;