/**
 * Chat Service - Simple chat logic for ThinkForge
 * Uses SSE format like Editron for consistent streaming
 */

import { chatAgent } from '../agents/chat-agent';
import { runResearchAgent } from '../agents/research-agent';
import { generateScriptDraft } from '../agents/script-draft-agent';
import { PostWriterAgent, type PostWriterInput } from '../agents/post-writer-agent';
import { ScriptWriterAgent, type ScriptWriterInput } from '../agents/script-writer-agent';
import { runThinkingAgent } from '../agents/thinking-agent';
import { createScriptRefinementAgent } from '../agents/script-refinement-agent';
import { quickAssembleContext, fetchContextSources, formatSystemBrief } from '../context';
import { classifyIntent, intentRequiresSelection, type Intent, type IntentContextSignals } from '../intent/intent-gate';
import * as db from './db';
import { applyCommand } from './command-service';
import { collectExemplarPassively } from './exemplar-collector';
import { appendEvent } from './event-log';
import {
  mergeThinkForgeProjectMetadata,
  resolveProjectMetaBrandId,
  type SessionState,
  type ProjectMeta,
  type ScriptState,
} from '../state/types';
import { validateThinkForgeBlocks, type ThinkForgeBlock, ensureThinkForgeBlockId, normalizeThinkForgeRichText } from '../schemas/thinkforge-block';
import { applyThinkForgeBlockPatches, extractTextFromRichText } from '../utils/thinkforge-block-patch';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
import { resolveThinkForgeDocumentIntent } from '../agents/prompt-utils';
import { resolveThinkForgeTrendContext } from './trend-context';
import { resolveThinkForgeProductionBrief } from '../brief/resolve-production-brief';
import { buildThinkForgeSourceLedger } from '../provenance/source-ledger';
import {
  resolveContentSignalProfile,
  formatContentSignalProfileForPrompt,
  evaluateContentProfileCompliance,
  formatContentProfileComplianceViolations,
  shouldAutoRepairContentProfileViolations,
  type ThinkForgeContentSignalProfile,
} from '../signals';
import { buildThinkForgeSignalTrace } from '../signals/signal-trace';
import crypto from 'crypto';

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

function getBlockIdsFromSelectionBlocks(blocks?: ThinkForgeBlock[] | null): string[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => b?.id).filter((id): id is string => typeof id === 'string');
}

