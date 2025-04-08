import { useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

interface ProgressUpdate {
  type: 'progress';
  analysisId: string;
  progress: number;
  stage: string; // e.g., 'uploading', 'processing'
}

export function useAnalysisProgress(
  analysisId: string | null,
  onProgress: (progress: number) => void
) {
  const { user } = useUser();

  // Memoize the handler to prevent re-creating it on every render
  const handleSSEMessage = useCallback((event: MessageEvent) => {
    try {
      // Ensure data is parsed safely
      const data = JSON.parse(event.data) as ProgressUpdate;
      // Check if the message is relevant to the current analysis
      if (data.type === 'progress' && data.analysisId === analysisId) {
        console.log(`SSE Progress for ${analysisId}:`, data.progress, `Stage: ${data.stage}`);
        onProgress(data.progress);
      }
    } catch (error) {
      console.error('Error parsing SSE message data:', error, 'Raw data:', event.data);
    }
  }, [analysisId, onProgress]);

  useEffect(() => {
    // Only establish connection if we have a user and an analysis ID
    if (!user?.id || !analysisId) {
      return; // No cleanup needed if connection wasn't established
    }

    console.log(`Setting up SSE for analysisId: ${analysisId}, userId: ${user.id}`);
    // Standard EventSource initialization
    const eventSource = new EventSource(`/api/sse?userId=${user.id}`);

    // Add the message listener
    eventSource.addEventListener('message', handleSSEMessage);

    // Optional: Log connection opening
    eventSource.onopen = () => {
      console.log(`SSE connection opened for analysisId: ${analysisId}`);
    };

    // Log errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // EventSource will automatically attempt to reconnect,
      // but you might want to close it here based on error type
      // eventSource.close(); // Example: close on specific errors
    };

    // Cleanup function: close the connection when the component unmounts
    // or when dependencies (userId, analysisId) change.
    return () => {
      console.log(`Closing SSE connection for analysisId: ${analysisId}`);
      eventSource.close();
    };

    // Dependencies for the effect
  }, [user?.id, analysisId, handleSSEMessage]); // handleSSEMessage is memoized

  // This hook doesn't render anything itself
  return null;
}