/**
 * Chat Service - Simple chat logic for ThinkForge
 * Uses SSE format like Editron for consistent streaming
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
  script?: { title?: string; content?: string; blocks?: any[] } | null;
  project?: ProjectMeta | null;
}

/**
 * Detect if prompt is asking to create/generate a script
 */
function detectScriptCreationIntent(prompt: string): boolean {
  const promptLower = prompt.toLowerCase();
  
  // Keywords that indicate script creation
  const createKeywords = ['make', 'create', 'write', 'generate', 'draft', 'start', 'begin'];
  const scriptKeywords = ['script', 'doc', 'document', 'content', 'copy', 'text', 'storyboard'];
  
  // Check for patterns like "make the script", "create a document", etc.
  for (const create of createKeywords) {
    for (const script of scriptKeywords) {
      // Pattern: "make the script", "create a doc", "write the document"
      if (new RegExp(`${create}\\s+(the|a|my|this)?\\s*${script}`, 'i').test(promptLower)) {
        return true;
      }
      // Reverse pattern: "script creation", "document draft"
      if (new RegExp(`${script}\\s+(${create}|${create}d|${create}ing)`, 'i').test(promptLower)) {
        return true;
      }
    }
  }
  
  // Direct phrases
  const directPhrases = [
    'write it', 'make it', 'create it', 'generate it', 'draft it',
    'let\'s write', 'let\'s create', 'let\'s make', 'let\'s draft',
    'start writing', 'begin writing', 'start the script', 'begin the script',
    'write this', 'create this', 'make this',
    'give me the script', 'give me a script',
    'i need a script', 'i want a script',
    'can you write', 'can you create', 'can you make', 'can you draft',
    'please write', 'please create', 'please make', 'please draft',
  ];
  
  for (const phrase of directPhrases) {
    if (promptLower.includes(phrase)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect if prompt is asking to EDIT the existing script
 * This is smarter than just checking if script exists
 */
function detectScriptEditIntent(prompt: string): boolean {
  const promptLower = prompt.toLowerCase();
  
  // Edit action keywords
  const editKeywords = [
    'change', 'modify', 'edit', 'update', 'improve', 'fix', 'revise',
    'rewrite', 'rephrase', 'adjust', 'tweak', 'add', 'remove', 'delete',
    'expand', 'shorten', 'condense', 'simplify', 'clarify', 'sharpen',
    'strengthen', 'tone', 'punchier', 'tighten', 'cut', 'create', 'draft'
  ];
  
  // Script-related targets
  const scriptTargets = [
    'script', 'content', 'copy', 'text', 'section', 'paragraph', 'headline',
    'intro', 'hook', 'cta', 'opening', 'ending', 'body', 'it', 'this', 'that', 'document', 'doc', 'draft'
  ];
  
  // Check for edit patterns
  for (const edit of editKeywords) {
    // Direct match of edit keyword
    if (promptLower.includes(edit)) {
      // Extra validation: check if it's about the script
      for (const target of scriptTargets) {
        if (promptLower.includes(target)) {
          return true;
        }
      }
      // Short commands like "add humor", "cut fluff", "sharpen tone"
      if (prompt.trim().split(/\s+/).length <= 4) {
        return true;
      }
    }
  }
  
  // Direct edit phrases
  const editPhrases = [
    'make it', 'make the', 'more ', 'less ', 'shorter', 'longer', 'better',
    'add a', 'add the', 'add more', 'remove the', 'remove all',
    'can you change', 'can you edit', 'can you improve', 'can you fix',
    'please change', 'please edit', 'please improve', 'please fix',
    'i want it', 'i need it', 'stronger', 'weaker', 'funnier', 'serious',
  ];
  
  for (const phrase of editPhrases) {
    if (promptLower.includes(phrase)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Process chat request - handles Q&A, script editing, AND script creation
 * Returns SSE stream with data: {...} events
 */
export async function processChat(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const { sessionId, prompt, selection, userId, script: providedScript, project: providedProject } = request;
  
  // Load or create session
  let session = sessionId ? await db.getSession(sessionId, userId) : null;
  if (!session && sessionId) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  // Load script if session exists (prefer provided script)
  const script = providedScript || (session ? await db.getScript(sessionId || session._id) : null);
  
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
      title: script.title || '',
      blocks: script.blocks || [],
      content: script.content || '',
      draft: false,
      version: 1
    } : null,
    ideas: [],
    metadata: {
      ...(providedProject || session?.projectMeta || {}),
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
  
  // Create SSE stream
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  // Run in background
  (async () => {
    try {
      let finalResponse = '';
      
      // Determine if we should edit script, create script, or just chat
      // IMPORTANT: Don't automatically edit just because script exists
      // User must express intent to modify the script
      const hasExistingScript = !!script && (script.content || script.blocks?.length);
      const wantsScriptCreation = detectScriptCreationIntent(prompt);
      const wantsScriptEdit = detectScriptEditIntent(prompt);
      
      // Only edit if: script exists AND user is asking to edit it
      const shouldEditScript = hasExistingScript && wantsScriptEdit;
      // Only create if: no script exists AND user wants to create one
      const shouldCreateScript = !hasExistingScript && wantsScriptCreation;
      
      if (shouldEditScript) {
        // Generate script edit
        const draft = await generateScriptDraft(
          selection ? `Apply this change ONLY to the selected text:\nSelected:\n---\n${selection}\n---\nChange:\n${prompt}` : prompt,
          sessionState,
          {
            title: script!.title || '',
            blocks: script!.blocks || [],
            content: script!.content || ''
          }
        );
        
        // Save script update (use saveScript which handles both create and update)
        if (session) {
          await db.saveScript(sessionId || session._id, {
            title: draft.title,
            content: draft.content,
            blocks: draft.blocks
          });
        }
        
        // Send script update as SSE event
        const scriptUpdate = {
          script: {
            title: draft.title,
            blocks: draft.blocks,
            content: draft.content
          },
          metadata: {
            workflow: 'edit',
            thoughts: 'Script updated',
            duration_ms: 0,
            agent_steps: []
          }
        };
        
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'script_update', ...scriptUpdate })}\n\n`));
        
        // Send text response
        finalResponse = 'Script updated successfully.';
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`));
        
        // Persist assistant message
        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
        }
      } else if (shouldCreateScript) {
        // Generate NEW script from scratch
        // Stream a "working" message first
        const workingMsg = 'Creating your script...';
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: workingMsg })}\n\n`));
        
        const draft = await generateScriptDraft(
          prompt,
          sessionState,
          null // No existing script
        );
        
        // Save new script
        if (session) {
          await db.saveScript(sessionId || session._id, {
            title: draft.title,
            content: draft.content,
            blocks: draft.blocks
          });
        }
        
        // Send script update as SSE event
        const scriptUpdate = {
          script: {
            title: draft.title,
            blocks: draft.blocks,
            content: draft.content
          },
          metadata: {
            workflow: 'create',
            thoughts: 'Script created from scratch',
            duration_ms: 0,
            agent_steps: []
          }
        };
        
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'script_update', ...scriptUpdate })}\n\n`));
        
        // Send completion response
        finalResponse = `\n\nScript "${draft.title}" created successfully!`;
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`));
        
        // Persist assistant message
        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', `Creating your script...\n\nScript "${draft.title}" created successfully!`);
        }
      } else {
        // Regular chat response - stream tokens
        const project = providedProject || session?.projectMeta || null;
        const chatStream = await chatAgent(prompt, {
          sessionState,
          script: null,
          project,
          selection: selection || null
        });
        
        // Convert plain text stream to SSE format
        const reader = chatStream.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          finalResponse += chunk;
          
          // Send as token events
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
        }
        
        // Persist assistant message
        if (session && finalResponse) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
        }
      }
      
      // Send done event
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done', sessionId: session?._id })}\n\n`));
    } catch (error: any) {
      console.error('Error in chat stream:', error);
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Chat failed' })}\n\n`));
    } finally {
      await writer.close();
    }
  })();
  
  return stream.readable;
}

