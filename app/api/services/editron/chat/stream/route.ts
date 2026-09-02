import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAgent } from '@/lib/editron/agent/agent-graph';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { chatService } from '@/lib/editron/services/chat-service';
import {
  ProjectNotFoundOrForbiddenError,
  projectService,
  type ProjectMutationReceiptV1,
} from '@/lib/editron/services/project-service';
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
import { resolveBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import { TokenTracker } from '@/lib/editron/utils/token-tracker';
import { CHAT_MODEL_NAME } from '@/lib/editron/utils/gemini-model-factory';
import {
  formatChatFrameEvidencePrompt,
  resolveChatFrameContinuationLicense,
  sanitizeChatFrameEvidence,
} from '@/lib/editron/agent/chat-frame-evidence';
import {
  ChatAttachmentContractError,
  formatChatAttachmentsForPrompt,
  resolveAuthorizedChatAttachments,
} from '@/lib/editron/services/chat-attachment-contract';
import {
  bindTrustedSelectedOverlayTarget,
  bindTrustedTimelineTarget,
  classifyChatRequestOwner,
} from '@/lib/editron/agent/chat-request-owner';
import { classifyChatProviderFailure } from '@/lib/editron/agent/chat-provider-failure';
import {
  buildRequestedChatEditRenderVerification,
  markChatEditRenderVerificationDispatched,
  type ChatEditRenderVerificationRecord,
} from '@/lib/editron/services/chat-edit-render-verification-lifecycle';
import { startChatSseHeartbeat } from '@/lib/editron/services/chat-sse-heartbeat';

// Minimum credits required to start a chat (actual cost calculated post-hoc based on tokens)
const MINIMUM_CREDITS_REQUIRED = 1;

export const maxDuration = 300; // Agent execution: apply_editorial_intent runs the director plan; 60s truncated it (stopgap — the project path is being moved to the QStash queue like script-recomposition)

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

function latestWriterReceiptForProject(
  receipts: readonly ProjectMutationReceiptV1[],
  projectId: string,
): ProjectMutationReceiptV1 | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    if (receipts[index].projectId === projectId) return receipts[index];
  }
  return undefined;
}

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
  return `${content}${separator}[AI edit checkpoint context: ${parts.join('; ')}. Restore beforeCheckpointId only to return to the state before this assistant edit. afterCheckpointId is retained as audit state and is not a safe redo target.]`;
}

async function persistChatEditVerificationRequested(input: {
  projectId: string;
  userId: string;
  request: ChatEditRenderVerificationRequest;
}): Promise<ChatEditRenderVerificationRecord> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const now = new Date();
  const record = buildRequestedChatEditRenderVerification(input.request, now);
  if (!input.request.subjectReceipt) {
    throw new Error('A chat render-verification request requires its writer-issued subject receipt.');
  }
  const checkpointWrite = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
    { checkpointId: input.request.beforeCheckpointId, projectId: input.projectId, userId: input.userId },
    { $set: { chatEditRenderVerification: record, updatedAt: now } },
  );
  if (checkpointWrite.matchedCount !== 1) {
    throw new Error('Unable to persist the requested chat render-verification job.');
  }
  try {
    await projectService.recordChatRenderVerificationProjection(input.userId, input.projectId, {
      subjectReceipt: input.request.subjectReceipt,
      record,
      expectedLifecycleStates: ['requested'],
      allowReplacePriorSubject: true,
    });
  } catch (error: unknown) {
    const failedRecord = markChatEditRenderVerificationDispatched(record, {
      dispatched: false,
      reason: error instanceof Error ? error.message : String(error),
    }, now);
    await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
      {
        checkpointId: input.request.beforeCheckpointId,
        projectId: input.projectId,
        userId: input.userId,
        'chatEditRenderVerification.operationId': input.request.operationId,
        'chatEditRenderVerification.lifecycle.state': 'requested',
      },
      { $set: { chatEditRenderVerification: failedRecord, updatedAt: now } },
    );
    throw error;
  }
  return record;
}

