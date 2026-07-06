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

  it('records Apify media extraction attempts before downstream analysis without fake revenue', () => {
    const extractor = readRepoFile('lib/alyzitron/extraction/apify.ts');

    expect(extractor).toContain('recordAlyzitronApifyExtractionCost({');
    expect(extractor).toContain('service: "alyzitron"');
    expect(extractor).toContain('action: "media_extraction"');
    expect(extractor).toContain('route: "lib/alyzitron/extraction/apify"');
    expect(extractor).toContain('provider: "apify"');
    expect(extractor).toContain('operation: "actor_run"');
    expect(extractor).toContain('requestCount: input.requestCount');
    expect(extractor).toContain('pollCount: input.pollCount');
    expect(extractor).toContain('if (providerCallStarted)');

    const helper = extractor.slice(extractor.indexOf('async function recordAlyzitronApifyExtractionCost'));
    expect(helper).not.toContain('chargedCredits');
    expect(helper).not.toContain('token');
    expect(helper).not.toContain('cleanUrl');
    expect(helper).not.toContain('downloadUrl');
    expect(helper).not.toContain('audioUrl');
    expect(helper).not.toContain('requestBody');
    expect(helper).not.toContain('input,');
    expect(helper).not.toContain('items');
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

  it('records Gemini File API upload and polling provider spend without attaching analysis revenue', () => {
    const processor = readRepoFile('app/api/services/alyzitron/processor/route.ts');
    const helper = readRepoFile('lib/services/geminiFileService.ts');

    expect(processor).toContain('const geminiFileCostContext = {');
    expect(processor).toContain('uploadUrlToGeminiFileAPI(downloadUrl, updatedMimeType, `task-${taskId}`, geminiFileCostContext)');
    expect(processor).toContain('uploadUrlToGeminiFileAPI(extracted.downloadUrl, updatedMimeType, `task-${taskId}-video`, geminiFileCostContext)');
    expect(helper).toContain('recordGeminiFileProviderCost({');
    expect(helper).toContain('provider: "gemini-file-api"');
    expect(helper).toContain('model: "files-api"');
    expect(helper).toContain('operation: "file_upload"');
    expect(helper).toContain('requestCount: 1 + input.pollCount');
    expect(helper).toContain('bytesIn: input.bytesIn');
    expect(helper).not.toContain('chargedCredits');
  });

  it('keeps Gemini File API provider-cost metadata free of media URLs, temp paths, and file URIs', () => {
    const helper = readRepoFile('lib/services/geminiFileService.ts');
    const helperBody = helper.slice(helper.indexOf('async function recordGeminiFileProviderCost'));

    expect(helperBody).not.toContain('url');
    expect(helperBody).not.toContain('tempFilePath');
    expect(helperBody).not.toContain('fileUri');
    expect(helperBody).not.toContain('uri');
    expect(helperBody).not.toContain('path');
  });
  it('documents the partial T6 Alyzitron analysis telemetry slice in the provider-cost plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('Partial 2026-07-04: Alyzitron Gemini video-analysis provider events are wired');
    expect(plan).toContain('Gemini video-analysis pricing remains `pricing_to_be_seen`');
    expect(plan).toContain('Gemini File API upload/poll provider events are wired');
    expect(plan).toContain('Alyzitron Apify media extraction provider events are wired');
  });
});