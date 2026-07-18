import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { chatService } from '@/lib/editron/services/chat-service';
import { projectService } from '@/lib/editron/services/project-service';
import { generateProjectSummary, formatSummaryForPrompt } from '@/lib/editron/utils/project-summary';
import { buildChatEditContextBundle, formatChatEditContextForPrompt } from '@/lib/editron/agent/chat-edit-context';
import {
  formatChatAiEditRestoreTargetForPrompt,
  resolveChatAiEditRestoreTarget,
} from '@/lib/editron/agent/chat-ai-edit-transactions';
import {
  buildChatEditRenderVerificationStatusMessage,
  completeChatAiEditTransaction,
  prepareChatAiEditTransaction,
  rollbackChatAiEditTransaction,
  type ChatAiEditTransaction,
} from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';
import type { ChatEditRenderVerificationRequest } from '@/lib/editron/services/phase0-rendered-evidence-worker';
import { checkRateLimit } from '@/lib/editron/utils/rate-limiter';
import { CreditsService } from '@/lib/services/creditsService';
import { TokenTracker } from '@/lib/editron/utils/token-tracker';
import { CHAT_MODEL_NAME } from '@/lib/editron/utils/gemini-model-factory';
import {
  formatChatFrameEvidencePrompt,
  sanitizeChatFrameEvidence,
} from '@/lib/editron/agent/chat-frame-evidence';
import {
  ChatAttachmentContractError,
  formatChatAttachmentsForPrompt,
  resolveAuthorizedChatAttachments,
} from '@/lib/editron/services/chat-attachment-contract';
import { classifyChatRequestOwner } from '@/lib/editron/agent/chat-request-owner';

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
  return `${content}${separator}[AI edit checkpoint context: ${parts.join('; ')}. Restore beforeCheckpointId to return to the state before this assistant edit. Restore afterCheckpointId only to return to the state after this assistant edit.]`;
}

async function persistChatEditVerificationDispatch(input: {
  projectId: string;
  userId: string;
  request: ChatEditRenderVerificationRequest;
  result: { dispatched: boolean; reason?: string; messageId?: string };
}) {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const now = new Date();
  const record = {
    version: 'editron-chat-render-verification-result-v1',
    operationId: input.request.operationId,
    sessionId: input.request.sessionId,
    beforeCheckpointId: input.request.beforeCheckpointId,
    afterCheckpointId: input.request.afterCheckpointId,
    status: input.result.dispatched ? 'pending' : 'error',
    requestedAt: input.request.requestedAt,
    startedAt: null,
    completedAt: input.result.dispatched ? null : now.toISOString(),
    modalities: input.request.modalities,
    targets: input.request.targets,
    sampleFrames: input.request.sampleFrames,
    visual: null,
    audio: null,
    reasons: input.result.dispatched ? [] : [String(input.result.reason ?? 'render_verification_dispatch_failed').slice(0, 500)],
    dispatchMessageId: input.result.messageId ?? null,
    notificationStatus: 'pending',
    notificationSentAt: null,
  };
  await Promise.all([
    db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
      { checkpointId: input.request.beforeCheckpointId, projectId: input.projectId, userId: input.userId },
      { $set: { chatEditRenderVerification: record, updatedAt: now } },
    ),
    db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId: input.projectId, userId: input.userId },
      { $set: { 'intelligence.latestChatEditRenderVerification': record } },
    ),
  ]);
}

