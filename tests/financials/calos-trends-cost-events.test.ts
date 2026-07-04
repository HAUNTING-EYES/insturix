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

describe('CalOS provider cost telemetry contract', () => {
  it('records Gemini planner attempts as CalOS AI plan spend', () => {
    const source = readRepoFile('lib/calos/planner/index.ts');

    expect(source).toContain('recordCalosPlannerCost(input, {');
    expect(source).toContain('service: "calos"');
    expect(source).toContain('action: "ai_plan"');
    expect(source).toContain('route: "lib/calos/planner"');
    expect(source).toContain('provider: "gemini"');
    expect(source).toContain('operation: "ai_plan"');
    expect(source).toContain('usage: readGeminiUsage(result)');
    expect(source).toContain('slotCount: input.slots.length');
    expect(source).toContain('trendCount: input.trends.length');
  });

  it('records Apify trend actor attempts as provider spend', () => {
    const source = readRepoFile('lib/calos/trends/apify.ts');

    expect(source).toContain('recordApifyTrendsCost(query, {');
    expect(source).toContain('route: "lib/calos/trends/apify"');
    expect(source).toContain('provider: "apify"');
    expect(source).toContain('model: "actor-run"');
    expect(source).toContain('operation: "actor_run"');
    expect(source).toContain('projectId: query.brandId');
    expect(source).toContain('requestCount: 1');
  });

  it('records Perplexity Sonar trend attempts with token usage when available', () => {
    const source = readRepoFile('lib/calos/trends/perplexity.ts');

    expect(source).toContain('recordPerplexityTrendsCost(query, {');
    expect(source).toContain('route: "lib/calos/trends/perplexity"');
    expect(source).toContain('provider: "perplexity"');
    expect(source).toContain('operation: "trend_search"');
    expect(source).toContain('inputTokens: readNumber(input.usage?.prompt_tokens ?? input.usage?.promptTokens)');
    expect(source).toContain('outputTokens: readNumber(input.usage?.completion_tokens ?? input.usage?.completionTokens)');
    expect(source).toContain('totalTokens: readNumber(input.usage?.total_tokens ?? input.usage?.totalTokens)');
  });

  it('records Gemini grounded trend attempts with usage metadata when available', () => {
    const source = readRepoFile('lib/calos/trends/gemini.ts');

    expect(source).toContain('recordGeminiTrendsCost(query, {');
    expect(source).toContain('route: "lib/calos/trends/gemini"');
    expect(source).toContain('provider: "gemini"');
    expect(source).toContain('operation: "trend_search_grounded"');
    expect(source).toContain('usage: readGeminiUsage(result)');
    expect(source).toContain('groundingEnabled: true');
  });

  it('keeps CalOS trends provider-cost metadata free of prompts, queries, URLs, credentials, and payload bodies', () => {
    const apifySource = readRepoFile('lib/calos/trends/apify.ts');
    const perplexitySource = readRepoFile('lib/calos/trends/perplexity.ts');
    const geminiSource = readRepoFile('lib/calos/trends/gemini.ts');
    const plannerSource = readRepoFile('lib/calos/planner/index.ts');
    const helpers = [
      sliceHelper(apifySource, 'async function recordApifyTrendsCost', 'function byteLength'),
      sliceHelper(perplexitySource, 'async function recordPerplexityTrendsCost', 'function buildPrompt'),
      sliceHelper(geminiSource, 'async function recordGeminiTrendsCost', 'interface GeminiUsage'),
      sliceHelper(plannerSource, 'async function recordCalosPlannerCost', 'function readGeminiUsage'),
    ].join('\n');

    expect(helpers).not.toContain('niche');
    expect(helpers).not.toContain('keyword');
    expect(helpers).not.toContain('search:');
    expect(helpers).not.toContain('authorization');
    expect(helpers).not.toContain('apiKey');
    expect(helpers).not.toContain('accessToken');
    expect(helpers).not.toContain('refreshToken');
    expect(helpers).not.toContain('sourceUrl');
    expect(helpers).not.toContain('messages:');
    expect(helpers).not.toContain('prompt:');
    expect(helpers).not.toContain('brandContext:');
    expect(helpers).not.toContain('theme:');
    expect(helpers).not.toContain('goal:');
    expect(helpers).not.toContain('body:');
  });

  it('documents the partial T6 CalOS trends telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-05: CalOS planner and trends provider events are wired');
    expect(plan).toContain('Apify, Perplexity Sonar, and Gemini grounded-search pricing remain `pricing_to_be_seen`');
  });
});
