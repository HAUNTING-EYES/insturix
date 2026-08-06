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
import { getActiveBrandIdFromStorage } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';

const CREATE_SESSION_KEY_TTL_MS = 15 * 60 * 1000;
const CREATE_SESSION_PENDING_RETRIES = 12;

interface PendingCreateSessionRequest {
  key: string;
  expiresAt: number;
}

const pendingCreateSessionRequests = new Map<string, PendingCreateSessionRequest>();

function buildClickatronSessionRequestFingerprint(formData: FormData): string {
  return Array.from(formData.entries())
    .map(([name, value]) => {
      if (typeof value === 'string') return `${name}:text:${value}`;
      return `${name}:file:${value.name}:${value.size}:${value.type}:${value.lastModified}`;
    })
    .join('\u001e');
}

function getCreateSessionRequestKey(fingerprint: string): string {
  const now = Date.now();
  for (const [key, pending] of pendingCreateSessionRequests) {
    if (pending.expiresAt <= now) pendingCreateSessionRequests.delete(key);
  }

  const existing = pendingCreateSessionRequests.get(fingerprint);
  if (existing) return existing.key;

  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${now}_${Math.random().toString(36).slice(2)}`;
  const key = `clickatron_create_${randomPart}`;
  pendingCreateSessionRequests.set(fingerprint, {
    key,
    expiresAt: now + CREATE_SESSION_KEY_TTL_MS,
  });
  return key;
}

async function postCreateSession(formData: FormData, idempotencyKey: string): Promise<Response> {
  for (let attempt = 0; attempt <= CREATE_SESSION_PENDING_RETRIES; attempt += 1) {
    const response = await fetch('/api/services/clickatron/session', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: formData,
    });
    if (response.status !== 409) return response;

    const body = await response.clone().json().catch(() => null);
    if (body?.code !== 'REQUEST_IN_PROGRESS' || attempt === CREATE_SESSION_PENDING_RETRIES) {
      return response;
    }

    const retryAfterSeconds = Number(response.headers.get('Retry-After')) || 2;
    await new Promise((resolve) => {
      setTimeout(resolve, Math.max(250, retryAfterSeconds * 1000));
    });
  }

  throw new Error('Clickatron session creation retry budget was exhausted.');
}

const useClickatronStore = create<ClickatronStore>()(
  devtools(
    (set, get) => ({
      task: null,
      isSaving: false,
      saveError: null,
      lastSaved: null,
      editModelId: undefined,
      setTask: (task) => set({ task }),
      setEditModelId: (modelId) => set({ editModelId: modelId ?? undefined }),
      
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
          const activeBrandId = getActiveBrandIdFromStorage();
          if (activeBrandId && !formData.has('brandId')) {
            formData.append('brandId', activeBrandId);
          }

          const requestFingerprint = buildClickatronSessionRequestFingerprint(formData);
          const idempotencyKey = getCreateSessionRequestKey(requestFingerprint);
          const response = await postCreateSession(formData, idempotencyKey);

          if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            if (response.status < 500 && errorBody?.code !== 'REQUEST_IN_PROGRESS') {
              pendingCreateSessionRequests.delete(requestFingerprint);
            }
            const message = errorBody?.error || `Failed to create session (${response.status})`;
            console.error('Failed to create session:', message);
            throw new Error(message);
          }

          const data = await response.json();
          if (!data?.sessionId || !data?.variation) {
            throw new Error('Clickatron returned an incomplete session response.');
          }
          pendingCreateSessionRequests.delete(requestFingerprint);

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
          console.log('ðŸš€ Syncing canvas with session:', sessionId);
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canvas }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('âŒ Sync failed with status:', response.status, 'and body:', errorText);
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
          console.error('ðŸ’¥ Sync error:', error);
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
