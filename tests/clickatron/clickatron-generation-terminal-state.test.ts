import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisHarness = vi.hoisted(() => ({
  values: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
  sortedSets: new Map<string, Map<string, number>>(),
  evalReturnsParsedObject: false,
}));

vi.mock('@upstash/redis', () => {
  class Redis {
    async get(key: string) {
      return redisHarness.values.get(key) ?? null;
    }

    async set(key: string, value: string, options?: { nx?: boolean }) {
      if (options?.nx && redisHarness.values.has(key)) return null;
      redisHarness.values.set(key, value);
      return 'OK';
    }

    async eval(script: string, keys: string[], args: Array<string | number>) {
      if (script.includes('current ~= ARGV[1]')) {
        if (redisHarness.values.get(keys[0]) !== args[0]) return 0;
        redisHarness.values.set(keys[0], String(args[1]));
        return 1;
      }
      if (script.includes('redis.call("DEL", KEYS[1])')) {
        if (redisHarness.values.get(keys[0]) !== args[0]) return 0;
        return redisHarness.values.delete(keys[0]) ? 1 : 0;
      }

      const raw = redisHarness.values.get(keys[0]);
      if (!raw) {
        const result = { outcome: 'missing' };
        return redisHarness.evalReturnsParsedObject ? result : JSON.stringify(result);
      }
      const job = JSON.parse(raw);
      const allowed = JSON.parse(String(args[0])) as string[];
      if (!allowed.includes(job.status)) {
        const result = { outcome: 'rejected', job };
        return redisHarness.evalReturnsParsedObject ? result : JSON.stringify(result);
      }

      const updates = JSON.parse(String(args[1]));
      const updatedJob = {
        ...job,
        ...updates,
        updatedAt: Number(args[2]),
        trace: [
          ...(job.trace ?? []),
          {
            timestamp: Number(args[2]),
            stage: updates.stage ?? job.stage,
            progress: updates.progress ?? job.progress,
            message: String(args[4]),
          },
        ],
      };
      redisHarness.values.set(keys[0], JSON.stringify(updatedJob));
      if (['completed', 'failed', 'canceled'].includes(updatedJob.status)) {
        redisHarness.sortedSets.get(keys[1])?.delete(updatedJob.id);
      }
      const result = { outcome: 'updated', job: updatedJob };
      return redisHarness.evalReturnsParsedObject ? result : JSON.stringify(result);
    }

    multi() {
      const operations: Array<() => void> = [];
      const chain = {
        set: (key: string, value: string) => {
          operations.push(() => redisHarness.values.set(key, value));
          return chain;
        },
        sadd: (key: string, value: string) => {
          operations.push(() => {
            const members = redisHarness.sets.get(key) ?? new Set<string>();
            members.add(value);
            redisHarness.sets.set(key, members);
          });
          return chain;
        },
        expire: () => chain,
        zadd: (key: string, entry: { member: string; score: number }) => {
          operations.push(() => {
            const members = redisHarness.sortedSets.get(key) ?? new Map<string, number>();
            members.set(entry.member, entry.score);
            redisHarness.sortedSets.set(key, members);
          });
          return chain;
        },
        exec: async () => {
          operations.forEach((operation) => operation());
          return [];
        },
      };
      return chain;
    }
  }

  return { Redis };
});

