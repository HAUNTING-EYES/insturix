import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Alyzitron chat provider cost telemetry contract', () => {
  it('records Gemini chat completion provider spend after final credit true-up', () => {
    const route = readRepoFile('app/api/services/alyzitron/chat/route.ts');

    expect(route).toContain('recordAlyzitronChatProviderCost({');
    expect(route).toContain('operation: "chat_completion"');
    expect(route).toContain('route: "/api/services/alyzitron/chat"');
    expect(route).toContain('provider: ALYZITRON_CHAT_PROVIDER');
    expect(route).toContain('model: ALYZITRON_CHAT_MODEL');
    expect(route).toContain('chargedCredits: creditsConsumed');
    expect(route).toContain('creditTransactionId: initialDeduct.transactionId');
    expect(route).toContain('additionalCreditTransactionId: additionalTransactionId');
    expect(route).toContain('chatProviderStarted = true');
    expect(route).toContain('if (chatProviderStarted)');
  });

  it('records Gemini summarization spend separately without fake charged credits', () => {
    const route = readRepoFile('app/api/services/alyzitron/chat/route.ts');
    const summarizeCall = route.slice(
      route.indexOf('operation: "chat_summarization"'),
      route.indexOf('throw summaryErr;')
    );

    expect(route).toContain('operation: "chat_summarization"');
    expect(route).toContain('summaryMessageCount: toSummarize.length');
    expect(route).toContain('inputTokens: summaryInputTokens');
    expect(summarizeCall).not.toContain('chargedCredits');
    expect(summarizeCall).not.toContain('creditTransactionId');
  });

  it('keeps Alyzitron chat provider-cost metadata free of prompts, responses, and analysis payloads', () => {
    const route = readRepoFile('app/api/services/alyzitron/chat/route.ts');
    const helper = route.slice(route.indexOf('async function recordAlyzitronChatProviderCost'));

    expect(helper).not.toContain('userMessage');
    expect(helper).not.toContain('content:');
    expect(helper).not.toContain('fullAssistantResponse');
    expect(helper).not.toContain('videoAnalysis');
    expect(helper).not.toContain('formattedTranscript');
    expect(helper).not.toContain('transcription');
    expect(helper).not.toContain('videoTitle');
  });

  it('documents the partial T6 Alyzitron chat telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-04: Alyzitron chat Gemini provider events are wired');
    expect(plan).toContain('Gemini chat pricing remains `pricing_to_be_seen`');
  });
});