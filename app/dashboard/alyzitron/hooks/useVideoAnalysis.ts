"use client";

import { useState, useCallback } from 'react';
import { calculateUploadProgress } from '../utils/progress';

interface UploadState {
  progress: number;
  speed: number;
  remaining: number;
}

interface AnalysisState {
  status: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  error?: {
    message: string;
    action?: string;
  };
}

export function useVideoAnalysis() {
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: 'idle',
    progress: 0,
  });

  const uploadWithProgress = useCallback(async (url: string, file: File): Promise<Response> => {
    const startTime = Date.now();
    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const { progress, speed, remaining } = calculateUploadProgress(
            event.loaded,
            event.total,
            startTime
          );
          setUploadState({ progress, speed, remaining });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: new Headers({
              'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'
            })
          }));
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onabort = () => reject(new Error('Upload aborted'));

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }, []);

  const uploadFile = useCallback(async (
    file: File,
    videoType: string
  ): Promise<string> => {
    try {
      setAnalysisState({ status: 'uploading', progress: 0 });

      // Get signed URL or local upload URL
      const signResponse = await fetch('/api/services/alyzitron/gcs/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });

      if (!signResponse.ok) {
        const error = await signResponse.json();
        throw new Error(error.error?.message || 'Failed to get upload URL');
      }

      const { url, gcsPath, storage } = await signResponse.json();

      // Upload file with progress tracking
      try {
        const uploadResponse = await uploadWithProgress(url, file);
        
        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }

        setUploadState(null);
        return gcsPath;

      } catch (uploadError) {
        throw new Error(
          uploadError instanceof Error 
            ? uploadError.message 
            : 'Failed to upload file'
        );
      }

    } catch (error) {
      setAnalysisState({
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Upload failed',
          action: 'Please try again',
        },
      });
      throw error;
    } finally {
      setUploadState(null);
    }
  }, [uploadWithProgress]);

  const submitAnalysis = useCallback(async (
    videoUrl: string,
    videoType: string,
    metadata?: {
      title?: string;
      description?: string;
      niche?: string;
      target_audience?: string;
      additional_details?: string;
    }
  ) => {
    try {
      setAnalysisState({
        status: 'analyzing',
        progress: 0
      });

      const response = await fetch('/api/services/alyzitron/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: videoType.toUpperCase().replace(' ', '_'),
          video_url: videoUrl,
          ...metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to initiate analysis');
      }

      const { analysisId, taskId, estimatedTime } = await response.json();

      setAnalysisState({
        status: 'completed',
        progress: 100
      });

      return { analysisId, taskId, estimatedTime };

    } catch (error) {
      setAnalysisState({
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Analysis failed',
          action: 'Please try again',
        },
      });
      throw error;
    }
  }, []);

  const analyzeFile = useCallback(async (
    file: File,
    videoType: string,
    metadata?: {
      title?: string;
      description?: string;
      niche?: string;
      target_audience?: string;
      additional_details?: string;
    }
  ) => {
    try {
      // Upload file first
      const gcsPath = await uploadFile(file, videoType);
      
      // Submit for analysis
      return await submitAnalysis(gcsPath, videoType, {
        title: file.name,
        ...metadata,
      });

    } catch (error) {
      console.error('File analysis failed:', error);
      throw error;
    }
  }, [uploadFile, submitAnalysis]);

  const cancelAnalysis = useCallback(async (taskId: string) => {
    try {
      const response = await fetch('/api/services/alyzitron/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to cancel analysis');
      }

      setAnalysisState({
        status: 'idle',
        progress: 0,
      });

    } catch (error) {
      console.error('Cancel analysis failed:', error);
      throw error;
    }
  }, []);

  return {
    uploadState,
    analysisState,
    analyzeFile,
    submitAnalysis,
    cancelAnalysis,
  };
}