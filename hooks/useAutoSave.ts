// Auto-save hook using TanStack Query mutations
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { idbManager } from '@/lib/idb';

interface AutoSaveData {
  taskId: string;
  taskData: any;
  variations: any[];
  activeVariationId: string | null;
  fineTuningControls: any;
}

const saveSession = async (data: AutoSaveData): Promise<void> => {
  const { taskId, ...sessionData } = data;
  await idbManager.saveSession(`clickatron_${taskId}`, sessionData);
};

export const useAutoSave = (enabled: boolean = true) => {
  const taskId = useCanvasStore(state => state.taskId);
  const taskData = useCanvasStore(state => state.taskData);
  const variations = useCanvasStore(state => state.variations);
  const activeVariationId = useCanvasStore(state => state.activeVariationId);
  const fineTuningControls = useCanvasStore(state => state.fineTuningControls);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  
  const saveMutation = useMutation({
    mutationFn: saveSession,
    onError: (error) => {
      console.error('Auto-save failed:', error);
    },
  });

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !taskId || !taskData) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveMutation.mutate({
        taskId,
        taskData,
        variations,
        activeVariationId,
        fineTuningControls,
      });
    }, 1000); // 1 second debounce

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [taskId, taskData, variations, activeVariationId, fineTuningControls, enabled, saveMutation]);

  return {
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    lastSaved: saveMutation.isSuccess ? new Date() : null,
  };
};