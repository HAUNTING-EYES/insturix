import { NextResponse, NextRequest } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { addClient, removeClient, analysisEventEmitter } from '@/lib/sseManager'; // Import manager functions

// --- IMPORTANT ---
// This route now uses the in-memory sseManager.
// Your callback endpoints (handling Python server updates) MUST emit events
// using analysisEventEmitter.emit('analysisUpdate', { userId, ...analysisData });
// For production scaling, replace sseManager with Redis Pub/Sub or similar.

interface AnalysisEventData {
  userId: string;
  type?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const { userId } = getAuth(request); // Clerk authentication

  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Create a streaming response
  const stream = new ReadableStream({
    start(controller) {
      // Declare controller and handler within the start scope
      const clientController = addClient(userId, controller);

      const handleUpdate = (eventData: AnalysisEventData) => {
        // Check if the event is for this connected user
          console.log(`SSE Route: Received event for user ${userId}:`, eventData);
          const message = `event: message\ndata: ${JSON.stringify(eventData)}\n\n`;
          try {
            // Check if controller is still active before enqueueing
            if (request.signal.aborted) {
              console.log(`SSE Route: Attempted to send to aborted connection for user ${userId}. Cleaning up.`);
              removeClient(userId, clientController);
              analysisEventEmitter.off('analysisUpdate', handleUpdate);
              return;
            }
            controller.enqueue(new TextEncoder().encode(message));
          } catch (error) {
             console.error(`SSE Route: Error enqueuing message for user ${userId}:`, error);
             // Attempt to remove client if enqueue fails
             removeClient(userId, clientController);
             analysisEventEmitter.off('analysisUpdate', handleUpdate); // Remove listener
             try { controller.close(); } catch {} // Close the stream
          }
      };

      // Subscribe to events from the emitter
      analysisEventEmitter.on('analysisUpdate', handleUpdate);

      // Handle client disconnection (browser tab closed, navigation, etc.)
      request.signal.addEventListener('abort', () => {
        console.log(`SSE Route: Client disconnected (abort) for user ${userId}`);
        removeClient(userId, clientController); // Remove from manager
        analysisEventEmitter.off('analysisUpdate', handleUpdate); // Clean up listener
        // Controller closing is handled by the browser/runtime on abort
      });

      // Optional: Send a confirmation message on connection
      const connectMsg = `event: message\ndata: ${JSON.stringify({ type: 'connection_established', userId })}\n\n`;
      try {
        controller.enqueue(new TextEncoder().encode(connectMsg));
        console.log(`SSE Route: Client connected for user ${userId}`);
      } catch (error) {
        console.error(`SSE Route: Error sending connection message for user ${userId}:`, error);
        removeClient(userId, clientController);
        analysisEventEmitter.off('analysisUpdate', handleUpdate);
        try { controller.close(); } catch {} // Close the stream
      }
    },
    cancel(reason) {
      // This cancel function might be called by the stream consumer,
      // but cleanup for client disconnects is primarily handled by the 'abort' event.
      // We log it but rely on the 'abort' listener for robust cleanup.
      console.log('SSE Route: Stream cancelled explicitly for user', userId, 'Reason:', reason);
      // Find the clientController associated with this stream instance if needed,
      // though it might be difficult if start() hasn't fully completed or state is lost.
      // Relying on the 'abort' listener attached to request.signal is generally preferred.
    },
  });

  // Return the streaming response with appropriate headers
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Required for streaming routes in Next.js App Router
export const dynamic = 'force-dynamic';