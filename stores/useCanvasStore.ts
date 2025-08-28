// Zustand store for Clickatron2 canvas state management
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { idbManager } from '@/lib/idb';

export interface Variation {
  id: string;
  imageId?: string; // Reference to image in IndexedDB
  prompt: string;
  timestamp: number;
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
        const { taskData, taskId } = get();
        if (!taskData || !taskId) return;
        
        const updatedData = { ...taskData, ...updates };
        set({ taskData: updatedData });
        
        try {
          await idbManager.saveSession(`clickatron2_${taskId}`, updatedData);
        } catch (error) {
          console.error('Failed to save task data:', error);
        }
      },
      
      loadTaskData: async (taskId) => {
        set({ isLoading: true, taskId, loadError: null });

        try {
          const raw = await idbManager.getSession(`clickatron2_${taskId}`);
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

            let mockVariations: Variation[] = [];
            let activeId: string | null = null;
            if (normalized.stage === 'canvas' && normalized.selectedDirection) {
              const v: Variation = {
                id: `mock_${Date.now()}`,
                prompt: normalized.selectedDirection,
                timestamp: Date.now(),
              };
              mockVariations = [v];
              activeId = v.id;
            }

            set({
              taskData: normalized,
              isLoading: false,
              variations: mockVariations,
              activeVariationId: activeId,
              history: activeId ? [activeId] : [],
              historyIndex: activeId ? 0 : -1,
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

          // Dev fallback mock
            console.warn(`No session data found for taskId: ${taskId}. Creating mock data for development.`);
          const mock: TaskData = {
            videoIdea: 'Direct URL Access - Mock Video Idea',
            timestamp: Date.now(),
            stage: 'ideation',
            selectedPreset: {
              id: 'youtube',
              name: 'YouTube Thumbnail',
              aspectRatio: '16:9',
              dimensions: '1920x1080',
              promptText: "What's your video about?",
              placeholder: 'e.g., "10 JavaScript tricks every developer should know"',
            },
            referenceImage: null,
          };
          await idbManager.saveSession(`clickatron2_${taskId}`, mock);
          set({
            taskData: mock,
            isLoading: false,
            loadError: null,
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
        } catch (e) {
          console.error('Failed to load task data:', e);
          set({ isLoading: false, loadError: 'error' });
          return false;
        }
      },

      // Variation management
      addVariation: (variation) => {
        const { variations, history, historyIndex } = get();
        const newVariations = [variation, ...variations];
        const newHistory = [...history.slice(0, historyIndex + 1), variation.id];
        
        set({
          variations: newVariations,
          activeVariationId: variation.id,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },
      
      removeVariation: (variationId) => {
        const { variations, activeVariationId, history, historyIndex } = get();
        
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
        });
      },
      
      setActiveVariation: (variationId) => {
        const { history, historyIndex, variations } = get();
        
        // Find the variation and load its fine-tuning settings
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
        
        // Add to history if not already there
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
        const { variations } = get();
        const original = variations.find(v => v.id === variationId);
        if (!original) return;
        
        const duplicate: Variation = {
          ...original,
          id: `${variationId}_duplicate_${Date.now()}`,
          timestamp: Date.now(),
        };
        
        const originalIndex = variations.findIndex(v => v.id === variationId);
        const newVariations = [...variations];
        newVariations.splice(originalIndex + 1, 0, duplicate);
        
        set({
          variations: newVariations,
          activeVariationId: duplicate.id,
        });
        
        get().addToHistory(duplicate.id);
      },

      // Fine-tuning
      updateFineTuning: (key, value) => {
        const { activeVariationId } = get();
        if (!activeVariationId) return;
        
        set(state => ({
          variations: state.variations.map(v => 
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
          ),
          // Also update global controls for immediate UI feedback
          fineTuningControls: {
            ...state.fineTuningControls,
            [key]: value,
          },
        }));
      },
      
      resetFineTuning: () => {
        const { activeVariationId } = get();
        const defaultControls = {
          brightness: 100,
          contrast: 100,
          saturation: 100,
        };
        
        if (activeVariationId) {
          set(state => ({
            variations: state.variations.map(v => 
              v.id === activeVariationId 
                ? { ...v, fineTuning: defaultControls }
                : v
            ),
            fineTuningControls: defaultControls,
          }));
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
          await idbManager.saveSession(`clickatron2_${taskId}`, taskData);
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
        
        if (!sessionId || !isDirty) return;
        
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
          });
          
          return data.sessionId;
        } catch (error) {
          console.error('Session creation failed:', error);
          throw error;
        }
      },
      
      fetchBackendSession: async (sessionId) => {
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}`);
          
          if (!response.ok) {
            throw new Error(`Session fetch failed: ${response.status}`);
          }
          
          const data = await response.json();
          set({
            backendSynced: true,
            isDirty: false,
            lastSyncTime: Date.now(),
          });
          
          return data.session;
        } catch (error) {
          console.error('Session fetch failed:', error);
          set({ syncError: error instanceof Error ? error.message : 'Fetch failed' });
          throw error;
        }
      },
      
      createVariation: async (request) => {
        const { sessionId } = get();
        
        if (!sessionId) {
          throw new Error('No session ID available');
        }
        
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          });
          
          if (!response.ok) {
            throw new Error(`Variation creation failed: ${response.status}`);
          }
          
          const data = await response.json();
          set(state => ({ isDirty: true }));
          
          return data.variationId;
        } catch (error) {
          console.error('Variation creation failed:', error);
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