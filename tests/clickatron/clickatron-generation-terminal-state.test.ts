import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Clickatron generation terminal-state contract', () => {
  it('bounds frontend variation polling and marks timed-out polls as failed locally', () => {
    const poller = readRepoFile('lib/frontend/services/clickatron.ts');
    const canvasStage = readRepoFile('components/dashboard/Clickatron/stages/CanvasStage.tsx');

    expect(poller).toContain('DEFAULT_VARIATION_POLL_TIMEOUT_MS = 12 * 60 * 1000');
    expect(poller).toContain('Image generation timed out after');
    expect(canvasStage).toContain('pollingVariationIdsRef');
    expect(canvasStage).toContain('markVariationPollingFailed');
    expect(canvasStage).toContain('status: "failed"');
    expect(canvasStage).toContain('updatedAt: new Date()');
  });

  it('mirrors worker signature failures to the visible Mongo variation without duplicate refunds', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');

    expect(worker).toContain('async function markVariationFailedForJob');
    expect(worker).toContain("variation.status = 'failed'");
    expect(worker).toContain("variation.error = errorMessage");
    expect(worker).toContain("const shouldRefund = Boolean(job && !['completed', 'failed', 'canceled'].includes(job.status));");
    expect(worker).toContain('Worker: Signature failure saw already-terminal job, skipping duplicate refund');
  });

  it('bounds QStash enqueue so handoff creation cannot wait indefinitely on publishJSON', () => {
    const qtask = readRepoFile('lib/clickatron-qtask.ts');

    expect(qtask).toContain('CLICKATRON_QSTASH_ENQUEUE_TIMEOUT_MS = 15_000');
    expect(qtask).toContain('QSTASH_TOKEN is not configured; cannot enqueue Clickatron generation job');
    expect(qtask).toContain('await withTimeout(');
    expect(qtask).toContain('qstashClient.publishJSON({');
  });

  it('keeps the stuck-variation watchdog reachable from Vercel Cron', () => {
    const cron = readRepoFile('app/api/cron/check-task-timeouts/route.ts');

    expect(cron).toContain("const isVercelCron = userAgent.includes('vercel-cron')");
    expect(cron).toContain('const hasValidSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)');
    expect(cron).toContain('if (!isVercelCron && !hasValidSecret)');
    expect(cron).toContain("$elemMatch: { status: 'generating', updatedAt: { $lt: variationStuckTimeout } }");
  });
});