function resolveSectionBlockIds(blocks: ThinkForgeBlock[], anchorIds: string[]): string[] {
  if (!Array.isArray(blocks) || blocks.length === 0 || anchorIds.length === 0) return [];
  const indices = anchorIds
    .map((id) => blocks.findIndex((b) => b.id === id))
    .filter((i) => i >= 0);
  if (!indices.length) return [];

  const firstIdx = Math.min(...indices);
  const lastIdx = Math.max(...indices);

  const findHeaderForIndex = (idx: number): number => {
    for (let i = idx; i >= 0; i--) {
      if (blocks[i].kind === 'header') return i;
    }
    return -1;
  };

  const headerIdx = findHeaderForIndex(firstIdx);
  if (headerIdx < 0) return [];

  // Ensure all anchors are within the same section header
  const anchorHeaderIds = new Set(indices.map((idx) => findHeaderForIndex(idx)).filter((i) => i >= 0));
  if (anchorHeaderIds.size > 1) return [];

  const headerLevel = blocks[headerIdx].meta?.level ?? 2;

  // Find next header of same or higher level after lastIdx
  let endIdx = blocks.length - 1;
  for (let i = Math.max(lastIdx + 1, headerIdx + 1); i < blocks.length; i++) {
    if (blocks[i].kind === 'header') {
      const lvl = blocks[i].meta?.level ?? 2;
      if (lvl <= headerLevel) {
        endIdx = i - 1;
        break;
      }
    }
  }

  return blocks.slice(headerIdx, endIdx + 1).map((b) => b.id);
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
  selectionBlockIds?: string[]; // Structural block IDs from editor
  selectionRange?: { from: number; to: number }; // Tiptap selection range for precise replacement
  scriptId?: string | null;
  generationId?: string | null;
  threadId?: string | null;
  intentContext?: IntentContextSignals;
  blueprintArtifacts?: Array<{ type: string; label: string; description?: string; priority?: string }>;
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
    selectionBlockIds: providedSelectionBlockIds,
    selectionRange: providedSelectionRange,
    scriptId: providedScriptId,
    generationId: providedGenerationId,
    threadId: providedThreadId,
    intentContext: providedIntentContext,
    blueprintArtifacts: providedBlueprintArtifacts,
  } = request;
  const threadId = providedThreadId || 'default';

  // STEP 5: Explicit session existence verification before processing
  // Load session - require it to exist (no auto-create for chat operations)
  let session = sessionId ? await db.getSession(sessionId, userId) : null;
  if (!session && sessionId) {
    // Session doesn't exist - this is an error condition for chat operations
    // The client should have created the session via hydrate first
    console.error('[ThinkForge][chat-service] Session not found:', sessionId);
    throw new Error(`Session not found: ${sessionId}. Please ensure the session is created before sending chat messages.`);
  }

  if (!session) {
    // No sessionId provided - also an error for chat operations
    throw new Error('sessionId is required for chat operations');
  }

  let effectiveScriptId = typeof providedScriptId === 'string' && providedScriptId.trim()
    ? providedScriptId
    : null;

  // Load script if session exists (prefer provided script)
  const script = providedScript || (session ? await db.getScript(sessionId || session._id, effectiveScriptId) : null);

  const thinkforgeBlocks = validateThinkForgeBlocks(Array.isArray((script as any)?.blocks) ? (script as any).blocks : []);
  if (script && thinkforgeBlocks.length !== ((script as any)?.blocks?.length || 0)) {
    throw new Error('Script blocks are not valid ThinkForge blocks. Please migrate the script.');
  }

  // Load chat history, user preferences, and multi-hop context in parallel
  const scriptContent = providedScript?.content || '';
  const baseProjectMeta = mergeThinkForgeProjectMetadata(session.projectMeta, providedProject);
  const retrievalBrandId = resolveProjectMetaBrandId(baseProjectMeta);
  const [chatHistory, preferences, retrievedCtx] = await Promise.all([
    session ? db.getChatHistory(sessionId || session._id, 50, threadId) : Promise.resolve([]),
    db.getUserPreferences(userId),
    fetchContextSources({
      userId,
      projectId: sessionId || undefined,
      sessionId: sessionId || undefined,
      brandId: retrievalBrandId,
      orgId: session.orgId ?? null,
      currentPrompt: prompt,
      currentScript: scriptContent,
      maxFacts: 5,
      interactionWindowDays: 30,
    }).catch((err) => {
      console.warn('[ThinkForge] Multi-hop retrieval failed, proceeding without:', err);
      return null;
    }),
  ]);
  const systemBrief = retrievedCtx ? formatSystemBrief(retrievedCtx) : null;
  const currentScriptState: ScriptState | null = script ? {
    title: script.title || '',
    blocks: thinkforgeBlocks,
    content: script.content || '',
    draft: false,
    version: 1
  } : null;

  // Build session state
  const sessionState: SessionState = {
    sessionId: session?._id || 'temp',
    userId,
    chat: chatHistory,
    script: currentScriptState,
    documents: currentScriptState ? [currentScriptState] : [],
    ideas: [],
    metadata: mergeThinkForgeProjectMetadata(session.projectMeta, providedProject, preferences),
    version: 1,
    lastUpdated: new Date()
  };

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

  const emitEvent = async (eventType: string, payload: Record<string, any>): Promise<boolean> => {
    const sid = sessionId || session?._id || 'temp';
    const record = appendEvent(sid, eventType, payload, threadId);
    const data = {
      ...payload,
      type: eventType,
      eventId: record.id,
      documentId: effectiveScriptId || undefined,
    };
    return safeWrite(`id: ${record.id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Run in background
  (async () => {
    let activeGenerationId: string | null = null;
    try {
      let finalResponse = '';
      const hasExistingScript = !!script && thinkforgeBlocks.length > 0;

      // Resolve user plan and enforce rate limits
      let planName = 'free';
      try {
        planName = await ServiceUsageService.getUserPlanName(userId);
      } catch (planError) {
        console.error('[ThinkForge][chat-service] Failed to resolve plan name:', planError);
      }

      const chatLimit = await db.checkChatLimit(userId, sessionState.sessionId, planName);
      if (!chatLimit.allowed) {
        const quota = {
          planName: chatLimit.planName,
          remaining: chatLimit.remaining,
          maxAllowed: chatLimit.maxAllowed,
          resetAt: chatLimit.resetAt,
        };
        await emitEvent('error', { error: 'Chat limit reached. Please upgrade your plan.', quota });
        await emitEvent('done', { sessionId: session?._id, quota });
        return;
      }

      // Persist user message
      if (session) {
        await db.appendChatMessage(sessionId || session._id, 'user', prompt, threadId);
        await db.recordChatUsage(userId, sessionId || session._id, chatLimit.planName);
      }

      // Blueprint initialization — skip intent classification, run full draft pipeline per artifact
      if (Array.isArray(providedBlueprintArtifacts) && providedBlueprintArtifacts.length > 0) {
        const artifacts = providedBlueprintArtifacts;
        const total = artifacts.length;
        const projectDesc = sessionState.metadata.idea
          || sessionState.metadata.title
          || sessionState.metadata.projectName
          || sessionState.metadata.sessionName
          || prompt;

        if (!(await emitEvent('token', { content: `Creating ${total} document${total > 1 ? 's' : ''} for your project...\n` }))) return;

        const createdDocs: Array<{ scriptId: string; title: string; documentType: string }> = [];

        for (let i = 0; i < total; i++) {
          const artifact = artifacts[i];
          const docType = artifact.type || 'custom';
          const title = artifact.label || 'Untitled Document';
          const newScriptId = crypto.randomUUID();
          const artifactPrompt = `Create a professional "${title}" (${docType.replace(/_/g, ' ')}) document for this project: ${projectDesc}. ${artifact.description || ''}`;

          // Progress is shown via the progress bar, not verbose chat messages

          // Thinking Agent for this artifact
          try {
            const thinking = await runThinkingAgent({
              userPrompt: artifactPrompt,
              projectSummary: projectDesc,
              documentType: docType,
              documentTitle: title,
            });
            if (thinking) {
              await emitEvent('thinking', { content: thinking });
            }
          } catch (thinkErr) {
            console.warn(`[chat-service] Blueprint thinking failed for "${title}" (continuing):`, thinkErr);
          }

          // Run full draft pipeline
          const genId = `gen_bp_${Date.now()}_${i}`;
          if (!(await emitEvent('progress', { progress: (i / total) * 0.9, message: `Writing "${title}"...` }))) return;

          try {
            const draft = await generateScriptDraft(
              artifactPrompt,
              sessionState,
              null,
              undefined,
              {
                onProgress: async ({ progress, message, completed, total: t }) => {
                  const overallProgress = (i / total) + (progress / total) * 0.9;
                  await emitEvent('progress', { progress: overallProgress, message: `[${title}] ${message}`, completed, total: t });
                },
                onPartial: async ({ title: dTitle, blocks, richText, content, completed, total: t }) => {
                  await emitEvent('script_update', {
                    script: { title: dTitle, blocks, richText, content },
                    metadata: { workflow: 'blueprint', streaming: true, completed, total: t },
                  });
                },
              },
              systemBrief,
              retrievedCtx
            );

            // Save document
            const saveResult = await applyCommand({
              type: 'ReplaceDocument',
              sessionId: sessionId || session!._id,
              baseVersion: 0,
              source: 'ai',
              payload: {
                scriptId: newScriptId,
                title: draft.title || title,
                content: draft.content,
                blocks: draft.blocks,
                richText: draft.richText as any,
                documentType: docType,
                metadata: {
                  workflow: 'blueprint',
                  source: 'ai',
                  ...(draft.signalTrace ? { signalTrace: draft.signalTrace } : {}),
                },
              },
            }, userId);

            if (!saveResult.ok) {
              if (!(await emitEvent('token', { content: `Failed to save "${title}": ${saveResult.error}\n` }))) return;
              continue;
            }

            createdDocs.push({ scriptId: newScriptId, title: draft.title || title, documentType: docType });
            await emitEvent('script_created', { scriptId: newScriptId, title: draft.title || title, documentType: docType });
            if (!(await emitEvent('token', { content: `\n✓ ${draft.title || title}\n` }))) return;

            // Deduct credits per document
            try {
              const { CreditsService } = await import('@/lib/services/creditsService');
              await CreditsService.deductCredits(userId, 'thinkforge', 'document_creation');
            } catch (creditErr) {
              console.warn('[chat-service] Credit deduction failed for blueprint doc:', creditErr);
            }
          } catch (draftErr: any) {
            console.error(`[chat-service] Blueprint draft failed for "${title}":`, draftErr);
            if (!(await emitEvent('token', { content: `Error creating "${title}": ${draftErr.message || 'Unknown error'}\n` }))) return;
          }
        }

        // Summary
        const summaryMsg = createdDocs.length === total
          ? `\nAll ${total} documents are ready. Switch between them using the tabs.`
          : `\n${createdDocs.length} of ${total} documents created.`;
        if (!(await emitEvent('token', { content: summaryMsg }))) return;

        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', `Blueprint initialized: ${createdDocs.map(d => d.title).join(', ')}`, threadId);
        }

        await emitEvent('progress', { progress: 1, message: 'Blueprint complete' });
        await emitEvent('done', { sessionId: session?._id });
        if (!isStreamClosed) {
          try { await writer.close(); } catch { /* stream already closed */ }
        }
        return;
      }

      // 1. Check for confirmation of a previous proposal
      // If a placement proposal is pending, intent classification is suspended.
      // The next user message is interpreted only as confirmation or rejection.
      const lastAssistantMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const isAwaitingConfirmation = lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content.includes('I suggest inserting it');

      const CONFIRM_PATTERNS = [/^(yes|yep|yup|sure|correct|ok|okay|that works|proceed|do it)$/i, /\b(yes|yep|yup|do it|do that|proceed|confirm|go ahead|that works|that's fine)\b/i];
      const REJECT_PATTERNS = [/^(no|nope|cancel|stop)$/i, /\b(no|nope|don't|do not|nevermind|cancel)\b/i];
      const isMatch = (text: string, patterns: RegExp[]) => patterns.some(p => p.test(text.trim().replace(/[.!?]$/, '')));

      let effectivePrompt = prompt;
      const selectionBlockIds = Array.isArray(providedSelectionBlockIds) ? providedSelectionBlockIds.filter(Boolean) : [];
      const selectionBlockIdsFromBlocks = getBlockIdsFromSelectionBlocks(providedSelectionBlocks || null);
      let blockIds = Array.isArray(providedBlockIds) ? providedBlockIds.filter(Boolean) : [];
      const hasSelectionBlocks = Array.isArray(providedSelectionBlocks) && providedSelectionBlocks.length > 0;
      const hasSelectionRange = !!providedSelectionRange;
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
              intent: 'edit',
              confidence: 0.85,
              scope: 'section',
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
          if (!(await emitEvent('token', { content: finalResponse }))) return;
          if (!(await emitEvent('done', { sessionId: session?._id }))) return;
          if (session) await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
          return;
        }
      }

      if (!intentResult) {
        // Fast heuristic first (instant, 0ms)
        const { classifyIntentFast } = await import('../intent/intent-gate');
        const fastResult = classifyIntentFast(
          effectivePrompt,
          selection || null,
          hasExistingScript,
          providedIntentContext
        );

        // If heuristic is confident enough, use it directly
        if (fastResult.confidence >= 0.7) {
          intentResult = fastResult;
        } else {
          // Low confidence — run LLM classifier in parallel with a "thinking" message
          // This eliminates perceived lag: user sees immediate feedback
          const thinkingMsg = '🔍 Analyzing your request...';
          const thinkingPromise = emitEvent('token', { content: thinkingMsg });

          const classifyPromise = classifyIntent(
            effectivePrompt,
            selection || null,
            hasExistingScript,
            undefined,
            providedIntentContext
          );

          // Wait for both: the thinking message emission and the classification
          const [thinkingOk, classified] = await Promise.all([thinkingPromise, classifyPromise]);
          if (!thinkingOk) return; // Stream closed

          intentResult = classified;
          finalResponse = thinkingMsg; // Track the thinking message
        }
      }

      if (intentResult.intent === 'edit' || intentResult.intent === 'hybrid') {
        if (blockIds.length === 0) {
          blockIds = selectionBlockIds.length > 0 ? selectionBlockIds : selectionBlockIdsFromBlocks;
        }

        if (intentResult.scope === 'document') {
          blockIds = thinkforgeBlocks.map((b) => b.id);
        }

        if (intentResult.scope === 'section') {
          const sectionIds = resolveSectionBlockIds(thinkforgeBlocks, blockIds);
          if (sectionIds.length === 0) {
            const clarification = 'Which section should I edit? Place your cursor inside the section or select the section heading.';
            if (!(await emitEvent('token', { content: clarification }))) return;
            if (!(await emitEvent('done', { sessionId: session?._id }))) return;
            if (session) await db.appendChatMessage(sessionId || session._id, 'assistant', clarification, threadId);
            return;
          }
          blockIds = sectionIds;
        }
      }

      // Send intent to client immediately
      if (!(await emitEvent('intent', { intent: intentResult.intent, confidence: intentResult.confidence, scope: intentResult.scope }))) {
        return; // Stream closed, exit early
      }

      if (intentResult.intent === 'edit' && !hasExistingScript) {
        finalResponse = 'No script open. Open a script or start a new one before editing.';
        if (!(await emitEvent('token', { content: finalResponse }))) return;
        if (!(await emitEvent('done', { sessionId: session?._id }))) return;
        return;
      }

      // Enforce selection for edits
      if (intentRequiresSelection(intentResult.intent, intentResult.scope) && blockIds.length === 0 && !(hasSelectionBlocks && hasSelectionRange)) {
        if (intentResult.reason === 'missing_scope' && intentResult.proposal) {
          finalResponse = `I can perform that edit, but I need to know where. I suggest inserting it after a nearby action block. Confirm if this works, or select a different insertion point.`;
        } else if (intentResult.reason === 'missing_scope') {
          finalResponse = 'I can perform that edit, but I need to know where. Please select the block(s) you want to change or tell me where to insert the new content.';
        } else {
          finalResponse = 'I need a specific target. Please select the exact block(s) or place your cursor in the section you want to edit.';
        }
        if (!(await emitEvent('token', { content: finalResponse }))) return;
        if (!(await emitEvent('done', { sessionId: session?._id }))) return;
        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
        }
        return;
      }

      const wantsFullRegenerate = detectFullRegenerate(effectivePrompt);
      const isGenerateIntent = intentResult.intent === 'draft';
      const shouldRunGeneration = isGenerateIntent || (hasExistingScript && wantsFullRegenerate);
      const shouldRunEdit = intentResult.intent === 'edit' || intentResult.intent === 'hybrid';
      const requestedDocumentIntent = shouldRunGeneration
        ? resolveThinkForgeDocumentIntent(effectivePrompt, sessionState.metadata.format)
        : null;
      const requestedContentPath = requestedDocumentIntent?.contentPath ?? null;
      const requestedDocumentType = requestedDocumentIntent?.documentType ?? 'screenplay';
      const requestedDocumentLabel = requestedDocumentIntent?.documentLabel ?? 'script';
      const eventSessionId = sessionId || session?._id;

      const isCanvasEmpty = (() => {
        if (!script) return true;
        const hasBlocks = Array.isArray((script as any)?.blocks) && (script as any).blocks.length > 0;
        const hasRichText = (script as any)?.richText && Array.isArray((script as any).richText?.content) && (script as any).richText.content.length > 0;
        const hasContent = typeof (script as any)?.content === 'string' && (script as any).content.trim().length > 0;
        return !(hasBlocks || hasRichText || hasContent);
      })();

      if (isGenerateIntent) {
        if (!session) {
          finalResponse = 'No active session. Start a session first.';
          if (!(await emitEvent('token', { content: finalResponse }))) return;
          if (!(await emitEvent('done', { sessionId: undefined }))) return;
          return;
        }

        // If current canvas is empty, draft into it. Otherwise create a new document.
        if (isCanvasEmpty && effectiveScriptId) {
          // Use the current scriptId as-is.
        } else {
          const newScriptId = crypto.randomUUID();
          const initialTitle = requestedContentPath === 'post' ? 'New Post' : 'New Script';
          const createResult = await applyCommand({
            type: 'ReplaceDocument',
            sessionId: sessionId || session._id,
            baseVersion: 0,
            source: 'ai',
            payload: {
              scriptId: newScriptId,
              title: initialTitle,
              content: '',
              blocks: [],
              documentType: requestedDocumentType,
              metadata: {
                workflow: 'create',
                source: 'ai',
                initializing: true,
              },
            }
          }, userId);

          if (!createResult.ok) {
            finalResponse = createResult.error || `Failed to create new ${requestedDocumentLabel}.`;
            if (!(await emitEvent('token', { content: finalResponse }))) return;
            if (!(await emitEvent('done', { sessionId: session?._id }))) return;
            return;
          }

          effectiveScriptId = newScriptId;
          await emitEvent('script_created', { scriptId: newScriptId, sessionId: eventSessionId, title: initialTitle, documentType: requestedDocumentType });
        }
      }

      if ((shouldRunGeneration || shouldRunEdit) && !effectiveScriptId) {
        finalResponse = `No active ${requestedDocumentLabel}. Create a new ${requestedDocumentLabel} first, then generate.`;
        if (!(await emitEvent('token', { content: finalResponse }))) return;
        if (!(await emitEvent('done', { sessionId: session?._id }))) return;
        return;
      }
      if (shouldRunEdit && hasExistingScript && !wantsFullRegenerate) {
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
          null,
          systemBrief
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
              scriptId: effectiveScriptId,
              sessionId: eventSessionId,
              title: script!.title,
              blocks: finalBlocks,
              richText: finalRichText,
              content: script!.content || ''
            },
            metadata: {
              workflow: 'refine',
              source: 'ai',
              scriptId: effectiveScriptId,
              sessionId: eventSessionId,
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

          if (!(await emitEvent('script_update', scriptUpdate))) return;
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

          let savedVersion: number | undefined;
          if (session) {
            const latest = await db.getScript(sessionId || session._id, effectiveScriptId);
            let baseVersion = latest?.version ?? 0;
            const saveResult = await applyCommand({
              type: 'ReplaceDocument',
              sessionId: sessionId || session._id,
              baseVersion,
              source: 'ai',
              payload: {
                scriptId: effectiveScriptId,
                title: refined.title || script!.title,
                content: mergedContent || script!.content || '',
                blocks: mergedBlocks,
                richText: finalRichText as any,
                metadata: {
                  workflow: 'refine',
                  source: 'ai',
                },
              }
            }, userId);
            if (!saveResult.ok) {
              throw new Error(saveResult.error);
            }
            savedVersion = saveResult.script.version;
          }

          const scriptUpdate = {
            script: {
              scriptId: effectiveScriptId,
              sessionId: eventSessionId,
              title: refined.title || script!.title,
              blocks: mergedBlocks,
              richText: finalRichText,
              content: mergedContent || script!.content || '',
              version: savedVersion
            },
            metadata: {
              workflow: 'refine',
              source: 'ai',
              scriptId: effectiveScriptId,
              sessionId: eventSessionId,
              thoughts: 'Script refined surgically',
              duration_ms: 0,
              agent_steps: []
            }
          };

          if (!(await emitEvent('script_update', scriptUpdate))) return;
        }

        finalResponse = 'Update applied to selected blocks only.';
        if (!(await emitEvent('token', { content: finalResponse }))) return;

        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
        }
      } else if (shouldRunGeneration) {
        // Generate a new document from scratch
        // Stream a "working" message first
        const workingMsg = `Creating your ${requestedDocumentLabel}...`;
        if (!(await emitEvent('token', { content: workingMsg }))) return;

        // Run Thinking Agent before draft ONLY for video scripts or explicit doc types
        const documentIntent = requestedDocumentIntent || resolveThinkForgeDocumentIntent(effectivePrompt, sessionState.metadata.format);
        const contentPath = documentIntent.contentPath;
        const generatedDocumentType = documentIntent.documentType;
        const generatedDocumentLabel = documentIntent.documentLabel;
        
        // FEATURE FLAG: Only run Thinking Agent for scripts, skip for posts to reduce latency
        if (contentPath !== 'post') {
          try {
            const thinking = await runThinkingAgent({
              userPrompt: effectivePrompt,
              projectSummary: sessionState.metadata.idea
                || sessionState.metadata.title
                || sessionState.metadata.projectName
                || sessionState.metadata.sessionName
                || '',
            });
            if (thinking) {
              await emitEvent('thinking', { content: thinking });
            }
          } catch (thinkErr) {
            console.warn('[chat-service] Thinking agent failed (continuing):', thinkErr);
          }
        }

        activeGenerationId = providedGenerationId || `gen_${Date.now()}`;
        if (session) {
          await db.setActiveGeneration(sessionId || session._id, {
            id: activeGenerationId,
            type: 'script_generate',
            scriptId: effectiveScriptId || undefined,
            status: 'running',
            intent: 'draft',
            progress: 0.01,
            message: 'Starting content generation',
            startedAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (!(await emitEvent('progress', { progress: 0.01, message: 'Starting content generation' }))) return;

        let finalTitle = contentPath === 'post' ? 'New Post' : 'New Script';
        let finalContent = '';
        let finalBlocks: ThinkForgeBlock[] = [];
        let finalRichText: TiptapJSON = { type: 'doc', content: [] } as any;
        let signalTrace: any = undefined;
        let briefSnapshot: ReturnType<typeof resolveThinkForgeProductionBrief> | undefined;
        let writerOutputMetadata: Record<string, any> | undefined;

        // Phase 4: resolve the content signal profile and fold it into systemBrief so the writers
        // ground (proof points, forbidden terms, source-ledger) and signalTrace persists for the
        // Clickatron handoff. ponytail: reuse the systemBrief injection the writers already read --
        // no writer-agent changes. Fails soft to the un-grounded brief.
        let groundedSystemBrief = systemBrief;
        // Resolved profile is also threaded to the writers (baseInput.contentSignalProfile) so the
        // flat Post/Script writers can drive writing-graph technique selection from the structured
        // signals, not just the folded brief. Fails soft to the un-grounded brief.
        let resolvedSignalProfile: ThinkForgeContentSignalProfile | undefined;
        let trendContextMetadata: Record<string, any> | undefined;
        try {
          const contentSignalProfile = resolveContentSignalProfile({
            userPrompt: effectivePrompt,
            documentType: documentIntent.documentType,
            brandId: sessionState.metadata.brandId,
            sessionId: sessionState.sessionId,
            retrievedContext: retrievedCtx || undefined,
          });
          resolvedSignalProfile = contentSignalProfile;
          groundedSystemBrief = [systemBrief, formatContentSignalProfileForPrompt(contentSignalProfile)]
            .filter(Boolean)
            .join('\n\n');
          signalTrace = buildThinkForgeSignalTrace(contentSignalProfile);
        } catch (profileErr) {
          console.warn('[chat-service] content signal profile resolution failed; generating without it:', profileErr);
        }

        try {
          const trendContext = await resolveThinkForgeTrendContext({
            userPrompt: effectivePrompt,
            project: sessionState.metadata,
            brandId: sessionState.metadata.brandId,
            contentPath,
          });
          if (trendContext?.promptBlock) {
            groundedSystemBrief = [groundedSystemBrief, trendContext.promptBlock]
              .filter(Boolean)
              .join('\n\n');
          }
          if (trendContext?.metadata) {
            trendContextMetadata = trendContext.metadata;
          }
        } catch (trendErr) {
          console.warn('[chat-service] public trend context failed; generating without it:', trendErr);
        }

        try {
          briefSnapshot = resolveThinkForgeProductionBrief({
            userPrompt: effectivePrompt,
            project: sessionState.metadata,
            documentType: generatedDocumentType,
            contentPath,
            brandId: sessionState.metadata.brandId,
          });
        } catch (briefErr) {
          console.warn('[chat-service] production brief resolution failed; generating without briefSnapshot:', briefErr);
        }

        try {
          const sourceLedger = buildThinkForgeSourceLedger({
            userPrompt: effectivePrompt,
            retrievedContext: retrievedCtx || undefined,
            brandId: sessionState.metadata.brandId,
            sessionId: sessionState.sessionId,
          });

          const baseInput = {
            context: quickAssembleContext(
              'script_draft',
              sessionState.metadata,
              null,
              [],
              null,
              groundedSystemBrief
            ),
            userPrompt: effectivePrompt,
            retrievedContext: retrievedCtx || undefined,
            project: sessionState.metadata,
            sessionId: sessionState.sessionId,
            brandId: sessionState.metadata.brandId,
            contentSignalProfile: resolvedSignalProfile,
            productionBrief: briefSnapshot,
            sourceLedger,
          };

          if (contentPath === 'post') {
            const writer = new PostWriterAgent();
            const { result } = await writer.runStructured(baseInput as PostWriterInput);
            finalContent = result.content;
            finalTitle = result.metadata?.platform ? `${result.metadata.platform} Post` : 'Social Post';
            writerOutputMetadata = {
              writerType: 'post',
              contentAnalysis: result.contentAnalysis,
              visualPrompts: result.clickatron,
              writerMetadata: result.metadata,
              ...(trendContextMetadata ? { trendContext: trendContextMetadata } : {}),
            };
            
            // Build simple paragraph block for post content
            const parsedBlocks = parseMarkdownToBlocks(finalContent);
            finalBlocks = validateThinkForgeBlocks(
              parsedBlocks.length > 0
                ? parsedBlocks
                : [
                    {
                      id: ensureThinkForgeBlockId(),
                      kind: 'paragraph',
                      content: normalizeThinkForgeRichText([{ type: 'text', text: finalContent, styles: {} }]),
                    },
                  ]
            );
            finalRichText = thinkForgeBlocksToTiptapJSON(finalBlocks);
            
            // Log analytics
            console.log(`[ThinkForge:PostWriter] Score: ${result.contentAnalysis?.qualityScore}`);

          } else {
            const writer = new ScriptWriterAgent();
            const { result } = await writer.runStructured(baseInput as ScriptWriterInput);
            finalContent = result.content;
            finalTitle = 'Video Script';
            writerOutputMetadata = {
              writerType: 'script',
              contentAnalysis: result.contentAnalysis,
              visualPrompts: result.visualMetadata,
              scriptSidecar: result.sidecar,
              sidecarVersion: result.sidecar.sidecarVersion,
              sourceLedger,
              writerMetadata: result.metadata,
              ...(trendContextMetadata ? { trendContext: trendContextMetadata } : {}),
            };

            // Build structural blocks for script
            const parsedBlocks = parseMarkdownToBlocks(finalContent);
            finalBlocks = validateThinkForgeBlocks(
              parsedBlocks.length > 0
                ? parsedBlocks
                : [
                    {
                      id: ensureThinkForgeBlockId(),
                      kind: 'paragraph',
                      content: normalizeThinkForgeRichText([{ type: 'text', text: finalContent, styles: {} }]),
                    },
                  ]
            );
            finalRichText = thinkForgeBlocksToTiptapJSON(finalBlocks);
            
            // Log analytics
            console.log(`[ThinkForge:ScriptWriter] Score: ${result.contentAnalysis?.qualityScore}`);
          }

          // Stack A profile-compliance: run the same post-gen scoring Stack B runs (forbidden
          // terms, missing proof points, platform length, format mismatch, internal metadata
          // leakage, missing CTA) on the flat writers' output. Stack A has no stylist rewrite
          // stage, so this measures + persists + logs loud on critical (rather than auto-repairing);
          // criticals are real defects (leaked metadata, forbidden brand term, script labels in a
          // social post) that should be visible. Needs the resolved profile to have facts to check.
          if (resolvedSignalProfile && finalContent) {
            const compliance = evaluateContentProfileCompliance(finalContent, resolvedSignalProfile);
            if (compliance.violations.length > 0 && writerOutputMetadata) {
              const hasCritical = shouldAutoRepairContentProfileViolations(compliance.violations);
              writerOutputMetadata.profileCompliance = {
                score: compliance.score,
                hasCritical,
                violations: formatContentProfileComplianceViolations(compliance.violations),
              };
              (hasCritical ? console.error : console.warn)(
                `[ThinkForge:ProfileCompliance] Stack A score ${compliance.score}/100${hasCritical ? ' — CRITICAL' : ''}. Violations: ${compliance.violations.map((v) => v.id).join(', ')}`,
              );
            }
          }
        } catch (writerError) {
          console.error('[chat-service] Writer agent failed:', writerError);
          // Fallback to old agent if new one fails entirely? No, let it error out so we can debug.
          throw writerError;
        }

        // Save new script with richText (Tiptap JSON AST)
        let savedVersion: number | undefined;
        if (session) {
          const latest = await db.getScript(sessionId || session._id, effectiveScriptId);
          let baseVersion = latest?.version ?? 0;
          const saveResult = await applyCommand({
            type: 'ReplaceDocument',
            sessionId: sessionId || session._id,
            baseVersion,
            source: 'ai',
            payload: {
              scriptId: effectiveScriptId,
              title: finalTitle,
              content: finalContent,
              blocks: finalBlocks,
              richText: finalRichText as any,
              documentType: generatedDocumentType,
              metadata: {
                workflow: 'create',
                source: 'ai',
                documentType: generatedDocumentType,
                ...(signalTrace ? { signalTrace } : {}),
                ...(briefSnapshot ? { briefSnapshot } : {}),
                ...(writerOutputMetadata ? { writerOutput: writerOutputMetadata } : {}),
              },
            }
          }, userId);
          if (!saveResult.ok) {
            throw new Error(saveResult.error);
          }
          savedVersion = saveResult.script.version;

          // Passive exemplar collection (fire-and-forget, never blocks save)
          const detectedType = /post|linkedin|twitter|instagram/i.test(prompt) ? 'post' : 'video_script';
          collectExemplarPassively(userId, finalContent, detectedType).catch(() => {});
        }

        // Send script update as SSE event
        const scriptUpdate = {
          script: {
            scriptId: effectiveScriptId,
            sessionId: eventSessionId,
            title: finalTitle,
            blocks: finalBlocks,
            richText: finalRichText,
            content: finalContent,
            version: savedVersion,
            documentType: generatedDocumentType,
            // signalTrace/briefSnapshot/writerOutput intentionally NOT emitted to the client:
            // internal reasoning the browser never reads. Still persisted server-side
            // (ReplaceDocument above) and fed to handoffs from the DB, not over the wire.
          },
          metadata: {
            workflow: 'create',
            source: 'ai',
            scriptId: effectiveScriptId,
            sessionId: eventSessionId,
            generationId: activeGenerationId,
            documentType: generatedDocumentType,
            thoughts: `${contentPath === 'post' ? 'Post' : 'Script'} created directly via Writer API`,
            duration_ms: 0,
            agent_steps: []
          }
        };

        if (!(await emitEvent('script_update', scriptUpdate))) return;

        if (session) {
          await db.updateGenerationState(sessionId || session._id, activeGenerationId, {
            status: 'completed',
            scriptId: effectiveScriptId || undefined,
            progress: 1,
            message: 'Content generated',
          });
        }

        // Send completion response
        const completionLabel = contentPath === 'post' ? 'Post' : 'Script';
        finalResponse = `\n\n${completionLabel} "${finalTitle}" created successfully!`;
        if (!(await emitEvent('token', { content: finalResponse }))) return;

        // Persist assistant message
        if (session) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', `Creating your ${generatedDocumentLabel}...\n\n${completionLabel} "${finalTitle}" created successfully!`, threadId);
      }
      } else if (intentResult.intent === 'research') {
        // Research intent - use search-grounded agent (non-streaming for metadata access)
        const project = sessionState.metadata;

        // Emit a progress indicator while research runs
        const searchingMsg = '\n\n🌐 Searching the web for relevant information...\n\n';
        if (!(await emitEvent('token', { content: searchingMsg }))) return;
        finalResponse += searchingMsg;

        try {
          const researchResult = await runResearchAgent(prompt, {
            sessionState,
            project,
            systemBrief,
          });

          // Emit the full research response as a single token event
          if (!(await emitEvent('token', { content: researchResult.text }))) return;
          finalResponse += researchResult.text;

          // Persist assistant message
          if (session && finalResponse) {
            await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
          }

          // Auto-save research to DataBank (with verified sources)
          try {
            await db.addDataBankEntry(
              sessionId || session._id,
              userId,
              {
                type: 'research',
                title: `Research: ${prompt.substring(0, 80)}`,
                content: {
                  query: prompt,
                  response: researchResult.text,
                  verifiedSources: researchResult.sources,
                },
                tags: ['auto-research'],
                scope: 'project',
              }
            );
          } catch (dbErr) {
            console.error('[ThinkForge] Failed to save research to DataBank:', dbErr);
          }
        } catch (researchErr: any) {
          console.error('[ResearchAgent] Failed:', researchErr);
          const errorMsg = '\n\nSorry, the research search encountered an error. Please try again.';
          if (!(await emitEvent('token', { content: errorMsg }))) return;
          finalResponse += errorMsg;
          if (session) {
            await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
          }
        }
      } else {
        // Regular chat response - stream tokens
        const project = sessionState.metadata;
        const chatStream = await chatAgent(prompt, {
          sessionState,
          script: null,
          project,
          selection: selection || null,
          systemBrief,
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
            if (!(await emitEvent('token', { content: chunk }))) {
              break; // Stream closed, stop reading
            }
          }
        } finally {
          // Release reader when done or aborted
          try {
            reader.releaseLock();
          } catch { }
        }

        // Persist assistant message
        if (session && finalResponse) {
          await db.appendChatMessage(sessionId || session._id, 'assistant', finalResponse, threadId);
        }
      }

      // Send done event (only if stream is still open)
      if (!isStreamClosed) {
        await emitEvent('done', { sessionId: session?._id });
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
      if (session && activeGenerationId) {
        await db.updateGenerationState(sessionId || session._id, activeGenerationId, {
          status: 'failed',
          message: error?.message || 'Generation failed',
        });
      }
      // Try to send error, but don't fail if stream is closed
      await emitEvent('error', { error: error.message || 'Chat failed' });
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
