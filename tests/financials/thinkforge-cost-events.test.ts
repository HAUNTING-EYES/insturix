import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function sliceHelper(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('ThinkForge provider cost telemetry contract', () => {
  it('records BaseAgent streaming attempts as ThinkForge LLM provider spend', () => {
    const source = readRepoFile('lib/thinkforge/agents/base-agent.ts');

    expect(source).toContain('recordThinkForgeAgentCost({');
    expect(source).toContain("service: 'thinkforge'");
    expect(source).toContain("action: 'agent_generation'");
    expect(source).toContain("route: 'lib/thinkforge/agents/base-agent.run'");
    expect(source).toContain("operation: 'llm_stream'");
    expect(source).toContain('projectId: input.sourceInput?.brandId');
    expect(source).toContain('taskId: input.sourceInput?.sessionId');
    expect(source).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');
  });

  it('records structured output and manual JSON fallback attempts', () => {
    const source = readRepoFile('lib/thinkforge/agents/base-agent.ts');

    expect(source).toContain("route: 'lib/thinkforge/agents/base-agent.runStructured'");
    expect(source.match(/operation: 'llm_structured'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source.match(/operation: 'llm_structured_fallback'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source).toContain('outputChars: safeJsonLength(result.object)');
    expect(source).toContain('const fallbackUsage = await readAiSdkUsage((fallback as { usage?: unknown }).usage)');
    expect(source).toContain("fallback: 'manual_json'");
  });

  it('keeps BaseAgent provider-cost metadata free of prompts, outputs, URLs, and error messages', () => {
    const source = readRepoFile('lib/thinkforge/agents/base-agent.ts');
    const helper = sliceHelper(source, 'async function recordThinkForgeAgentCost', 'async function readAiSdkUsage');

    expect(helper).not.toContain('prompt:');
    expect(helper).not.toContain('fullText');
    expect(helper).not.toContain('jsonText');
    expect(helper).not.toContain('currentScript');
    expect(helper).not.toContain('chatHistory');
    expect(helper).not.toContain('transcript');
    expect(helper).not.toContain('content:');
    expect(helper).not.toContain('url:');
    expect(helper).not.toContain('apiKey');
    expect(helper).not.toContain('error.message');
  });

  it('records Gemini writing-context cache creation, cached generation, and inline generation', () => {
    const source = readRepoFile('lib/thinkforge/services/gemini-writing-context-cache.ts');

    expect(source).toContain('recordThinkForgeWritingContextCost({');
    expect(source).toContain("service: 'thinkforge'");
    expect(source).toContain("action: 'writing_context_cache'");
    expect(source).toContain("route: 'lib/thinkforge/services/gemini-writing-context-cache'");
    expect(source).toContain("provider: 'gemini'");
    expect(source).toContain("operation: 'context_cache_create'");
    expect(source).toContain("operation: 'llm_completion_cached_context'");
    expect(source).toContain("operation: 'llm_completion_inline_context'");
    expect(source).toContain('usage: readGeminiUsage(result)');
    expect(source).toContain('systemInstructionChars: systemInstruction.length');
    expect(source).toContain('userInputChars: input.prompt.length');
  });

  it('keeps writing-context provider-cost metadata free of prompt and cached document payloads', () => {
    const source = readRepoFile('lib/thinkforge/services/gemini-writing-context-cache.ts');
    const helper = sliceHelper(source, 'async function recordThinkForgeWritingContextCost', 'function readGeminiUsage');

    expect(helper).not.toContain('input.prompt');
    expect(helper).not.toContain('prompt:');
    expect(helper).not.toContain('docText');
    expect(helper).not.toContain('creative_content_knowledge');
    expect(helper).not.toContain('contents');
    expect(helper).not.toContain('body:');
    expect(helper).not.toContain('url:');
    expect(helper).not.toContain('apiKey');
  });

  it('records direct ThinkForge route calls outside BaseAgent', () => {
    const enhance = readRepoFile('app/api/services/thinkforge/enhance/route.ts');
    const observer = readRepoFile('lib/thinkforge/events/observer-job.ts');

    expect(enhance).toContain('recordThinkForgeDirectCost({');
    expect(enhance).toContain("action: 'prompt_enhance'");
    expect(enhance).toContain("route: 'app/api/services/thinkforge/enhance'");
    expect(enhance).toContain("operation: 'llm_stream_direct'");
    expect(enhance).toContain('usage: await readAiSdkUsage(usage)');
    expect(enhance).toContain("sourceKind: 'prompt_panel_enhance'");

    expect(observer).toContain('recordThinkForgeDirectCost({');
    expect(observer).toContain("action: 'observer_extraction'");
    expect(observer).toContain("route: 'app/api/internal/workers/thinkforge/observer'");
    expect(observer).toContain("operation: 'llm_structured_direct'");
    expect(observer).toContain('usage = await readAiSdkUsage((generated as { usage?: unknown }).usage)');
    expect(observer).toContain('outputChars: safeJsonLength(object)');
    expect(observer).toContain('resultCount: object.facts.length');
  });

  it('records direct ThinkForge generateText helpers outside BaseAgent', () => {
    const intentClassifier = readRepoFile('lib/thinkforge/protocol/intent-classifier.ts');
    const fillerRepair = readRepoFile('lib/thinkforge/services/ai-filler-repair.ts');
    const thinkingAgent = readRepoFile('lib/thinkforge/agents/thinking-agent.ts');

    expect(intentClassifier).toContain('recordThinkForgeDirectCost({');
    expect(intentClassifier).toContain("action: 'intent_classification'");
    expect(intentClassifier).toContain("route: 'lib/thinkforge/protocol/intent-classifier'");
    expect(intentClassifier).toContain("sourceKind: 'edit_blocks_intent_classifier'");
    expect(intentClassifier).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');

    expect(fillerRepair).toContain('recordThinkForgeDirectCost({');
    expect(fillerRepair).toContain("action: 'filler_repair'");
    expect(fillerRepair).toContain("route: 'lib/thinkforge/services/ai-filler-repair'");
    expect(fillerRepair).toContain("sourceKind: 'post_generation_filler_repair'");
    expect(fillerRepair).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');

    expect(thinkingAgent).toContain('recordThinkForgeDirectCost({');
    expect(thinkingAgent).toContain("action: 'thinking_agent'");
    expect(thinkingAgent).toContain("route: 'lib/thinkforge/agents/thinking-agent'");
    expect(thinkingAgent).toContain("sourceKind: 'pre_generation_reasoning'");
    expect(thinkingAgent).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');
  });

  it('records direct ThinkForge fallback and compression helpers outside BaseAgent', () => {
    const intentGate = readRepoFile('lib/thinkforge/intent/intent-gate.ts');
    const stylistAgent = readRepoFile('lib/thinkforge/agents/stylist-agent.ts');
    const postMortemAgent = readRepoFile('lib/thinkforge/agents/post-mortem-agent.ts');

    expect(intentGate).toContain('recordThinkForgeDirectCost({');
    expect(intentGate).toContain('action: "intent_gate_fallback"');
    expect(intentGate).toContain('route: "lib/thinkforge/intent/intent-gate"');
    expect(intentGate).toContain('sourceKind: "intent_gate_llm_fallback"');
    expect(intentGate).toContain('usage: await readAiSdkUsage((aiResult as { usage?: unknown }).usage)');

    expect(stylistAgent).toContain('recordThinkForgeDirectCost({');
    expect(stylistAgent).toContain("action: 'stylist_rewrite'");
    expect(stylistAgent).toContain("route: 'lib/thinkforge/agents/stylist-agent.rewriteFlagged'");
    expect(stylistAgent).toContain("sourceKind: 'stylist_targeted_rewrite'");
    expect(stylistAgent).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');

    expect(postMortemAgent).toContain('recordThinkForgeDirectCost({');
    expect(postMortemAgent).toContain("action: 'post_mortem_compression'");
    expect(postMortemAgent).toContain("route: 'lib/thinkforge/agents/post-mortem-agent'");
    expect(postMortemAgent).toContain("operation: 'llm_structured_direct'");
    expect(postMortemAgent).toContain('outputChars: safeJsonLength(object)');
    expect(postMortemAgent).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');
  });

  it('records ThinkForge search-grounded research provider spend outside BaseAgent', () => {
    const researchAgent = readRepoFile('lib/thinkforge/agents/research-agent.ts');
    const telemetry = readRepoFile('lib/thinkforge/services/provider-cost-telemetry.ts');

    expect(telemetry).toContain("'llm_search_grounded_direct'");
    expect(researchAgent).toContain('recordThinkForgeDirectCost({');
    expect(researchAgent).toContain("action: 'research_grounded_search'");
    expect(researchAgent).toContain("route: 'lib/thinkforge/agents/research-agent.runResearchAgent'");
    expect(researchAgent).toContain("operation: 'llm_search_grounded_direct'");
    expect(researchAgent).toContain("sourceKind: 'gemini_search_grounded_research'");
    expect(researchAgent).toContain('resultCount: sources.length');
    expect(researchAgent).toContain('usage: await readAiSdkUsage((result as { usage?: unknown }).usage)');
  });

  it('keeps direct ThinkForge provider-cost helper metadata free of prompts, outputs, and content', () => {
    const source = readRepoFile('lib/thinkforge/services/provider-cost-telemetry.ts');
    const helper = sliceHelper(source, 'export async function recordThinkForgeDirectCost', 'export async function readAiSdkUsage');

    expect(helper).toContain("service: 'thinkforge'");
    expect(helper).toContain('inputTokens');
    expect(helper).toContain('outputTokens');
    expect(helper).not.toContain('prompt:');
    expect(helper).not.toContain('text:');
    expect(helper).not.toContain('content:');
    expect(helper).not.toContain('body:');
    expect(helper).not.toContain('url:');
    expect(helper).not.toContain('apiKey');
    expect(helper).not.toContain('error.message');
  });

  it('documents the partial T6 ThinkForge telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: ThinkForge BaseAgent, writing-context cache, prompt-enhance, observer, intent-classifier, filler-repair, thinking-agent, intent-gate fallback, stylist rewrite, post-mortem compression, and search-grounded research provider events are wired');
    expect(plan).toContain('Gemini/OpenRouter-style ThinkForge token pricing and Gemini search-grounding pricing remain `pricing_to_be_seen` until exact model-rate tables are seeded');
  });
});