import {
  claimIdempotencyKey,
  claimJobForExecution,
  commitIdempotencyKey,
  completeJob,
  createJob,
  failJob,
  failQueuedJob,
  getJob,
  getJobCreditTransaction,
  recordJobCreditTransaction,
} from '@/lib/clickatron-jobs';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Clickatron generation terminal-state contract', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    redisHarness.values.clear();
    redisHarness.sets.clear();
    redisHarness.sortedSets.clear();
    redisHarness.evalReturnsParsedObject = false;
  });

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

  it('claims a queued job exactly once under concurrent delivery', async () => {
    const jobId = await createJob({
      sessionId: 'session-1',
      variationId: 'variation-1',
      prompt: 'Generate a branded launch image',
      userId: 'user-1',
      modelId: 'fal-ai/imagen4/preview',
      aspectRatio: '1:1',
    });

    const claims = await Promise.all([
      claimJobForExecution(jobId, 'generating'),
      claimJobForExecution(jobId, 'generating'),
    ]);

    expect(claims.filter((claim) => claim.outcome === 'updated')).toHaveLength(1);
    expect(claims.filter((claim) => claim.outcome === 'rejected')).toHaveLength(1);
    expect((await getJob(jobId))?.status).toBe('running');
  });

  it('accepts Redis Lua results already decoded by the Upstash SDK', async () => {
    redisHarness.evalReturnsParsedObject = true;
    const jobId = await createJob({
      sessionId: 'session-decoded',
      variationId: 'variation-decoded',
      prompt: 'Generate one smoke-test image',
      userId: 'user-1',
      aspectRatio: '1:1',
    });

    const claim = await claimJobForExecution(jobId, 'generating');

    expect(claim.outcome).toBe('updated');
    expect(claim.job?.status).toBe('running');
  });

  it('does not refund-cancel a job after a worker has claimed it', async () => {
    const jobId = await createJob({
      sessionId: 'session-2',
      variationId: 'variation-2',
      prompt: 'Generate carousel slide two',
      userId: 'user-1',
      aspectRatio: '1:1',
    });

    expect((await claimJobForExecution(jobId)).outcome).toBe('updated');
    const dispatchFailure = await failQueuedJob(jobId, {
      code: 'QUEUE_DISPATCH_FAILED',
      message: 'Publisher acknowledgement timed out',
    });

    expect(dispatchFailure.outcome).toBe('rejected');
    expect(dispatchFailure.job?.status).toBe('running');
  });

  it('never resurrects or refunds a completed job', async () => {
    const jobId = await createJob({
      sessionId: 'session-3',
      variationId: 'variation-3',
      prompt: 'Generate a campaign image',
      userId: 'user-1',
      aspectRatio: '1:1',
    });

    await claimJobForExecution(jobId);
    await completeJob(jobId, 'r2://asset');
    const failed = await failJob(jobId, {
      code: 'LATE_FAILURE',
      message: 'Late bookkeeping failure',
    });

    expect(failed).toBeNull();
    expect((await getJob(jobId))?.status).toBe('completed');
  });

  it('carries the exact debit transaction into the claimed job', async () => {
    const jobId = await createJob({
      sessionId: 'session-4',
      variationId: 'variation-4',
      prompt: 'Generate a product visual',
      userId: 'user-1',
      aspectRatio: '1:1',
    });

    await recordJobCreditTransaction(jobId, 'txn_exact', 3);
    const claim = await claimJobForExecution(jobId);

    expect(claim.outcome).toBe('updated');
    expect(getJobCreditTransaction(claim.job!)).toEqual({
      transactionId: 'txn_exact',
      chargedCredits: 3,
    });
  });

  it('deduplicates per-job debits inside the atomic wallet update', () => {
    const credits = readRepoFile('lib/services/creditsService.ts');
    const sessionRoute = readRepoFile('app/api/services/clickatron/session/route.ts');

    expect(credits).toContain("'metadata.idempotencyKey': idempotencyKey");
    expect(credits).toContain("$not: {");
    expect(credits).toContain('const concurrentUser = await User.findOne({ clerkUserId });');
    expect(credits).toContain('duplicate: true');
    expect(sessionRoute).toContain('idempotencyKey: `clickatron:job:${jobId}:charge`');
    expect(sessionRoute).toContain('originalTransactionId: charge.transactionId');
  });

  it('atomically claims and commits a request idempotency key', async () => {
    const claims = await Promise.all([
      claimIdempotencyKey('user-1:request-1', 'token-a'),
      claimIdempotencyKey('user-1:request-1', 'token-b'),
    ]);
    const winner = claims.find((claim) => claim.outcome === 'claimed');

    expect(claims.filter((claim) => claim.outcome === 'claimed')).toHaveLength(1);
    expect(claims.filter((claim) => claim.outcome === 'existing')).toHaveLength(1);
    expect(winner).toBeDefined();
    expect(await commitIdempotencyKey(
      'user-1:request-1',
      winner!.value.replace('pending:', ''),
      'session-committed',
    )).toBe(true);
    expect(redisHarness.values.get('clickatron:idempotency:user-1:request-1')).toBe('session-committed');
  });

  it('does not let an unauthenticated variation request alter a queued job or refund', () => {
    const worker = readRepoFile('app/api/internal/workers/clickatron/variation/route.ts');

    expect(worker).toContain('async function markVariationFailedForJob');
    expect(worker).toContain('const claim = await claimJobForExecution');
    expect(worker).toContain("export const POST = withInternalQStashWorkerAuth(handler, 'clickatron-variation');");
    expect(worker).not.toContain('failQueuedJob');
    expect(worker).not.toContain('SIGNATURE_VERIFICATION_FAILED');
    expect(worker).toContain('await refundClaimedJob(');
    expect(worker).toContain('originalTransactionId: ledger.transactionId');
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
