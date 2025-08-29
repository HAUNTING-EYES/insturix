// Zustand store for Clickatron canvas state management
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { idbManager } from '@/lib/idb';

// Module-scoped promise to ensure only one session creation runs at a time
let createSessionPromise: Promise<string> | null = null;
// Map to dedupe concurrent fetchBackendSession calls per sessionId
const fetchSessionInFlight = new Map<string, Promise<any>>();

export interface Variation {
  id: string;
  imageId?: string; // Reference to image in IndexedDB
  prompt: string;
  timestamp: number;
  status?: 'generating' | 'completed' | 'failed';
  referenceImages?: string[]; // Array of image IDs
  fineTuning?: FineTuningControls; // Per-variation fine-tuning settings
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
}

export interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface CanvasPreset {
  id: string;
  name: string;
  aspectRatio: string;
  dimensions: string;
  promptText: string;
  placeholder: string;
}

export interface TaskData {
  videoIdea: string;
  timestamp: number;
  stage: 'ideation' | 'canvas';
  selectedDirection?: string;
  selectedPreset?: CanvasPreset;
  referenceImage?: {
    name: string;
    size: number;
    type: string;
    imageId: string; // Reference to image in IndexedDB
  } | null;
}

interface CanvasState {
  // Task data
  taskData: TaskData | null;
  taskId: string | null;
  loadError: string | null; // e.g. 'not_found' | 'invalid'
  
  // Backend sync
  sessionId: string | null;
  backendSynced: boolean;
  isDirty: boolean; // indicates local changes not yet synced to backend
  syncError: string | null;
  lastSyncTime: number | null;
  
  // Canvas state
  variations: Variation[];
  activeVariationId: string | null;
  fineTuningControls: FineTuningControls;
  
  // UI state
  galleryCollapsed: boolean;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  
  // History
  history: string[];
  historyIndex: number;
  
  // Loading states
  isGenerating: boolean;
  isLoading: boolean;
}

interface CanvasActions {
  // Task management
  setTaskData: (taskData: TaskData) => void;
  setTaskId: (taskId: string) => void;
  updateTaskData: (updates: Partial<TaskData>) => Promise<void>;
  loadTaskData: (taskId: string) => Promise<boolean>;
  
  // Backend sync
  setSessionId: (sessionId: string) => void;
  setBackendSynced: (synced: boolean) => void;
  setIsDirty: (dirty: boolean) => void;
  setSyncError: (error: string | null) => void;
  persistToBackend: (updates: any) => Promise<void>;
  createBackendSession: (request: any) => Promise<string>;
  fetchBackendSession: (sessionId: string) => Promise<any>;
  createVariation: (request: any) => Promise<string>;
  updateVariation: (variationId: string, updates: any) => Promise<void>;
  commitVariation: (request: any) => Promise<any>;
  
  // Variation management
  addVariation: (variation: Variation) => void;
  removeVariation: (variationId: string) => void;
  setActiveVariation: (variationId: string) => void;
  duplicateVariation: (variationId: string) => void;
  
  // Fine-tuning
  updateFineTuning: (key: keyof FineTuningControls, value: number) => void;
  resetFineTuning: () => void;
  
  // UI controls
  setGalleryCollapsed: (collapsed: boolean) => void;
  setZoomLevel: (level: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  
  // History management
  addToHistory: (variationId: string) => void;
  undo: () => void;
  redo: () => void;
  
  // Loading states
  setIsGenerating: (generating: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  
  // Utility
  reset: () => void;
  saveSession: () => Promise<void>;
}

const initialState: CanvasState = {
  taskData: null,
  taskId: null,
  loadError: null,
  sessionId: null,
  backendSynced: false,
  isDirty: false,
  syncError: null,
  lastSyncTime: null,
  variations: [],
  activeVariationId: null,
  fineTuningControls: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
  },
  galleryCollapsed: false,
  zoomLevel: 100,
  panOffset: { x: 0, y: 0 },
  history: [],
  historyIndex: -1,
  isGenerating: false,
  isLoading: false,
};

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Task management
      setTaskData: (taskData) => set({ taskData }),
      
      setTaskId: (taskId) => set({ taskId }),
      
      updateTaskData: async (updates) => {
        const { taskData, sessionId, persistToBackend } = get();
        if (!taskData || !sessionId) return;
        
        const updatedData = { ...taskData, ...updates };
        set({ taskData: updatedData, isDirty: true });
        
        await persistToBackend({ workflow: updatedData });
      },
      
