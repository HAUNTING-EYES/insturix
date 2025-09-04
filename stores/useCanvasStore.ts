import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  IClickatronTask,
  CreateSessionRequest,
  Idea,
  Canvas,
  ClickatronStore,
} from '@/types/clickatron';
import { produce } from 'immer';

const useClickatronStore = create<ClickatronStore>()(
  devtools(
    (set, get) => ({
      task: null,
      isSaving: false,
      saveError: null,
      lastSaved: null,
      setTask: (task) => set({ task }),
      
      updateCanvas: (canvas) => {
        set(
          produce((state: ClickatronStore) => {
            if (state.task) {
              state.task.details.canvas = canvas;
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

      selectIdea: async (sessionId, idea) => {
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/ideas/select`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedIdea: idea }),
          });

          if (!response.ok) {
            throw new Error('Failed to select idea');
          }

          // Immediately load the session to get the "generating" state
          await get().loadSession(sessionId);

          // Set up polling with proper cleanup
          let pollCount = 0;
          const maxPolls = 15; // 30 seconds max (15 * 2 seconds)
          
          const poll = setInterval(async () => {
            pollCount++;
            
            try {
              await get().loadSession(sessionId);
              const task = get().task;
              const variation = task?.details.canvas?.variations[0];
              
              // Stop polling if generation is complete or we've reached max attempts
              if (variation && variation.status !== 'generating' || pollCount >= maxPolls) {
                clearInterval(poll);
                console.log('Polling stopped:', variation?.status || 'max attempts reached');
              }
            } catch (error) {
              console.error('Polling error:', error);
              clearInterval(poll);
            }
          }, 2000);

          return true;
        } catch (error) {
          console.error('Error selecting idea:', error);
          return false;
        }
      },

      syncCanvas: async (sessionId, canvas) => {
        // Prevent concurrent syncs
        if (get().isSaving) {
          console.log('Sync already in progress, skipping...');
          return;
        }

        // Set saving state
        set({ isSaving: true, saveError: null });
        
        // Get current state for intelligent merging
        const currentTask = get().task;
        if (!currentTask) {
          set({ isSaving: false, saveError: 'No task available' });
          return;
        }

        // Create merged canvas that preserves backend updates
        const mergedCanvas = produce(canvas, (draft) => {
          // For each variation in the frontend canvas
          draft.variations.forEach((frontendVariation, index) => {
            // Find corresponding variation in current task (which may have backend updates)
            const backendVariation = currentTask.details.canvas?.variations.find(
              (v) => v.id === frontendVariation.id
            );
            
            if (backendVariation) {
              // Preserve backend-controlled fields (status, imageRef) if they're more recent
              // Backend updates these when generation completes
              if (backendVariation.status === 'completed' && backendVariation.imageRef) {
                frontendVariation.status = backendVariation.status;
                frontendVariation.imageRef = backendVariation.imageRef;
              }
              
              // Keep frontend-controlled fields (fineTuning, prompt for user edits)
              // These are what the user is actively modifying
            }
          });
        });

        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canvas: mergedCanvas }),
          });

          if (!response.ok) {
            set({ isSaving: false, saveError: 'Failed to sync canvas' });
            throw new Error('Failed to sync canvas');
          }
          
          // Success - update the task state directly without triggering loadSession
          set(produce((state: ClickatronStore) => {
            if (state.task) {
              state.task.details.canvas = mergedCanvas;
              state.task.updatedAt = new Date();
            }
          }));
          
          // Set saving state separately to avoid potential issues
          set({ isSaving: false, saveError: null, lastSaved: new Date() });

        } catch (error) {
          set({ isSaving: false, saveError: error instanceof Error ? error.message : 'Unknown error' });
          console.error('Error syncing canvas:', error);
        }
      },

      loadSession: async (sessionId) => {
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`);
          if (!response.ok) {
            throw new Error('Failed to load session');
          }
          const data = await response.json();
          
          // Simply set the task - the component will handle preventing autosave loops
          set({ task: data.session });
        } catch (error) {
          console.error('Error loading session:', error);
        }
      },
    }),
    { name: 'ClickatronStore' }
  )
);

export default useClickatronStore;