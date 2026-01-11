/**
 * Chat Service - Simple chat logic for ThinkForge
 * Uses SSE format like Editron for consistent streaming
 */

import { chatAgent } from '../agents/chat-agent';
import { generateScriptDraft } from '../agents/script-draft-agent';
import { createScriptRefinementAgent } from '../agents/script-refinement-agent';
import { quickAssembleContext } from '../context';
import { classifyIntent, intentRequiresSelection, type Intent } from '../intent/intent-gate';
import * as db from './db';
import type { SessionState, ProjectMeta } from '../state/types';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import { applyThinkForgeBlockPatches, extractTextFromRichText } from '../utils/thinkforge-block-patch';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';

// Generator may be imperfect. Renderer must never fail.

function normalizeText(value: string | undefined | null): string {
  return (value || '').toLowerCase();
}

function blockToPlainText(block: any): string {
  // ThinkForge block
  if (block && Array.isArray((block as any).content)) {
    return extractTextFromRichText((block as any).content as any);
  }
  const children = Array.isArray(block?.children) ? block.children : [];
  const texts: string[] = [];
  for (const child of children) {
    if (child && typeof child === 'object') {
      if (typeof (child as any).text === 'string') {
        texts.push((child as any).text);
      } else if (Array.isArray((child as any).children)) {
        texts.push(blockToPlainText(child));
      }
    }
  }
  return texts.join(' ').trim();
}

function resolveBlockIdsBySelection(blocks: any[], selection?: string | null): string[] {
  if (!selection || !selection.trim() || !Array.isArray(blocks)) return [];
  const needle = normalizeText(selection).slice(0, 400);
  const matches: string[] = [];
  blocks.forEach((b: any) => {
    const text = normalizeText(blockToPlainText(b));
    if (text.includes(needle) && typeof b?.id === 'string') {
      matches.push(b.id);
    }
  });
  return matches;
}

function resolveContextWindowTF(blocks: ThinkForgeBlock[], targetIds: string[], window: number = 1): ThinkForgeBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0 || targetIds.length === 0) return [];
  const indices = targetIds
    .map((id) => blocks.findIndex((b) => b.id === id))
    .filter((i) => i >= 0);
  if (!indices.length) return [];
  const start = Math.max(0, Math.min(...indices) - window);
  const end = Math.min(blocks.length - 1, Math.max(...indices) + window);
  return blocks.slice(start, end + 1);
}

function formatBlocksForPromptTF(blocks: ThinkForgeBlock[]): string {
  return blocks
    .map((b) => `[${b.id}] (${b.kind}) ${extractTextFromRichText(b.content)}`.trim())
    .filter(Boolean)
    .join('\n');
}

function suggestInsertionPointTF(blocks: ThinkForgeBlock[]): { insertAfterBlockId?: string; atEnd?: boolean } {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { atEnd: true };
  }
  const lastAction = [...blocks].reverse().find((b) => b.kind === 'action');
  if (lastAction) return { insertAfterBlockId: lastAction.id };
  return { insertAfterBlockId: blocks[blocks.length - 1].id };
}

export interface ChatRequest {
  sessionId?: string;
  prompt: string;
  selection?: string;
  userId: string;
  script?: { title?: string; content?: string; blocks?: ThinkForgeBlock[] | any[] } | null;
  project?: ProjectMeta | null;
  blockIds?: string[];
  selectionBlocks?: ThinkForgeBlock[]; // Selected blocks from Tiptap editor for surgical editing
  selectionRange?: { from: number; to: number }; // Tiptap selection range for precise replacement
}

