import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { chatService } from '@/lib/editron/services/chat-service';
import { projectService } from '@/lib/editron/services/project-service';
import { generateProjectSummary, formatSummaryForPrompt } from '@/lib/editron/utils/project-summary';
import { buildChatEditContextBundle, formatChatEditContextForPrompt } from '@/lib/editron/agent/chat-edit-context';
import { beginChatAiEditTransaction, completeChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transactions';
import { checkRateLimit } from '@/lib/editron/utils/rate-limiter';
import { CreditsService } from '@/lib/services/creditsService';
import { TokenTracker } from '@/lib/editron/utils/token-tracker';

// Minimum credits required to start a chat (actual cost calculated post-hoc based on tokens)
const MINIMUM_CREDITS_REQUIRED = 1;

export const maxDuration = 60; // Allow longer timeout for agent execution

// PERF FIX: Cache project context summaries keyed by `${projectId}:${updatedAt}`.
// generateProjectSummary + formatSummaryForPrompt ran on every POST request even
// when the project hadn't changed between messages in the same conversation.
// The cache key uses the project's updatedAt timestamp so it auto-invalidates
// whenever the project is actually modified (tools write back → updatedAt changes).
//
// OLD: const summary = generateProjectSummary(project);  [every request]
//      const contextMessage = formatSummaryForPrompt(summary);
// NEW: read from _summaryCache[cacheKey] when project hasn't changed
const _summaryCache = new Map<string, string>();
const SUMMARY_CACHE_MAX_SIZE = 50; // cap to avoid unbounded memory growth

function getCachedProjectContext(project: any): string {
  const cacheKey = `${project.projectId ?? project.id}:${project.updatedAt ?? ''}`;
  if (_summaryCache.has(cacheKey)) {
    return _summaryCache.get(cacheKey)!;
  }
  const summary = generateProjectSummary(project);
  const contextMessage = formatSummaryForPrompt(summary);
  // Evict oldest entry if cache is at capacity
  if (_summaryCache.size >= SUMMARY_CACHE_MAX_SIZE) {
    const firstKey = _summaryCache.keys().next().value;
    if (firstKey !== undefined) _summaryCache.delete(firstKey);
  }
  _summaryCache.set(cacheKey, contextMessage);
  return contextMessage;
}


function appendCheckpointContextForAgent(content: string, checkpointIds?: string[]): string {
  if (!checkpointIds?.length) return content;

  const [beforeCheckpointId, afterCheckpointId] = checkpointIds;
  const parts = [
    beforeCheckpointId ? `beforeCheckpointId=${beforeCheckpointId}` : null,
    afterCheckpointId ? `afterCheckpointId=${afterCheckpointId}` : null,
  ].filter((part): part is string => Boolean(part));

  if (!parts.length) return content;

  const separator = content.trim() ? '\n\n' : '';
  return `${content}${separator}[AI edit checkpoint context: ${parts.join('; ')}. To undo this assistant edit, call restore_ai_edit_checkpoint with beforeCheckpointId. To redo it, use afterCheckpointId.]`;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before sending more messages.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
          }
        }
      );
    }

    // Credits check - ensure user has minimum credits available
    // We use post-hoc billing based on actual token usage
    const creditsCheck = await CreditsService.hasCredits(userId, 'editron', 'ai_chat', {
      tokenCount: MINIMUM_CREDITS_REQUIRED * 1000, // Check if they have at least minimum credits
    });
    if (!creditsCheck.hasCredits) {
      return NextResponse.json(
        { 
          error: 'Insufficient credits',
          creditsInfo: {
            required: MINIMUM_CREDITS_REQUIRED,
            available: creditsCheck.available,
          }
        },
        { status: 402 }
      );
    }

    const { message, projectId, sessionId, selectedOverlayId, clientContext } = await req.json();

    if (!message || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get or create session
    const actualSessionId = await chatService.getOrCreateSession(userId, projectId, sessionId);

    // Load history BEFORE saving new message to avoid duplicate
    const history = await chatService.getSessionHistory(actualSessionId);

    // Save user message (after loading history so it's not included in history conversion)
    await chatService.saveMessage(actualSessionId, {
      role: 'user',
      content: message,
    });
    
    // Convert history to LangChain format
    const langchainHistory: (HumanMessage | AIMessage | ToolMessage)[] = [];
    
    history.forEach(msg => {
      if (msg.role === 'user') {
        // Ensure content is never empty/undefined
        langchainHistory.push(new HumanMessage(msg.content || ''));
      } else if (msg.role === 'assistant') {
        // Check if we have tool calls AND corresponding tool results
        // If tool calls exist but results are missing/incomplete, skip the tool_calls
        // This prevents Google Generative AI from receiving malformed messages
        const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
        const hasCompleteToolResults = msg.toolResults && 
          msg.toolResults.length >= (msg.toolCalls?.length || 0);
        
        // Only include tool_calls if we have complete results for all of them
        const toolCalls = hasToolCalls && hasCompleteToolResults
          ? msg.toolCalls!.map(tc => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              type: 'tool_call' as const,
            }))
          : undefined;

        // Ensure content is never empty/undefined when there are no tool calls.
        // Google Generative AI requires either content or tool_calls.
        const content = appendCheckpointContextForAgent(
          msg.content || (toolCalls ? '' : ' '),
          msg.checkpointIds,
        );

        langchainHistory.push(new AIMessage({
          content,
          tool_calls: toolCalls,
        }));

        // Add ToolMessages for results if we included tool_calls
        if (toolCalls && msg.toolResults && msg.toolResults.length > 0) {
          msg.toolResults.forEach(tr => {
            langchainHistory.push(new ToolMessage({
              tool_call_id: tr.toolCallId,
              name: tr.toolName,
              content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
            }));
          });
        }
      }
    });

    // Load project for context injection
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    // Generate project summary — cached per projectId:updatedAt (Priyank's perf fix)
    let contextMessage = getCachedProjectContext(project);

    const chatEditContext = buildChatEditContextBundle(project, { clientContext, selectedOverlayId });
    contextMessage += `\n\n${formatChatEditContextForPrompt(chatEditContext)}`;
    const editTransaction = beginChatAiEditTransaction({
      sessionId: actualSessionId,
      projectId,
      userId,
      overlays: project.overlays ?? [],
    });

    // Initialize agent with project context
    const agent = createAgent(userId, contextMessage);

    // Create a stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    console.log('[STREAM-ROUTE] Starting chat stream for message:', message.substring(0, 100));
    console.log('[STREAM-ROUTE] History has', langchainHistory.length, 'messages');

    // Run agent in background with streaming
    (async () => {
      try {
        const inputs = {
          messages: [
            ...langchainHistory,
            new HumanMessage(message) // The new message
          ]
        };

        console.log('[STREAM-ROUTE] Prepared inputs with', inputs.messages.length, 'total messages');

        // Create stream callback to emit events in real-time
        let callbackInvocationCount = 0;
        const streamCallback = async (chunk: { type: 'token' | 'tool_start' | 'tool_end', data: any }) => {
          callbackInvocationCount++;
          console.log(`[STREAM-ROUTE] Callback #${callbackInvocationCount}:`, chunk.type, chunk.type === 'token' ? chunk.data.content?.substring(0, 50) : chunk.data.tool);
          
          if (chunk.type === 'token') {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk.data.content })}\n\n`));
          } else if (chunk.type === 'tool_start') {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: chunk.data.tool, id: chunk.data.id, args: chunk.data.args })}\n\n`));
          } else if (chunk.type === 'tool_end') {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', tool: chunk.data.tool, id: chunk.data.id, output: chunk.data.output })}\n\n`));
          }
        };

        // Create token tracker for billing
        const tokenTracker = new TokenTracker('gemini-2.5-flash');

        console.log('[STREAM-ROUTE] Invoking agent...');
        const result = await agent.invoke(inputs, {
          recursionLimit: 50, // Allow up to 50 tool calls per request
          configurable: {
            projectId,
            streamCallback,
            tokenTracker,
          }
        });
        console.log('[STREAM-ROUTE] Agent.invoke completed. Callback was invoked', callbackInvocationCount, 'times');

        // Extract tool calls and content from the result for saving to DB
        const messages = result.messages || [];
        console.log('[STREAM-ROUTE] Result has', messages.length, 'messages');
        messages.forEach((m: any, i: number) => {
          console.log(`[STREAM-ROUTE] Message ${i}: type=${m.constructor?.name}, content=${String(m.content).substring(0, 100)}, tool_calls=${m.tool_calls?.length || 0}`);
        });
        
        // Only take NEW messages generated by agent
        const newMessages = messages.slice(inputs.messages.length);
        const toolCallsMap = new Map<string, any>();
        const toolResultsMap = new Map<string, any>();
        let finalResponse = "";

        // Process all messages to extract tool calls and content
        for (const msg of newMessages) {
          const msgAny = msg as any;
          const msgType = typeof msgAny._getType === 'function' ? msgAny._getType() : msg.constructor?.name;
          
          // Skip the human message we added
          if (msgType === 'human' || msgType === 'HumanMessage') continue;
          
          // Process AI messages
          if (msgType === 'ai' || msgType === 'AIMessage' || msgType === 'AIMessageChunk') {
            // Tool Calls
            if (msgAny.tool_calls?.length) {
              for (const tc of msgAny.tool_calls) {
                if (!toolCallsMap.has(tc.id)) {
                  toolCallsMap.set(tc.id, {
                    id: tc.id,
                    name: tc.name,
                    args: tc.args
                  });
                }
              }
            }
          
            // Final response
            if (!msgAny.tool_calls?.length && typeof msgAny.content === "string") {
              finalResponse = msgAny.content;
            }
          }

          // Process Tool messages (results) - tool_end events are now emitted from sequentialToolNode
          if (msgType === 'tool' || msgType === 'ToolMessage') {
            const id = msgAny.tool_call_id;

            if (toolCallsMap.has(id) && !toolResultsMap.has(id)) {
              toolResultsMap.set(id, {
                toolCallId: id,
                toolName: msgAny.name,
                result: msgAny.content
              });
            }
          }
        }

        // Convert maps → arrays
        const toolCalls = Array.from(toolCallsMap.values());
        const toolResults = Array.from(toolResultsMap.values());
        const editTransactionSummary = await completeChatAiEditTransaction({
          transaction: editTransaction,
          toolResults,
        });
        if (editTransactionSummary.status === 'failed') {
          console.error('[STREAM-ROUTE] Failed to create AI edit transaction checkpoints:', editTransactionSummary.error);
        }

        // Save assistant response with tool info
        await chatService.saveMessage(actualSessionId, {
          role: 'assistant',
          content: finalResponse,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          checkpointIds: editTransactionSummary.checkpointIds.length > 0 ? editTransactionSummary.checkpointIds : undefined,
        });

        // Calculate and deduct actual credits based on token usage (post-hoc billing)
        const tokensUsed = tokenTracker.getTotalTokens();
        const creditsConsumed = tokenTracker.getCreditsConsumed();
        
        if (creditsConsumed > 0) {
          const deductResult = await CreditsService.deductCredits(userId, 'editron', 'ai_chat', {
            tokenCount: tokensUsed,
            model: 'gemini-2.5-flash',
          });
          
          if (!deductResult.success) {
            console.error('[STREAM-ROUTE] Failed to deduct credits:', deductResult.error);
          } else {
            console.log(`[STREAM-ROUTE] Deducted ${creditsConsumed.toFixed(2)} credits for ${tokensUsed} tokens`);
          }
        }

        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          type: 'done', 
          sessionId: actualSessionId,
          aiEditTransaction: editTransactionSummary,
          creditsConsumed: Math.round(creditsConsumed * 100) / 100,
          tokensUsed,
        })}\n\n`));
      } catch (error: any) {
        console.error("Agent error:", error);
        // No refund needed since we're using post-hoc billing
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
