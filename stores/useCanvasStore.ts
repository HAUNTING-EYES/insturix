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
          
          // After selecting an idea, we should reload the session to get the new canvas
          await get().loadSession(sessionId);

          return true;
        } catch (error) {
          console.error('Error selecting idea:', error);
          return false;
        }
      },

      syncCanvas: async (sessionId, canvas) => {
        // Optimistic update
        const originalTask = get().task;
        set(produce((state: ClickatronStore) => {
            if(state.task) {
                state.task.details.canvas = canvas;
            }
        }));

        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canvas }),
          });

          if (!response.ok) {
            // Revert on failure
            set({ task: originalTask });
            throw new Error('Failed to sync canvas');
          }
        } catch (error) {
          // Revert on failure
          set({ task: originalTask });
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