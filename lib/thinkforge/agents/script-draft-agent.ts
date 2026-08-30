/**
 * Script Draft Orchestrator
 *
 * Multi-stage pipeline (Manual mode default):
 * 1) Outline (gemini-2.5-flash-lite) hierarchical with knowledge layers
 * 2) Section expansion: gemini-2.5-flash only (no preview)
 * 3) No full-document coherence rewrite; optional validator only
 * 4) Assembly into ThinkForge blocks only (no canonical/text fallbacks)
 */

import type { AgentInput } from './types';
import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptOutlineAgent, type ScriptOutline } from './script-outline-agent';
import type { SectionOutput } from './script-section-agent';
import { ScriptContractAgent, type NarrativeContract } from './script-contract-agent';
import { ScriptAuthorAgent, type ScriptAuthorInput } from './script-author-agent';
import type { AgentConfig } from './base-agent';
import { quickAssembleContext, type RetrievedContext } from '../context';
import type { SessionState } from '../state/types';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import { scoreContent } from '../data/quality-scorer';
import { StylistAgent } from './stylist-agent';
import {
  evaluateContentProfileCompliance,
  buildThinkForgeSignalTrace,
  formatContentProfileComplianceViolations,
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
  shouldAutoRepairContentProfileViolations,
  type ThinkForgeSignalTrace,
} from '../signals';
import {
  applyContentSignalProfileToClickatronExportMeta,
  appendClickatronCreativeSidecarInstruction,
  attachClickatronCreativeExportMeta,
  extractRequiredClickatronCreativeSidecar,
  shouldRequestClickatronCreativeSidecar,
  stripClickatronCreativeSidecarText,
} from '../utils/clickatron-creative-sidecar';

function compactOutline(outline: ScriptOutline): ScriptOutline {
  const capped = outline.sections.slice(0, 5);
  return { ...outline, sections: capped };
}

export interface ScriptDraftResult {
  title: string;
  blocks: ThinkForgeBlock[];
  richText?: TiptapJSON; // Tiptap JSON AST
  content: string;
  draft: boolean;
  outline: ScriptOutline;
  sections: SectionOutput[];
  status?: 'ok' | 'error';
  reason?: string;
  qualityScore?: number;
  qualityViolations?: string[];
  stylistFlags?: string[];
  signalTrace?: ThinkForgeSignalTrace;
}

export interface ScriptDraftCallbacks {
  onProgress?: (info: { progress: number; message?: string; completed?: number; total?: number; sectionId?: string }) => void | Promise<void>;
  onPartial?: (partial: { title: string; blocks: ThinkForgeBlock[]; richText: TiptapJSON; content: string; completed: number; total: number }) => void | Promise<void>;
}

