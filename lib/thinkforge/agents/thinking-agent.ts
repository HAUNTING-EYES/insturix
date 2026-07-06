/**
 * Thinking Agent - Pre-generation reasoning display
 *
 * Runs before script generation to produce 3-6 concise reasoning bullets
 * shown in the chat UI. Uses the cheapest model tier (Structural).
 *
 * Non-streaming, fast (~1-2s), purely for user transparency.
 */

import { generateText } from 'ai';
import { createModelByTier, ModelTier } from './model-factory';
import { readAiSdkUsage, recordThinkForgeDirectCost } from '../services/provider-cost-telemetry';

export interface ThinkingInput {
  userPrompt: string;
  projectSummary?: string;
  documentType?: string;
  documentTitle?: string;
}

export async function runThinkingAgent(input: ThinkingInput): Promise<string> {
  const { userPrompt, projectSummary, documentType, documentTitle } = input;

  const contextBlock = projectSummary
    ? `Project: ${projectSummary}`
    : '';

  const docBlock = documentType
    ? `Document type: ${documentType}${documentTitle ? ` — "${documentTitle}"` : ''}`
    : '';

  // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
  const prompt = `<role>You are a creative strategist preparing to write a document.</role>
<task>Output 3-6 SHORT reasoning bullets describing your approach to the request below.</task>
<rules>Each bullet starts with "•". No preamble, no summary, no numbering — only bullets.</rules>
${contextBlock}
${docBlock}
<input_data>Request: ${userPrompt}</input_data>`;

  const modelName = 'gemini-2.5-flash';
  const startedAt = Date.now();

  try {
    const model = createModelByTier(ModelTier.Structural);
    const result = await generateText({
      model,
      prompt,
      temperature: 0.3,
      // @ts-ignore
      maxTokens: 200,
    });
    await recordThinkForgeDirectCost({
      status: 'success',
      action: 'thinking_agent',
      route: 'lib/thinkforge/agents/thinking-agent',
      provider: 'gemini',
      modelName,
      operation: 'llm_text_direct',
      promptChars: prompt.length,
      outputChars: result.text?.length,
      functionMs: Date.now() - startedAt,
      usage: await readAiSdkUsage((result as { usage?: unknown }).usage),
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      temperature: 0.3,
      maxTokens: 200,
      sourceKind: 'pre_generation_reasoning',
    });

    const text = (result.text || '').trim();
    if (!text) return '';

    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    return lines.join('\n');
  } catch (err) {
    await recordThinkForgeDirectCost({
      status: 'failed',
      action: 'thinking_agent',
      route: 'lib/thinkforge/agents/thinking-agent',
      provider: 'gemini',
      modelName,
      operation: 'llm_text_direct',
      promptChars: prompt.length,
      functionMs: Date.now() - startedAt,
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      temperature: 0.3,
      maxTokens: 200,
      sourceKind: 'pre_generation_reasoning',
      error: err,
    });
    console.warn('[ThinkingAgent] Failed (non-blocking):', err);
    return '';
  }
}
