import { useEffect } from 'react';
import { analysisEventEmitter } from '@/lib/sseManager';

export function useSSEConnection(userId: string) {
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
          
          if (data.type === 'analysisUpdate') {
            analysisEventEmitter.emit('analysisUpdate', data);
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