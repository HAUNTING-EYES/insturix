import { readFileSync } from 'node:fs';
import type { Collection } from 'mongodb';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildThinkForgeEditorialPlan } from '@/lib/thinkforge/agents/editorial-plan';
import { buildThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger';
import { createThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
const persistence = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  claimGenerationCommit: vi.fn(),
  getActiveGeneration: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: persistence.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  claimGenerationCommit: persistence.claimGenerationCommit,
  getActiveGeneration: persistence.getActiveGeneration,
  getSession: persistence.getSession,
  getScript: persistence.getScript,
}));

import {
  LongFormScriptGenerationJobStore,
  LongFormScriptJobLeaseLostError,
  type ClaimLongFormScriptJobResult,
  type LongFormScriptGenerationJobInput,
  type LongFormScriptGenerationJobRecord,
  type LongFormScriptGenerationJobSnapshot,
} from '@/lib/thinkforge/long-form/script-generation-job-store';
import {
  handoffChapteredScriptGenerationIfRequired,
  processLongFormScriptJob,
  type LongFormScriptGenerationHandoffInput,
  type LongFormScriptJobDependencies,
} from '@/lib/thinkforge/long-form/script-generation-job';
import {
  LongFormScriptNonRetryableError,
  executeLongFormScriptAction,
} from '@/lib/thinkforge/long-form/script-generation-execution';

function job(overrides: Partial<LongFormScriptGenerationJobSnapshot> = {}): LongFormScriptGenerationJobSnapshot {
  return {
    id: 'longscript_ab12',
    version: 1,
    dedupeKey: 'd'.repeat(64),
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    generationId: 'generation_1',
    input: {} as LongFormScriptGenerationJobSnapshot['input'],
    status: 'running',
    stage: 'planning',
    dispatchCount: 1,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: '2026-08-20T12:08:00.000Z',
    queueMessageId: null,
    plan: null,
    planHash: null,
    chapterArtifacts: {},
    chapterArtifactHashes: {},
    assembledResult: null,
    assembledResultHash: null,
    commitReceipt: null,
    error: null,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    expiresAt: '2026-08-22T12:00:00.000Z',
    ...overrides,
  };
}

function dependencies(claim: ClaimLongFormScriptJobResult): Required<LongFormScriptJobDependencies> {
  return {
    store: {
      createOrGet: vi.fn(),
      claim: vi.fn().mockResolvedValue(claim),
      heartbeat: vi.fn().mockResolvedValue(undefined),
      savePlan: vi.fn().mockResolvedValue(undefined),
      saveChapterArtifact: vi.fn().mockResolvedValue(undefined),
      saveAssembledResult: vi.fn().mockResolvedValue(undefined),
      saveCommitReceipt: vi.fn().mockResolvedValue(undefined),
      yieldLease: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      retryOrDeadLetter: vi.fn().mockResolvedValue('queued'),
      setQueueMessage: vi.fn(),
      listRecoverable: vi.fn(),
    },
    execute: vi.fn(),
    dispatch: vi.fn().mockResolvedValue('message_1'),
  };
}

function handoffInput(authoringContext: LongFormScriptGenerationHandoffInput['authoringContext'] = {
  projectMeta: { brandId: 'brand_1' },
  retrievedContext: { projectFacts: [], globalFacts: [], semanticFacts: [], interactionPatterns: [] } as never,
  systemBrief: 'Grounded Brand Vault and trend context.',
  snapshot: { profile: { recordId: 'profile_1', revision: 4, checksum: 'c'.repeat(64) } } as never,
}): LongFormScriptGenerationHandoffInput {
  const targetDurationSec = 36_000;
  const userPrompt = 'Write a ten-hour sourced documentary.';
  const authoringRequest = createThinkForgeAuthoringRequest({
    contentContract: createThinkForgeWriterContract('video_script'),
    platformSurface: { id: 'youtube' },
    publishingSurface: 'youtube_video',
    targetDurationSec,
  });
  const productionBrief: ProductionBrief = {
    entryPoint: 'thinkforge',
    output: {
      format: 'reel',
      platform: 'youtube',
      aspectRatio: '16:9',
      targetDurationSec,
      count: 1,
      voiceLanguages: ['en'],
    },
    resolution: { fieldConfidence: {}, inferred: [], confirmed: [] },
  };
  const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });
  const editorialPlan = buildThinkForgeEditorialPlan({
    userPrompt,
    authoringRequest,
    productionBrief,
    sourceLedgerEntryIds: sourceLedger.entries.map((entry) => entry.referenceId),
  });
  if (editorialPlan.writerKind !== 'script') throw new Error('Expected a script editorial plan fixture.');
  return {
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    generationId: 'generation_1',
    scriptId: 'script_1',
    baseVersion: 0,
    authoringContext,
    writerInput: {
      context: {
        projectSummary: 'A complete feature documentary.',
        systemBrief: 'Grounded Brand Vault and trend context.',
      },
      userPrompt,
      authoringRequest,
      editorialPlan,
      productionBrief,
      sourceLedger,
    },
    signalTrace: { outputFormat: 'video_script', goal: 'documentary', angle: 'evidence-led' } as never,
    contextMetadata: {
      trendContext: { trendId: 'trend_1' },
      castingContext: { status: 'resolved' },
    },
  };
}

