import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('clickatron provider cost telemetry contract', () => {
  it('records idempotent Fal image-generation cost events from the variation worker', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');

    expect(worker).toContain("import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events'");
    expect(worker).toContain('recordClickatronFalProviderCost({');
    expect(worker).toContain("provider: 'fal-ai'");
    expect(worker).toContain("operation: 'image_generation'");
    expect(worker).toContain('idempotencyKey: `clickatron:variation:${job.id}:fal:${status}`');
    expect(worker).toContain('providerJobId: getFalProviderJobId(result)');
    expect(worker).toContain('imageCount: getFalImageCount(result)');
  });

  it('records R2 storage bytes without duplicating charged-credit revenue', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');
    const storageStart = worker.indexOf('async function recordClickatronR2StorageCost');
    expect(storageStart).toBeGreaterThan(0);
    const storageHelper = worker.slice(storageStart, worker.indexOf('async function handler'));

    expect(storageHelper).toContain("provider: 'cloudflare-r2'");
    expect(storageHelper).toContain("operation: 'storage'");
    expect(storageHelper).toContain('storageBytes: imageBytes + thumbnailBytes');
    expect(storageHelper).toContain('requestCount: 2');
    expect(storageHelper).not.toContain('chargedCredits');
  });

  it('records Fal success only after the job completes and failed Fal attempts only when a call was attempted', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');

    expect(worker).toContain('falCallAttempted = true');
    expect(worker).toContain('falResult = result');
    expect(worker).toContain('await completeJob(jobId, rawR2Url);');
    expect(worker).toContain('falCostRecorded = true');
    expect(worker).toContain('if (falCallAttempted && !falCostRecorded)');
  });

  it('does not persist raw prompts or media URLs in provider-cost helper metadata', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');
    const helperStart = worker.indexOf('async function recordClickatronFalProviderCost');
    expect(helperStart).toBeGreaterThan(0);
    const helpers = worker.slice(helperStart, worker.indexOf('async function handler'));

    expect(helpers).not.toContain('prompt');
    expect(helpers).not.toContain('imageUrl');
    expect(helpers).not.toContain('generatedImageUrl');
    expect(helpers).not.toContain('rawR2Url');
    expect(helpers).not.toContain('thumbnailR2Url');
  });

  it('marks T3 complete in the provider-cost telemetry plan', () => {
    const plan = readRepoFile('docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md');

    expect(plan).toContain('- [x] T3 (P1) - Clickatron - Record Fal image generation COGS and R2 storage bytes.');
  });
});