export class ScriptDraftAgent {
  private outlineAgent: ScriptOutlineAgent;
  private contractAgent: ScriptContractAgent;
  private authorAgent: ScriptAuthorAgent;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    this.outlineAgent = new ScriptOutlineAgent({
      maxTokens: config?.maxTokens ?? 500,
      temperature: 0.5,
    });
    this.contractAgent = new ScriptContractAgent({
      maxTokens: 400,
      temperature: 0.4,
    });
    this.authorAgent = new ScriptAuthorAgent({
      maxTokens: 2600,
      temperature: 0.7,
    });
  }

  private applyAbortSignal(signal?: AbortSignal) {
    this.outlineAgent.setAbortSignal(signal);
    this.contractAgent.setAbortSignal(signal);
    this.authorAgent.setAbortSignal(signal);
  }

  async generateScript(input: AgentInput, abortSignal?: AbortSignal, callbacks?: ScriptDraftCallbacks): Promise<ScriptDraftResult> {
    this.applyAbortSignal(abortSignal);
    const generationMode = input.generationMode ?? 'manual';
    const modeAwareInput: AgentInput = { ...input, generationMode };
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: modeAwareInput.userPrompt,
      project: modeAwareInput.project,
      context: modeAwareInput.context,
      documentType: modeAwareInput.project?.format,
      platform: modeAwareInput.project?.platform,
      brandId: modeAwareInput.brandId ?? modeAwareInput.project?.brandId,
      sessionId: modeAwareInput.sessionId,
      retrievedContext: modeAwareInput.retrievedContext,
    });
    const signalProfileBlock = formatContentSignalProfileForPrompt(contentSignalProfile);
    const signalAwareInput: AgentInput = {
      ...modeAwareInput,
      context: {
        ...modeAwareInput.context,
        systemBrief: [modeAwareInput.context.systemBrief, signalProfileBlock]
          .filter(Boolean)
          .join('\n\n'),
      },
    };
    const shouldAuthorClickatronCreative = shouldRequestClickatronCreativeSidecar(modeAwareInput, contentSignalProfile);
    const authorInput = shouldAuthorClickatronCreative
      ? appendClickatronCreativeSidecarInstruction(modeAwareInput, contentSignalProfile)
      : modeAwareInput;

    if (callbacks?.onProgress) {
      await callbacks.onProgress({ progress: 0.02, message: 'Analyzing brief' });
    }

    const contract = await this.contractAgent.generateContract(signalAwareInput, {
      maxTokens: 400,
      temperature: 0.2,
    });

    if (callbacks?.onProgress) {
      await callbacks.onProgress({ progress: 0.1, message: 'Building outline' });
    }

    const outlineRaw = await this.outlineAgent.generateOutline(signalAwareInput, {
      maxTokens: 500,
      temperature: 0.2,
    });

    const outline = compactOutline(outlineRaw);

    if (callbacks?.onProgress) {
      await callbacks.onProgress({ progress: 0.2, message: 'Authoring full draft' });
    }

    const authorRunInput: ScriptAuthorInput = {
      ...authorInput,
      outline,
      contract,
      contentSignalProfile,
    };

    const { stream } = await this.authorAgent.run(authorRunInput);

    let markdown = '';
    let lastEmitLen = 0;
    for await (const chunk of stream) {
      markdown += chunk;

      if (callbacks?.onPartial) {
        const delta = markdown.length - lastEmitLen;
        const hasBoundary = /\n\n|\n##\s|\n###\s/.test(chunk);
        if (delta >= 800 || hasBoundary) {
          lastEmitLen = markdown.length;
          const partialContent = stripClickatronCreativeSidecarText(markdown);
          const parsedBlocks = parseMarkdownToBlocks(partialContent);
          const partialBlocks = validateThinkForgeBlocks(
            parsedBlocks.length > 0
              ? parsedBlocks
              : [
                  {
                    id: ensureThinkForgeBlockId(),
                    kind: 'paragraph',
                    content: normalizeThinkForgeRichText([{ type: 'text', text: partialContent, styles: {} }]),
                  },
                ]
          );
          const partialRichText = thinkForgeBlocksToTiptapJSON(partialBlocks);
          await callbacks.onPartial({
            title: outline.title,
            blocks: partialBlocks,
            richText: partialRichText,
            content: partialContent,
            completed: 0,
            total: 1,
          });
        }
      }
    }

    const clickatronExtraction = shouldAuthorClickatronCreative
      ? extractRequiredClickatronCreativeSidecar(markdown)
      : { visibleMarkdown: stripClickatronCreativeSidecarText(markdown), exportMeta: undefined };
    let clickatronExportMeta = clickatronExtraction.exportMeta;
    if (clickatronExportMeta) {
      clickatronExportMeta = applyContentSignalProfileToClickatronExportMeta(
        clickatronExportMeta,
        modeAwareInput,
        contentSignalProfile,
      );
    }
    let clickatronStaleReason: string | undefined;
    const visibleMarkdown = clickatronExtraction.visibleMarkdown;
    const parsedBlocks = parseMarkdownToBlocks(visibleMarkdown);
    let blocks = validateThinkForgeBlocks(
      parsedBlocks.length > 0
        ? parsedBlocks
        : [
            {
              id: ensureThinkForgeBlockId(),
              kind: 'paragraph',
              content: normalizeThinkForgeRichText([{ type: 'text', text: visibleMarkdown, styles: {} }]),
            },
          ]
    );
    let content = visibleMarkdown.trim();

    // ─── Post-generation: Quality Scoring + Stylist Review ────────
    let qualityScore = 100;
    let qualityViolations: string[] = [];
    let shouldRunStylistReview = false;
    try {
      const score = scoreContent(content);
      qualityScore = score.score;
      qualityViolations = score.violations.map(v => v.message);
      shouldRunStylistReview = score.score < 90;
      const profileCompliance = evaluateContentProfileCompliance(content, contentSignalProfile);
      if (profileCompliance.violations.length > 0) {
        const shouldRepairProfile = shouldAutoRepairContentProfileViolations(profileCompliance.violations);
        qualityScore = Math.min(qualityScore, profileCompliance.score);
        shouldRunStylistReview = shouldRunStylistReview || shouldRepairProfile;
        qualityViolations = [
          ...qualityViolations,
          ...formatContentProfileComplianceViolations(profileCompliance.violations),
        ];
        console.log(`[ThinkForge:ProfileCompliance] Score: ${profileCompliance.score}/100. Violations: ${profileCompliance.violations.map(v => v.id).join(', ')}`);
      }
      if (score.violations.length > 0) {
        console.log(`[ThinkForge:Quality] Score: ${score.score}/100 (${score.status}). Violations: ${score.violations.map(v => v.constraintId).join(', ')}`);
      }
    } catch (e) {
      console.error('[ThinkForge:Quality] Scoring failed:', e);
    }

    let stylistFlags: string[] = [];
    if (shouldRunStylistReview) {
      try {
        if (callbacks?.onProgress) {
          await callbacks.onProgress({ progress: 0.9, message: 'Reviewing voice quality' });
        }
        const stylist = new StylistAgent();
        const review = await stylist.checkVoice({
          context: signalAwareInput.context,
          brandId: signalAwareInput.brandId ?? signalAwareInput.project?.brandId,
          sessionId: signalAwareInput.sessionId,
          userPrompt: content,
        });
        stylistFlags = review.flags.filter(f => f.severity === 'high').map(f => `${f.issue}: ${f.suggestion}`);
        console.log(`[ThinkForge:Stylist] Score: ${review.overallScore}/100. Flags: ${review.flags.length} (${stylistFlags.length} high).`);

        // V2: Auto-rewrite flagged sections
        if (qualityViolations.length > 0 || stylistFlags.length > 0) {
          if (callbacks?.onProgress) {
            await callbacks.onProgress({ progress: 0.95, message: 'Rewriting flagged sections' });
          }
          const rewritten = await stylist.rewriteFlagged({
            content,
            violations: qualityViolations,
            flags: stylistFlags,
            brandContext: signalAwareInput.context.systemBrief,
            brandId: signalAwareInput.brandId ?? signalAwareInput.project?.brandId,
            sessionId: signalAwareInput.sessionId,
          });
          if (rewritten) {
            const newScore = scoreContent(rewritten);
            const newProfileCompliance = evaluateContentProfileCompliance(rewritten, contentSignalProfile);
            const combinedRewriteScore = Math.min(newScore.score, newProfileCompliance.score);
            if (combinedRewriteScore > qualityScore) {
              console.log(`[ThinkForge:Stylist] Rewrite improved quality: ${qualityScore} → ${combinedRewriteScore}`);
              content = rewritten;
              const newParsed = parseMarkdownToBlocks(rewritten);
              blocks = validateThinkForgeBlocks(
                newParsed.length > 0
                  ? newParsed
                  : [{ id: ensureThinkForgeBlockId(), kind: 'paragraph', content: normalizeThinkForgeRichText([{ type: 'text', text: rewritten, styles: {} }]) }]
              );
              if (clickatronExportMeta) {
                clickatronStaleReason = 'source_content_rewritten_by_stylist';
              }
              qualityScore = combinedRewriteScore;
              qualityViolations = [
                ...newScore.violations.map(v => v.message),
                ...formatContentProfileComplianceViolations(newProfileCompliance.violations),
              ];
            } else {
              console.log(`[ThinkForge:Stylist] Rewrite did not improve (${qualityScore} → ${combinedRewriteScore}), keeping original`);
            }
          }
        }
      } catch (e) {
        console.error('[ThinkForge:Stylist] Review failed:', e);
      }
    }

    if (clickatronExportMeta) {
      blocks = attachClickatronCreativeExportMeta(blocks, clickatronExportMeta, { staleReason: clickatronStaleReason });
    }

    // Convert to Tiptap JSON AST
    const richText = thinkForgeBlocksToTiptapJSON(blocks);

    if (callbacks?.onPartial) {
      await callbacks.onPartial({
        title: outline.title,
        blocks,
        richText,
        content,
        completed: 1,
        total: 1,
      });
    }

    return {
      status: 'ok',
      title: outline.title,
      blocks,
      richText,
      content,
      draft: true,
      outline,
      sections: [],
      qualityScore,
      qualityViolations,
      stylistFlags,
      signalTrace: buildThinkForgeSignalTrace(contentSignalProfile),
    };
  }
}

export function createScriptDraftAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptDraftAgent {
  return new ScriptDraftAgent(config);
}

// Backwards-compatible helper used by chat-service
export async function generateScriptDraft(
  instruction: string,
  sessionState: SessionState,
  existingScript?: { blocks?: ThinkForgeBlock[]; content?: string; title?: string } | null,
  abortSignal?: AbortSignal,
  callbacks?: ScriptDraftCallbacks,
  systemBrief?: string | null,
  retrievedContext?: RetrievedContext | null,
): Promise<ScriptDraftResult> {
  const context = quickAssembleContext(
    'script_draft',
    sessionState.metadata,
    existingScript ? { title: existingScript.title, content: existingScript.content } : null,
    sessionState.chat,
    null,
    systemBrief
  );

  const agent = createScriptDraftAgent();
  return agent.generateScript({
    context,
    project: sessionState.metadata,
    sessionId: sessionState.sessionId,
    brandId: sessionState.metadata.brandId,
    retrievedContext,
    userPrompt: instruction,
  }, abortSignal, callbacks);
}