describe('processLongFormScriptJob', () => {
  it('checkpoints one action, releases its lease, and dispatches the next action', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_1' });
    const plan = { title: 'Master plan' } as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>;
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan });

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'queued', reason: 'next_action',
    });
    expect(deps.store.savePlan).toHaveBeenCalledWith(claimedJob.id, 'lease_1', plan);
    expect(deps.store.yieldLease).toHaveBeenCalledWith(claimedJob.id, 'lease_1');
    expect(deps.dispatch).toHaveBeenCalledWith(claimedJob.id);
    expect(deps.store.complete).not.toHaveBeenCalled();
  });

  it('completes atomically after the durable commit receipt without another dispatch', async () => {
    const claimedJob = job({
      plan: { acts: [] } as unknown as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>,
      assembledResult: {} as NonNullable<LongFormScriptGenerationJobSnapshot['assembledResult']>,
      stage: 'committing',
    });
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_2' });
    const receipt = {
      documentVersion: 4,
      contentHash: 'a'.repeat(64),
      committedAt: '2026-08-20T12:01:00.000Z',
    };
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'commit', receipt });

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({ status: 'completed' });
    expect(deps.store.saveCommitReceipt).toHaveBeenCalledWith(claimedJob.id, 'lease_2', receipt);
    expect(deps.store.complete).toHaveBeenCalledWith(claimedJob.id, 'lease_2');
    expect(deps.store.yieldLease).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('dead-letters deterministic failures instead of repeatedly spending model credits', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_3' });
    vi.mocked(deps.execute).mockRejectedValue(new LongFormScriptNonRetryableError('version conflict'));
    vi.mocked(deps.store.retryOrDeadLetter).mockResolvedValue('dead_letter');

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'dead_letter', error: 'version conflict',
    });
    expect(deps.store.retryOrDeadLetter).toHaveBeenCalledWith(
      claimedJob.id, 'lease_3', expect.any(LongFormScriptNonRetryableError), false,
    );
  });

  it('defers when cancellation or another worker invalidates the lease', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_4' });
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan: {} as never });
    vi.mocked(deps.store.heartbeat).mockRejectedValue(new LongFormScriptJobLeaseLostError());
    vi.mocked(deps.store.retryOrDeadLetter).mockRejectedValue(new LongFormScriptJobLeaseLostError());

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'deferred', reason: 'lease_lost',
    });
    expect(deps.store.savePlan).not.toHaveBeenCalled();
  });

  it('surfaces a failed redispatch while preserving the durable checkpoint', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_5' });
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan: {} as never });
    vi.mocked(deps.dispatch).mockRejectedValue(new Error('queue unavailable'));

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'queued', reason: 'dispatch_failed', error: 'queue unavailable',
    });
    expect(deps.store.savePlan).toHaveBeenCalledOnce();
    expect(deps.store.yieldLease).toHaveBeenCalledOnce();
  });

  it('does not execute terminal or concurrently leased jobs', async () => {
    const terminal = dependencies({ kind: 'skipped', reason: 'terminal' });
    await expect(processLongFormScriptJob('longscript_ab12', terminal)).resolves.toEqual({
      status: 'skipped', reason: 'terminal',
    });
    expect(terminal.execute).not.toHaveBeenCalled();

    const leased = dependencies({ kind: 'skipped', reason: 'lease_held' });
    await expect(processLongFormScriptJob('longscript_ab12', leased)).resolves.toEqual({
      status: 'deferred', reason: 'lease_held',
    });
    expect(leased.execute).not.toHaveBeenCalled();
  });
});

