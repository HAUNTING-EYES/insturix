import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Alyzitron analysis provider cost telemetry contract', () => {
  it('persists the video-analysis credit transaction and charged credits on the queued task', () => {
    const route = readRepoFile('app/api/services/alyzitron/analyze/route.ts');

    expect(route).toContain("const analysisChargedCredits = getCreditCost('alyzitron', 'video_analysis'");
    expect(route).toContain('const analysisDeduct = await creditCheck.deduct();');
    expect(route).toContain('billing: {');
    expect(route).toContain("service: 'alyzitron'");
    expect(route).toContain("action: 'video_analysis'");
    expect(route).toContain('creditTransactionId: analysisDeduct.transactionId');
    expect(route).toContain('chargedCredits: analysisChargedCredits');
  });

  it('records Gemini analysis provider spend from the processor only after final completion for revenue', () => {
    const processor = readRepoFile('app/api/services/alyzitron/processor/route.ts');

    expect(processor).toContain('recordAlyzitronGeminiAnalysisCost({');
    expect(processor).toContain('operation: ALYZITRON_ANALYSIS_OPERATION');
    expect(processor).toContain('provider: ALYZITRON_ANALYSIS_PROVIDER');
    expect(processor).toContain('chargedCredits: status === "success" ? analysisChargedCredits : undefined');
    expect(processor).toContain('await recordPendingGeminiAnalysisCost("success");');
    expect(processor).toContain('await recordPendingGeminiAnalysisCost("failed", parseError);');
    expect(processor).toContain('originalTransactionId: analysisCreditTransactionId');
  });

  it('keeps Gemini analysis provider-cost metadata free of prompts, media URLs, and transcripts', () => {
    const processor = readRepoFile('app/api/services/alyzitron/processor/route.ts');
    const helperStart = processor.indexOf('async function recordAlyzitronGeminiAnalysisCost');
    const helperEnd = processor.indexOf('async function handler');
    const helper = processor.slice(helperStart, helperEnd);

    expect(helper).not.toContain('videoUrl');
    expect(helper).not.toContain('mediaUri');
    expect(helper).not.toContain('fileUri');
    expect(helper).not.toContain('audioUri');
    expect(helper).not.toContain('prompt');
    expect(helper).not.toContain('transcript');
    expect(helper).not.toContain('content:');
    expect(helper).not.toContain('analysisContext');
  });

  it('documents the partial T6 Alyzitron analysis telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-04: Alyzitron Gemini video-analysis provider events are wired');
    expect(plan).toContain('Gemini video-analysis pricing remains `pricing_to_be_seen`');
  });
});