export async function POST(req: NextRequest) {
  let activeTransaction: ChatAiEditTransaction | undefined;
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
      model: CHAT_MODEL_NAME,
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

    const {
      message,
      projectId,
      sessionId,
      selectedOverlayId,
      clientContext,
      operationId,
      attachments: rawAttachments,
      visualEvidence: rawVisualEvidence,
    } = await req.json();

    if (typeof message !== 'string' || !message.trim() || !projectId || !operationId) {
      return NextResponse.json(
        { error: 'message, projectId, and operationId are required' },
        { status: 400 },
      );
    }
    const visualEvidence = rawVisualEvidence == null
      ? undefined
      : sanitizeChatFrameEvidence(rawVisualEvidence);
    if (rawVisualEvidence != null && !visualEvidence) {
      return NextResponse.json(
        { error: 'visualEvidence must be a fresh, bounded editor-rendered JPEG or WebP frame' },
        { status: 400 },
      );
    }

    // Authorize the project before touching any chat session state.
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    let attachments;
    try {
      attachments = await resolveAuthorizedChatAttachments(rawAttachments, userId, projectId);
    } catch (error) {
      if (error instanceof ChatAttachmentContractError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }
    const projectDurationInFrames = Number(project.durationInFrames);
    if (
      visualEvidence
      && (!Number.isFinite(projectDurationInFrames)
        || projectDurationInFrames <= 0
        || visualEvidence.frame >= projectDurationInFrames)
    ) {
      return NextResponse.json(
        { error: 'visualEvidence frame is outside the authorized project timeline' },
        { status: 400 },
      );
    }
    const messageWithFrameEvidence = visualEvidence
      ? formatChatFrameEvidencePrompt(message, visualEvidence)
      : message;
    const agentMessage = formatChatAttachmentsForPrompt(messageWithFrameEvidence, attachments);
    let contextMessage = getCachedProjectContext(project);
    const chatEditContext = buildChatEditContextBundle(project, { clientContext, selectedOverlayId });
    contextMessage += `\n\n${formatChatEditContextForPrompt(chatEditContext)}`;

    // Get or create a session scoped to this user and project.
    const actualSessionId = await chatService.getOrCreateSession(userId, projectId, sessionId);

    // Load history BEFORE saving new message to avoid duplicate
    const history = await chatService.getSessionHistory(actualSessionId, userId, projectId);
    if (!history) {
      throw new Error('Chat session was not created for this project');
    }

    const restoreTarget = resolveChatAiEditRestoreTarget(history, { userMessage: message });
    const tokenTracker = new TokenTracker(CHAT_MODEL_NAME);
    const requestOwnerLicense = await classifyChatRequestOwner({
      userMessage: message,
      restoreStatus: restoreTarget.status,
      selectedOverlayPresent: Boolean(selectedOverlayId),
      visualEvidencePresent: Boolean(visualEvidence),
      attachments,
    }, {
      addUsage: (usage) => tokenTracker.addUsage(usage),
    });

    // Fail closed before invoking any mutating tool. Every turn gets a durable
    // pre-state because mutation intent is not trustworthy until the agent has
    // resolved and executed its tool calls.
    const preparedTransaction = await prepareChatAiEditTransaction({
      operationId,
      sessionId: actualSessionId,
      projectId,
      userId,
      project: project as unknown as Record<string, unknown>,
    });
    if (preparedTransaction.status === 'duplicate') {
      return NextResponse.json(
        {
          error: preparedTransaction.message,
          code: 'CHAT_EDIT_OPERATION_REPLAY',
          operationId,
          operationStatus: preparedTransaction.operationStatus,
          beforeCheckpointId: preparedTransaction.beforeCheckpointId,
          afterCheckpointId: preparedTransaction.afterCheckpointId,
        },
        { status: 409 },
      );
    }
    const editTransaction = preparedTransaction.transaction;
    if (!editTransaction) {
      throw new Error('Chat edit transaction preflight returned no executable transaction.');
    }
    activeTransaction = editTransaction;

    // Save user message (after loading history so it's not included in history conversion)
    await chatService.saveMessage(actualSessionId, userId, projectId, {
      role: 'user',
      content: message,
      attachments,
      requestOwnerLicense,
    });
    
    // Convert history to LangChain format
    const langchainHistory: (HumanMessage | AIMessage | ToolMessage)[] = [];
    
    history.forEach(msg => {
      if (msg.role === 'user') {
        // Ensure content is never empty/undefined
        langchainHistory.push(new HumanMessage(formatChatAttachmentsForPrompt(msg.content || '', msg.attachments)));
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

    const restoreTargetPrompt = formatChatAiEditRestoreTargetForPrompt(restoreTarget);
    if (restoreTargetPrompt) {
      contextMessage += `\n\n${restoreTargetPrompt}`;
    }

    // Initialize agent with project context
    const agent = createAgent(userId, contextMessage, {
      sessionId: actualSessionId,
      operationId,
      requestOwnerLicense,
    });

    // Create a stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Run agent in background with streaming
    (async () => {
      let transactionSettled = false;
      let mutatingToolStarted = false;
      try {
        const inputs = {
          messages: [
            ...langchainHistory,
            new HumanMessage(agentMessage) // The new message, optionally paired with visual evidence
          ]
        };

        // Create stream callback to emit events in real-time
        const streamCallback = async (chunk: { type: 'token' | 'tool_start' | 'tool_end', data: any }) => {
          if (chunk.type === 'token') {
            if (!mutatingToolStarted) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk.data.content })}\n\n`));
            }
          } else if (chunk.type === 'tool_start') {
            if (getChatToolMetadata(chunk.data.tool)?.mutatesProject === true) mutatingToolStarted = true;
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: chunk.data.tool, id: chunk.data.id, args: chunk.data.args })}\n\n`));
          } else if (chunk.type === 'tool_end') {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', tool: chunk.data.tool, id: chunk.data.id, output: chunk.data.output })}\n\n`));
          }
        };

        const result = await agent.invoke(inputs, {
          recursionLimit: 50, // Allow up to 50 tool calls per request
          configurable: {
            projectId,
            projectFps: project.fps,
            streamCallback,
            tokenTracker,
            chatFrameEvidence: visualEvidence,
          }
        });

        // Extract tool calls and content from the result for saving to DB
        const messages = result.messages || [];
        
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
          toolCalls,
          toolResults,
        });
        transactionSettled = true;
        if (editTransactionSummary.status === 'failed') {
          throw new Error(`AI edit rollback failed: ${editTransactionSummary.error ?? 'unknown error'}`);
        }
        if (editTransactionSummary.status === 'rolled-back') {
          throw new Error(`AI edit was rolled back: ${editTransactionSummary.error ?? 'a mutating tool failed'}`);
        }

        let renderVerificationDispatch: { dispatched: boolean; reason?: string; messageId?: string } | undefined;
        let persistedResponse = finalResponse;
        if (editTransactionSummary.status === 'created' && editTransactionSummary.renderVerification) {
          try {
            const { dispatchPhase0RenderedEvidenceJob } = await import(
              '@/lib/editron/services/phase0-rendered-evidence-worker'
            );
            renderVerificationDispatch = await dispatchPhase0RenderedEvidenceJob({
              projectId,
              userId,
              requestedAt: editTransactionSummary.renderVerification.requestedAt,
              chatEditVerification: editTransactionSummary.renderVerification,
            });
          } catch (error: unknown) {
            renderVerificationDispatch = {
              dispatched: false,
              reason: error instanceof Error ? error.message : String(error),
            };
          }
          await persistChatEditVerificationDispatch({
            projectId,
            userId,
            request: editTransactionSummary.renderVerification,
            result: renderVerificationDispatch,
          });
          persistedResponse = buildChatEditRenderVerificationStatusMessage(renderVerificationDispatch);
        }
        if (mutatingToolStarted) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: persistedResponse })}\n\n`));
        }

        // Save assistant response with tool info
        await chatService.saveMessage(actualSessionId, userId, projectId, {
          role: 'assistant',
          content: persistedResponse,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          checkpointIds: editTransactionSummary.checkpointIds.length > 0 ? editTransactionSummary.checkpointIds : undefined,
          requestOwnerLicense,
        });

        // Calculate and deduct actual credits based on token usage (post-hoc billing)
        const tokensUsed = tokenTracker.getTotalTokens();
        const creditsConsumed = tokenTracker.getCreditsConsumed();
        
        if (creditsConsumed > 0) {
          const deductResult = await CreditsService.deductCredits(userId, 'editron', 'ai_chat', {
            tokenCount: tokensUsed,
            model: tokenTracker.getModel(),
          });
          
          if (!deductResult.success) {
            console.error('[STREAM-ROUTE] Failed to deduct credits:', deductResult.error);
          }
        }

        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          type: 'done', 
          sessionId: actualSessionId,
          aiEditTransaction: editTransactionSummary,
          renderVerificationDispatch,
          requestOwnerLicense,
          creditsConsumed: Math.round(creditsConsumed * 100) / 100,
          tokensUsed,
        })}\n\n`));
      } catch (error: unknown) {
        let errorMessage = error instanceof Error ? error.message : 'AI edit failed.';
        if (!transactionSettled) {
          try {
            const rollback = await rollbackChatAiEditTransaction({
              transaction: editTransaction,
              reason: errorMessage,
            });
            transactionSettled = true;
            if (rollback.status === 'failed') {
              errorMessage = `${errorMessage} Rollback also failed: ${rollback.error ?? 'unknown error'}`;
            }
          } catch (rollbackError: unknown) {
            errorMessage = `${errorMessage} Rollback threw: ${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}`;
          }
        }
        console.error('Agent error:', errorMessage);
        // No refund needed since we're using post-hoc billing
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`));
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

  } catch (error: unknown) {
    let errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    if (activeTransaction) {
      try {
        const rollback = await rollbackChatAiEditTransaction({
          transaction: activeTransaction,
          reason: `Chat stream preflight failed: ${errorMessage}`,
        });
        if (rollback.status === 'failed') {
          errorMessage = `${errorMessage} Rollback also failed: ${rollback.error ?? 'unknown error'}`;
        }
      } catch (rollbackError: unknown) {
        errorMessage = `${errorMessage} Rollback threw: ${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}`;
      }
    }
    console.error('Error in chat route:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
