/**
 * Chat Service - Simple chat logic for ThinkForge
 */

import { chatAgent } from '../agents/chat-agent';
import { generateScriptDraft } from '../agents/script-draft-agent';
import * as db from './db';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree } from '../schemas/canonical';

export interface ChatRequest {
  sessionId?: string;
  prompt: string;
  selection?: string;
  userId: string;
}

export interface ChatResponse {
  stream: ReadableStream<Uint8Array>;
  scriptUpdated?: boolean;
}

/**
 * Process chat request - handles both Q&A and script editing
 */
export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const { sessionId, prompt, selection, userId } = request;
  
  // Load or create session
  let session = sessionId ? await db.getSession(sessionId, userId) : null;
  if (!session && sessionId) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  // Load script if session exists
  const script = session ? await db.getScript(sessionId || session._id) : null;
  
  // Load chat history
  const chatHistory = session ? await db.getChatHistory(sessionId || session._id, 50) : [];
  
  // Load user preferences
  const preferences = await db.getUserPreferences(userId);
  
  // Build session state
  const sessionState: SessionState = {
    sessionId: session?._id || 'temp',
    userId,
    chat: chatHistory,
    script: script ? {
      title: script.title,
      blocks: script.blocks || [],
      content: script.content,
      draft: false,
      version: 1
    } : null,
    ideas: [],
    metadata: {
      ...(session?.projectMeta || {}),
      preferences
    },
    version: 1,
    lastUpdated: new Date()
  };
  
  // Check rate limits
  const planName = 'free'; // TODO: Get from user profile
  const canChat = await db.checkChatLimit(userId, sessionState.sessionId, planName);
  if (!canChat) {
    throw new Error('Chat limit reached. Please upgrade your plan.');
  }
  
  // Persist user message
  if (session) {
    await db.appendChatMessage(sessionId || session._id, 'user', prompt);
    await db.recordChatUsage(userId, sessionId || session._id);
  }
  
  // Determine if we should edit script or chat
  const shouldEditScript = !!script;
  
  if (shouldEditScript) {
    // Generate script edit
    const draft = await generateScriptDraft(
      selection ? `Apply this change ONLY to the selected text:\nSelected:\n---\n${selection}\n---\nChange:\n${prompt}` : prompt,
      sessionState,
      {
        title: script.title,
        blocks: script.blocks || [],
        content: script.content
      }
    );
    
    // Save script update
    if (session) {
      await db.updateScript(sessionId || session._id, {
        title: draft.title,
        content: draft.content,
        blocks: draft.blocks
      });
    }
    
    // Create streaming response with script update marker
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode('Working on your script...\n\n'));
          
          // Send script update in marker format
          const scriptUpdate = {
            script: {
              title: draft.title,
              blocks: draft.blocks,
              content: draft.content
            },
            metadata: {
              workflow: 'draft',
              thoughts: 'Script updated',
              duration_ms: 0,
              agent_steps: []
            }
          };
          
          controller.enqueue(encoder.encode(`<script_update>${JSON.stringify(scriptUpdate)}</script_update>`));
          
          // Persist assistant message
          if (session) {
            await db.appendChatMessage(sessionId || session._id, 'assistant', 'Script updated successfully.');
          }
          
          controller.close();
        } catch (error) {
          console.error('Error in script stream:', error);
          controller.error(error);
        }
      }
    });
    
    return { stream, scriptUpdated: true };
  } else {
    // Regular chat response
    const chatStream = await chatAgent(prompt, {
      sessionState,
      script: null,
      project: session?.projectMeta || null,
      selection: selection || null
    });
    
    // Persist assistant message (best effort - accumulate stream in production)
    if (session) {
      setTimeout(async () => {
        try {
          await db.appendChatMessage(sessionId || session._id, 'assistant', '[Response streamed]');
        } catch (error) {
          console.error('Error persisting assistant message:', error);
        }
      }, 100);
    }
    
    return { stream: chatStream, scriptUpdated: false };
  }
}