describe('long-form chat handoff', () => {
  const singlePassFeasibility = {
    mode: 'single_pass' as const,
    requiredOutputTokens: 10_000,
    requiredVisibleOutputTokens: 8_192,
    thinkingBudgetTokens: 8_192,
    maximumOutputTokens: 65_536,
    maximumSinglePassDurationSeconds: 900,
  };
  const chapteredFeasibility = {
    mode: 'chaptered_required' as const,
    requiredOutputTokens: 200_000,
    requiredVisibleOutputTokens: 191_808,
    thinkingBudgetTokens: 8_192,
    maximumOutputTokens: 65_536,
    maximumSinglePassDurationSeconds: 900,
    requestedDurationSeconds: 36_000,
  };

  it('leaves ordinary single-pass scripts on the existing writer path without requiring resolved context', async () => {
    const enqueue = vi.fn();
    const beforeEnqueue = vi.fn();

    await expect(handoffChapteredScriptGenerationIfRequired(
      handoffInput(null),
      { resolveFeasibility: () => singlePassFeasibility, enqueue, beforeEnqueue },
    )).resolves.toEqual({ mode: 'single_pass', feasibility: singlePassFeasibility });
    expect(beforeEnqueue).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('freezes the complete grounded contract and establishes ownership before durable enqueue', async () => {
    const order: string[] = [];
    const enqueue = vi.fn(async (input: LongFormScriptGenerationJobInput) => {
      order.push('enqueue');
      return { job: job({ input, status: 'queued' }), created: true, queueMessageId: 'message_1' };
    });
    const beforeEnqueue = vi.fn(async () => { order.push('ownership'); });

    const result = await handoffChapteredScriptGenerationIfRequired(handoffInput(), {
      resolveFeasibility: () => chapteredFeasibility,
      enqueue,
      beforeEnqueue,
    });

    expect(result).toMatchObject({ mode: 'chaptered', created: true, queueMessageId: 'message_1' });
    expect(order).toEqual(['ownership', 'enqueue']);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      generationId: 'generation_1',
      scriptId: 'script_1',
      baseVersion: 0,
      authoringContext: expect.objectContaining({
        systemBrief: 'Grounded Brand Vault and trend context.',
      }),
      authoringInput: expect.objectContaining({
        context: expect.not.objectContaining({ systemBrief: expect.anything() }),
        productionBrief: expect.objectContaining({ output: expect.objectContaining({ targetDurationSec: 36_000 }) }),
        editorialPlan: expect.objectContaining({ writerKind: 'script' }),
        sourceLedger: expect.objectContaining({ entries: expect.any(Array) }),
      }),
      contextMetadata: {
        trendContext: { trendId: 'trend_1' },
        castingContext: { status: 'resolved' },
      },
    }));
  });

  it('wires chat preflight before the paid writer and preserves durable lifecycle ownership', () => {
    const chat = readFileSync(
      new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url),
      'utf8',
    );
    const handoff = chat.indexOf('await handoffChapteredScriptGenerationIfRequired({');
    const paidWriter = chat.indexOf(
      'writer.runStructured(baseInput as ScriptWriterInput, undefined, abortSignal)',
      handoff,
    );

    expect(handoff).toBeGreaterThan(-1);
    expect(paidWriter).toBeGreaterThan(handoff);
    expect(chat).toContain('intent: LONG_FORM_SCRIPT_GENERATION_INTENT');
    expect(chat).toContain('systemBrief: groundedSystemBrief');
    expect(chat).toContain('generationHandedOff = true');
    expect(chat).toContain('!generationTerminalized && !generationHandedOff');
    expect(chat).toContain('if (generationHandedOff) {');

    const execution = readFileSync(
      new URL('../../lib/thinkforge/long-form/script-generation-execution.ts', import.meta.url),
      'utf8',
    );
    expect(execution).toContain('job.input.contextMetadata?.trendContext');
    expect(execution).toContain('job.input.contextMetadata?.castingContext');
  });
});

