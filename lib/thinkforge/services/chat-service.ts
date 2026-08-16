/**
 * Chat Service - Simple chat logic for ThinkForge
 * Uses SSE format like Editron for consistent streaming
 */

import { generateText } from 'ai';
import { chatAgent } from '../agents/chat-agent';
import { runResearchAgent } from '../agents/research-agent';
import { generateScriptDraft } from '../agents/script-draft-agent';
import { PostWriterAgent, type PostWriterInput } from '../agents/post-writer-agent';
import { ScriptWriterAgent, type ScriptWriterInput } from '../agents/script-writer-agent';
import { runThinkingAgent } from '../agents/thinking-agent';
import {
  quickAssembleContext,
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '../context';
import {
  buildThinkForgeAuthoringContextSnapshot,
  resolveThinkForgeAuthoringProjectMetadata,
} from '../context/brand-authoring-context';
import { classifyIntent, intentRequiresSelection, type IntentContextSignals } from '../intent/intent-gate';
import * as db from './db';
import { applyCommand } from './command-service';
import { appendEvent } from './event-log';
import {
  resolveProjectMetaBrandId,
  type SessionState,
  type ProjectMeta,
  type ScriptState,
} from '../state/types';
import { validateThinkForgeBlocks, type ThinkForgeBlock, ensureThinkForgeBlockId, normalizeThinkForgeRichText } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from '../utils/thinkforge-block-patch';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
import { createThinkForgeModelForRoute } from '../agents/model-factory';
import { buildIsolatedPromptParts } from '../agents/prompt-boundary';
import { resolveThinkForgeGenerationDocumentIntent } from '../agents/prompt-utils';
import { resolveThinkForgeTrendContext } from './trend-context';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import {
  resolveThinkForgeAuthoringPrompt,
  resolveThinkForgeProductionBrief,
} from '../brief/resolve-production-brief';
import { resolveThinkForgeAvatarCasting, type ThinkForgeCastingMetadata } from '../casting/resolve-casting';
import { buildKnobParserSystemInstruction, parsePromptUnderstanding } from '../intake/prompt-knob-parser';
import { buildThinkForgeSourceLedger } from '../provenance/source-ledger';
import { persistGroundedResearchMemory } from '../provenance/research-memory';
import {
  resolveContentSignalProfile,
  formatContentSignalProfileForPrompt,
  evaluateContentProfileCompliance,
  formatContentProfileComplianceViolations,
  shouldAutoRepairContentProfileViolations,
} from '../signals';
import { buildThinkForgeSignalTrace } from '../signals/signal-trace';
import { getVersion as getWritingKnowledgeVersion } from '../data/writing-graph-query';
import {
  createThinkForgeDocumentCommitBaseline,
  resolveThinkForgeCommitBaseVersion,
} from '../document-commit-baseline';
import { reviseDocumentViaFlatWriter } from './flat-writer-edit';
import { resolveCanonicalEditSelection } from './canonical-edit-selection';
import crypto from 'crypto';

const PROMPT_UNDERSTANDING_SEED = 7;

export async function resolveScriptPromptUnderstanding(userPrompt: string) {
  return parsePromptUnderstanding(userPrompt, async () => {
    const promptParts = buildIsolatedPromptParts({
      systemInstruction: buildKnobParserSystemInstruction(),
      data: { userPrompt },
      fieldLimits: { userPrompt: 24_000 },
      totalLimit: 32_000,
    });
    const { text } = await generateText({
      model: createThinkForgeModelForRoute({
        routePurpose: 'structural',
        privacyClass: 'business_confidential',
      }),
      system: promptParts.systemInstruction,
      prompt: promptParts.prompt,
      temperature: 0,
      seed: PROMPT_UNDERSTANDING_SEED,
    });
    return text;
  });
}

// Generator may be imperfect. Renderer must never fail.

function normalizeText(value: string | undefined | null): string {
  return (value || '').toLowerCase();
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

function suggestInsertionPointTF(blocks: ThinkForgeBlock[]): { insertAfterBlockId?: string; atEnd?: boolean } {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { atEnd: true };
  }
  const lastAction = [...blocks].reverse().find((b) => b.kind === 'action');
  if (lastAction) return { insertAfterBlockId: lastAction.id };
  return { insertAfterBlockId: blocks[blocks.length - 1].id };
}

interface ChatRequest {
  sessionId: string;
  prompt: string;
  selection?: string;
  userId: string;
  orgId?: string | null;
  isOrgAdmin?: boolean;
  script?: { title?: string; content?: string; blocks?: ThinkForgeBlock[] | any[]; version?: number } | null;
  project?: ProjectMeta | null;
  blockIds?: string[];
  selectionBlocks?: ThinkForgeBlock[]; // Selected blocks from Tiptap editor for surgical editing
  selectionBlockIds?: string[]; // Structural block IDs from editor
  selectionRange?: { from: number; to: number }; // Tiptap selection range for precise replacement
  scriptId: string;
  generationId?: string | null;
  threadId?: string | null;
  intentContext?: IntentContextSignals;
  blueprintArtifacts?: Array<{ type: string; label: string; description?: string; priority?: string }>;
  /** Route-resolved authoring truth. Undefined keeps direct server callers compatible. */
  authoringContext?: ThinkForgeResolvedAuthoringContext | null;
  /** Silent generation (auto-starter draft): run the draft but do NOT persist the triggering
   *  prompt as a visible user chat message. The assistant progress + script still stream. */
  silent?: boolean;
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
    orgId,
    isOrgAdmin,
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
    authoringContext: providedAuthoringContext,
    silent: isSilent = false,
  } = request;
  const threadId = providedThreadId || 'default';

  // P3.1: the chat request is the work; its org context decides who pays. Resolved ONCE at
  // work-start and reused for every downstream charge of this stream (the blueprint
  // per-document deductions below) — the flag/context can never flip mid-stream.
  const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

  // STEP 5: Explicit session existence verification before processing
  // Load session - require it to exist (no auto-create for chat operations)
  const exactSessionId = sessionId.trim();
  const exactProvidedScriptId = providedScriptId.trim();
  if (!exactSessionId || exactSessionId !== sessionId) {
    throw new Error('sessionId must be a non-empty trimmed string');
  }
  if (!exactProvidedScriptId || exactProvidedScriptId !== providedScriptId) {
    throw new Error('scriptId must be a non-empty trimmed string');
  }

  const session = await db.getSession(exactSessionId, userId, orgId);
  if (!session) {
    // Session doesn't exist - this is an error condition for chat operations
    // The client should have created the session via hydrate first
    console.error('[ThinkForge][chat-service] Session not found:', exactSessionId);
    throw new Error(`Session not found: ${exactSessionId}. Please ensure the session is created before sending chat messages.`);
  }
  const canonicalSessionId = session._id;

  let effectiveScriptId = exactProvidedScriptId;

  // The HTTP route supplies the server-owned snapshot used for context resolution.
  // Direct server callers still resolve the same exact document by ID here.
  const script = providedScript || (session ? await db.getScript(canonicalSessionId, effectiveScriptId) : null);
  const commitBaseline = effectiveScriptId
    ? createThinkForgeDocumentCommitBaseline(effectiveScriptId, script?.version ?? 0)
    : null;

  const thinkforgeBlocks = validateThinkForgeBlocks(Array.isArray((script as any)?.blocks) ? (script as any).blocks : []);
  if (script && thinkforgeBlocks.length !== ((script as any)?.blocks?.length || 0)) {
    throw new Error('Script blocks are not valid ThinkForge blocks. Please migrate the script.');
  }

  // Direct callers still resolve the same server-owned context. The HTTP route
  // pre-resolves it before billing and passes it here to avoid divergent reads.
  const scriptContent = providedScript?.content || '';
  const baseProjectMeta = resolveThinkForgeAuthoringProjectMetadata(session.projectMeta, providedProject);
  const retrievalBrandId = resolveProjectMetaBrandId(baseProjectMeta);
  const authoringContextPromise = providedAuthoringContext !== undefined
    ? Promise.resolve(providedAuthoringContext)
    : resolveThinkForgeAuthoringContext({
        userId,
        orgId: session.orgId ?? null,
        isOrgAdmin,
        sessionProjectMeta: session.projectMeta,
        providedProject,
        projectId: canonicalSessionId,
        sessionId: canonicalSessionId,
        currentPrompt: prompt,
        currentScript: scriptContent,
        maxFacts: 5,
        interactionWindowDays: 30,
        writingKnowledgeVersion: getWritingKnowledgeVersion(),
      }).catch((err) => {
        console.warn('[ThinkForge] Multi-hop retrieval failed, proceeding without:', err);
        if (retrievalBrandId) throw err;
        return null;
      });
  const [chatHistory, preferences, authoringContext] = await Promise.all([
    session ? db.getChatHistory(canonicalSessionId, 50, threadId) : Promise.resolve([]),
    db.getUserPreferences(userId),
    authoringContextPromise,
  ]);
  const resolvedProjectMeta = authoringContext?.projectMeta ?? baseProjectMeta;
  const retrievedCtx = authoringContext?.retrievedContext ?? null;
  const systemBrief = authoringContext?.systemBrief ?? null;
  const currentScriptState: ScriptState | null = script ? {
    title: script.title || '',
    blocks: thinkforgeBlocks,
    content: script.content || '',
    draft: false,
    version: 1
  } : null;

  // Build session state
  const sessionState: SessionState = {
    sessionId: canonicalSessionId,
    userId,
    chat: chatHistory,
    script: currentScriptState,
    documents: currentScriptState ? [currentScriptState] : [],
    ideas: [],
    metadata: {
      ...resolvedProjectMeta,
      preferences,
    },
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
        return false;
      }
      throw error;
    }
  };

  const emitEvent = async (eventType: string, payload: Record<string, any>): Promise<boolean> => {
    const sid = canonicalSessionId;
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
    const activeGenerationId = providedGenerationId || `gen_${crypto.randomUUID()}`;
    let generationTerminalized = false;
    let commitOwnershipClaimed = false;
    let commitPersisted = false;
    let terminalFailureMessage: string | null = null;

    const claimCommitOwnership = async (): Promise<void> => {
      if (commitOwnershipClaimed) return;
      if (!session) throw new Error('Cannot claim generation commit without a session');
      const claimed = await db.claimGenerationCommit(canonicalSessionId, activeGenerationId);
      if (!claimed) {
        throw new db.GenerationStateConflictError(
          `Generation ${activeGenerationId} was cancelled or superseded before commit`,
        );
      }
      commitOwnershipClaimed = true;
    };

    try {
      if (!providedGenerationId) {
        const now = new Date();
        const admitted = await db.setActiveGeneration(canonicalSessionId, userId, {
          id: activeGenerationId,
          type: 'chat',
          status: 'running',
          startedAt: now,
          updatedAt: now,
        });
        if (!admitted) throw new Error('Could not acquire generation ownership');
      }

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
        terminalFailureMessage = 'Chat limit reached. Please upgrade your plan.';
        await emitEvent('done', { sessionId: canonicalSessionId, quota });
        return;
      }

      // Persist user message (skipped for silent auto-starter drafts so the triggering prompt
      // never shows as a user bubble — on first render or on reload. Usage is still recorded.)
      if (session) {
        if (!isSilent) {
          await db.appendChatMessage(canonicalSessionId, 'user', prompt, threadId);
        }
        await db.recordChatUsage(userId, canonicalSessionId, chatLimit.planName);
      }

      // Blueprint initialization — skip intent classification, run full draft pipeline per artifact
      if (Array.isArray(providedBlueprintArtifacts) && providedBlueprintArtifacts.length > 0) {
        await db.updateGenerationState(canonicalSessionId, activeGenerationId, {
          type: 'script_generate',
          intent: 'blueprint',
          message: 'Generating blueprint documents',
        });
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
            await claimCommitOwnership();
            const saveResult = await applyCommand({
              type: 'ReplaceDocument',
              sessionId: canonicalSessionId,
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
            }, userId, orgId);

            if (!saveResult.ok) {
              if (!(await emitEvent('token', { content: `Failed to save "${title}": ${saveResult.error}\n` }))) return;
              continue;
            }

            commitPersisted = true;
            createdDocs.push({ scriptId: newScriptId, title: draft.title || title, documentType: docType });
            await emitEvent('script_created', { scriptId: newScriptId, title: draft.title || title, documentType: docType });
            if (!(await emitEvent('token', { content: `\n✓ ${draft.title || title}\n` }))) return;

            // Deduct credits per document (P3.1: routed to the wallet resolved at work-start —
            // an org-context blueprint bills the org wallet, flag off bills personal as before)
            try {
              const { CreditsService } = await import('@/lib/services/creditsService');
              await CreditsService.deductForWallet(billingWallet, 'thinkforge', 'document_creation');
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
          await db.appendChatMessage(canonicalSessionId, 'assistant', `Blueprint initialized: ${createdDocs.map(d => d.title).join(', ')}`, threadId);
        }

        await emitEvent('progress', { progress: 1, message: 'Blueprint complete' });
        await emitEvent('done', { sessionId: canonicalSessionId });
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
              usedFallback: false
            };
          }
        } else if (isMatch(prompt, REJECT_PATTERNS)) {
          finalResponse = "Understood. I've cancelled that suggestion. What would you like to do instead?";
          if (!(await emitEvent('token', { content: finalResponse }))) return;
          if (!(await emitEvent('done', { sessionId: canonicalSessionId }))) return;
          if (session) await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
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
            if (!(await emitEvent('done', { sessionId: canonicalSessionId }))) return;
            if (session) await db.appendChatMessage(canonicalSessionId, 'assistant', clarification, threadId);
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
        if (!(await emitEvent('done', { sessionId: canonicalSessionId }))) return;
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
        if (!(await emitEvent('done', { sessionId: canonicalSessionId }))) return;
        if (session) {
          await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
        }
        return;
      }

      const wantsFullRegenerate = detectFullRegenerate(effectivePrompt);
      const isGenerateIntent = intentResult.intent === 'draft';
      const shouldRunGeneration = isGenerateIntent || (hasExistingScript && wantsFullRegenerate);
      const shouldRunEdit = intentResult.intent === 'edit' || intentResult.intent === 'hybrid';
      const documentIntentOrigin = providedIntentContext?.lastUserAction === 'initial_draft_claim'
        ? 'initial_draft_claim'
        : 'user_request';
      const requestedDocumentIntent = shouldRunGeneration
        ? resolveThinkForgeGenerationDocumentIntent(
            effectivePrompt,
            sessionState.metadata.format,
            documentIntentOrigin,
            sessionState.metadata.contentContract,
          )
        : null;
      const requestedDocumentLabel = requestedDocumentIntent?.documentLabel ?? 'document';
      const eventSessionId = canonicalSessionId;

      const isCanvasEmpty = (() => {
        if (!script) return true;
        const hasBlocks = Array.isArray((script as any)?.blocks) && (script as any).blocks.length > 0;
        const hasRichText = (script as any)?.richText && Array.isArray((script as any).richText?.content) && (script as any).richText.content.length > 0;
        const hasContent = typeof (script as any)?.content === 'string' && (script as any).content.trim().length > 0;
        return !(hasBlocks || hasRichText || hasContent);
      })();

      if (isGenerateIntent) {
        if (!requestedDocumentIntent) {
          throw new Error('ThinkForge generation requires an authoritative document contract');
        }
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
          const initialTitle = requestedDocumentIntent.contentPath === 'post' ? 'New Post' : 'New Script';
          effectiveScriptId = newScriptId;
          await emitEvent('script_created', {
            scriptId: newScriptId,
            sessionId: eventSessionId,
            title: initialTitle,
            documentType: requestedDocumentIntent.documentType,
          });
        }
      }

      if (shouldRunGeneration || shouldRunEdit) {
        const generationType = shouldRunGeneration ? 'script_generate' : 'script_edit';
        const updatedGeneration = await db.updateGenerationState(canonicalSessionId, activeGenerationId, {
          type: generationType,
          scriptId: effectiveScriptId || undefined,
          intent: shouldRunGeneration ? 'draft' : 'edit',
        });
        if (!updatedGeneration) throw new Error('Generation ownership was lost before execution');
      }
      if ((shouldRunGeneration || shouldRunEdit) && !effectiveScriptId) {
        finalResponse = `No active ${requestedDocumentLabel}. Create a new ${requestedDocumentLabel} first, then generate.`;
        if (!(await emitEvent('token', { content: finalResponse }))) return;
        if (!(await emitEvent('done', { sessionId: canonicalSessionId }))) return;
        return;
      }
      if (shouldRunEdit && hasExistingScript && !wantsFullRegenerate) {
        const canonicalSelection = resolveCanonicalEditSelection({
          blocks: thinkforgeBlocks,
          targetBlockIds: blockIds,
          requestedSelection: selection,
        });
        await claimCommitOwnership();
        const revised = await reviseDocumentViaFlatWriter({
          userId,
          orgId,
          sessionId: canonicalSessionId,
          scriptId: effectiveScriptId!,
          instruction: effectivePrompt,
          selection: canonicalSelection,
        });
        commitPersisted = true;

        const revisedBlocks = validateThinkForgeBlocks(revised.blocks ?? []);
        const revisedRichText = revised.richText ?? thinkForgeBlocksToTiptapJSON(revisedBlocks);
        if (!(await emitEvent('script_update', {
          script: {
            scriptId: effectiveScriptId,
            sessionId: eventSessionId,
            title: revised.title,
            blocks: revisedBlocks,
            richText: revisedRichText,
            content: revised.content,
            version: revised.version,
            documentType: revised.documentType,
            contentContract: revised.contentContract,
          },
          metadata: {
            workflow: 'edit',
            source: 'ai',
            scriptId: effectiveScriptId,
            sessionId: eventSessionId,
            thoughts: 'Document revised through its canonical writer',
            duration_ms: 0,
            agent_steps: [],
          },
        }))) return;

        finalResponse = canonicalSelection
          ? 'Update applied to the selected content.'
          : 'Update applied to the document.';
        if (!(await emitEvent('token', { content: finalResponse }))) return;

        if (session) {
          await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
        }
      } else if (shouldRunGeneration) {
        // Generate a new document from scratch
        // Keep the working state transient. Chat tokens are durable user-facing content.
        const workingMsg = `Creating your ${requestedDocumentLabel}...`;
        if (!(await emitEvent('progress', { progress: 0, message: workingMsg }))) return;

        // Run Thinking Agent before draft ONLY for video scripts or explicit doc types
        if (!requestedDocumentIntent) {
          throw new Error('ThinkForge generation requires an authoritative document contract');
        }
        const documentIntent = requestedDocumentIntent;
        const contentPath = documentIntent.contentPath;
        const generatedDocumentType = documentIntent.documentType;
        const authoringPrompt = resolveThinkForgeAuthoringPrompt(
          effectivePrompt,
          sessionState.metadata,
          documentIntentOrigin === 'initial_draft_claim',
        );
        
        // FEATURE FLAG: Only run Thinking Agent for scripts, skip for posts to reduce latency
        if (contentPath !== 'post') {
          try {
            const thinking = await runThinkingAgent({
              userPrompt: authoringPrompt,
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

        await db.updateGenerationState(canonicalSessionId, activeGenerationId, {
          type: 'script_generate',
          scriptId: effectiveScriptId || undefined,
          progress: 0.01,
          message: 'Starting content generation',
        });
        if (!(await emitEvent('progress', { progress: 0.01, message: 'Starting content generation' }))) return;

        let finalTitle = contentPath === 'post' ? 'New Post' : 'New Script';
        let finalContent = '';
        let finalBlocks: ThinkForgeBlock[] = [];
        let finalRichText: TiptapJSON = { type: 'doc', content: [] } as any;
        let signalTrace: any = undefined;
        let writerOutputMetadata: Record<string, any> | undefined;
        const authoringContextSnapshot = authoringContext?.snapshot
          ?? buildThinkForgeAuthoringContextSnapshot({
            orgId: session.orgId ?? null,
            retrievedContext: retrievedCtx,
            writingKnowledgeVersion: getWritingKnowledgeVersion(),
          });

        const resolvedSignalProfile = resolveContentSignalProfile({
          userPrompt: authoringPrompt,
          documentType: documentIntent.documentType,
          contentContract: documentIntent.contract,
          brandId: sessionState.metadata.brandId,
          sessionId: sessionState.sessionId,
          retrievedContext: retrievedCtx || undefined,
        });
        let groundedSystemBrief = [systemBrief, formatContentSignalProfileForPrompt(resolvedSignalProfile)]
          .filter(Boolean)
          .join('\n\n');
        signalTrace = buildThinkForgeSignalTrace(resolvedSignalProfile);
        let trendContextMetadata: Record<string, any> | undefined;
        let castingContextMetadata: ThinkForgeCastingMetadata | undefined;
        let promptUnderstanding: Awaited<ReturnType<typeof resolveScriptPromptUnderstanding>> | undefined;

        const hasCompletedSelectedTrend = sessionState.metadata.selectedTrend?.analysis?.status === 'completed';
        if (!hasCompletedSelectedTrend) {
          try {
            const trendContext = await resolveThinkForgeTrendContext({
              userPrompt: authoringPrompt,
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
        }

        if (contentPath !== 'post') {
          promptUnderstanding = await resolveScriptPromptUnderstanding(authoringPrompt);
        }

        let briefSnapshot = resolveThinkForgeProductionBrief({
          userPrompt: authoringPrompt,
          project: sessionState.metadata,
          requested: promptUnderstanding?.requested,
          documentType: generatedDocumentType,
          contentPath,
          brandId: sessionState.metadata.brandId,
        });
        if (contentPath !== 'post') {
          const castingResolution = await resolveThinkForgeAvatarCasting({
            brief: briefSnapshot,
            project: sessionState.metadata,
            userId,
            orgId: session.orgId ?? null,
            brandId: sessionState.metadata.brandId,
            castingIntent: promptUnderstanding?.castingIntent,
          });
          briefSnapshot = castingResolution.brief;
          if (castingResolution.metadata.status !== 'not_requested') {
            castingContextMetadata = castingResolution.metadata;
          }
        }

        try {
          const sourceLedger = buildThinkForgeSourceLedger({
            userPrompt: authoringPrompt,
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
            userPrompt: authoringPrompt,
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
              hashtags: result.hashtags,
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
              ...(castingContextMetadata ? { castingContext: castingContextMetadata } : {}),
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
          await claimCommitOwnership();
          const baseVersion = resolveThinkForgeCommitBaseVersion(commitBaseline, effectiveScriptId!);
          const saveResult = await applyCommand({
            type: 'ReplaceDocument',
            sessionId: canonicalSessionId,
            baseVersion,
            source: 'ai',
            payload: {
              scriptId: effectiveScriptId,
              title: finalTitle,
              content: finalContent,
              blocks: finalBlocks,
              richText: finalRichText as any,
              documentType: generatedDocumentType,
              contentContract: documentIntent.contract,
              metadata: {
                workflow: 'create',
                source: 'ai',
                documentType: generatedDocumentType,
                authoringContextSnapshot,
                ...(signalTrace ? { signalTrace } : {}),
                ...(briefSnapshot ? { briefSnapshot } : {}),
                ...(writerOutputMetadata ? { writerOutput: writerOutputMetadata } : {}),
              },
            }
          }, userId, orgId);
          if (!saveResult.ok) {
            throw new Error(saveResult.error);
          }
          savedVersion = saveResult.script.version;
          commitPersisted = true;

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
            contentContract: documentIntent.contract,
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

        // Send completion response
        const completionLabel = contentPath === 'post' ? 'Post' : 'Script';
        finalResponse = `${completionLabel} "${finalTitle}" created successfully!`;
        if (!(await emitEvent('token', { content: finalResponse }))) return;

        // Persist assistant message
        if (session) {
          await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
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
            await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
          }

          // Auto-save research to DataBank (with verified sources)
          try {
            await persistGroundedResearchMemory({
              principal: { userId, orgId },
              sessionId: canonicalSessionId,
              query: prompt,
              response: researchResult.text,
              verifiedSources: researchResult.sources,
            });
          } catch (dbErr) {
            console.error(
              '[ThinkForge] Failed to save governed research memory:',
              dbErr instanceof Error ? dbErr.message : 'unknown_error',
            );
          }
        } catch (researchErr: any) {
          console.error('[ResearchAgent] Failed:', researchErr);
          const errorMsg = '\n\nSorry, the research search encountered an error. Please try again.';
          if (!(await emitEvent('token', { content: errorMsg }))) return;
          finalResponse += errorMsg;
          if (session) {
            await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
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
          await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId);
        }
      }

      // Send done event (only if stream is still open)
      if (!isStreamClosed) {
        await emitEvent('done', { sessionId: canonicalSessionId });
      }
    } catch (error: any) {
      const isAbortError = error?.name === 'InvalidStateError' ||
        error?.code === 'ERR_INVALID_STATE' ||
        error?.message?.includes('WritableStream is closed') ||
        error?.message?.includes('ResponseAborted');
      const wasAborted = isAbortError || isStreamClosed;
      const terminalStatus = commitPersisted
        ? 'completed'
        : wasAborted
          ? 'cancelled'
          : 'failed';
      generationTerminalized = true;

      if (session) {
        try {
          await db.updateGenerationState(canonicalSessionId, activeGenerationId, {
            status: terminalStatus,
            scriptId: effectiveScriptId || undefined,
            progress: terminalStatus === 'completed' ? 1 : undefined,
            message: commitPersisted
              ? 'Content saved before the response ended'
              : error?.message || (wasAborted ? 'Generation cancelled' : 'Generation failed'),
          });
        } catch (lifecycleError) {
          if (!(lifecycleError instanceof db.GenerationStateConflictError)) {
            console.error('[ThinkForge] Failed to settle generation after stream error:', lifecycleError);
          }
        }
      }

      if (wasAborted) return;
      console.error('Error in chat stream:', error);
      await emitEvent('error', { error: error.message || 'Chat failed' });
    } finally {
      if (session && !generationTerminalized) {
        const terminalStatus = terminalFailureMessage
          ? 'failed'
          : commitPersisted || !isStreamClosed
            ? 'completed'
            : 'cancelled';
        try {
          await db.updateGenerationState(canonicalSessionId, activeGenerationId, {
            status: terminalStatus,
            scriptId: effectiveScriptId || undefined,
            progress: terminalStatus === 'completed' ? 1 : undefined,
            message: terminalFailureMessage
              || (terminalStatus === 'completed' ? 'Request completed' : 'Generation cancelled'),
          });
        } catch (lifecycleError) {
          if (!(lifecycleError instanceof db.GenerationStateConflictError)) {
            console.error('[ThinkForge] Failed to finalize generation lifecycle:', lifecycleError);
          }
        }
        generationTerminalized = true;
      }

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