  loadTaskData: async (taskId) => {
        set({ isLoading: true, taskId, loadError: null });

        try {
          const raw = await idbManager.getSession(`clickatron_${taskId}`);
          if (raw) {
            // Validate
            if (typeof raw.videoIdea !== 'string' || !raw.videoIdea.trim()) {
              set({ isLoading: false, loadError: 'invalid' });
              return false;
            }
            const normalized: TaskData = {
              ...raw,
              stage: raw.selectedDirection ? 'canvas' : (raw.stage || 'ideation'),
            };

            set({
              taskData: normalized,
              isLoading: false,
              variations: [],
              activeVariationId: null,
              history: [],
              historyIndex: -1,
              fineTuningControls: { brightness: 100, contrast: 100, saturation: 100 },
              galleryCollapsed: false,
              zoomLevel: 100,
              panOffset: { x: 0, y: 0 },
            });
            return true;
          }

          // Not found
          if (process.env.NODE_ENV !== 'development') {
            set({ isLoading: false, loadError: 'not_found' });
            return false;
          }

          // Dev fallback (no mock variations)
          console.warn(`No session data found for taskId: ${taskId}. No mock data created (backend expected).`);
          set({ isLoading: false, loadError: 'not_found' });
          return false;
        } catch (e) {
          console.error('Failed to load task data:', e);
          set({ isLoading: false, loadError: 'error' });
          return false;
        }
      },

      // Variation management
      addVariation: (variation) => {
        const { variations, history, historyIndex, persistToBackend } = get();

        // Ensure a status is present to satisfy server-side validation.
        const normalized: Variation = {
          status: 'generating',
          ...variation,
        };

        const newVariations = [normalized, ...variations];
        const newHistory = [...history.slice(0, historyIndex + 1), normalized.id];

        set({
          variations: newVariations,
          activeVariationId: normalized.id,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          isDirty: true,
        });

        // Persist normalized variations so the backend receives a valid shape
        persistToBackend({ canvas: { variations: newVariations } });
      },
      
      removeVariation: (variationId) => {
        const { variations, activeVariationId, history, persistToBackend } = get();
        
        if (variations.length <= 1) return;
        
        const variationIndex = variations.findIndex(v => v.id === variationId);
        if (variationIndex === -1) return;
        
        const newVariations = variations.filter(v => v.id !== variationId);
        let newActiveId = activeVariationId;
        
        // If deleted variation was active, select next best one
        if (activeVariationId === variationId) {
          if (variationIndex > 0) {
            newActiveId = variations[variationIndex - 1].id;
          } else {
            newActiveId = variations[variationIndex + 1]?.id || variations[0].id;
          }
        }
        
        const newHistory = history.filter(id => id !== variationId);
        if (newActiveId && !newHistory.includes(newActiveId)) {
          newHistory.push(newActiveId);
        }
        
        set({
          variations: newVariations,
          activeVariationId: newActiveId,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          isDirty: true,
        });
        
        persistToBackend({ canvas: { variations: newVariations } });
      },
      
      setActiveVariation: (variationId) => {
        const { history, historyIndex, variations } = get();
        
        const variation = variations.find(v => v.id === variationId);
        const fineTuningControls = variation?.fineTuning || {
          brightness: 100,
          contrast: 100,
          saturation: 100,
        };
        
        set({ 
          activeVariationId: variationId,
          fineTuningControls,
        });
        
        if (!history.includes(variationId)) {
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(variationId);
          set({
            history: newHistory,
            historyIndex: newHistory.length - 1,
          });
        }
      },
      
      duplicateVariation: (variationId) => {
        const { variations, addVariation } = get();
        const original = variations.find(v => v.id === variationId);
        if (!original) return;
        
        const duplicate: Variation = {
          ...original,
          id: `${variationId}_duplicate_${Date.now()}`,
          timestamp: Date.now(),
        };
        
        addVariation(duplicate);
      },

      // Fine-tuning
      updateFineTuning: (key, value) => {
        const { activeVariationId, persistToBackend } = get();
        if (!activeVariationId) return;
        
        set(state => {
          const newVariations = state.variations.map(v => 
            v.id === activeVariationId 
              ? {
                  ...v,
                  fineTuning: {
                    brightness: 100,
                    contrast: 100,
                    saturation: 100,
                    ...v.fineTuning,
                    [key]: value,
                  }
                }
              : v
          );
          
          persistToBackend({ canvas: { variations: newVariations } });
          
          return {
            variations: newVariations,
            fineTuningControls: {
              ...state.fineTuningControls,
              [key]: value,
            },
            isDirty: true,
          };
        });
      },
      