describe('long-form generation identity', () => {
  it('accepts base version zero when generation targets a new canonical document', async () => {
    const collection = {
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'longscript_new' }),
    } as unknown as Collection<LongFormScriptGenerationJobRecord>;
    const store = new LongFormScriptGenerationJobStore(async () => collection);
    const input = {
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      generationId: 'generation_new',
      scriptId: 'script_new',
      baseVersion: 0,
      authoringContext: {},
      authoringInput: {},
      signalTrace: {},
    } as unknown as LongFormScriptGenerationJobInput;

    await expect(store.createOrGet(input)).resolves.toMatchObject({ created: true });
    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ baseVersion: 0 }),
    }));
  });
});

describe('long-form canonical commit recovery', () => {
  function commitJob(baseVersion = 3): LongFormScriptGenerationJobSnapshot {
    return job({
      plan: { title: 'Durable story' } as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>,
      assembledResult: {
        content: '# Durable story\n\nComplete script.',
      } as NonNullable<LongFormScriptGenerationJobSnapshot['assembledResult']>,
      input: {
        userId: 'user_1',
        orgId: 'org_1',
        sessionId: 'session_1',
        generationId: 'generation_1',
        scriptId: 'default',
        baseVersion,
        authoringInput: {
          authoringRequest: {
            contentContract: { outputKind: 'video_script' },
          },
        },
      } as LongFormScriptGenerationJobSnapshot['input'],
    });
  }

  beforeEach(() => {
    persistence.applyCommand.mockReset();
    persistence.claimGenerationCommit.mockReset().mockResolvedValue(true);
    persistence.getActiveGeneration.mockReset().mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'default',
      status: 'running',
    });
    persistence.getSession.mockReset();
    persistence.getScript.mockReset();
  });

  it('recovers the receipt only for the exact already-committed generation and content', async () => {
    const current = commitJob();
    persistence.getSession.mockResolvedValue({ _id: 'session_1' });
    persistence.getScript.mockResolvedValue({
      version: 4,
      content: current.assembledResult!.content,
      updatedAt: new Date('2026-08-20T12:05:00.000Z'),
      metadata: {
        writerOutput: { generationTrace: { operation: { id: current.generationId } } },
      },
    });

    await expect(executeLongFormScriptAction({
      job: current,
      action: { kind: 'commit' },
    })).resolves.toEqual({
      kind: 'commit',
      receipt: expect.objectContaining({
        documentVersion: 4,
        committedAt: '2026-08-20T12:05:00.000Z',
      }),
    });
    expect(persistence.applyCommand).not.toHaveBeenCalled();
    expect(persistence.claimGenerationCommit).not.toHaveBeenCalled();
  });

  it('rejects a competing document version instead of overwriting it', async () => {
    const current = commitJob();
    persistence.getSession.mockResolvedValue({ _id: 'session_1' });
    persistence.getScript.mockResolvedValue({
      version: 5,
      content: 'A user edit made while generation was running.',
      updatedAt: new Date('2026-08-20T12:06:00.000Z'),
      metadata: {},
    });

    await expect(executeLongFormScriptAction({
      job: current,
      action: { kind: 'commit' },
    })).rejects.toThrow('Document changed during long-form generation (5/3).');
    expect(persistence.applyCommand).not.toHaveBeenCalled();
    expect(persistence.claimGenerationCommit).not.toHaveBeenCalled();
  });

  it('blocks every durable action after the canonical generation is cancelled', async () => {
    const current = commitJob();
    persistence.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'default',
      status: 'cancelled',
    });

    await expect(executeLongFormScriptAction({
      job: current,
      action: { kind: 'commit' },
    })).rejects.toThrow('canonical generation is no longer active');
    expect(persistence.getSession).not.toHaveBeenCalled();
    expect(persistence.getScript).not.toHaveBeenCalled();
    expect(persistence.claimGenerationCommit).not.toHaveBeenCalled();
    expect(persistence.applyCommand).not.toHaveBeenCalled();
  });

  it('claims canonical commit ownership after version validation and before persistence', () => {
    const source = readFileSync(
      new URL('../../lib/thinkforge/long-form/script-generation-execution.ts', import.meta.url),
      'utf8',
    );
    const versionGuard = source.indexOf("Document changed during long-form generation");
    const commitClaim = source.indexOf('await claimGenerationCommit(job)', versionGuard);
    const persistenceCommit = source.indexOf('const result = await applyCommand({', commitClaim);

    expect(versionGuard).toBeGreaterThan(-1);
    expect(commitClaim).toBeGreaterThan(versionGuard);
    expect(persistenceCommit).toBeGreaterThan(commitClaim);
  });
});
