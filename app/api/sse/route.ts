import { type NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/sseManager';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'auto';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return new Response('Unauthorized: Missing userId', { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start: (controller) => {
      // Store the client connection
      const clientController = addClient(userId, controller);

      // Send initial connection message
      const message = `event: message\ndata: ${JSON.stringify({ type: 'connection_established' })}\n\n`;
      controller.enqueue(encoder.encode(message));

      // Handle cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        removeClient(userId, clientController);
      });
    },
    cancel: () => {
      // Clean up client connection on stream close
      console.log('SSE connection closed for user:', userId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}