      resetFineTuning: () => {
        const { activeVariationId, persistToBackend } = get();
        const defaultControls = {
          brightness: 100,
          contrast: 100,
          saturation: 100,
        };
        
        if (activeVariationId) {
          set(state => {
            const newVariations = state.variations.map(v => 
              v.id === activeVariationId 
                ? { ...v, fineTuning: defaultControls }
                : v
            );
            
            persistToBackend({ canvas: { variations: newVariations } });
            
            return {
              variations: newVariations,
              fineTuningControls: defaultControls,
              isDirty: true,
            };
          });
        } else {
          set({ fineTuningControls: defaultControls });
        }
      },

      // UI controls
      setGalleryCollapsed: (collapsed) => set({ galleryCollapsed: collapsed }),
      setZoomLevel: (level) => set({ zoomLevel: level }),
      setPanOffset: (offset) => set({ panOffset: offset }),

      // History management
      addToHistory: (variationId) => {
        const { history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(variationId);
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },
      
      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          set({
            historyIndex: newIndex,
            activeVariationId: history[newIndex],
          });
        }
      },
      
      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          set({
            historyIndex: newIndex,
            activeVariationId: history[newIndex],
          });
        }
      },

      // Loading states
      setIsGenerating: (generating) => set({ isGenerating: generating }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Utility
      reset: () => set(initialState),
      
      saveSession: async () => {
        const { taskData, taskId } = get();
        if (!taskData || !taskId) return;
        
        try {
          await idbManager.saveSession(`clickatron_${taskId}`, taskData);
        } catch (error) {
          console.error('Failed to save session:', error);
        }
      },
      
      // Backend sync methods
      setSessionId: (sessionId) => set({ sessionId }),
      setBackendSynced: (synced) => set({ backendSynced: synced }),
      setIsDirty: (dirty) => set({ isDirty: dirty }),
      setSyncError: (error) => set({ syncError: error }),
      
      persistToBackend: async (updates) => {
        const { sessionId, isDirty, setIsDirty, setSyncError } = get();
        
        if (!sessionId) return;
        
        try {
          setSyncError(null);
          
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
          });
          
          if (!response.ok) {
            throw new Error(`Backend sync failed: ${response.status}`);
          }
          
          setIsDirty(false);
          set({ lastSyncTime: Date.now() });
        } catch (error) {
          console.error('Backend sync failed:', error);
          setSyncError(error instanceof Error ? error.message : 'Sync failed');
          throw error;
        }
      },
      
      createBackendSession: async (request) => {
        const { sessionId } = get();
        if (sessionId) return sessionId;

        if (createSessionPromise) return createSessionPromise;

        createSessionPromise = (async () => {
          try {
            const response = await fetch('/api/services/clickatron/session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(request),
            });

            if (!response.ok) {
              throw new Error(`Session creation failed: ${response.status}`);
            }

            const data = await response.json();
            set({
              sessionId: data.sessionId,
              backendSynced: true,
              isDirty: false,
              taskData: data.taskData ? { ...data.taskData } : null,
              variations: [],
              activeVariationId: null,
              history: [],
              historyIndex: -1,
            });

            return data.sessionId;
          } catch (error) {
            console.error('Session creation failed:', error);
            throw error;
          } finally {
            createSessionPromise = null;
          }
        })();

        return createSessionPromise;
      },
      
      fetchBackendSession: async (sessionId) => {
        set({ isLoading: true, loadError: null, sessionId });

        // If there's an in-flight fetch for this sessionId, reuse it
        if (fetchSessionInFlight.has(sessionId)) {
          return fetchSessionInFlight.get(sessionId)!;
        }

        const promise = (async () => {
          const start = Date.now();
          if (process.env.NODE_ENV === 'development') {
            console.log(`[STORE] fetchBackendSession start=${new Date().toISOString()} sessionId=${sessionId}`);
          }
          try {
            const response = await fetch(`/api/services/clickatron/session/${sessionId}`, {
              headers: { 'X-Origin': 'store-fetch-backend' },
            });

            if (process.env.NODE_ENV === 'development') {
              console.log(`[STORE] fetchBackendSession completed status=${response.status} duration=${Date.now() - start}ms`);
            }

            if (!response.ok) {
              if (response.status === 404) set({ loadError: 'not_found' });
              throw new Error(`Session fetch failed: ${response.status}`);
            }

            const data = await response.json();
            const session = data.session;
            const workflow = session?.details?.workflow || {};
            const canvas = session?.details?.canvas || { variations: [] };

            const taskData: TaskData = {
              videoIdea: workflow.videoIdea || session.title || 'Untitled',
              timestamp: new Date(session.createdAt).getTime(),
              stage: workflow.stage || 'ideation',
              selectedDirection: workflow.selectedDirection,
              selectedPreset: workflow.selectedPreset,
              referenceImage: workflow.referenceImageMeta || null,
            };

            const variations: Variation[] = (canvas.variations || []).map((v: any) => ({
              ...v,
              status: v.status || 'completed',
            }));

            set({
              taskData,
              variations,
              activeVariationId: variations[0]?.id || null,
              sessionId: session._id,
              backendSynced: true,
              isLoading: false,
              loadError: null,
            });

            return session;
          } catch (error) {
            // If the fetch was aborted (e.g. by an AbortController elsewhere), treat it as a benign cancellation
            const isAbort = !!(error && ((error as any).name === 'AbortError' || /aborted/i.test(String(error))));
            if (isAbort) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[STORE] fetchBackendSession aborted for sessionId=${sessionId}`);
              }
              // Ensure loading state is cleared but don't surface a sync error for cancellations
              set({ isLoading: false });
              throw error;
            }

            console.error('Session fetch failed:', error);
            set({ syncError: error instanceof Error ? error.message : 'Fetch failed', isLoading: false });
            throw error;
          } finally {
            fetchSessionInFlight.delete(sessionId);
          }
        })();

        fetchSessionInFlight.set(sessionId, promise);
        return promise;
      },
      
      createVariation: async (request) => {
        const { sessionId, addVariation } = get();
        
        if (!sessionId) {
          throw new Error('No session ID available');
        }
        // If the session is not yet marked as canvas, mark it and persist to backend
        const { taskData, persistToBackend } = get();
        if (taskData?.stage !== 'canvas') {
          // update local state immediately (only if taskData exists)
          if (taskData) {
            set({ taskData: { ...taskData, stage: 'canvas' } });
          }
          try {
            // persist stage change before creating variation so history reflects canvas
            await persistToBackend({ workflow: { stage: 'canvas' } });
          } catch (err) {
            // log but continue — generation should still proceed
            console.error('Failed to persist stage change to canvas:', err);
          }
        }

        const tempId = `temp_${Date.now()}`;
        addVariation({
          id: tempId,
          prompt: request.prompt,
          timestamp: Date.now(),
          status: 'generating',
        });

        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...request, tempId }),
          });
          
          if (!response.ok) {
            throw new Error(`Variation creation failed: ${response.status}`);
          }
          
          const data = await response.json();
          // The backend will eventually push an update via WebSocket
          // For now, we just mark as dirty and wait for next fetch
          set(state => ({ isDirty: true }));
          
          return data.variationId;
        } catch (error) {
          console.error('Variation creation failed:', error);
          // Revert the optimistic update
          set(state => ({
            variations: state.variations.filter(v => v.id !== tempId)
          }));
          throw error;
        }
      },
      
      updateVariation: async (variationId, updates) => {
        const { sessionId } = get();
        
        if (!sessionId) {
          throw new Error('No session ID available');
        }
        
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation/${variationId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
          });
          
          if (!response.ok) {
            throw new Error(`Variation update failed: ${response.status}`);
          }
          
          set(state => ({ isDirty: true }));
        } catch (error) {
          console.error('Variation update failed:', error);
          throw error;
        }
      },
      
      commitVariation: async (request) => {
        const { sessionId } = get();
        
        if (!sessionId) {
          throw new Error('No session ID available');
        }
        
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/commit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          });
          
          if (!response.ok) {
            throw new Error(`Variation commit failed: ${response.status}`);
          }
          
          const data = await response.json();
          set(state => ({ isDirty: false }));
          
          return data;
        } catch (error) {
          console.error('Variation commit failed:', error);
          throw error;
        }
      },
    }),
    {
      name: 'canvas-store',
    }
  )
);

// Selectors for optimized subscriptions
export const useTaskData = () => useCanvasStore(state => state.taskData);
export const useVariations = () => useCanvasStore(state => state.variations);
export const useActiveVariation = () => {
  const variations = useCanvasStore(state => state.variations);
  const activeId = useCanvasStore(state => state.activeVariationId);
  return variations.find(v => v.id === activeId) || null;
};
export const useFineTuningControls = () => useCanvasStore(state => state.fineTuningControls);
// Individual selectors to avoid object creation on every render
export const useGalleryCollapsed = () => useCanvasStore(state => state.galleryCollapsed);
export const useZoomLevel = () => useCanvasStore(state => state.zoomLevel);
export const usePanOffset = () => useCanvasStore(state => state.panOffset);

// History selectors
export const useCanUndo = () => useCanvasStore(state => state.historyIndex > 0);
export const useCanRedo = () => useCanvasStore(state => state.historyIndex < state.history.length - 1);