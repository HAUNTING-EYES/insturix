import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { ClientAlyzitronAnalysis } from '@/app/dashboard/alyzitron/types/client';

export function useSSEConnection(userId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const connectSSE = () => {
      console.log('Establishing SSE connection with userId:', userId);
      const eventSource = new EventSource(`/api/sse?userId=${encodeURIComponent(userId)}`, {
        withCredentials: true
      });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE event received:', data);
          
          // Check for essential fields instead of strictly relying on type === 'analysisUpdate'
          if (data.analysisId && data.status) {
            console.log(`SSE Handler: Processing event for analysisId=${data.analysisId}, status=${data.status}, type=${data.type}`); // Add log here
            // Directly update the React Query cache
            queryClient.setQueryData<ClientAlyzitronAnalysis[]>(['analyses'], (oldData) => {
              const analyses = oldData || [];
              const index = analyses.findIndex(a => a._id.toString() === data.analysisId);

              if (index !== -1) {
                // Update existing analysis
                // Add state transition protection (e.g., don't revert 'processing' to 'queued')
                const existing = analyses[index];
                const incomingStatus = data.status;
                const existingStatus = existing.status;
                let newStatus = incomingStatus ?? existingStatus;
                let newProgress = data.progress ?? existing.progress;

                console.log(`SSE Debug: ID=${data.analysisId}, ExistingStatus=${existingStatus}, IncomingStatus=${incomingStatus}`);

                // Toast notifications on status transitions
                if (existingStatus !== incomingStatus) {
                  if (incomingStatus === 'processing') {
                    toast({
                      title: 'Analysis Started',
                      description: `Your analysis "${data.metadata?.originalFilename || data.type}" is now processing.`,
                    });
                  } else if (incomingStatus === 'completed') {
                    toast({
                      title: 'Analysis Completed',
                      description: `Your analysis "${data.metadata?.originalFilename || data.type}" has finished.`,
                    });
                  } else if (incomingStatus === 'failed') {
                    toast({
                      title: 'Analysis Failed',
                      description: `Your analysis "${data.metadata?.originalFilename || data.type}" has failed.`,
                      variant: 'destructive',
                    });
                  }
                }

                if (existingStatus === 'completed' || existingStatus === 'failed') {
                    console.log(`SSE Debug: ID=${data.analysisId}, Status is terminal (${existingStatus}), skipping update.`);
                    return analyses; // Don't update terminal states via SSE
                }
                // This protection should only prevent going BACKWARDS from processing to queued
                if (existingStatus === 'processing' && incomingStatus === 'queued') {
                    console.log(`SSE Debug: ID=${data.analysisId}, Preventing backward transition from processing to queued.`);
                    newStatus = 'processing'; // Protect processing state
                    newProgress = existing.progress;
                }

                // Create the updated item, ensuring SSE data takes precedence for relevant fields
                const updatedItem: ClientAlyzitronAnalysis = {
                    ...existing, // Start with existing data
                    // Explicitly apply fields from SSE data if they exist
                    ...(data.taskId && { taskId: data.taskId }),
                    ...(data.videoUrl && { videoUrl: data.videoUrl }),
                    ...(data.gcsPath && { gcsPath: data.gcsPath }),
                    ...(data.estimatedTime !== undefined && { estimatedTime: data.estimatedTime }),
                    ...(data.results && { results: data.results }),
                    ...(data.metadata && { metadata: { ...existing.metadata, ...data.metadata } }),
                    error: data.error !== undefined ? data.error : existing.error, // Prioritize SSE error state
                    queuePosition: data.queuePosition, // Update queue position (might become undefined)
                    // Crucially, apply the calculated status and progress
                    status: newStatus,
                    progress: newProgress,
                    updatedAt: new Date(), // Always update timestamp
                };

                console.log(`SSE Debug: ID=${data.analysisId}, Final computed status: ${newStatus}`); // Log final status
                const updatedAnalyses = [...analyses];
                updatedAnalyses[index] = updatedItem;
                console.log(`SSE Update: Analysis ${data.analysisId} status changed to ${newStatus}`); // Add log
                return updatedAnalyses;
              } else {
                // Add new analysis if it wasn't found (less common via SSE, but possible)
                console.log(`SSE Add: New analysis ${data.analysisId} detected.`); // Add log
                // Ensure the data structure matches ClientAlyzitronAnalysis
                const newAnalysis: ClientAlyzitronAnalysis = {
                    _id: data.analysisId,
                    clerkUserId: data.clerkUserId || '',
                    type: data.type || 'SHORT_FORM',
                    status: data.status || 'pending',
                    taskId: data.taskId || '',
                    videoUrl: data.videoUrl || '',
                    gcsPath: data.gcsPath || '',
                    progress: data.progress || 0,
                    estimatedTime: data.estimatedTime || 0,
                    unread: true,
                    results: data.results || null,
                    metadata: data.metadata || { originalFilename: 'New Analysis', videoSize: 0, videoDuration: 0, mimeType: '' },
                    createdAt: new Date(data.createdAt || Date.now()),
                    updatedAt: new Date(),
                    error: data.error || undefined,
                    queuePosition: data.queuePosition || undefined,
                };
                // Add to the beginning or sort as needed
                return [newAnalysis, ...analyses];
              }
            });
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
        // Attempt to reconnect after a delay
        setTimeout(connectSSE, 5000);
      };

      // Cleanup on unmount
      return () => {
        console.log('Closing SSE connection...');
        eventSource.close();
      };
    };

    if (userId) {
      return connectSSE();
    }
  }, [userId]);
}