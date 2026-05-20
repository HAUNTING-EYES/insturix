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

  try {
    const model = createModelByTier(ModelTier.Structural);
    const result = await generateText({
      model,
      prompt,
      temperature: 0.3,
      maxTokens: 200,
    });

    const text = (result.text || '').trim();
    if (!text) return '';

    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    return lines.join('\n');
  } catch (err) {
    console.warn('[ThinkingAgent] Failed (non-blocking):', err);
    return '';
  }
}