function formatBlocksForPrompt(blocks: { blockId: string; text: string; type?: string }[]): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return blocks
    .map((b) => {
      const label = b.type ? `(${b.type}) ` : '';
      const text = typeof b.text === 'string' ? b.text : '';
      return `[${b.blockId}] ${label}${text}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function detectFullRegenerate(prompt: string): boolean {
  const p = normalizeText(prompt);
  return /regenerate (everything|all|entire)/.test(p) || /rewrite (everything|the whole)/.test(p) || /start over/.test(p) || /from scratch/.test(p);
}

/**
 * Process chat request - handles Q&A, script editing, AND script creation
 * Returns SSE stream with data: {...} events
 */
export async function processChat(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const { 
    sessionId, 
    prompt, 
    selection, 
    userId, 
    script: providedScript, 
    project: providedProject, 
    blockIds: providedBlockIds,
    selectionBlocks: providedSelectionBlocks,
    selectionRange: providedSelectionRange,
  } = request;
  
  // Load or create session
  let session = sessionId ? await db.getSession(sessionId, userId) : null;
  if (!session && sessionId) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  // Load script if session exists (prefer provided script)
  const script = providedScript || (session ? await db.getScript(sessionId || session._id) : null);
  
  const thinkforgeBlocks = validateThinkForgeBlocks(Array.isArray((script as any)?.blocks) ? (script as any).blocks : []);
  if (script && thinkforgeBlocks.length !== ((script as any)?.blocks?.length || 0)) {
    throw new Error('Script blocks are not valid ThinkForge blocks. Please migrate the script.');
  }

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
      blocks: thinkforgeBlocks,
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
  
  // Track if stream is closed (aborted by client)
  let isStreamClosed = false;
  
  // Helper function to safely write to stream
  const safeWrite = async (data: string): Promise<boolean> => {
    if (isStreamClosed) return false;
    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      // Stream was closed (client aborted)
      if (error?.name === 'InvalidStateError' || error?.code === 'ERR_INVALID_STATE') {
        isStreamClosed = true;
        console.log('[ThinkForge] Stream closed by client');
        return false;
      }
      throw error;
    }
  };
  
  // Run in background
  (async () => {
    try {
      let finalResponse = '';
      const hasExistingScript = !!script && thinkforgeBlocks.length > 0;

      // 1. Check for confirmation of a previous proposal
      // If a placement proposal is pending, intent classification is suspended.
      // The next user message is interpreted only as confirmation or rejection.
      const lastAssistantMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const isAwaitingConfirmation = lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content.includes('I suggest inserting it');
      
      const CONFIRM_PATTERNS = [/^(yes|yep|yup|sure|correct|ok|okay|that works|proceed|do it)$/i, /\b(yes|yep|yup|do it|do that|proceed|confirm|go ahead|that works|that's fine)\b/i];
      const REJECT_PATTERNS = [/^(no|nope|cancel|stop)$/i, /\b(no|nope|don't|do not|nevermind|cancel)\b/i];
      const isMatch = (text: string, patterns: RegExp[]) => patterns.some(p => p.test(text.trim().replace(/[.!?]$/, '')));

      let effectivePrompt = prompt;
      let blockIds = Array.isArray(providedBlockIds) ? providedBlockIds.filter(Boolean) : resolveBlockIdsBySelection(thinkforgeBlocks, selection);
      let intentResult: any = null;

      if (isAwaitingConfirmation) {
        if (isMatch(prompt, CONFIRM_PATTERNS)) {
          // Find the original request (the message before the proposal)
            const originalRequest = chatHistory.length > 1 ? chatHistory[chatHistory.length - 2] : null;
            if (originalRequest && originalRequest.role === 'user') {
              effectivePrompt = originalRequest.content;
              const proposal = suggestInsertionPointTF(thinkforgeBlocks);
              if (proposal.insertAfterBlockId) blockIds = [proposal.insertAfterBlockId];
              else if (proposal.atEnd) blockIds = ["__END__"];
            
            intentResult = {
              intent: 'SCRIPT_EDIT',
              reason: 'confirmed_proposal',
              executable: true,
              signals: ['proposal_confirmed'],
              textSample: effectivePrompt.substring(0, 50),
              usedFallback: false
            };
            console.log('[ThinkForge][Proposal] Confirmed by user');
          }
        } else if (isMatch(prompt, REJECT_PATTERNS)) {
          finalResponse = "Understood. I've cancelled that suggestion. What would you like to do instead?";
          if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`))) return;
          if (!(await safeWrite(`data: ${JSON.stringify({ type: 'done', sessionId: session?._id })}\n\n`))) return;
          if (session) await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
          return;
        }
      }

      if (!intentResult) {
        intentResult = await classifyIntent(effectivePrompt, selection || null, hasExistingScript);
      }
      
      console.log('[ThinkForge][Intent]', { 
        sessionId: session?._id, 
        intent: intentResult.intent, 
        reason: intentResult.reason, 
        signals: intentResult.signals,
        textSample: intentResult.textSample,
        usedFallback: intentResult.usedFallback 
      });

      // Send intent to client immediately
      if (!(await safeWrite(`data: ${JSON.stringify({ type: 'intent', intent: intentResult.intent })}\n\n`))) {
        return; // Stream closed, exit early
      }

      if (intentResult.intent === 'SCRIPT_EDIT' && !hasExistingScript) {
        finalResponse = 'No script open. Open a script or start a new one before editing.';
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`))) return;
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'done', sessionId: session?._id })}\n\n`))) return;
        return;
      }

      // Enforce selection for edits
      if (intentRequiresSelection(intentResult.intent) && blockIds.length === 0) {
        if (intentResult.reason === 'missing_scope' && intentResult.proposal) {
          finalResponse = `I can perform that edit, but I need to know where. I suggest inserting it after a nearby action block. Confirm if this works, or select a different insertion point.`;
        } else if (intentResult.reason === 'missing_scope') {
          finalResponse = 'I can perform that edit, but I need to know where. Please select the block(s) you want to change or tell me where to insert the new content.';
        } else {
          finalResponse = 'Select the blocks to edit and retry. No changes were made.';
        }
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`))) return;
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'done', sessionId: session?._id })}\n\n`))) return;
        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
        }
        return;
      }

      const wantsFullRegenerate = detectFullRegenerate(effectivePrompt);
      const isGenerateIntent = intentResult.intent === 'SCRIPT_GENERATE';
      const shouldRunGeneration = isGenerateIntent || (hasExistingScript && wantsFullRegenerate);

      if (intentResult.intent === 'SCRIPT_EDIT' && hasExistingScript && !wantsFullRegenerate) {
        // Use selection blocks if provided (surgical editing)
        const useSelectionBlocks = providedSelectionBlocks && providedSelectionBlocks.length > 0;
        const blocksToEdit = useSelectionBlocks 
          ? validateThinkForgeBlocks(providedSelectionBlocks)
          : resolveContextWindowTF(thinkforgeBlocks, blockIds.filter(id => id !== '__END__'), 1);
        
        const promptBlocks = formatBlocksForPromptTF(blocksToEdit);

        const refinementContext = quickAssembleContext(
          'script_refinement',
          sessionState.metadata,
          { title: script!.title || '', content: promptBlocks, blocks: blocksToEdit },
          [],
          null
        );

        const isAddition = /\b(add|insert|append|new section|new step)\b/i.test(effectivePrompt);
        const agentPrompt = useSelectionBlocks
          ? `Edit the following selected content. Change request: ${effectivePrompt}. 

CRITICAL: You are editing a SELECTION from a larger document. 
- Preserve the exact structure: if input has headings, return headings with same levels
- Preserve lists: if input has bullet/numbered lists, return lists
- Preserve blockquotes/callouts: if input has "why" blocks, return "why" blocks
- Preserve horizontal rules: if input has dividers, return dividers
- Only modify the content within the selection, not the structure
- Return blocks that match the input structure exactly`
          : isAddition 
            ? `Add a new section about the following request immediately AFTER ${blockIds[0] === '__END__' ? 'the end of the document' : 'blockId ' + blockIds[0]}. Request: ${effectivePrompt}. If adding a new block, use blockId: "NEW_BLOCK" in your patches.`
            : `Edit only these blockIds: ${blockIds.join(', ')}. Change request: ${effectivePrompt}`;

        const agent = createScriptRefinementAgent({ maxTokens: 900, temperature: 0.3 });
        
        // For selection-based editing, refine only the selected blocks
        // The agent needs the full document context but will only modify selected blocks
        const refined = await agent.refineScript(
          { context: refinementContext, userPrompt: agentPrompt },
          useSelectionBlocks ? blocksToEdit : thinkforgeBlocks
        );

        let finalBlocks: ThinkForgeBlock[];
        let finalRichText: TiptapJSON;

        if (useSelectionBlocks && providedSelectionRange) {
          // Surgical editing: only replace the selected blocks
          // The refined blocks are the replacement for the selection
          finalBlocks = thinkforgeBlocks; // Keep all blocks, we'll replace selection in editor
          finalRichText = thinkForgeBlocksToTiptapJSON(thinkforgeBlocks); // Full document
          
          // Include selection metadata for surgical application
          const scriptUpdate = {
            script: {
              title: script!.title,
              blocks: finalBlocks,
              richText: finalRichText,
              content: script!.content || ''
            },
            metadata: {
              workflow: 'refine',
              thoughts: 'Script refined surgically on selection',
              duration_ms: 0,
              agent_steps: [],
              // Selection metadata for surgical editing
              selectionEdit: {
                editedBlocks: refined.blocks,
                originalRange: providedSelectionRange,
                applySurgically: true,
              }
            }
          };

          if (!(await safeWrite(`data: ${JSON.stringify({ type: 'script_update', ...scriptUpdate })}\n\n`))) return;
        } else {
          // Traditional block-based editing
          const anchorId = blockIds[0];
          const mergedBlocks = applyThinkForgeBlockPatches(thinkforgeBlocks, refined.patches || [], {
            insertAfterId: anchorId === '__END__' ? thinkforgeBlocks[thinkforgeBlocks.length - 1]?.id : anchorId,
            defaultKind: 'paragraph',
          });

          const mergedContent = mergedBlocks.map((b) => extractTextFromRichText(b.content)).join('\n\n');
          
          // Convert to Tiptap JSON AST
          finalRichText = thinkForgeBlocksToTiptapJSON(mergedBlocks);
          finalBlocks = mergedBlocks;

          if (session) {
            await db.saveScript(sessionId || session._id, {
              title: refined.title || script!.title,
              content: mergedContent || script!.content || '',
              blocks: mergedBlocks,
              richText: finalRichText as any,
            });
          }

          const scriptUpdate = {
            script: {
              title: refined.title || script!.title,
              blocks: mergedBlocks,
              richText: finalRichText,
              content: mergedContent || script!.content || ''
            },
            metadata: {
              workflow: 'refine',
              thoughts: 'Script refined surgically',
              duration_ms: 0,
              agent_steps: []
            }
          };

          if (!(await safeWrite(`data: ${JSON.stringify({ type: 'script_update', ...scriptUpdate })}\n\n`))) return;
        }

        finalResponse = 'Update applied to selected blocks only.';
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`))) return;

        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
        }
      } else if (shouldRunGeneration) {
        // Generate NEW script from scratch
        // Stream a "working" message first
        const workingMsg = 'Creating your script...';
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: workingMsg })}\n\n`))) return;
        
        const draft = await generateScriptDraft(
          effectivePrompt,
          sessionState,
          (hasExistingScript && wantsFullRegenerate) ? {
            title: script?.title || '',
            blocks: script?.blocks || [],
            content: script?.content || ''
          } : null
        );
        
        // Save new script with richText (Tiptap JSON AST)
        if (session) {
          await db.saveScript(sessionId || session._id, {
            title: draft.title,
            content: draft.content,
            blocks: draft.blocks,
            richText: draft.richText as any
          });
        }
        
        // Send script update as SSE event
        const scriptUpdate = {
          script: {
            title: draft.title,
            blocks: draft.blocks,
            richText: draft.richText,
            content: draft.content
          },
          metadata: {
            workflow: 'create',
            thoughts: 'Script created from scratch',
            duration_ms: 0,
            agent_steps: []
          }
        };
        
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'script_update', ...scriptUpdate })}\n\n`))) return;
        
        // Send completion response
        finalResponse = `\n\nScript "${draft.title}" created successfully!`;
        if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: finalResponse })}\n\n`))) return;
        
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
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // CRITICAL: Check if stream is still writable before writing
            const chunk = decoder.decode(value, { stream: true });
            finalResponse += chunk;
            
            // Send as token events - stop if stream is closed
            if (!(await safeWrite(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`))) {
              break; // Stream closed, stop reading
            }
          }
        } finally {
          // Release reader when done or aborted
          try {
            reader.releaseLock();
          } catch {}
        }
        
        // Persist assistant message
        if (session && finalResponse) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse);
        }
      }
      
      // Send done event (only if stream is still open)
      if (!isStreamClosed) {
        await safeWrite(`data: ${JSON.stringify({ type: 'done', sessionId: session?._id })}\n\n`);
      }
    } catch (error: any) {
      // Check if error is due to stream being closed (abort)
      const isAbortError = error?.name === 'InvalidStateError' || 
                          error?.code === 'ERR_INVALID_STATE' ||
                          error?.message?.includes('WritableStream is closed') ||
                          error?.message?.includes('ResponseAborted');
      
      if (isAbortError || isStreamClosed) {
        console.log('[ThinkForge] Stream aborted by client');
        return; // Exit early, don't try to write error
      }
      
      console.error('Error in chat stream:', error);
      // Try to send error, but don't fail if stream is closed
      await safeWrite(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Chat failed' })}\n\n`);
    } finally {
      // CRITICAL: Only close if stream is still open
      if (!isStreamClosed) {
        try {
          await writer.close();
        } catch (closeError: any) {
          // Stream already closed, ignore (expected when client aborts)
          if (closeError?.name !== 'InvalidStateError' && closeError?.code !== 'ERR_INVALID_STATE') {
            console.error('[ThinkForge] Error closing writer:', closeError);
          }
        }
      }
    }
  })();
  
  return stream.readable;
}

