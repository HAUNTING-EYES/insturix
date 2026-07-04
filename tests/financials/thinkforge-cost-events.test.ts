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

  it('documents the partial T6 ThinkForge telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: ThinkForge BaseAgent and writing-context cache provider events are wired');
    expect(plan).toContain('Gemini/OpenRouter-style ThinkForge token pricing remains `pricing_to_be_seen` until exact model-rate tables are seeded');
  });
});
