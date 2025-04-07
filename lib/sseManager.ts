import { EventEmitter } from 'events';

// IMPORTANT: This in-memory solution is NOT suitable for production scaling.
// Use Redis Pub/Sub or a similar external message broker in production.

// Structure to hold the SSE stream controller
interface ClientController {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

// Map to store active client connections: userId -> Set of controllers
const clientConnections = new Map<string, Set<ClientController>>();

// Event emitter to decouple callbacks from SSE route
const eventEmitter = new EventEmitter();

// Export this emitter for frontend usage (client-only)
export const analysisEventEmitter = eventEmitter;

// Server-side SSE management logic
if (typeof window === 'undefined') {
  // Listen for analysis updates and send them to the appropriate user
  eventEmitter.on('analysisUpdate', (data: { userId: string; type?: string } & Record<string, unknown>) => {
    const { userId, ...eventData } = data;
    console.log(`SSE Manager: Received analysisUpdate event for user ${userId}:`, eventData);
    sendEventToUser(userId, { type: 'analysisUpdate', ...eventData });
  });
}
// Function to add a client connection
export const addClient = (userId: string, controller: ReadableStreamDefaultController<Uint8Array>): ClientController => {
  if (!clientConnections.has(userId)) {
    clientConnections.set(userId, new Set());
  }
  const clientSet = clientConnections.get(userId)!;
  const clientController = { controller };
  clientSet.add(clientController);
  console.log(`SSE Manager: Added client for user ${userId}. Total clients for user: ${clientSet.size}`);
  return clientController;
};

// Function to remove a client connection
export const removeClient = (userId: string, clientController: ClientController) => {
  if (clientConnections.has(userId)) {
    const clientSet = clientConnections.get(userId)!;
    clientSet.delete(clientController);
    console.log(`SSE Manager: Removed client for user ${userId}. Remaining clients for user: ${clientSet.size}`);
    if (clientSet.size === 0) {
      clientConnections.delete(userId);
      console.log(`SSE Manager: Removed user entry ${userId}.`);
    }
  }
};

// Function to send an event to a specific user's connections
export const sendEventToUser = (userId: string, data: object) => {
  if (clientConnections.has(userId)) {
    const clientSet = clientConnections.get(userId)!;
    const payloadWithUserId = { userId, ...data };
    const message = `event: message\ndata: ${JSON.stringify(payloadWithUserId)}\n\n`;
    const encodedMessage = new TextEncoder().encode(message);

    console.log(`SSE Manager: Sending event to ${clientSet.size} clients for user ${userId}:`, data);
    clientSet.forEach(({ controller }) => {
      try {
        controller.enqueue(encodedMessage);
      } catch (error) {
        // Handle potential errors if the controller is already closed
        console.error(`SSE Manager: Error enqueuing message for user ${userId}:`, error);
        // Optionally remove the client if enqueue fails consistently
      }
    });
  } else {
    console.debug(`SSE Manager: No active clients found for user ${userId} to send event. This may be normal in serverless or multi-instance environments.`, data);
  }
};

// Export the emitter for callbacks to use

// Example of how a callback might trigger an event:
// import { analysisEventEmitter } from '@/lib/sseManager';
// // Inside your callback handler (e.g., /api/services/alyzitron/callback/started)
// const handleTaskStarted = (userId: string, analysisData: any) => {
//   analysisEventEmitter.emit('analysisUpdate', { userId, ...analysisData });
// };