async function persistChatEditVerificationDispatch(input: {
  projectId: string;
  userId: string;
  request: ChatEditRenderVerificationRequest;
  requestedRecord: ChatEditRenderVerificationRecord;
  result: { dispatched: boolean; reason?: string; messageId?: string };
}): Promise<{ dispatched: boolean; reason?: string; messageId?: string }> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const now = new Date();
  const record = markChatEditRenderVerificationDispatched(input.requestedRecord, input.result, now);
  const checkpointBase = {
    checkpointId: input.request.beforeCheckpointId,
    projectId: input.projectId,
    userId: input.userId,
    'chatEditRenderVerification.operationId': input.request.operationId,
  };
  if (input.result.dispatched && input.request.subjectReceipt) {
    try {
      await projectService.recordChatRenderVerificationProjection(input.userId, input.projectId, {
        subjectReceipt: input.request.subjectReceipt,
        record,
        expectedLifecycleStates: ['requested'],
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      const failedRecord = markChatEditRenderVerificationDispatched(input.requestedRecord, {
        dispatched: false,
        reason,
      }, now);
      const failedWrite = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
        { ...checkpointBase, 'chatEditRenderVerification.lifecycle.state': 'requested' },
        { $set: { chatEditRenderVerification: failedRecord, updatedAt: now } },
      );
      if (failedWrite.matchedCount !== 1) {
        throw new Error('Unable to record the stale chat render-verification dispatch disposition.');
      }
      return { dispatched: false, reason };
    }
  }

  const checkpointWrite = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
    { ...checkpointBase, 'chatEditRenderVerification.lifecycle.state': 'requested' },
    { $set: { chatEditRenderVerification: record, updatedAt: now } },
  );
  if (checkpointWrite.matchedCount !== 1) {
    throw new Error('Unable to persist the chat render-verification dispatch disposition.');
  }
  return input.result;
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

    // (Credits pre-flight moved below, after loadProject, so it checks the BILLED wallet — P2.)

    const {
      message,
      projectId,
      sessionId,
      selectedOverlayId,
      clientContext,
      operationId,
      attachments: rawAttachments,
      visualEvidence: rawVisualEvidence,
      // Director Mode: set true ONLY by the client's explicit "Run Auto-Director"
      // confirmation button (structured confirm — never inferred from message text).
      autoDirectorConfirmed: rawAutoDirectorConfirmed,
    } = await req.json();
    const autoDirectorConfirmed = rawAutoDirectorConfirmed === true;

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
    let projectSnapshot;
    try {
      projectSnapshot = await projectService.loadProjectForMutation(userId, projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundOrForbiddenError) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      throw error;
    }
    const { project } = projectSnapshot;
    // Director Mode (assist lane): a refunded scan_failed project must never open
    // into chat — the user was refunded because they never received the product
    // (CEO plan REV 4 #5, cancel-refund loophole).
    if ((project as { editMode?: unknown }).editMode === 'assist'
      && (project as { autoEditStatus?: unknown }).autoEditStatus === 'scan_failed') {
      return NextResponse.json(
        { error: 'This project\'s scan failed and its credits were refunded. Start a new project to edit this footage.', code: 'assist_scan_failed' },
        { status: 403 },
      );
    }

    // Billing wallet for this chat (P2): an org-owned project bills the org wallet, else the
    // member's personal wallet. The post-hoc deduct below uses the SAME wallet. Flag off /
    // personal project => personal, exactly as before.
    const billingWallet = resolveBillingOwner(userId, project, isOrgWalletBillingEnabled());
    // Credits pre-flight — post-hoc billing, so this only gates that the BILLED wallet holds at
    // least the minimum. Checks the org wallet for an org project (D2), so an org member with an
    // empty personal wallet is not wrongly blocked from a funded org project.
    const creditsCheck = await CreditsService.hasCreditsForWallet(billingWallet, 'editron', 'ai_chat', {
      tokenCount: MINIMUM_CREDITS_REQUIRED * 1000,
      model: CHAT_MODEL_NAME,
    });
    if (!creditsCheck.hasCredits) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          creditsInfo: {
            required: MINIMUM_CREDITS_REQUIRED,
            available: creditsCheck.available,
          },
          walletOwner: billingWallet.type,
        },
        { status: 402 },
      );
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
    const continuationLicense = visualEvidence
      ? resolveChatFrameContinuationLicense(history, visualEvidence)
      : null;
    const classifiedRequestOwnerLicense = continuationLicense
      ?? await classifyChatRequestOwner({
        userMessage: message,
        restoreStatus: restoreTarget.status,
        restoreAction: restoreTarget.action,
        selectedOverlayPresent: Boolean(selectedOverlayId),
        visualEvidencePresent: Boolean(visualEvidence),
        selectedRangePresent: Boolean(chatEditContext.selectedRange),
        visibleTimelinePresent: Boolean(chatEditContext.visibleTimeline),
        playheadPresent: Number.isFinite(chatEditContext.playhead.frame),
        attachments,
      }, {
        addUsage: (usage) => tokenTracker.addUsage(usage),
      });
    const requestOwnerLicense = bindTrustedTimelineTarget(
      bindTrustedSelectedOverlayTarget(
        classifiedRequestOwnerLicense,
        selectedOverlayId,
      ),
      chatEditContext,
    );

    // Fail closed before invoking any mutating tool. Every turn gets a durable
    // pre-state because mutation intent is not trustworthy until the agent has
    // resolved and executed its tool calls.
    const preparedTransaction = await prepareChatAiEditTransaction({
      operationId,
      sessionId: actualSessionId,
      projectId,
      userId,
      project: project as unknown as Record<string, unknown>,
      projectRevision: projectSnapshot.revision,
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
      // Director Mode: in the assist lane the user is the editorial director, so
      // family directives license the direct tools instead of Auto-Director.
      assistLane: (project as { editMode?: unknown }).editMode === 'assist',
    });

    // Create a stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    const heartbeat = startChatSseHeartbeat(writer, {
      onWriteError: (error) => {
        console.warn(
          '[STREAM-ROUTE] SSE heartbeat stopped after the client stream became unavailable:',
          error instanceof Error ? error.message : String(error),
        );
      },
    });

    // Run agent in background with streaming
    (async () => {
      let transactionSettled = false;
      let mutatingToolStarted = false;
      let writerIssuedReceipt: ProjectMutationReceiptV1 | undefined;
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

        const capturedAgentInvocation = await projectService.captureMutationReceipts(
          () => agent.invoke(inputs, {
            recursionLimit: 50, // Allow up to 50 tool calls per request
            configurable: {
              projectId,
              projectFps: project.fps,
              streamCallback,
              tokenTracker,
              chatFrameEvidence: visualEvidence,
              // Structured Auto-Director confirmation (Director Mode). The tool ORs
              // this into its wire input so a button-driven confirm executes without
              // parsing "yes" from free text.
              autoDirectorConfirmed,
            }
          }),
          (receipts) => {
            writerIssuedReceipt = latestWriterReceiptForProject(receipts, projectId);
          },
        );
        const result = capturedAgentInvocation.value;

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
          writerIssuedReceipt,
        });
        transactionSettled = true;
        if (editTransactionSummary.status === 'failed') {
          throw new Error(`AI edit rollback failed: ${editTransactionSummary.error ?? 'unknown error'}`);
        }
        // ROLLED-BACK is a safe, user-explainable outcome — the project was
        // restored untouched. Throwing here used to skip BOTH the SSE reply and
        // saveMessage, so the user got an EMPTY response (C1 matrix: every
        // rollback turn). Tell them what happened instead.
        if (editTransactionSummary.status === 'rolled-back') {
          const failedNames = editTransactionSummary.failedToolNames.join(', ') || 'the requested edit';
          finalResponse = [
            `I couldn't complete this edit — ${failedNames} failed, so I restored your project to exactly how it was before I started. Nothing was changed.`,
            editTransactionSummary.error ? `Reason: ${editTransactionSummary.error}` : '',
            'You can try rephrasing the request, or ask me to try a different approach.',
          ].filter(Boolean).join('\n\n');
        }

        let renderVerificationDispatch: { dispatched: boolean; reason?: string; messageId?: string } | undefined;
        let persistedResponse = finalResponse;
        if (editTransactionSummary.status === 'created' && editTransactionSummary.renderVerification) {
          let requestedRecord: ChatEditRenderVerificationRecord | undefined;
          try {
            requestedRecord = await persistChatEditVerificationRequested({
              projectId,
              userId,
              request: editTransactionSummary.renderVerification,
            });
            const { dispatchPhase0RenderedEvidenceJob } = await import(
              '@/lib/editron/services/phase0-rendered-evidence-worker'
            );
            const dispatched = await dispatchPhase0RenderedEvidenceJob({
              projectId,
              userId,
              requestedAt: editTransactionSummary.renderVerification.requestedAt,
              chatEditVerification: editTransactionSummary.renderVerification,
            });
            renderVerificationDispatch = dispatched;
          } catch (error: unknown) {
            renderVerificationDispatch = {
              dispatched: false,
              reason: error instanceof Error ? error.message : String(error),
            };
          }
          if (requestedRecord) {
            renderVerificationDispatch = await persistChatEditVerificationDispatch({
              projectId,
              userId,
              request: editTransactionSummary.renderVerification,
              requestedRecord,
              result: renderVerificationDispatch,
            });
          }
          persistedResponse = buildChatEditRenderVerificationStatusMessage(renderVerificationDispatch);
        }
        // KEEP-BEST: a committed batch can now carry reported failures — say so
        // instead of implying everything applied.
        if (editTransactionSummary.status === 'created' && editTransactionSummary.failedToolNames.length > 0) {
          persistedResponse = [
            persistedResponse,
            `Note: ${editTransactionSummary.mutatingToolNames.join(', ')} applied successfully, but ${editTransactionSummary.failedToolNames.join(', ')} failed and was not applied. The successful edits were kept.`,
          ].filter(Boolean).join('\n\n');
        }
        // A turn must NEVER end with an empty reply (C1 matrix: silent deaths
        // after tool spirals). Synthesize an honest minimum from the outcome.
        if (!persistedResponse || !persistedResponse.trim()) {
          persistedResponse = editTransactionSummary.status === 'created'
            ? `Done — applied: ${editTransactionSummary.mutatingToolNames.join(', ')}.`
            : 'I looked into this but could not complete an edit this turn. Nothing was changed — tell me how you would like to proceed.';
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
          const deductResult = await CreditsService.deductForWallet(billingWallet, 'editron', 'ai_chat', {
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
        const providerFailure = classifyChatProviderFailure(error);
        let errorMessage = error instanceof Error ? error.message : 'AI edit failed.';
        if (!transactionSettled) {
          try {
            const rollback = await rollbackChatAiEditTransaction({
              transaction: editTransaction,
              reason: errorMessage,
              writerIssuedReceipt,
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
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: providerFailure?.message ?? errorMessage,
          ...(providerFailure ? { code: providerFailure.code, retryable: providerFailure.retryable } : {}),
        })}\n\n`));
      } finally {
        await heartbeat.stop();
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
    const providerFailure = classifyChatProviderFailure(error);
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
      {
        error: providerFailure?.message ?? errorMessage,
        ...(providerFailure ? { code: providerFailure.code, retryable: providerFailure.retryable } : {}),
      },
      {
        status: providerFailure?.httpStatus ?? 500,
        headers: providerFailure?.retryAfterSeconds
          ? { 'Retry-After': String(providerFailure.retryAfterSeconds) }
          : undefined,
      },
    );
  }
}
