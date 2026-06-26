import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  IClickatronTask,
  CreateSessionRequest,
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
      editModelId: undefined,
      setTask: (task) => set({ task }),
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

      createSession: async (formData: FormData) => {
        try {
          const response = await fetch('/api/services/clickatron/session', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to create session:', errorText);
            throw new Error('Failed to create session');
          }

          const data = await response.json();

          // Set the new task in the store immediately
          set(produce((state: ClickatronStore) => {
            state.task = {
              _id: data.sessionId,
              clerkUserId: '', // This will be filled when loading the session
              details: {
                videoIdea: data.variation.prompt,
                aspectRatio: data.variation.aspectRatio,
                canvas: {
                  // A carousel handoff returns N slide variations; fall back to the
                  // single variation for the normal (non-carousel) path.
                  variations: Array.isArray(data.variations) && data.variations.length > 0
                    ? data.variations
                    : [data.variation],
                  chatHistory: [],
                },
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }));

          return { sessionId: data.sessionId, variation: data.variation };
        } catch (error) {
          console.error('Error creating session:', error);
          return null;
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