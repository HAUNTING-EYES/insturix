"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {  useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useVideoAnalysis } from '../hooks/useVideoAnalysis';
import { AnalysisProgress } from './AnalysisProgress';
import { AnalysisStatus as ApiAnalysisStatus } from '@/app/api/services/alyzitron/types';
import type { ClientAlyzitronAnalysis } from '../types/client';

interface FetchedAlyzitronAnalysis extends ClientAlyzitronAnalysis {
  expectedWaitSeconds?: number;
  expectedDurationSeconds?: number;
  queuePosition?: number;
}

interface ManagedAnalysis extends FetchedAlyzitronAnalysis {
  displayStatus: ApiAnalysisStatus;
  estimatedProgress: number;
  processingStartTime?: number;
}

interface AnalysisListProps {
  initialAnalyses: FetchedAlyzitronAnalysis[];
  maxDisplayItems?: number;
}

interface AnalysisUpdateEvent extends Partial<Omit<ClientAlyzitronAnalysis, '_id' | 'metadata'>> {
  _id?: string;
  analysisId?: string;
  metadata?: Partial<ClientAlyzitronAnalysis['metadata']>;
}

export function AnalysisList({ initialAnalyses, maxDisplayItems }: AnalysisListProps) {
  const { cancelAnalysis } = useVideoAnalysis();
  const [managedAnalyses, setManagedAnalyses] = useState<ManagedAnalysis[]>([]);
  const [showAll, setShowAll] = useState(false);
  const analysisRefs = useRef<Record<string, ManagedAnalysis>>({});

  const { data: fetchedAnalyses = initialAnalyses, isSuccess } = useQuery<FetchedAlyzitronAnalysis[], Error>({
    queryKey: ['analyses'],
    queryFn: async () => {
      const response = await fetch('/api/services/alyzitron/analyses');
      if (!response.ok) throw new Error('Failed to fetch analyses');
      return response.json();
    },
    initialData: initialAnalyses,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    const newRefs: Record<string, ManagedAnalysis> = {};
    managedAnalyses.forEach(a => {
      newRefs[a._id] = a;
    });
    analysisRefs.current = newRefs;
  }, [managedAnalyses]);

  const updateAnalysisState = useCallback((analysisId: string, updates: Partial<ManagedAnalysis>) => {
    setManagedAnalyses(prevAnalyses =>
      prevAnalyses.map(a => {
        if (a._id === analysisId) {
          const updatedAnalysis = { ...a, ...updates };
          analysisRefs.current[analysisId] = updatedAnalysis;
          return updatedAnalysis;
        }
        return a;
      })
    );
  }, []);

  // SSE event handler
  useEffect(() => {
    const handleAnalysisUpdate = (data: AnalysisUpdateEvent) => {
      const analysisId = data.analysisId || data._id;
      if (!analysisId) return;

      setManagedAnalyses(prevAnalyses => {
        // Create a new array to avoid mutation
        const newAnalyses = [...prevAnalyses];
        const existingIndex = newAnalyses.findIndex(a => a._id === analysisId);
        const currentProgress = existingIndex !== -1 ? newAnalyses[existingIndex].estimatedProgress : 0;
        
        // Determine correct status and progress
        let newStatus: ApiAnalysisStatus = data.status ?? 'queued';
        let newProgress = data.progress ?? currentProgress;

        // State transition rules
        if (existingIndex !== -1) {
          const existing = newAnalyses[existingIndex];
          
          // Protect completed state
          if (existing.displayStatus === 'completed') {
            return prevAnalyses; // No changes to completed analysis
          }
          
          // Protect processing state from going back to queued
          if (existing.displayStatus === 'processing' && newStatus === 'queued') {
            newStatus = 'processing';
            newProgress = existing.estimatedProgress;
          }
        }
        
        if (existingIndex === -1) {
          // Add new analysis with verified state
          // Use the ID directly since we're working with strings on the client
          const normalizedId = (data._id || data.analysisId)?.toString() || '';

          // Create base analysis with required fields
          const newAnalysis: ManagedAnalysis = {
            _id: normalizedId,
            displayStatus: newStatus,
            estimatedProgress: newProgress,
            clerkUserId: data.clerkUserId || '',
            videoUrl: data.videoUrl || '',
            gcsPath: data.gcsPath || '',
            type: data.type || 'SHORT_FORM',
            status: data.status || 'queued',
            taskId: data.taskId || '',
            estimatedTime: data.estimatedTime || 0,
            progress: data.progress || 0,
            results: null,
            metadata: {
              originalFilename: data.metadata?.originalFilename || 'Untitled',
              videoSize: data.metadata?.videoSize || 0,
              videoDuration: data.metadata?.videoDuration || 0,
              mimeType: data.metadata?.mimeType || 'video/mp4'
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            processingStartTime: newStatus === 'processing' ? Date.now() : undefined
          };

          // Override with any valid update data
          if (data.error) newAnalysis.error = data.error;
          if (data.queuePosition) newAnalysis.queuePosition = data.queuePosition;
          if (data.metadata?.title) newAnalysis.metadata.title = data.metadata.title;
          if (data.metadata?.description) newAnalysis.metadata.description = data.metadata.description;
          if (data.metadata?.niche) newAnalysis.metadata.niche = data.metadata.niche;
          if (data.metadata?.target_audience) newAnalysis.metadata.target_audience = data.metadata.target_audience;
          if (data.metadata?.additional_details) newAnalysis.metadata.additional_details = data.metadata.additional_details;

          return [newAnalysis, ...prevAnalyses];
        }
        
        // Update existing analysis with state protection
        // Use the ID directly since we're working with strings on the client
        const normalizedUpdateId = (data._id || data.analysisId)?.toString() || '';

        // Update existing analysis while preserving required fields
        const existingAnalysis = newAnalyses[existingIndex];
        const updatedAnalysis: ManagedAnalysis = {
          ...existingAnalysis,
          _id: normalizedUpdateId,
          displayStatus: newStatus,
          estimatedProgress: newProgress,
          processingStartTime: newStatus === 'processing' && existingAnalysis.displayStatus !== 'processing'
            ? Date.now()
            : existingAnalysis.processingStartTime
        };

        // Safely update optional fields from the event
        if (data.error) updatedAnalysis.error = data.error;
        if (data.queuePosition) updatedAnalysis.queuePosition = data.queuePosition;
        if (data.metadata) {
          updatedAnalysis.metadata = {
            ...existingAnalysis.metadata,
            ...(data.metadata.title && { title: data.metadata.title }),
            ...(data.metadata.description && { description: data.metadata.description }),
            ...(data.metadata.niche && { niche: data.metadata.niche }),
            ...(data.metadata.target_audience && { target_audience: data.metadata.target_audience }),
            ...(data.metadata.additional_details && { additional_details: data.metadata.additional_details })
          };
        }

        newAnalyses[existingIndex] = updatedAnalysis;
        
        return newAnalyses;
      });
    };

    // Import emitter dynamically to avoid circular deps if any
    let cleanupListener: (() => void) | undefined;
    
    import('@/lib/sseManager').then(({ analysisEventEmitter }) => {
      analysisEventEmitter.on('analysisUpdate', handleAnalysisUpdate);
      cleanupListener = () => analysisEventEmitter.off('analysisUpdate', handleAnalysisUpdate);
    });

    return () => {
      cleanupListener?.();
    };
  }, []);

  // Initialize managed analyses from fetched data
  useEffect(() => {
    if (!isSuccess || !fetchedAnalyses) return;

    const initialManagedState: ManagedAnalysis[] = fetchedAnalyses.map(analysis => ({
      ...analysis,
      displayStatus: analysis.status,
      estimatedProgress: analysis.status === 'completed' ? 1 : 0,
    }));

    setManagedAnalyses(initialManagedState);
  }, [isSuccess, fetchedAnalyses]);

  // Handle analysis cancellation
  const handleCancel = async (taskId: string) => {
    const analysisToCancel = Object.values(analysisRefs.current).find(a => a.taskId === taskId);
    if (!analysisToCancel) return;

    const analysisId = analysisToCancel._id;

    updateAnalysisState(analysisId, {
      displayStatus: 'failed',
      status: 'failed',
      error: { code: 'USER_CANCELLED', message: 'Cancelled by user' },
      estimatedProgress: 0
    });

    try {
      await cancelAnalysis(taskId);
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium text-zinc-100">
          {showAll ? "All Analyses" : "Recent Analyses"}
        </h2>
        <Button
          variant="ghost"
          className="text-zinc-400 hover:text-zinc-300"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>
              Show Recent
              <ChevronRight className="ml-2 h-4 w-4 rotate-180" />
            </>
          ) : (
            <>
              View All
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {(showAll ? managedAnalyses : managedAnalyses.slice(0, maxDisplayItems || 5)).map((analysis) => (
          <AnalysisProgress
            key={analysis._id}
            analysisId={analysis._id}
            taskId={analysis.taskId}
            title={analysis.metadata?.originalFilename}
            type={analysis.type}
            status={analysis.displayStatus}
            progress={analysis.estimatedProgress}
            queuePosition={analysis.displayStatus === 'queued' ? analysis.queuePosition : undefined}
            error={analysis.error}
            onCancel={analysis.taskId && (analysis.displayStatus === 'queued' || analysis.displayStatus === 'processing') ? handleCancel : undefined}
          />
        ))}

        {managedAnalyses.length === 0 && (
          <div className="text-center py-8">
            <p className="text-zinc-500">No analyses yet</p>
            <p className="text-sm text-zinc-600">
              Upload a video to start analyzing
            </p>
          </div>
        )}
      </div>
    </div>
  );
}