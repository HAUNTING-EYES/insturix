import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('pipeline video provider cost telemetry contract', () => {
  it('carries the credit transaction and per-job charged credits from enqueue to worker payloads', () => {
    const route = readRepoFile('app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts');

    expect(route).toContain('const creditTransactionId = deductResult.transactionId');
    expect(route).toContain("getCreditCost('pipeline', 'video_generation'");
    expect(route).toContain('chargedCreditsForJob(s.durationSeconds)');
    expect(route).toContain('chargedCreditsForJob(scene.durationSeconds)');
    expect(route).toContain('billableVideoSeconds');
  });

  it('records idempotent success and failure provider events in the video worker', () => {
    const worker = readRepoFile('app/api/internal/workers/pipeline/video/route.ts');

    expect(worker).toContain("import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events'");
    expect(worker).toContain('recordPipelineVideoProviderCost({');
    expect(worker).toContain("status: 'success'");
    expect(worker).toContain("status: 'failed'");
    expect(worker).toContain('idempotencyKey: `pipeline:video:${payload.jobId}:${status}`');
    expect(worker).toContain("route: '/api/internal/workers/pipeline/video'");
    expect(worker).toContain("operation: 'video_generation'");
    expect(worker).toContain('providerJobId: result?.providerJobId');
    expect(worker).toContain('creditTransactionId');
    expect(worker).toContain('chargedCredits');
    expect(worker).toContain('let providerCostRecorded = false');
    expect(worker).toContain('providerCostRecorded = true');
    expect(worker).toContain('if (!providerCostRecorded)');
  });

  it('does not persist raw prompts or signed media URLs in provider cost metadata', () => {
    const worker = readRepoFile('app/api/internal/workers/pipeline/video/route.ts');
    const helperStart = worker.indexOf('async function recordPipelineVideoProviderCost');
    expect(helperStart).toBeGreaterThan(0);
    const helper = worker.slice(helperStart);

    expect(helper).not.toContain('motionPrompt');
    expect(helper).not.toContain('imageUrl');
    expect(helper).not.toContain('videoUrl');
  });

  it('exposes typed provider model and job identifiers for reconciliation', () => {
    const provider = readRepoFile('lib/pipeline/video-generation-service.ts');

    expect(provider).toContain('modelUsed?: string');
    expect(provider).toContain('providerJobId?: string');
    expect(provider).toContain('modelUsed: modelKey');
    expect(provider).toContain('result?.request_id');
    expect(provider).toContain('providerJobId: taskId');
  });
});